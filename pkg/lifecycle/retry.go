package lifecycle

import (
	"context"
	"fmt"
	"math/rand"
	"time"
)

// RetryWithBackoff retries op with exponential backoff and jitter.
// baseSleep is doubled each attempt, capped at 8s. ±25% jitter applied.
// Respects ctx cancellation. Returns the last error if all attempts fail.
func RetryWithBackoff(ctx context.Context, maxAttempts int, baseSleep time.Duration, op func() error) error {
	var err error
	for attempt := 0; attempt < maxAttempts; attempt++ {
		if err = op(); err == nil {
			return nil
		}

		if attempt == maxAttempts-1 {
			break
		}

		sleep := baseSleep * time.Duration(1<<uint(attempt))
		if sleep > 8*time.Second {
			sleep = 8 * time.Second
		}

		jitter := time.Duration(rand.Int63n(int64(sleep)/2)) - sleep/4
		sleep += jitter

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(sleep):
		}
	}
	return fmt.Errorf("failed after %d attempts: %w", maxAttempts, err)
}
