package domain

type PlaylistArchiveItem struct {
	Name     string `json:"name"`
	CoverArt string `json:"cover_art"`
	URI      string `json:"uri"`
	Owner    string `json:"owner"`
}
