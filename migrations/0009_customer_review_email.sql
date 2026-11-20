-- MapleWeb AI transactional email handoff. Only after migration 0008.
-- Tracks unique customer review link delivery attempts, not marketing messages.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS customer_review_email_operations (
 token_id TEXT PRIMARY KEY REFERENCES customer_review_tokens(id) ON DELETE CASCADE,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 provider TEXT NOT NULL DEFAULT 'resend',
 status TEXT NOT NULL CHECK(status IN ('RESERVED','SENT','MANUAL_REVIEW')),
 provider_message_id TEXT UNIQUE,
 recipient_email_hash TEXT NOT NULL CHECK(length(recipient_email_hash)=64),
 idempotency_key TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS customer_review_email_status
 ON customer_review_email_operations(status,updated_at DESC);
