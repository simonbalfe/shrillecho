package models

import (
	sharedModels "github.com/smwbalfe/shrillecho-playlist-archive/backend/internal/spotify/shared"
)

type DiscoveredResponse struct {
	Data struct {
		ArtistUnion ArtistDiscoveredOn `json:"artistUnion"`
	} `json:"data"`
	Extensions map[string]interface{} `json:"extensions"`
}

type ArtistDiscoveredOn struct {
	TypeName string               `json:"__typename"`
	ID       string               `json:"id"`
	Profile  sharedModels.Profile `json:"profile"`
	Related  Related              `json:"relatedContent"`
	URI      string               `json:"uri"`
}

type Related struct {
	DiscoveredOn DiscoveredContent `json:"discoveredOnV2"`
}

type DiscoveredContent struct {
	Items      []ContentItem `json:"items"`
	TotalCount int           `json:"totalCount"`
}

type ContentItem struct {
	Data ItemData `json:"data"`
}

type ItemData struct {
	TypeName    string                `json:"__typename"`
	Description string                `json:"description,omitempty"`
	Images      ImagesList            `json:"images,omitempty"`
	Name        string                `json:"name,omitempty"`
	OwnerV2     OwnerDataDiscoveredOn `json:"ownerV2,omitempty"`
	URI         string                `json:"uri,omitempty"`
}

type ImagesList struct {
	Items []ImageItem `json:"items"`
}

type ImageItem struct {
	Sources []sharedModels.ImageSource `json:"sources"`
}

type OwnerDataDiscoveredOn struct {
	Data OwnerDiscoveredOn `json:"data"`
}

type OwnerDiscoveredOn struct {
	TypeName string `json:"__typename"`
	Name     string `json:"name"`
}
