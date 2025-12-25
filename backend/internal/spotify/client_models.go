package spotify

// Tokens
type AccessTokenResponse struct {
	AccessToken string `json:"accessToken"`
	ClientID    string `json:"clientId"`
}

type ClientToken struct {
	Token string `json:"token"`
}

type ClientTokenResponse struct {
	GrantedToken ClientToken `json:"granted_token"`
}

// Client Auth
type JsSDKData struct {
	DeviceBrand string `json:"device_brand"`
	DeviceModel string `json:"device_model"`
	OS          string `json:"os"`
	OSVersion   string `json:"os_version"`
	DeviceID    string `json:"device_id"`
	DeviceType  string `json:"device_type"`
}

type ClientData struct {
	ClientVersion string    `json:"client_version"`
	ClientID      string    `json:"client_id"`
	JsSDKData     JsSDKData `json:"js_sdk_data"`
}

type RootData struct {
	ClientData ClientData `json:"client_data"`
}

