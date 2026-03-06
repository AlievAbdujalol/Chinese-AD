-- Migration to support multiple API key providers
-- 1. Drop the existing unique constraint on user_id
ALTER TABLE user_api_keys DROP CONSTRAINT IF EXISTS user_api_keys_user_id_key;

-- 2. Add provider column
ALTER TABLE user_api_keys ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'gemini';

-- 3. Add new composite unique constraint
ALTER TABLE user_api_keys ADD CONSTRAINT user_api_keys_user_id_provider_key UNIQUE (user_id, provider);

-- 4. Update existing records to be 'gemini' (already default, but good to be explicit if needed)
UPDATE user_api_keys SET provider = 'gemini' WHERE provider IS NULL;
