package repository

import (
	"github.com/smwbalfe/shrillecho-playlist-archive/backend/internal/db"
	"context"

	"github.com/jackc/pgx/v5/pgtype"
)

type PostgresScrapeRepository struct {
	postgres *db.Queries
}

func NewPostgresScrapeRepository(pg *db.Queries) PostgresScrapeRepository {
	return PostgresScrapeRepository{
		postgres: pg,
	}
}

func (r *PostgresScrapeRepository) CreateScrape(ctx context.Context, userID pgtype.UUID) (int64, error) {
	return r.postgres.CreateScrape(ctx, userID)
}

func (r *PostgresScrapeRepository) CreateScrapeArtist(ctx context.Context, scrapeId int64, artistID int64) error {
	return r.postgres.CreateScrapeArtist(ctx, db.CreateScrapeArtistParams{
		ScrapeID: scrapeId,
		ArtistID: artistID,
	})
}

func (r *PostgresScrapeRepository) GetScrapeByID(ctx context.Context, scrapeID int64) (bool, error) {
	exists, err := r.postgres.GetScrapeByID(ctx, scrapeID)
	if err != nil {
		return false, err
	}
	return exists, nil
}
