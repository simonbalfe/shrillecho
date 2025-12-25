package repository

import (
	"github.com/smwbalfe/shrillecho-playlist-archive/backend/internal/db"
	"context"
	"github.com/gofrs/uuid/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

type PostgresUserRepository struct {
	postgres *db.Queries
}

func NewPostgresUserRepository(postgres *db.Queries) PostgresUserRepository {
	return PostgresUserRepository{
		postgres: postgres,
	}
}

func (r *PostgresUserRepository) GetUserArtists(ctx context.Context, userID uuid.UUID) ([]string, error) {
	return r.postgres.GetUserArtists(ctx, pgtype.UUID{Bytes: userID, Valid: true})
}

func (r *PostgresUserRepository) CreateUser(ctx context.Context, userID uuid.UUID) (pgtype.UUID, error) {
	return r.postgres.CreateUser(ctx, pgtype.UUID{Bytes: userID, Valid: true})
}

func (r *PostgresUserRepository) GetUserByID(ctx context.Context, userID uuid.UUID) (bool, error) {
	exists, err := r.postgres.GetUserByID(ctx, pgtype.UUID{Bytes: userID, Valid: true})
	if err != nil {
		return false, err
	}
	return exists, nil
}

func (r *PostgresUserRepository) GetUserArtistsByUserAndScrapeID(ctx context.Context, userID uuid.UUID, scrapeID int64) ([]string, error) {
	return r.postgres.GetArtistsByUserAndScrapeID(ctx, db.GetArtistsByUserAndScrapeIDParams{
		UserID: pgtype.UUID{Bytes: userID, Valid: true},
		ID:     scrapeID,
	})
}
