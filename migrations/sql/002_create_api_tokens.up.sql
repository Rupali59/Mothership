-- Create API tokens table for user authentication
CREATE TABLE IF NOT EXISTS api_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    scopes TEXT[] DEFAULT '{}',
    last_used_at TIMESTAMP,
    expires_at TIMESTAMP,
    revoked_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_api_tokens_user_id ON api_tokens(user_id);

-- Create index on token_hash for authentication
CREATE INDEX IF NOT EXISTS idx_api_tokens_token_hash ON api_tokens(token_hash);

-- Create index on expires_at for cleanup queries
CREATE INDEX IF NOT EXISTS idx_api_tokens_expires_at ON api_tokens(expires_at) WHERE expires_at IS NOT NULL;

-- Create partial index for active tokens (not revoked, not expired)
CREATE INDEX IF NOT EXISTS idx_api_tokens_active ON api_tokens(user_id, token_hash) 
    WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP);

-- Comments for documentation
COMMENT ON TABLE api_tokens IS 'API tokens for programmatic access';
COMMENT ON COLUMN api_tokens.token_hash IS 'Hashed version of the actual token';
COMMENT ON COLUMN api_tokens.scopes IS 'Array of permission scopes (e.g., read, write, admin)';
COMMENT ON COLUMN api_tokens.last_used_at IS 'Last time this token was used for authentication';
COMMENT ON COLUMN api_tokens.revoked_at IS 'When the token was revoked (NULL if active)';
