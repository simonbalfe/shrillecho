package service

import (
	"context"
	"fmt"
	"sync"

	"github.com/rs/zerolog/log"
	"github.com/smwbalfe/shrillecho-playlist-archive/backend/internal/domain"
	spotify "github.com/smwbalfe/shrillecho-playlist-archive/backend/internal/spotify"
	artModels "github.com/smwbalfe/shrillecho-playlist-archive/backend/internal/spotify/endpoints/artist/models"
	plModels "github.com/smwbalfe/shrillecho-playlist-archive/backend/internal/spotify/endpoints/playlist/models"
)

type SpotifyService struct {
	spotify *spotify.SpotifyClient
}

func NewSpotifyService(sp *spotify.SpotifyClient) SpotifyService {
	return SpotifyService{
		spotify: sp,
	}
}

func (srv *SpotifyService) GetArtistGenres(artistIDs []string) ([]string, error) {
	artistsExpanded, err := srv.BatchGetArtists(artistIDs)
	if err != nil {
		return []string{}, err
	}
	uniqueGenres := make(map[string]bool)
	for _, artist := range artistsExpanded.Artists {
		for _, genre := range artist.Genres {
			uniqueGenres[genre] = true
		}
	}
	result := make([]string, 0, len(uniqueGenres))
	for genre := range uniqueGenres {
		result = append(result, genre)
	}
	return result, nil
}

func (srv *SpotifyService) GetArtistName(artist string) (string, error) {
	parsedID, err := ExtractSpotifyID(artist)
	if err != nil {
		return "", err
	}
	artistSingle, err := srv.BatchGetArtists([]string{parsedID})
	if err != nil {
		return "", err
	}
	return artistSingle.Artists[0].Name, nil
}

func (s *SpotifyService) GetTracksExpanded(playlistId string) ([]plModels.Track, error) {
	plTracks, err := s.spotify.Playlists.GetFront(playlistId)
	if err != nil {
		return []plModels.Track{}, err
	}
	var tracks []plModels.Track
	for _, item := range plTracks.Data.PlaylistV2.Content.Items {
		tracks = append(tracks, item.ItemV2.Data)
	}
	return tracks, nil
}

func (s *SpotifyService) BatchGetArtists(artistIDs []string) (*artModels.ArtistResponse, error) {
	if len(artistIDs) == 0 {
		return &artModels.ArtistResponse{Artists: []artModels.ArtistData{}}, nil
	}
	combined := &artModels.ArtistResponse{
		Artists: make([]artModels.ArtistData, 0, len(artistIDs)),
	}

	batchSize := 50
	for offset := 0; offset < len(artistIDs); offset += batchSize {
		limit := batchSize
		if offset+limit > len(artistIDs) {
			limit = len(artistIDs) - offset
		}
		batchResponse, err := s.spotify.Artists.Many(artistIDs, offset, limit)
		if err != nil {
			return nil, fmt.Errorf("failed to get artists batch at offset %d: %v", offset, err)
		}
		combined.Artists = append(combined.Artists, batchResponse.Artists...)
	}

	return combined, nil
}

func (srv *SpotifyService) GetPlaylistGenres(ctx context.Context, playlistID string) ([]string, error) {
	tracks, err := srv.GetTracksExpanded(playlistID)
	if err != nil {
		return []string{}, err
	}
	var artists []string
	for _, track := range tracks {
		if len(track.Artists.Items) > 0 {
			artists = append(artists, ExtractSpotifyIDColon(track.Artists.Items[0].URI))
		}
	}
	artistsExpanded, err := srv.BatchGetArtists(artists)
	if err != nil {
		return []string{}, err
	}
	uniqueGenres := make(map[string]bool)
	for _, artist := range artistsExpanded.Artists {
		for _, genre := range artist.Genres {
			uniqueGenres[genre] = true
		}
	}
	result := make([]string, 0, len(uniqueGenres))
	for genre := range uniqueGenres {
		result = append(result, genre)
	}
	return result, nil
}

func (srv *SpotifyService) GetBatchPlaylistTracks(playlistIDs []string) []plModels.Track {
	var playlistTracks []plModels.Track
	for _, pl := range playlistIDs {
		tracks, err := srv.GetTracksExpanded(pl)
		if err != nil {
			log.Error().Msg("failed to fetch playlist")
			continue
		}
		playlistTracks = append(playlistTracks, tracks...)
	}

	return playlistTracks
}

func (srv *SpotifyService) GetTrackArtistsIds(track plModels.Track) []string {
	var artists []string
	for _, artist := range track.Artists.Items {
		artists = append(artists, ExtractSpotifyIDColon(artist.URI))
	}
	return artists
}

func containsGenre(genres []string, genre string) bool {
	for _, g := range genres {
		if g == genre {
			return true
		}
	}
	return false
}

func (srv *SpotifyService) AppendGenreToTracks(tracks []plModels.Track) []plModels.Track {
	if len(tracks) == 0 {
		return tracks
	}
	allArtistIds := make([]string, 0)
	artistIdMap := make(map[string][]int)
	for i, track := range tracks {
		artistIds := srv.GetTrackArtistsIds(track)
		for _, artistId := range artistIds {
			artistIdMap[artistId] = append(artistIdMap[artistId], i)
			allArtistIds = append(allArtistIds, artistId)
		}
	}
	artistsExpanded, err := srv.BatchGetArtists(allArtistIds)
	if err != nil {
		log.Err(err)
		return tracks
	}
	for _, artist := range artistsExpanded.Artists {
		for _, trackIndex := range artistIdMap[artist.ID] {
			for _, genre := range artist.Genres {
				if !containsGenre(tracks[trackIndex].Genres, genre) {
					tracks[trackIndex].Genres = append(tracks[trackIndex].Genres, genre)
				}
			}
		}
	}
	return tracks
}

func (srv *SpotifyService) FilterPlaylistByGenres(playlistIDs []string, targetGenres []string) ([]plModels.Track, error) {

	// Get all tracks from the playlists
	fmt.Println("getting playlist tracks")
	allTracks := srv.GetBatchPlaylistTracks(playlistIDs)

	// Append genres to the tracks based on their artists
	fmt.Println("appending genres to tracks")
	allTracks = srv.AppendGenreToTracks(allTracks)

	targetGenresMap := make(map[string]bool)
	for _, genre := range targetGenres {
		targetGenresMap[genre] = true
	}
	var filteredTracks []plModels.Track
	for _, track := range allTracks {
		for _, genre := range track.Genres {
			if targetGenresMap[genre] {
				filteredTracks = append(filteredTracks, track)
			}
		}
	}
	allTracks = filteredTracks
	return allTracks, nil
}

func (srv *SpotifyService) RemoveKnownTracks(targetTracks []domain.SimpleTrack, removeTracks []domain.SimpleTrack) ([]domain.SimpleTrack, error) {
	removeMap := make(map[string]struct{})
	for _, track := range removeTracks {
		name, artistURI := GetTrackMetadataSimple(track)
		key := name + "|" + artistURI
		removeMap[key] = struct{}{}
	}
	var dedupedTracks []domain.SimpleTrack
	for _, track := range targetTracks {
		name, artistURI := GetTrackMetadataSimple(track)
		key := name + "|" + artistURI
		if _, exists := removeMap[key]; !exists {
			dedupedTracks = append(dedupedTracks, track)
		}
	}
	return dedupedTracks, nil
}

func (srv *SpotifyService) ParseDiscoveredOn(discoveredOn artModels.DiscoveredResponse) []domain.PlaylistArchiveItem {
	var playlistItems []artModels.ContentItem = discoveredOn.Data.ArtistUnion.Related.DiscoveredOn.Items
	var parsePlaylistItems []domain.PlaylistArchiveItem
	for _, item := range playlistItems {
		if len(item.Data.URI) > 0 && item.Data.OwnerV2.Data.Name != "Angel" {
			var coverArtURL string
			if len(item.Data.Images.Items) > 0 && len(item.Data.Images.Items[0].Sources) > 0 {
				coverArtURL = item.Data.Images.Items[0].Sources[0].URL
			}
			parsePlaylistItems = append(parsePlaylistItems, domain.PlaylistArchiveItem{
				Name:     item.Data.Name,
				CoverArt: coverArtURL,
				URI:      item.Data.URI,
				Owner:    item.Data.OwnerV2.Data.Name,
			})
		}
	}
	return parsePlaylistItems
}

func (srv *SpotifyService) GetArtistDiscoveredOn(artists []string, semaphore chan struct{}) []domain.PlaylistArchiveItem {
	var mu sync.Mutex
	var wg sync.WaitGroup
	var totalPlaylists []domain.PlaylistArchiveItem
	errCh := make(chan error, len(artists))
	for _, artist := range artists {
		wg.Add(1)
		go func(artist string) {
			defer wg.Done()
			semaphore <- struct{}{}
			discoveredOn, err := srv.spotify.Artists.GetDiscoveredOn(artist)
			if err != nil {
				errCh <- fmt.Errorf("failed to get discovered on for %s: %v", artist, err)
				log.Printf("Failed to process artist %s: %v", artist, err)
				return
			}
			playlists := srv.ParseDiscoveredOn(discoveredOn)
			mu.Lock()
			log.Printf("Found %d playlists for artist %s", len(playlists), artist)
			totalPlaylists = append(totalPlaylists, playlists...)
			mu.Unlock()
		}(artist)
	}
	wg.Wait()
	close(errCh)
	for err := range errCh {
		fmt.Println("going over errors")
		if err != nil {
			log.Printf("Error occurred: %v", err)
		}
	}
	result := RemoveDuplicates(totalPlaylists)
	log.Printf("Completed collection. Total playlists before dedup: %d, after dedup: %d", len(totalPlaylists), len(result))
	return result
}

func (srv *SpotifyService) GetPlaylistTracks(playlists []domain.PlaylistArchiveItem) []plModels.Track {
	concurrencyLimit := 100
	sem := make(chan struct{}, concurrencyLimit)
	var wg sync.WaitGroup
	var allTracks []plModels.Track
	for _, pl := range playlists {
		wg.Add(1)
		sem <- struct{}{}
		go func(pl domain.PlaylistArchiveItem) {
			defer wg.Done()
			defer func() { <-sem }()
			id, err := ExtractID(pl.URI)
			if err != nil {
				return
			}
			playlistTracks, err := srv.GetTracksExpanded(id)
			if err != nil {
				log.Printf("Fatal Error: %v", err.Error())
				return
			}
			allTracks = append(allTracks, playlistTracks...)
		}(pl)
	}
	wg.Wait()
	return allTracks
}
