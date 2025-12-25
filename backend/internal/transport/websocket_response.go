package transport

type ArtistWsResponse struct {
	ID           int    `json:"id"`
	TotalArtists int    `json:"total_artists"`
	SeedArtist   string `json:"seed_artist"`
	Depth        int    `json:"depth"`
}
