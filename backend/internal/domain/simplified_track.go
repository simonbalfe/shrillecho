package domain

type SimplifiedTrack struct {
	Playcount   int    `json:"playcount"`
	CoverArtURL string `json:"coverArtUrl"`
	Name        string `json:"name"`
	URI         string `json:"uri"`
}
