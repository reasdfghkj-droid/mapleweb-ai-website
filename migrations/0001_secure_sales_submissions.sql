-- MapleWeb AI secure customer request storage (Cloudflare D1).
-- Apply to the correct D1 database only after owner approval.
CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  answers_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'NEW'
);
CREATE INDEX IF NOT EXISTS submissions_created_at_idx ON submissions(created_at DESC);
CREATE TABLE IF NOT EXISTS submission_rate_limits (
  client_key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  attempts INTEGER NOT NULL
);
