package api

import (
	"net/http"

	"github.com/smwbalfe/shrillecho-playlist-archive/backend/internal/domain"
	service "github.com/smwbalfe/shrillecho-playlist-archive/backend/internal/services"
	"github.com/smwbalfe/shrillecho-playlist-archive/backend/internal/transport"
)

func (a *api) PlaylistHandler(w http.ResponseWriter, r *http.Request) {
	playlistID := r.URL.Query().Get("id")
	playlistTracks, err := a.spotifyService.GetTracksExpanded(playlistID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	sortedTracks := service.SortTracksByPlaycount(playlistTracks)
	Json(w, r, transport.PlaylistResponse{Playlists: sortedTracks})
}

func (a *api) AddToPlaylist(w http.ResponseWriter, r *http.Request) {
	var createPlaylist transport.CreatePlaylistRequest
	if err := ParseBody(r, &createPlaylist); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	userID, err := a.spotify.Users.GetCurrentID()
	if err != nil {
		panic(err)
	}
	link, err := a.spotify.Playlists.Create(createPlaylist.Tracks, userID, "Track Collection")
	if err != nil {
		panic(err)
	}
	Json(w, r, transport.CreatePlaylistResponse{Link: link})
}

func (a *api) ReadPlaylistGenres(w http.ResponseWriter, r *http.Request) {
	playlistID := r.URL.Query().Get("id")
	if playlistID == "" {
		http.Error(w, "no playlist ID provided", http.StatusInternalServerError)
		return
	}
	playlistGenres, err := a.spotifyService.GetPlaylistGenres(r.Context(), playlistID)
	if err != nil {
		http.Error(w, "no playlist ID provided", http.StatusInternalServerError)
		return
	}
	Json(w, r, playlistGenres)
}

func (a *api) FilterPlaylists(w http.ResponseWriter, r *http.Request) {
	var filterRequest transport.FilterPlaylistsRequest
	if err := ParseBody(r, &filterRequest); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	var allSimpleTracks []domain.SimpleTrack

	for _, playlist := range filterRequest.PlaylistsToFilter {
		loadedTracks, err := a.spotifyService.GetTracksExpanded(playlist)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		for _, lTrack := range loadedTracks {
			allSimpleTracks = append(allSimpleTracks, service.GetSimpleTrack(lTrack))
		}
	}

	if len(filterRequest.Genres) > 0 {
		var simpleTracks []domain.SimpleTrack
		tracks, err := a.spotifyService.FilterPlaylistByGenres(filterRequest.PlaylistsToFilter, filterRequest.Genres)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		for _, track := range tracks {
			simpleTracks = append(simpleTracks, service.GetSimpleTrack(track))
		}
		allSimpleTracks = simpleTracks
	}

	if filterRequest.ApplyUnique {
		var removeTracks []domain.SimpleTrack
		for _, uPlaylist := range filterRequest.PlaylistsToRemove {
			tracks, err := a.spotifyService.GetTracksExpanded(uPlaylist)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			for _, track := range tracks {
				removeTracks = append(removeTracks, service.GetSimpleTrack(track))
			}
		}
		dedupedTracks, err := a.spotifyService.RemoveKnownTracks(allSimpleTracks, removeTracks)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
		allSimpleTracks = dedupedTracks
	}
	allSimpleTracks = service.RemoveArtists(allSimpleTracks, []string{"ILLENIUM"})
	Json(w, r, transport.FilterPlaylistResponse{Tracks: allSimpleTracks})
}
