package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/redis/go-redis/v9"
	"time"
)

type RedisArtistGenreRepository struct {
	redis *redis.Client
}

func NewRedisArtistGenreRepository(client *redis.Client) RedisArtistGenreRepository {
	return RedisArtistGenreRepository{
		redis: client,
	}
}

func (r *RedisArtistGenreRepository) FetchCachedArtistGenres(ctx context.Context, artistID string) ([]string, error) {
	cacheKey := fmt.Sprintf("artist:genres:%s", artistID)
	cached, err := r.redis.Get(ctx, cacheKey).Result()
	if err != nil {
		return nil, err
	}
	var genres []string
	if err := json.Unmarshal([]byte(cached), &genres); err != nil {
		return nil, err
	}
	return genres, nil
}

func (r *RedisArtistGenreRepository) CacheArtistGenres(ctx context.Context, artistID string, genres []string, ttl time.Duration) error {
	cacheKey := fmt.Sprintf("artist:genres:%s", artistID)
	cached, err := json.Marshal(genres)
	if err != nil {
		return err
	}
	return r.redis.Set(ctx, cacheKey, cached, ttl).Err()
}

func (r *RedisArtistGenreRepository) FetchCachedArtistGenresMap(ctx context.Context, artistIDs []string) (map[string][]string, error) {
	if len(artistIDs) == 0 {
		return map[string][]string{}, nil
	}
	pipe := r.redis.Pipeline()
	cmds := make(map[string]*redis.StringCmd)
	for _, artistID := range artistIDs {
		cacheKey := fmt.Sprintf("artist:genres:%s", artistID)
		cmds[artistID] = pipe.Get(ctx, cacheKey)
	}
	_, err := pipe.Exec(ctx)
	if err != nil && err != redis.Nil {
		return nil, err
	}
	result := make(map[string][]string)
	for artistID, cmd := range cmds {
		val, err := cmd.Result()
		if err == redis.Nil {
			continue
		}
		if err != nil {
			continue
		}
		var genres []string
		if err := json.Unmarshal([]byte(val), &genres); err != nil {
			continue
		}
		result[artistID] = genres
	}
	return result, nil
}

func (r *RedisArtistGenreRepository) CacheArtistGenresMap(ctx context.Context, artistGenresMap map[string][]string, ttl time.Duration) error {
	if len(artistGenresMap) == 0 {
		return nil
	}
	pipe := r.redis.Pipeline()
	for artistID, genres := range artistGenresMap {
		cacheKey := fmt.Sprintf("artist:genres:%s", artistID)
		cached, err := json.Marshal(genres)
		if err != nil {
			continue
		}
		pipe.Set(ctx, cacheKey, cached, ttl)
	}
	_, err := pipe.Exec(ctx)
	return err
}
