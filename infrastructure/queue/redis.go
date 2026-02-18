package queue

import (
	"context"
	"encoding/json"
	"time"

	"github.com/redis/go-redis/v9"
)

// Client wraps Redis for Pulse streams (XADD, consumer groups, XACK).
type Client struct {
	rdb *redis.Client
}

// New creates a Redis client for the given URL (e.g. redis://localhost:6379).
func New(redisURL string) (*Client, error) {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, err
	}
	rdb := redis.NewClient(opts)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := rdb.Ping(ctx).Err(); err != nil {
		return nil, err
	}
	return &Client{rdb: rdb}, nil
}

// EnsureConsumerGroup creates the stream and consumer group if they don't exist.
func (c *Client) EnsureConsumerGroup(ctx context.Context, stream, group string) error {
	err := c.rdb.XGroupCreateMkStream(ctx, stream, group, "0").Err()
	if err != nil && err.Error() != "BUSYGROUP Consumer Group name already exists" {
		return err
	}
	return nil
}

// AddJob appends a payload to the stream (e.g. jobs.process). Returns the message ID.
func (c *Client) AddJob(ctx context.Context, stream string, payload map[string]interface{}) (string, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	id, err := c.rdb.XAdd(ctx, &redis.XAddArgs{
		Stream: stream,
		Values: map[string]interface{}{"payload": string(body), "data": body},
	}).Result()
	if err != nil {
		return "", err
	}
	return id, nil
}

// AddJobString appends a raw JSON string to the stream.
func (c *Client) AddJobString(ctx context.Context, stream string, payload string) (string, error) {
	id, err := c.rdb.XAdd(ctx, &redis.XAddArgs{
		Stream: stream,
		Values: map[string]interface{}{"payload": payload, "data": payload},
	}).Result()
	if err != nil {
		return "", err
	}
	return id, nil
}

const defaultStream = "jobs.process"

// AddTaskJob pushes a task_process / task_sync job to the default stream.
func (c *Client) AddTaskJob(ctx context.Context, jobType string, workspaceID string, payload map[string]interface{}) (string, error) {
	if payload == nil {
		payload = make(map[string]interface{})
	}
	payload["job_type"] = jobType
	payload["type"] = jobType
	payload["workspace_id"] = workspaceID
	return c.AddJob(ctx, defaultStream, payload)
}

// Close closes the Redis connection.
func (c *Client) Close() error {
	return c.rdb.Close()
}

// StreamExists returns true if the stream exists.
func (c *Client) StreamExists(ctx context.Context, stream string) (bool, error) {
	n, err := c.rdb.Exists(ctx, stream).Result()
	if err != nil {
		return false, err
	}
	return n > 0, nil
}
