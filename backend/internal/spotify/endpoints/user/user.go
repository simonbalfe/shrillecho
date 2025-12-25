package user

import (
	"encoding/json"
	"fmt"
	"github.com/smwbalfe/shrillecho-playlist-archive/backend/internal/spotify/endpoints/user/models"
	"github.com/smwbalfe/shrillecho-playlist-archive/backend/internal/spotify/interface"
)

const (
	ApiURL               = "https://api.spotify.com/v1"
	ExtensionsRelated    = `{"persistedQuery":{"version":1,"sha256Hash":"3d031d6cb22a2aa7c8d203d49b49df731f58b1e2799cc38d9876d58771aa66f3"}}`
	ExtensionsDiscovered = `{"persistedQuery":{"version":1,"sha256Hash":"71c2392e4cecf6b48b9ad1311ae08838cbdabcfd189c6bf0c66c2430b8dcfdb1"}}`
	ExtensionsGetArtist  = `{"persistedQuery":{"version":1,"sha256Hash":"591ed473fa2f5426186f8ba52dee295fe1ce32b36820d67eaadbc957d89408b0"}}`
	maxArtistsPerRequest = 50
)

type UserService struct {
	client interfaces.APIClient
}

func NewUserService(client interfaces.APIClient) *UserService {
	return &UserService{
		client: client,
	}
}

func (s *UserService) GetCurrentID() (string, error) {
	reqURL := fmt.Sprintf("%s/me", ApiURL)
	resp, err := s.client.Get(reqURL, nil)
	if err != nil {
		return "", fmt.Errorf("failed to get current user profile: %v", err)
	}
	var userProfile models.UserProfile
	if err := json.Unmarshal(resp.Data, &userProfile); err != nil {
		return "", fmt.Errorf("failed to unmarshal user profile: %v", err)
	}
	return userProfile.ID, nil
}

