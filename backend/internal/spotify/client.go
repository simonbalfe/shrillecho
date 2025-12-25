package spotify

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"

	"github.com/smwbalfe/shrillecho-playlist-archive/backend/internal/spotify/endpoints/artist"
	"github.com/smwbalfe/shrillecho-playlist-archive/backend/internal/spotify/endpoints/playlist"
	"github.com/smwbalfe/shrillecho-playlist-archive/backend/internal/spotify/endpoints/user"
	shared "github.com/smwbalfe/shrillecho-playlist-archive/backend/internal/spotify/shared"
)

const (
	SpotifyRoot           = "https://open.spotify.com"
	ApiPartnerURL         = "https://api-partner.spotify.com/pathfinder/v1/query"
	ApiURL                = "https://api.spotify.com/v1"
	ExtensionsRelated     = `{"persistedQuery":{"version":1,"sha256Hash":"3d031d6cb22a2aa7c8d203d49b49df731f58b1e2799cc38d9876d58771aa66f3"}}`
	ExtensionsDiscovered  = `{"persistedQuery":{"version":1,"sha256Hash":"71c2392e4cecf6b48b9ad1311ae08838cbdabcfd189c6bf0c66c2430b8dcfdb1"}}`
	ExtensionsGetPlaylist = `{"persistedQuery":{"version":1,"sha256Hash":"19ff1327c29e99c208c86d7a9d8f1929cfdf3d3202a0ff4253c821f1901aa94d"}}`
	ExtensionsGetArtist   = `{"persistedQuery":{"version":1,"sha256Hash":"591ed473fa2f5426186f8ba52dee295fe1ce32b36820d67eaadbc957d89408b0"}}`
	maxArtistsPerRequest  = 50
)

type SpotifyClient struct {
	Auth   *Auth
	Client *http.Client

	Users     *user.UserService
	Playlists *playlist.PlaylistService
	Artists   *artist.ArtistService
}

func NewSpotifyClient() (*SpotifyClient, error) {
	httpClient := &http.Client{}
	auth := NewAuth(httpClient)
	client := &SpotifyClient{
		Auth:   auth,
		Client: httpClient,
	}
	if err := auth.Initialize(); err != nil {
		return nil, fmt.Errorf("error initialising client: %s", err)
	}
	client.Users = user.NewUserService(client)
	client.Playlists = playlist.NewPlaylistService(client)
	client.Artists = artist.NewArtistService(client)
	return client, nil
}

func (c *SpotifyClient) GetTokens() (string, string) {
	return c.Auth.GetTokens()
}

func (c *SpotifyClient) GetClient() *http.Client {
	return c.Client
}

func (c *SpotifyClient) Get(request string, headers map[string]string) (shared.RequestResponse, error) {
	return c.Request("GET", request, nil, headers)
}

func (c *SpotifyClient) Post(url string, data interface{}, headers map[string]string) (shared.RequestResponse, error) {
	jsonData, err := json.Marshal(data)
	if err != nil {
		return shared.RequestResponse{}, fmt.Errorf("failed to marshal JSON: %v", err)
	}

	return c.Request("POST", url, jsonData, headers)
}

func (c *SpotifyClient) Request(method string, url string, body []byte, headers map[string]string) (shared.RequestResponse, error) {
	req, err := http.NewRequest(method, url, bytes.NewBuffer(body))
	if err != nil {
		return shared.RequestResponse{}, fmt.Errorf("fail to create request: %v", err)
	}
	accessToken, clientToken := c.Auth.GetTokens()
	req.Header.Add("Authorization", fmt.Sprintf("Bearer %s", accessToken))
	req.Header.Add("Client-Token", clientToken)
	if method == "POST" && body != nil {
		req.Header.Add("Content-Type", "application/json")
	}
	for k, v := range headers {
		req.Header.Add(k, v)
	}
	resp, err := performRequest(req, c.Client)
	if err != nil {
		return shared.RequestResponse{}, fmt.Errorf("request failure: %v", err)
	}
	if resp.StatusCode == 429 {
		return shared.RequestResponse{}, fmt.Errorf("rate limited")
	} else if resp.StatusCode == 401 {
		if err := c.Auth.Initialize(); err != nil {
			return shared.RequestResponse{}, fmt.Errorf("failed to refresh authorization: %v", err)
		}
		return c.Request(method, url, body, headers)
	} else if resp.StatusCode != 200 {
		return shared.RequestResponse{}, fmt.Errorf("failed request error: %v", resp.StatusCode)
	}
	return resp, nil
}

func (c *SpotifyClient) BuildQueryURL(operationName string, variables string, extensions string) string {
	return fmt.Sprintf("%s?operationName=%s&variables=%s&extensions=%s",
		ApiPartnerURL,
		operationName,
		url.QueryEscape(variables),
		url.QueryEscape(extensions))
}
