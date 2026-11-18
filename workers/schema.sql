-- Create this table in a private Cloudflare D1 database before enabling submissions.
-- Restrict manager access to a secret token; never place tokens in GitHub.
CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  answers_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','REVIEWING','CLOSED'))
);
CREATE INDEX IF NOT EXISTS submissions_created_at_idx ON submissions(created_at DESC);

-- A keyed hash of the requester's IP, never a plaintext IP address.
-- Expired counters are removed by the confirmed manager prune operation.
CREATE TABLE IF NOT EXISTS submission_rate_limits (
  client_key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  attempts INTEGER NOT NULL CHECK (attempts >= 1)
);
CREATE INDEX IF NOT EXISTS submission_rate_limits_window_idx ON submission_rate_limits(window_start);
