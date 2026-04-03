package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"
	service "github.com/smwbalfe/shrillecho/worker/internal/services"
	spotify "github.com/smwbalfe/shrillecho/worker/internal/spotify"
)

func main() {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	redisHost := os.Getenv("REDIS_HOST")
	redisPort := os.Getenv("REDIS_PORT")
	if redisHost == "" {
		redisHost = "localhost"
	}
	if redisPort == "" {
		redisPort = "6379"
	}

	rdb := redis.NewClient(&redis.Options{
		Addr:     fmt.Sprintf("%s:%s", redisHost, redisPort),
		Password: "",
		DB:       0,
	})

	if _, err := rdb.Ping(ctx).Result(); err != nil {
		log.Fatal().Err(err).Msg("failed to connect to redis")
	}
	log.Info().Msg("connected to redis")

	spClient, err := spotify.NewSpotifyClient()
	if err != nil {
		log.Fatal().Err(err).Msg("failed to initialize spotify client")
	}

	queue := service.NewRedisQueue(rdb)
	scraper := service.NewArtistScraperService(rdb, spClient, 100)
	spotifyService := service.NewSpotifyService(spClient)

	numWorkers := 5
	log.Info().Int("workers", numWorkers).Msg("starting worker pool")

	for i := 0; i < numWorkers; i++ {
		go processQueue(ctx, queue, &scraper, spotifyService)
	}

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh
	log.Info().Msg("shutting down workers")
	cancel()
}

func processQueue(ctx context.Context, queue *service.RedisQueue, scraper *service.ArtistScraperService, spotifyService service.SpotifyService) {
	for {
		select {
		case <-ctx.Done():
			return
		default:
			var scrapeJob service.ScrapeJob

			if err := queue.PopRequest(ctx, &scrapeJob); err != nil {
				log.Error().Err(err).Msg("error dequeuing job")
				continue
			}

			log.Info().Int64("id", scrapeJob.ID).Str("artist", scrapeJob.Artist).Int("depth", scrapeJob.Depth).Msg("processing scrape job")

			artists, err := scraper.TriggerArtistScrape(ctx, scrapeJob.ID, scrapeJob.Artist, scrapeJob.Depth)
			if err != nil {
				log.Error().Err(err).Msg("scrape failed")
				scrapeJob.Status = "failure"
				scrapeJob.Error = err.Error()
				queue.PushResponse(ctx, &scrapeJob)
				continue
			}

			scrapeJob.Status = "success"
			scrapeJob.Artists = artists

			artistName, err := spotifyService.GetArtistName(scrapeJob.Artist)
			if err == nil {
				scrapeJob.Artist = artistName
			}

			log.Info().Int64("id", scrapeJob.ID).Int("artists", len(artists)).Msg("scrape completed")
			queue.PushResponse(ctx, &scrapeJob)
		}
	}
}
