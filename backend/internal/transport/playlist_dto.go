package transport

import (
	"github.com/smwbalfe/shrillecho-playlist-archive/backend/internal/domain"
)

type PlaylistResponse struct {
	Playlists []domain.SimplifiedTrack
}

type CreatePlaylistRequest struct {
	Tracks []string `json:"tracks"`
}

type CreatePlaylistResponse struct {
	Link string `json:"link"`
}
