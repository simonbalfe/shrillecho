package config

import (
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/smwbalfe/shrillecho-playlist-archive/backend/internal/db"
	"github.com/smwbalfe/shrillecho-playlist-archive/backend/internal/repository"
	service "github.com/smwbalfe/shrillecho-playlist-archive/backend/internal/services"
	spotify "github.com/smwbalfe/shrillecho-playlist-archive/backend/internal/spotify"
)

type DatabaseConnections struct {
	Redis    *redis.Client
	Postgres *db.Queries
	PgConn   *pgxpool.Pool
}

type AppServices struct {
	ScrapeRepo repository.PostgresScrapeRepository
	Queue      *service.RedisQueue
	Spotify    *spotify.SpotifyClient
}

type SharedConfig struct {
	Services *AppServices
	Dbs      *DatabaseConnections
}
