package artist

import (
	"encoding/json"
	"fmt"
	models "github.com/smwbalfe/shrillecho/worker/internal/spotify/endpoints/artist/models"
	"github.com/smwbalfe/shrillecho/worker/internal/spotify/interface"
	"net/url"
	"strings"
)

const (
	ApiURL               = "https://api.spotify.com/v1"
	ExtensionsRelated    = `{"persistedQuery":{"version":1,"sha256Hash":"3d031d6cb22a2aa7c8d203d49b49df731f58b1e2799cc38d9876d58771aa66f3"}}`
	ExtensionsDiscovered = `{"persistedQuery":{"version":1,"sha256Hash":"71c2392e4cecf6b48b9ad1311ae08838cbdabcfd189c6bf0c66c2430b8dcfdb1"}}`
	ExtensionsGetArtist  = `{"persistedQuery":{"version":1,"sha256Hash":"591ed473fa2f5426186f8ba52dee295fe1ce32b36820d67eaadbc957d89408b0"}}`
	maxArtistsPerRequest = 50
)

type ArtistService struct {
	client interfaces.APIClient
}

func NewArtistService(client interfaces.APIClient) *ArtistService {
	return &ArtistService{
		client: client,
	}
}

func (s *ArtistService) GetRelated(artistID string) (models.ArtistRelated, error) {
	variables := fmt.Sprintf(`{"uri":"spotify:artist:%s"}`, artistID)
	reqURL := s.client.BuildQueryURL("queryArtistRelated", variables, ExtensionsRelated)
	resp, err := s.client.Get(reqURL, nil)
	if err != nil {
		return models.ArtistRelated{}, fmt.Errorf("failed to get related artists for %v: %v", artistID, err)
	}
	var response models.ArtistRelated
	if err = json.Unmarshal(resp.Data, &response); err != nil {
		return models.ArtistRelated{}, fmt.Errorf("failed to unmarshal response: %v", err)
	}
	return response, nil
}

func (s *ArtistService) GetDiscoveredOn(artistID string) (models.DiscoveredResponse, error) {
	variables := fmt.Sprintf(`{"uri":"spotify:artist:%s"}`, artistID)
	reqURL := s.client.BuildQueryURL("queryArtistDiscoveredOn", variables, ExtensionsDiscovered)
	fmt.Println("DEBUG GETTING DISCOVERED ON")
	resp, err := s.client.Get(reqURL, nil)
	fmt.Println("DEBUG GETTING DISCOVERED ON HAS BEEN GOT")
	if err != nil {
		return models.DiscoveredResponse{}, fmt.Errorf("failed to get discovered on for %v: %v", artistID, err)
	}
	var response models.DiscoveredResponse
	if err = json.Unmarshal(resp.Data, &response); err != nil {
		return models.DiscoveredResponse{}, fmt.Errorf("failed to unmarshal response: %v", err)
	}
	return response, nil
}

func (s *ArtistService) Many(artistIDs []string, offset, limit int) (*models.ArtistResponse, error) {
	if limit <= 0 || limit > maxArtistsPerRequest {
		limit = maxArtistsPerRequest
	}
	end := offset + limit
	if end > len(artistIDs) {
		end = len(artistIDs)
	}
	if offset >= len(artistIDs) {
		return &models.ArtistResponse{Artists: []models.ArtistData{}}, nil
	}
	pageArtistIDs := artistIDs[offset:end]
	reqURL := fmt.Sprintf("%s/artists?ids=%s", ApiURL, url.QueryEscape(strings.Join(pageArtistIDs, ",")))
	resp, err := s.client.Get(reqURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to get artists: %v", err)
	}
	var response models.ArtistResponse
	if err = json.Unmarshal(resp.Data, &response); err != nil {
		return nil, fmt.Errorf("failed to unmarshal artists response: %v", err)
	}
	return &response, nil
}

