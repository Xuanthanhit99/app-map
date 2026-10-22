-- Email verification and password reset (account recovery).
-- Tokens are opaque; only their SHA-256 is stored. Single use, short-lived, bound to the email
-- address they were issued for (a token stops working if the account email changes).
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
UPDATE users SET email_verified_at = created_at WHERE email_verified AND email_verified_at IS NULL;

CREATE TABLE email_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     text NOT NULL CHECK (purpose IN ('VERIFY_EMAIL','RESET_PASSWORD')),
  token_hash  bytea NOT NULL UNIQUE,
  email       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  CHECK (expires_at > created_at)
);
CREATE INDEX email_tokens_user_purpose ON email_tokens (user_id, purpose) WHERE used_at IS NULL;

-- Push delivery bookkeeping: which notifications were pushed, and tokens the provider rejected.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS pushed_at timestamptz;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS push_error text;
ALTER TABLE push_tokens ADD COLUMN IF NOT EXISTS disabled_at timestamptz;
ALTER TABLE push_tokens ADD COLUMN IF NOT EXISTS disabled_reason text;
