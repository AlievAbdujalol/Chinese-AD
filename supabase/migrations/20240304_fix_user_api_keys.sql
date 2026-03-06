-- Consolidated migration to ensure user_api_keys table exists and is correct
CREATE TABLE IF NOT EXISTS user_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_api_keys ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'gemini';
ALTER TABLE user_api_keys ADD COLUMN IF NOT EXISTS encrypted_key text NOT NULL DEFAULT '';
ALTER TABLE user_api_keys ADD COLUMN IF NOT EXISTS key_hint text NOT NULL DEFAULT '';

-- Remove old single-provider constraint if it exists
ALTER TABLE user_api_keys DROP CONSTRAINT IF EXISTS user_api_keys_user_id_key;

-- Ensure new composite constraint
ALTER TABLE user_api_keys DROP CONSTRAINT IF EXISTS user_api_keys_user_id_provider_key;
ALTER TABLE user_api_keys ADD CONSTRAINT user_api_keys_user_id_provider_key UNIQUE (user_id, provider);

-- RLS
ALTER TABLE user_api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own keys" ON user_api_keys;
CREATE POLICY "Users can manage their own keys" ON user_api_keys FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
