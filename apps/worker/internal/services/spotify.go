package service

import (
	"fmt"

	spotify "github.com/smwbalfe/shrillecho/worker/internal/spotify"
	artModels "github.com/smwbalfe/shrillecho/worker/internal/spotify/endpoints/artist/models"
)

type SpotifyService struct {
	spotify *spotify.SpotifyClient
}

func NewSpotifyService(sp *spotify.SpotifyClient) SpotifyService {
	return SpotifyService{
		spotify: sp,
	}
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
	if len(artistSingle.Artists) == 0 {
		return "", fmt.Errorf("artist not found: %s", parsedID)
	}
	return artistSingle.Artists[0].Name, nil
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
