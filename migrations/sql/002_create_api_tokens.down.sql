-- Drop indexes first
DROP INDEX IF EXISTS idx_api_tokens_active;
DROP INDEX IF EXISTS idx_api_tokens_expires_at;
DROP INDEX IF EXISTS idx_api_tokens_token_hash;
DROP INDEX IF EXISTS idx_api_tokens_user_id;

-- Drop table
DROP TABLE IF EXISTS api_tokens CASCADE;
