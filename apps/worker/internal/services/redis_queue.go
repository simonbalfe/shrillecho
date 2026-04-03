package service

import (
	"context"
	"encoding/json"
	"github.com/redis/go-redis/v9"
)

type RedisQueue struct {
	client        redis.UniversalClient
	responseQueue string
	requestQueue  string
}

func NewRedisQueue(client redis.UniversalClient) *RedisQueue {
	return &RedisQueue{
		client:        client,
		responseQueue: "response_queue",
		requestQueue:  "request_queue",
	}
}

func (q *RedisQueue) PushRequest(ctx context.Context, item interface{}) error {
	bytes, err := json.Marshal(item)
	if err != nil {
		return err
	}
	return q.client.LPush(ctx, q.requestQueue, bytes).Err()
}

func (q *RedisQueue) PopResponse(ctx context.Context, result interface{}) error {
	resp, err := q.client.BRPop(ctx, 0, q.responseQueue).Result()
	if err != nil {
		return err
	}
	return json.Unmarshal([]byte(resp[1]), result)
}

func (q *RedisQueue) PopRequest(ctx context.Context, result interface{}) error {
	resp, err := q.client.BRPop(ctx, 0, q.requestQueue).Result()
	if err != nil {
		return err
	}
	return json.Unmarshal([]byte(resp[1]), result)
}

func (q *RedisQueue) PushResponse(ctx context.Context, item interface{}) error {
	bytes, err := json.Marshal(item)
	if err != nil {
		return err
	}
	return q.client.LPush(ctx, q.responseQueue, bytes).Err()
}
