package domain

type PlaylistResponse struct {
	Collaborative bool `json:"collaborative"`
	ExternalURLs  struct {
		Spotify string `json:"spotify"`
	} `json:"external_urls"`
	Followers struct {
		Href  string `json:"href"`
		Total int    `json:"total"`
	} `json:"followers"`
	Href         string  `json:"href"`
	ID           string  `json:"id"`
	Images       []Image `json:"images"`
	Name         string  `json:"name"`
	Description  string  `json:"description"`
	PrimaryColor string  `json:"primary_color"`
	Public       bool    `json:"public"`
	SnapshotID   string  `json:"snapshot_id"`
	Tracks       Tracks  `json:"tracks"`
	Type         string  `json:"type"`
	URI          string  `json:"uri"`
	Owner        Owner   `json:"owner"`
}

type Image struct {
	URL    string `json:"url"`
	Height *int   `json:"height"`
	Width  *int   `json:"width"`
}

type Owner struct {
	DisplayName  string `json:"display_name"`
	ExternalURLs struct {
		Spotify string `json:"spotify"`
	} `json:"external_urls"`
	Href string `json:"href"`
	ID   string `json:"id"`
	Type string `json:"type"`
	URI  string `json:"uri"`
}

type Tracks struct {
	Href     string `json:"href"`
	Items    []Item `json:"items"`
	Limit    int    `json:"limit"`
	Next     string `json:"next"`
	Offset   int    `json:"offset"`
	Previous string `json:"previous"`
	Total    int    `json:"total"`
}

type Item struct {
	AddedAt string `json:"added_at"`
	AddedBy struct {
		ExternalURLs struct {
			Spotify string `json:"spotify"`
		} `json:"external_urls"`
		Href string `json:"href"`
		ID   string `json:"id"`
		Type string `json:"type"`
		URI  string `json:"uri"`
	} `json:"added_by"`
	IsLocal        bool   `json:"is_local"`
	PrimaryColor   string `json:"primary_color"`
	Track          Track  `json:"track"`
	VideoThumbnail struct {
		URL string `json:"url"`
	} `json:"video_thumbnail"`
}

type Track struct {
	Album            Album    `json:"album"`
	Artists          []Artist `json:"artists"`
	AvailableMarkets []string `json:"available_markets"`
	DiscNumber       int      `json:"disc_number"`
	DurationMS       int      `json:"duration_ms"`
	Explicit         bool     `json:"explicit"`
	ExternalIDs      struct {
		ISRC string `json:"isrc"`
	} `json:"external_ids"`
	ExternalURLs struct {
		Spotify string `json:"spotify"`
	} `json:"external_urls"`
	Href        string `json:"href"`
	ID          string `json:"id"`
	Name        string `json:"name"`
	Popularity  int    `json:"popularity"`
	PreviewURL  string `json:"preview_url"`
	TrackNumber int    `json:"track_number"`
	Type        string `json:"type"`
	URI         string `json:"uri"`
	IsLocal     bool   `json:"is_local"`
	Episode     bool   `json:"episode"`
	Track       bool   `json:"track"`
}

type Album struct {
	AlbumType        string   `json:"album_type"`
	Artists          []Artist `json:"artists"`
	AvailableMarkets []string `json:"available_markets"`
	ExternalURLs     struct {
		Spotify string `json:"spotify"`
	} `json:"external_urls"`
	Href                 string  `json:"href"`
	ID                   string  `json:"id"`
	Images               []Image `json:"images"`
	Name                 string  `json:"name"`
	ReleaseDate          string  `json:"release_date"`
	ReleaseDatePrecision string  `json:"release_date_precision"`
	TotalTracks          int     `json:"total_tracks"`
	Type                 string  `json:"type"`
	URI                  string  `json:"uri"`
}

type Artist struct {
	ExternalURLs struct {
		Spotify string `json:"spotify"`
	} `json:"external_urls"`
	Href string `json:"href"`
	ID   string `json:"id"`
	Name string `json:"name"`
	Type string `json:"type"`
	URI  string `json:"uri"`
}
