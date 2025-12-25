package transport

import (
	models "github.com/smwbalfe/shrillecho-playlist-archive/backend/internal/spotify/endpoints/artist/models"
)

type ScrapeRequest struct {
	Artist string `json:"artist"`
	Depth  int    `json:"depth"`
}

type ScrapeResponse struct {
	Artists []models.Artist `json:"artists"`
}

type ScrapeTriggerResponse struct {
	ScrapeID string `json:"triggered"`
}
