package service

import (
	"fmt"
	"sort"
	"strconv"

	"github.com/smwbalfe/shrillecho-playlist-archive/backend/internal/domain"
	models "github.com/smwbalfe/shrillecho-playlist-archive/backend/internal/spotify/endpoints/playlist/models"
)

// GetTrackMetadataSimple extracts the track name and first artist name from a SimpleTrack.
func GetTrackMetadataSimple(track domain.SimpleTrack) (string, string) {
	var artistName string
	if len(track.Artists) > 0 {
		artistName = track.Artists[0].Name
	}
	return track.Name, artistName
}

// RemoveDuplicates removes duplicate playlist items based on URI.
func RemoveDuplicates(playlist []domain.PlaylistArchiveItem) []domain.PlaylistArchiveItem {
	seen := make(map[string]bool)
	result := make([]domain.PlaylistArchiveItem, 0, len(playlist))
	for _, item := range playlist {
		if !seen[item.URI] {
			seen[item.URI] = true
			result = append(result, item)
		}
	}
	return result
}

// SortTracksByPlaycount sorts tracks by playcount ascending and returns simplified tracks.
func SortTracksByPlaycount(tracks []models.Track) []domain.SimplifiedTrack {
	simplified := make([]domain.SimplifiedTrack, 0)
	for _, track := range tracks {
		playcount, err := strconv.Atoi(track.Playcount)
		if err != nil || playcount == 0 {
			continue
		}
		coverArtURL := ""
		if len(track.AlbumOfTrack.CoverArt.Sources) > 0 {
			coverArtURL = track.AlbumOfTrack.CoverArt.Sources[0].URL
		}
		simplified = append(simplified, domain.SimplifiedTrack{
			Playcount:   playcount,
			CoverArtURL: coverArtURL,
			Name:        track.Name,
			URI:         track.URI,
		})
	}
	sort.Slice(simplified, func(i, j int) bool {
		return simplified[i].Playcount < simplified[j].Playcount
	})
	return simplified
}

// GetSimpleTrack converts a Track model to a SimpleTrack domain object.
func GetSimpleTrack(track models.Track) domain.SimpleTrack {
	var artists []domain.ArtistSimple
	for _, artist := range track.Artists.Items {
		artists = append(artists, domain.ArtistSimple{
			Name: artist.Profile.Name,
		})
	}
	var sources []domain.Source
	for _, source := range track.AlbumOfTrack.CoverArt.Sources {
		sources = append(sources, domain.Source{
			URL:    source.URL,
			Height: source.Height,
			Width:  source.Width,
		})
	}
	return domain.SimpleTrack{
		Name:      track.Name,
		ID:        track.URI,
		Artists:   artists,
		Playcount: track.Playcount,
		CoverArt: domain.CoverArt{
			Sources: sources,
		},
		Genres: track.Genres,
	}
}

// RemoveArtists filters out tracks that have any of the excluded artists.
func RemoveArtists(allSimpleTracks []domain.SimpleTrack, excludedArtists []string) []domain.SimpleTrack {
	excludedMap := make(map[string]struct{})
	for _, artist := range excludedArtists {
		excludedMap[artist] = struct{}{}
	}
	filteredTracks := []domain.SimpleTrack{}
	for _, track := range allSimpleTracks {
		excluded := false
		for _, artist := range track.Artists {
			if _, exists := excludedMap[artist.Name]; exists {
				fmt.Printf("removing: %v", artist.Name)
				excluded = true
				break
			}
		}
		if !excluded {
			filteredTracks = append(filteredTracks, track)
		}
	}
	return filteredTracks
}
