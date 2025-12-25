package playlist

import (
	"encoding/json"
	"errors"
	"fmt"
	models "github.com/smwbalfe/shrillecho-playlist-archive/backend/internal/spotify/endpoints/playlist/models"
	"github.com/smwbalfe/shrillecho-playlist-archive/backend/internal/spotify/interface"
)

const (
	ApiURL                = "https://api.spotify.com/v1"
	ExtensionsGetPlaylist = `{"persistedQuery":{"version":1,"sha256Hash":"19ff1327c29e99c208c86d7a9d8f1929cfdf3d3202a0ff4253c821f1901aa94d"}}`
)

type PlaylistService struct {
	client interfaces.APIClient
}

func NewPlaylistService(client interfaces.APIClient) *PlaylistService {
	return &PlaylistService{
		client: client,
	}
}

func (s *PlaylistService) Get(playlistId string) (string, error) {
	reqURL := fmt.Sprintf("%s/playlists/%v", ApiURL, playlistId)
	resp, err := s.client.Get(reqURL, nil)
	if err != nil {
		return "", fmt.Errorf("failed to get playlist %v: %v", playlistId, err)
	}
	return string(resp.Data), nil
}

func (s *PlaylistService) GetFront(playlistId string) (models.PlaylistTracks, error) {
	variables := fmt.Sprintf(`{"uri":"spotify:playlist:%s", "offset":%v, "limit":%v}`,
		playlistId, 0, 4999)
	reqURL := s.client.BuildQueryURL("fetchPlaylistWithGatedEntityRelations", variables, ExtensionsGetPlaylist)
	resp, err := s.client.Get(reqURL, nil)
	if resp.StatusCode != 200 {
		return models.PlaylistTracks{}, errors.New("response code != 200")
	}
	if err != nil {
		return models.PlaylistTracks{}, fmt.Errorf("failed to get playlist data for %v: %v", playlistId, err)
	}
	var plTracks models.PlaylistTracks
	if err := json.Unmarshal(resp.Data, &plTracks); err != nil {
		return models.PlaylistTracks{}, fmt.Errorf("failed to unmarshal playlist data: %v", err)
	}
	return plTracks, nil
}

func (s *PlaylistService) Create(trackURIs []string, user string, playlistName string) (string, error) {
	createURL := fmt.Sprintf("%s/users/%v/playlists", ApiURL, user)
	playlistData := map[string]any{
		"name":   playlistName,
		"public": true,
	}
	createResp, err := s.client.Post(createURL, playlistData, nil)
	if err != nil {
		return "", err
	}
	var playlist models.Playlist
	if err := json.Unmarshal(createResp.Data, &playlist); err != nil {
		return "", err
	}
	addURL := fmt.Sprintf("%s/playlists/%s/tracks", ApiURL, playlist.ID)
	addData := map[string]interface{}{
		"uris": trackURIs,
	}
	_, err = s.client.Post(addURL, addData, nil)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("https://open.spotify.com/playlist/%s", playlist.ID), nil
}

