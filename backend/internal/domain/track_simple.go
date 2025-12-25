package domain

type SimpleTrack struct {
	Name      string         `json:"name"`
	ID        string         `json:"id"`
	Artists   []ArtistSimple `json:"artists"`
	Playcount string         `json:"playcount"`
	CoverArt  CoverArt       `json:"coverArt"`
	Genres []string 		`json:"genres"`
}

type ArtistSimple struct {
	Name string `json:"name"`
}

type CoverArt struct {
	Sources []Source `json:"sources"`
}

type Source struct {
	URL    string `json:"url"`
	Height int    `json:"height"`
	Width  int    `json:"width"`
}
