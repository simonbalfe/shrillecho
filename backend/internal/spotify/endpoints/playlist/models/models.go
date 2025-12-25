package models

type PlaylistTracks struct {
	Data PlaylistTracksData `json:"data"`
}

type PlaylistTracksData struct {
	PlaylistV2 PlaylistV2 `json:"playlistV2"`
}

type PlaylistV2 struct {
	Content        PlaylistContent `json:"content"`
	Attributes     []Attribute     `json:"attributes"`
	BasePermission string          `json:"basePermission"`
	Description    string          `json:"description"`
	Followers      int             `json:"followers"`
	Following      bool            `json:"following"`
	Format         string          `json:"format"`
	Images         Images          `json:"images"`
	Name           string          `json:"name"`
	OwnerV2        OwnerV2         `json:"ownerV2"`
	URI            string          `json:"uri"`
}

type PlaylistContent struct {
	Items      []PlaylistItem `json:"items"`
	PagingInfo PagingInfo     `json:"pagingInfo"`
	TotalCount int            `json:"totalCount"`
}

type PagingInfo struct {
	Limit  int `json:"limit"`
	Offset int `json:"offset"`
}

type PlaylistItem struct {
	ItemV2     ItemV2      `json:"itemV2"`
	AddedAt    TimeStamp   `json:"addedAt"`
	Attributes []Attribute `json:"attributes"`
	UID        string      `json:"uid"`
}

type ItemV2 struct {
	Data Track `json:"data"`
}

type TimeStamp struct {
	IsoString string `json:"isoString"`
}

type Attribute struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

type Images struct {
	Items []ImageItem `json:"items"`
}

type ImageItem struct {
	ExtractedColors ExtractedColors `json:"extractedColors"`
	Sources         []ImageSource   `json:"sources"`
}

type ExtractedColors struct {
	ColorRaw ColorRaw `json:"colorRaw"`
}

type ColorRaw struct {
	Hex        string `json:"hex"`
	IsFallback bool   `json:"isFallback"`
}

type ImageSource struct {
	Height interface{} `json:"height"`
	URL    string      `json:"url"`
	Width  interface{} `json:"width"`
}

type Track struct {
	AlbumOfTrack  AlbumOfTrack  `json:"albumOfTrack"`
	Artists       Artists       `json:"artists"`
	ContentRating ContentRating `json:"contentRating"`
	DiscNumber    int           `json:"discNumber"`
	TrackDuration TrackDuration `json:"trackDuration"`
	Name          string        `json:"name"`
	Playability   Playability   `json:"playability"`
	Playcount     string        `json:"playcount"`
	TrackNumber   int           `json:"trackNumber"`
	URI           string        `json:"uri"`
	Genres        []string
}

type AlbumOfTrack struct {
	Artists  Artists  `json:"artists"`
	CoverArt CoverArt `json:"coverArt"`
	Name     string   `json:"name"`
	URI      string   `json:"uri"`
}

type Artists struct {
	Items []ArtistItem `json:"items"`
}

type ArtistItem struct {
	Profile ArtistProfile `json:"profile"`
	URI     string        `json:"uri"`
}

type ArtistProfile struct {
	Name string `json:"name"`
}

type CoverArt struct {
	Sources []CoverArtSource `json:"sources"`
}

type CoverArtSource struct {
	Height int    `json:"height"`
	URL    string `json:"url"`
	Width  int    `json:"width"`
}

type ContentRating struct {
	Label string `json:"label"`
}

type TrackDuration struct {
	TotalMilliseconds int `json:"totalMilliseconds"`
}

type Playability struct {
	Playable bool   `json:"playable"`
	Reason   string `json:"reason"`
}

type OwnerV2 struct {
	Data OwnerData `json:"data"`
}

type OwnerData struct {
	Avatar   Avatar `json:"avatar"`
	Name     string `json:"name"`
	URI      string `json:"uri"`
	Username string `json:"username"`
}

type Avatar struct {
	Sources []AvatarSource `json:"sources"`
}

type AvatarSource struct {
	Height int    `json:"height"`
	URL    string `json:"url"`
	Width  int    `json:"width"`
}

