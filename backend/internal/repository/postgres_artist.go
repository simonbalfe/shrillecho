package repository

import (
	"github.com/smwbalfe/shrillecho-playlist-archive/backend/internal/db"
	"context"
)

type PostgresArtistRepository struct {
	postgres *db.Queries
}

func NewPostgresArtistRepository(pg *db.Queries) PostgresArtistRepository {
	return PostgresArtistRepository{
		postgres: pg,
	}
}

func (r *PostgresArtistRepository) CreateArtist(ctx context.Context, artistID string) (int64, error) {
	return r.postgres.CreateArtist(ctx, artistID)
}
