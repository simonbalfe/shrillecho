package repository

import (
	"github.com/smwbalfe/shrillecho-playlist-archive/backend/internal/domain"
	"context"
	"encoding/json"
	"fmt"
	"github.com/redis/go-redis/v9"
	"time"
)

type RedisPlaylistRepository struct {
	redis *redis.Client
}

func NewRedisPlaylistRepository(client *redis.Client) RedisPlaylistRepository {
	return RedisPlaylistRepository{
		redis: client,
	}
}

func (r *RedisPlaylistRepository) FetchCachedPlaylists(ctx context.Context, pool string) ([]domain.PlaylistArchiveItem, error) {
	cacheKey := fmt.Sprintf("playlists:%s", pool)
	cached, err := r.redis.Get(ctx, cacheKey).Result()
	if err != nil {
		return nil, err
	}
	var playlists []domain.PlaylistArchiveItem
	if err := json.Unmarshal([]byte(cached), &playlists); err != nil {
		return nil, err
	}
	return playlists, nil
}

func (r *RedisPlaylistRepository) CachePlaylists(ctx context.Context, pool string, playlists []domain.PlaylistArchiveItem, ttl time.Duration) error {
	cacheKey := fmt.Sprintf("playlists:%s", pool)
	cached, err := json.Marshal(playlists)
	if err != nil {
		return err
	}
	return r.redis.Set(ctx, cacheKey, cached, ttl).Err()
}
