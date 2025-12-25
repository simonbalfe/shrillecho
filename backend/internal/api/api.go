package api

import (
	"context"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/cors"
	"github.com/gorilla/websocket"
	"github.com/rs/zerolog/log"
	"github.com/smwbalfe/shrillecho-playlist-archive/backend/internal/api/middleware"
	"github.com/smwbalfe/shrillecho-playlist-archive/backend/internal/config"
	"github.com/smwbalfe/shrillecho-playlist-archive/backend/internal/repository"
	service "github.com/smwbalfe/shrillecho-playlist-archive/backend/internal/services"
	spotify "github.com/smwbalfe/shrillecho-playlist-archive/backend/internal/spotify"
	"github.com/smwbalfe/shrillecho-playlist-archive/backend/internal/workers"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type api struct {
	environment    *config.Environment
	spotify        *spotify.SpotifyClient
	queue          service.RedisQueue
	spotifyService service.SpotifyService
	scrapeRepo     repository.PostgresScrapeRepository
	userRepo       repository.PostgresUserRepository
	playlistRepo   repository.RedisPlaylistRepository
	scrapeWorker   *workers.ArtistScrapeWorker
}

func NewApi(ctx context.Context, sharedCfg *config.SharedConfig, env *config.Environment) *api {
	return &api{
		environment:    env,
		spotify:        sharedCfg.Services.Spotify,
		queue:          *sharedCfg.Services.Queue,
		spotifyService: service.NewSpotifyService(sharedCfg.Services.Spotify),
		scrapeRepo:     sharedCfg.Services.ScrapeRepo,
		userRepo:       repository.NewPostgresUserRepository(sharedCfg.Dbs.Postgres),
		playlistRepo:   repository.NewRedisPlaylistRepository(sharedCfg.Dbs.Redis),
	}
}

func (a *api) SetScrapeWorker(worker *workers.ArtistScrapeWorker) {
	a.scrapeWorker = worker
}

func (a *api) Routes() *chi.Mux {
	r := chi.NewRouter()

	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   a.environment.AllowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	r.Group(func(r chi.Router) {
		r.Get("/ws", func(w http.ResponseWriter, r *http.Request) {
			conn, err := upgrader.Upgrade(w, r, nil)
			if err != nil {
				log.Error().Err(err).Msg("Failed to upgrade connection")
				return
			}
			defer conn.Close()

			if a.scrapeWorker == nil {
				log.Error().Msg("Scrape worker not initialized")
				return
			}

			a.scrapeWorker.SetWebsocketConnection(conn)

			for {
				_, _, err := conn.ReadMessage()
				if err != nil {
					break
				}
			}
		})
	})

	r.Group(func(r chi.Router) {
		r.Use(middleware.CheckAuth)
		r.Route("/spotify", func(r chi.Router) {
			r.Get("/playlist", a.PlaylistHandler)
			r.Get("/playlists/genres", a.ReadPlaylistGenres)
			r.Post("/playlist/filter", a.FilterPlaylists)
			r.Post("/playlist/create", a.AddToPlaylist)
		})
	})

	r.Group(func(r chi.Router) {
		r.Use(middleware.CheckAuth)

		r.Route("/scrape", func(r chi.Router) {
			r.Post("/artists", a.ArtistScrape)
			r.Get("/playlists", a.CollectPlaylists)
			r.Get("/playlists_seed", a.PlaylistSeededScrape)
		})

		r.Route("/users", func(r chi.Router) {
			r.Post("/", a.RegisterUser)
		})
	})

	return r
}
