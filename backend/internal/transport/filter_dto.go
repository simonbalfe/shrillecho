package transport

import "github.com/smwbalfe/shrillecho-playlist-archive/backend/internal/domain"

type MonthlyListeners struct {
	Min int `json:"min"`
	Max int `json:"max"`
}

type FilterPlaylistsRequest struct {
	PlaylistsToFilter []string         `json:"playlists_to_filter"`
	PlaylistsToRemove []string         `json:"playlists_to_remove"`
	Genres            []string         `json:"genres"`
	ApplyUnique       bool             `json:"tracks"`
	TrackLimit        int              `json:"track_limit"`
	MonthlyListerners MonthlyListeners `json:"monthly_listeners"`
}

type FilterPlaylistResponse struct {
	Tracks []domain.SimpleTrack `json:"tracks"`
}
