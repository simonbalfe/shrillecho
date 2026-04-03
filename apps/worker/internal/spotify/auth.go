package spotify

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
)

type Auth struct {
	AccessToken string
	ClientToken string
	Client      *http.Client
}

func NewAuth(httpClient *http.Client) *Auth {
	if httpClient == nil {
		httpClient = &http.Client{}
	}
	return &Auth{
		Client: httpClient,
	}
}

func (a *Auth) Initialize() error {
	clientID, err := a.RefreshAccessToken()

	if err != nil {
		return err
	}

	if err := a.SetClientToken(clientID); err != nil {
		return fmt.Errorf("failed to set client token: %v", err)
	}

	return nil
}

func (a *Auth) RefreshAccessToken() (string, error) {
	req, err := http.NewRequest("GET", fmt.Sprintf("%s/get_access_token", SpotifyRoot), nil)
	if err != nil {
		return "", fmt.Errorf("error creating request: %w", err)
	}
	addCookies(req)
	addHeaders(req)
	resp, err := performRequest(req, a.Client)
	if err != nil {
		return "", fmt.Errorf("error performing request: %v", err)
	}
	var atResp AccessTokenResponse
	if err := json.Unmarshal(resp.Data, &atResp); err != nil {
		return "", fmt.Errorf("error unmarshalling JSON (body: %s): %w", string(resp.Data), err)
	}
	a.AccessToken = atResp.AccessToken
	atResp.ClientID = "d8a5ed958d274c2e8ee717e6a4b0971d"
	a.AccessToken = "***REMOVED_SPOTIFY_TOKEN***"
	return atResp.ClientID, nil
}

func (a *Auth) SetClientToken(clientID string) error {
	rootData := RootData{
		ClientData: ClientData{
			ClientVersion: "1.2.34.773.g9d8406e5",
			ClientID:      clientID,
			JsSDKData: JsSDKData{
				DeviceBrand: "",
				DeviceModel: "",
				OS:          "",
				OSVersion:   "",
				DeviceID:    "",
				DeviceType:  "",
			},
		},
	}

	jsonData, err := json.Marshal(rootData)
	if err != nil {
		return fmt.Errorf("error marshaling JSON data: %v", err)
	}

	fmt.Println("getting client token")
	req, err := http.NewRequest("POST", "https://clienttoken.spotify.com/v1/clienttoken", bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("error creating request: %v", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0")
	req.Header.Set("Accept", "application/json")

	resp, err := performRequest(req, a.Client)
	if err != nil {
		return fmt.Errorf("error performing request: %v", err)
	}

	var ctResp ClientTokenResponse
	if err := json.Unmarshal(resp.Data, &ctResp); err != nil {
		return fmt.Errorf("error unmarshalling JSON (body: %s): %w", string(resp.Data), err)
	}

	a.ClientToken = ctResp.GrantedToken.Token
	return nil
}

func (a *Auth) GetTokens() (string, string) {
	return a.AccessToken, a.ClientToken
}
