package bootstrapping

import (
	"fmt"
	"os"

	"github.com/joho/godotenv"
)

// ConfigResolver provides a standardized way to retrieve configuration values,
// supporting fallback logic between differnt sources (Env, ConfigManager, etc.).
type ConfigResolver struct {
	// For now, this just wraps environment variables.
	// In the future, it will include a reference to the ConfigManager/Mongo.
}

// NewConfigResolver creates a new ConfigResolver.
// It optionally loads environment variables from a .env file.
func NewConfigResolver(envPath string) (*ConfigResolver, error) {
	if envPath != "" {
		if _, err := os.Stat(envPath); err == nil {
			if err := godotenv.Load(envPath); err != nil {
				return nil, fmt.Errorf("failed to load .env file: %w", err)
			}
		}
	}

	return &ConfigResolver{}, nil
}

// Get returns the value for a key, falling back to defaultValue if not found.
func (c *ConfigResolver) Get(key, defaultValue string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultValue
}

// Require returns the value for a key or errors if it is missing.
func (c *ConfigResolver) Require(key string) (string, error) {
	val := os.Getenv(key)
	if val == "" {
		return "", fmt.Errorf("missing required configuration key: %s", key)
	}
	return val, nil
}
