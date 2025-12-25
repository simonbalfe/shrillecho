package workers

import (
	"context"
	"fmt"
	"log"
	"sync"

	"github.com/gorilla/websocket"
	"github.com/smwbalfe/shrillecho-playlist-archive/backend/internal/config"
	"github.com/smwbalfe/shrillecho-playlist-archive/backend/internal/repository"
	service "github.com/smwbalfe/shrillecho-playlist-archive/backend/internal/services"
	spotify "github.com/smwbalfe/shrillecho-playlist-archive/backend/internal/spotify"
	"github.com/smwbalfe/shrillecho-playlist-archive/backend/internal/transport"
)

type ArtistScrapeWorker struct {
	Spotify        *spotify.SpotifyClient
	Scraper        *service.ArtistScraperService
	Queue          *service.RedisQueue
	artistRepo     repository.PostgresArtistRepository
	scrapeRepo     repository.PostgresScrapeRepository
	wsConn         *websocket.Conn
	wsMutex        sync.Mutex
	SpotifyService service.SpotifyService
}

func NewArtistScrapeWorker(sharedCfg *config.SharedConfig) ArtistScrapeWorker {

	artistScraper := service.NewArtistScraperService(sharedCfg.Dbs.Redis, sharedCfg.Services.Spotify, 100)

	artistRepo := repository.NewPostgresArtistRepository(sharedCfg.Dbs.Postgres)

	spotifyService := service.NewSpotifyService(sharedCfg.Services.Spotify)

	return ArtistScrapeWorker{
		Spotify:        sharedCfg.Services.Spotify,
		scrapeRepo:     sharedCfg.Services.ScrapeRepo,
		artistRepo:     artistRepo,
		Queue:          sharedCfg.Services.Queue,
		Scraper:        &artistScraper,
		SpotifyService: spotifyService,
	}
}

func (w *ArtistScrapeWorker) SetWebsocketConnection(conn *websocket.Conn) {
	w.wsMutex.Lock()
	defer w.wsMutex.Unlock()
	w.wsConn = conn
}

func (scrp *ArtistScrapeWorker) ProcessScrapeQueue(queueCtx context.Context) {
	for {
		select {
		case <-queueCtx.Done():
			return
		default:

			var scrapeJob service.ScrapeJob

			err := scrp.Queue.PopRequest(queueCtx, &scrapeJob)

			if err != nil {
				log.Printf("Error dequeuing job: %v", err)
				scrapeJob.Status = "failure"
				scrapeJob.Error = err.Error()
				scrp.Queue.PushResponse(queueCtx, &scrapeJob)
			}

			artists, err := scrp.Scraper.TriggerArtistScrape(
				queueCtx,
				scrapeJob.ID,
				scrapeJob.Artist,
				scrapeJob.Depth,
			)

			if err != nil {
				log.Printf("error scraping: %v", err)
				scrapeJob.Status = "failure"
				scrapeJob.Error = err.Error()
				scrp.Queue.PushResponse(queueCtx, &scrapeJob)
			}

			scrapeJob.Status = "success"
			scrapeJob.Artists = artists
			artistName, err := scrp.SpotifyService.GetArtistName(scrapeJob.Artist)
			if err != nil {
				log.Printf("error getting name: %v", err)
				scrapeJob.Artist = "N/A"
			}
			scrapeJob.Artist = artistName
			scrp.Queue.PushResponse(queueCtx, &scrapeJob)
		}
	}
}

func (scrp *ArtistScrapeWorker) ProcessResponeQueue(queueCtx context.Context) {
	for {
		select {
		case <-queueCtx.Done():
			return
		default:

			var scrapeJob service.ScrapeJob

			err := scrp.Queue.PopResponse(queueCtx, &scrapeJob)

			if err != nil {
				fmt.Printf("invalid response received: %v", err)
				fmt.Println(scrapeJob)
			}

			fmt.Printf("received response: %v\n", len(scrapeJob.Artists))

			var wg sync.WaitGroup
			semaphore := make(chan struct{}, 500)

			for _, artist := range scrapeJob.Artists {
				wg.Add(1)
				currentArtist := artist

				semaphore <- struct{}{}
				go func() {
					defer wg.Done()
					defer func() { <-semaphore }()
					artistID, _ := scrp.artistRepo.CreateArtist(queueCtx, currentArtist.ID)
					scrp.scrapeRepo.CreateScrapeArtist(queueCtx, scrapeJob.ID, artistID)
				}()
			}
			wg.Wait()

			if scrp.wsConn != nil {

				artistName, err := scrp.SpotifyService.GetArtistName(scrapeJob.Artist)
				if err != nil {
					log.Printf("error getting name: %v", err)
					scrapeJob.Artist = "N/A"
				}
				scrapeJob.Artist = artistName

				wsResponse := transport.ArtistWsResponse{
					ID:           int(scrapeJob.ID),
					Depth:        scrapeJob.Depth,
					SeedArtist:   scrapeJob.Artist,
					TotalArtists: len(scrapeJob.Artists),
				}

				fmt.Println(wsResponse)
				scrp.wsConn.WriteJSON(wsResponse)
			}
		}
	}
}
