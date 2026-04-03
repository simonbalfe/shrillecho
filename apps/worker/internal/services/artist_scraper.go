package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"

	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"
	spotify "github.com/smwbalfe/shrillecho/worker/internal/spotify"
	artModels "github.com/smwbalfe/shrillecho/worker/internal/spotify/endpoints/artist/models"
)

type ArtistScraperService struct {
	RedisStore *redis.Client
	Spotify    *spotify.SpotifyClient
	NumWorkers int
}

func NewArtistScraperService(redis *redis.Client, spClient *spotify.SpotifyClient, workers int) ArtistScraperService {
	return ArtistScraperService{
		RedisStore: redis,
		Spotify:    spClient,
		NumWorkers: workers,
	}
}

func (s *ArtistScraperService) ParseRelated(relatedFront artModels.ArtistRelated) []artModels.Artist {
	return relatedFront.Data.ArtistUnion.RelatedContent.RelatedArtists.Items
}

func (s *ArtistScraperService) initialScrapeSetup(ctx context.Context, scrapeID int64, rootArtist string) error {
	relatedArtists, err := s.Spotify.Artists.GetRelated(rootArtist)
	paredRelatedArtists := s.ParseRelated(relatedArtists)
	if err != nil {
		return err
	}
	pipe := s.RedisStore.Pipeline()
	pipe.SAdd(ctx, fmt.Sprintf("%v:artists:seen", scrapeID), rootArtist)
	pipe.HSet(ctx, fmt.Sprintf("%v:artists:depth", scrapeID), rootArtist, 0)
	for _, artist := range paredRelatedArtists {
		artistJSON, err := json.Marshal(artist)
		if err != nil {
			log.Error().Msg(fmt.Sprintf("Failed to marshal artist: %v", err))
			continue
		}
		pipe.SAdd(ctx, fmt.Sprintf("%v:artists:seen", scrapeID), artist.ID)
		pipe.HSet(ctx, fmt.Sprintf("%v:artists:depth", scrapeID), artist.ID, 1)
		pipe.SAdd(ctx, fmt.Sprintf("%v:artists:unexpanded", scrapeID), artist.ID)
		pipe.HSet(ctx, fmt.Sprintf("%v:artists:data", scrapeID), artist.ID, artistJSON)
	}

	if _, err := pipe.Exec(ctx); err != nil {
		return err
	}
	return nil
}

func (s *ArtistScraperService) ScrapeArtists(scrapeID int64, rootArtist string, maxDepth int) error {
	ctx := context.Background()
	if err := s.initialScrapeSetup(ctx, scrapeID, rootArtist); err != nil {
		return err
	}
	var wg sync.WaitGroup
	wg.Add(s.NumWorkers)
	for i := 1; i <= s.NumWorkers; i++ {
		go s.worker(ctx, scrapeID, maxDepth, &wg)
	}
	wg.Wait()
	return nil
}

func (s *ArtistScraperService) worker(ctx context.Context, scrapeID int64, maxDepth int, wg *sync.WaitGroup) {
	defer wg.Done()
	for {
		select {
		case <-ctx.Done():
			return
		default:
			artist, err := s.RedisStore.SPop(ctx, fmt.Sprintf("%v:artists:unexpanded", scrapeID)).Result()
			if err == redis.Nil {
				return
			}
			if err != nil {
				log.Error().Msg(err.Error())
				continue
			}

			currentDepth, err := s.RedisStore.HGet(ctx, fmt.Sprintf("%v:artists:depth", scrapeID), artist).Int()
			if err != nil {
				continue
			}
			if currentDepth >= maxDepth {
				continue
			}

			relatedArtists, err := s.Spotify.Artists.GetRelated(artist)
			if err != nil {
				log.Error().Msg(err.Error())
				continue
			}

			parsedRelatedArtists := s.ParseRelated(relatedArtists)

			pipe := s.RedisStore.Pipeline()
			for _, relatedArtist := range parsedRelatedArtists {
				isMember, err := s.RedisStore.SIsMember(ctx, fmt.Sprintf("%v:artists:seen", scrapeID), relatedArtist.ID).Result()
				if err != nil {
					log.Error().Msg(err.Error())
					continue
				}

				if !isMember {
					artistJSON, err := json.Marshal(relatedArtist)
					if err != nil {
						log.Error().Msg(fmt.Sprintf("Failed to marshal artist: %v", err))
						continue
					}
					pipe.SAdd(ctx, fmt.Sprintf("%v:artists:seen", scrapeID), relatedArtist.ID)
					pipe.HSet(ctx, fmt.Sprintf("%v:artists:depth", scrapeID), relatedArtist.ID, currentDepth+1)
					pipe.SAdd(ctx, fmt.Sprintf("%v:artists:unexpanded", scrapeID), relatedArtist.ID)
					pipe.HSet(ctx, fmt.Sprintf("%v:artists:data", scrapeID), relatedArtist.ID, artistJSON)
				}
			}

			if _, err := pipe.Exec(ctx); err != nil {
				log.Error().Msg(err.Error())
			}
		}
	}
}

func (s *ArtistScraperService) TriggerArtistScrape(ctx context.Context, scrapeID int64, seedArtist string, depth int) ([]artModels.Artist, error) {
	artistID, err := ExtractSpotifyID(seedArtist)
	if err != nil {
		return []artModels.Artist{}, errors.New(fmt.Sprintf("failed to parse spotify ID: %v", err))
	}
	err = s.ScrapeArtists(scrapeID, artistID, depth)
	if err != nil {
		return []artModels.Artist{}, errors.New(fmt.Sprintf("failed to scrape artists: %v", err))
	}
	var artists []artModels.Artist
	artistsData, err := s.RedisStore.HGetAll(ctx, fmt.Sprintf("%v:artists:data", scrapeID)).Result()
	if err != nil {
		return []artModels.Artist{}, nil
	}
	for _, artistJSON := range artistsData {
		var artist artModels.Artist
		if err := json.Unmarshal([]byte(artistJSON), &artist); err != nil {
			continue
		}
		artists = append(artists, artist)
	}
	return artists, nil
}
