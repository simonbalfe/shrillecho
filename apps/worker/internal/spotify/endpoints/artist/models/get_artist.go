package models

import (
	sharedModels "github.com/smwbalfe/shrillecho/worker/internal/spotify/shared"
)

type ArtistResponse struct {
	Artists []ArtistData `json:"artists"`
}

type ArtistData struct {
	ExternalURLs sharedModels.ExternalURLs `json:"external_urls"`
	Followers    sharedModels.Followers    `json:"followers"`
	Genres       []string                  `json:"genres"`
	Href         string                    `json:"href"`
	ID           string                    `json:"id"`
	Images       []sharedModels.Image      `json:"images"`
	Name         string                    `json:"name"`
	Popularity   int                       `json:"popularity"`
	Type         string                    `json:"type"`
	URI          string                    `json:"uri"`
}

