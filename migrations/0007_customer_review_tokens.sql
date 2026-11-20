-- Phase 8: private customer quote, final review and delivery receipt tokens.
-- Apply after 0006. Cloudflare D1; no raw bearer token is stored here.
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS customer_review_tokens (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK(version>0),
  purpose TEXT NOT NULL CHECK(purpose IN ('QUOTE','FINAL_REVIEW','DELIVERY_RECEIPT')),
  token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash)=64),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  revoked_at TEXT,
  handover_reference TEXT,
  view_count INTEGER NOT NULL DEFAULT 0 CHECK(view_count>=0),
  CHECK(purpose='DELIVERY_RECEIPT' OR handover_reference IS NULL)
);
CREATE INDEX IF NOT EXISTS customer_review_tokens_project
  ON customer_review_tokens(project_id,version,purpose,created_at DESC);
CREATE INDEX IF NOT EXISTS customer_review_tokens_expiry
  ON customer_review_tokens(expires_at);

CREATE TABLE IF NOT EXISTS customer_review_responses (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  token_id TEXT NOT NULL UNIQUE REFERENCES customer_review_tokens(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK(version>0),
  purpose TEXT NOT NULL CHECK(purpose IN ('QUOTE','FINAL_REVIEW','DELIVERY_RECEIPT')),
  decision TEXT NOT NULL CHECK(decision IN ('ACCEPT','REQUEST_CHANGES','APPROVE','RECEIVED')),
  created_at TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '' CHECK(length(note)<=900)
);
CREATE INDEX IF NOT EXISTS customer_review_responses_project
  ON customer_review_responses(project_id,version,purpose,decision,created_at DESC);
