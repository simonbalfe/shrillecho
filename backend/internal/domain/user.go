package domain

import (
	"context"
	"github.com/gofrs/uuid/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

type UserRepository interface {
	GetUserArtists(ctx context.Context, userID uuid.UUID) ([]string, error)
	CreateUser(ctx context.Context, userID uuid.UUID) (pgtype.UUID, error)
}
