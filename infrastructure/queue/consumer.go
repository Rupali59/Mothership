package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// Consumer reads from a Redis stream in a consumer group.
type Consumer struct {
	client *Client
	stream string
	group  string
	name   string
}

// NewConsumer returns a consumer for the given stream and group.
func NewConsumer(client *Client, stream, group, consumerName string) *Consumer {
	if consumerName == "" {
		consumerName = "consumer-1"
	}
	return &Consumer{client: client, stream: stream, group: group, name: consumerName}
}

// Read blocks and reads one message. Caller should XACK after processing.
func (c *Consumer) Read(ctx context.Context, block time.Duration) ([]redis.XStream, error) {
	return c.client.rdb.XReadGroup(ctx, &redis.XReadGroupArgs{
		Group:    c.group,
		Consumer: c.name,
		Streams:  []string{c.stream, ">"},
		Count:    1,
		Block:    block,
	}).Result()
}

// Ack acknowledges a message by ID.
func (c *Consumer) Ack(ctx context.Context, id string) error {
	return c.client.rdb.XAck(ctx, c.stream, c.group, id).Err()
}

// ReclaimPending claims messages that have been pending longer than minIdle (PEL recovery - GAP 5 / Phase 4).
// Call this periodically (e.g. before Read or in a separate goroutine) to process messages left in the
// Pending Entries List by crashed consumers. Returns claimed messages and the next start ID (use "0-0" to start).
// Continue calling with the returned start ID until it is "0-0" to drain all reclaimable messages.
func (c *Consumer) ReclaimPending(ctx context.Context, minIdle time.Duration, startID string) ([]redis.XMessage, string, error) {
	if startID == "" {
		startID = "0-0"
	}
	return c.client.rdb.XAutoClaim(ctx, c.stream, c.group, c.name, minIdle, startID).Result()
}

// ParsePayload extracts the job payload from stream message values.
func ParsePayload(values interface{}) (map[string]interface{}, error) {
	m, ok := values.(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("unexpected message values type")
	}
	raw, _ := m["payload"].(string)
	if raw == "" {
		raw, _ = m["data"].(string)
	}
	if raw == "" {
		return nil, fmt.Errorf("no payload in message")
	}
	var out map[string]interface{}
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		return nil, err
	}
	return out, nil
}
