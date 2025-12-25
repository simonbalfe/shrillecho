package models

import (
	sharedModels "github.com/smwbalfe/shrillecho-playlist-archive/backend/internal/spotify/shared"
)

type AvatarImage struct {
	Sources []sharedModels.ImageSource `json:"sources"`
}

type Visuals struct {
	AvatarImage AvatarImage `json:"avatarImage"`
}

type Artist struct {
	ID      string               `json:"id"`
	Profile sharedModels.Profile `json:"profile"`
	URI     string               `json:"uri"`
	Visuals Visuals              `json:"visuals"`
}

type RelatedArtists struct {
	Items      []Artist `json:"items"`
	TotalCount int      `json:"totalCount"`
}

type RelatedContent struct {
	RelatedArtists RelatedArtists `json:"relatedArtists"`
}

type ArtistUnion struct {
	ID             string               `json:"id"`
	Profile        sharedModels.Profile `json:"profile"`
	RelatedContent RelatedContent       `json:"relatedContent"`
}

type SpotifyData struct {
	ArtistUnion ArtistUnion `json:"artistUnion"`
}

type ArtistRelated struct {
	Data SpotifyData `json:"data"`
}
