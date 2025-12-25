package api

import (
	"fmt"
	"math/rand"
	"net/http"
	"strconv"
	"time"

	"github.com/gofrs/uuid/v5"
	"github.com/rs/zerolog/log"
)

func (a *api) CollectPlaylists(w http.ResponseWriter, r *http.Request) {

	userID, ok := r.Context().Value("user").(uuid.UUID)
	if !ok {
		http.Error(w, "no uuid provided, have you registered...", http.StatusInternalServerError)
		return
	}

	limitInt, err := ParseQueryInt(r.URL.Query().Get("limit"))
	if err != nil {
		http.Error(w, "invalid limit parameter", http.StatusBadRequest)
		return
	}

	pool, err := ParseQueryInt(r.URL.Query().Get("pool"))

	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	playlists, err := a.playlistRepo.FetchCachedPlaylists(r.Context(), strconv.Itoa(pool))
	if len(playlists) == 0 || err != nil {
		fmt.Println(userID)
		artists, err := a.userRepo.GetUserArtistsByUserAndScrapeID(r.Context(), userID, int64(pool))

		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		playlists = a.spotifyService.GetArtistDiscoveredOn(artists, make(chan struct{}, 100))
		if err := a.playlistRepo.CachePlaylists(r.Context(), strconv.Itoa(pool), playlists, time.Hour); err != nil {
			log.Printf("Failed to cache playlists: %v", err)
		}
	}

	if limitInt > 0 && limitInt < len(playlists) {
		rand.Shuffle(len(playlists), func(i, j int) {
			playlists[i], playlists[j] = playlists[j], playlists[i]
		})
		playlists = playlists[:limitInt]
	}
	if len(playlists) == 0 {
		http.Error(w, "no playlists were found", http.StatusInternalServerError)
		return
	}
	Json(w, r, playlists)
}
