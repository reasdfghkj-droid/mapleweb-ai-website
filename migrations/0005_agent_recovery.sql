-- MapleWeb AI Phase 5: protect manual retries for background Developer jobs.
-- Apply AFTER 0004_developer_handoff_queue.sql.
-- No automatic retries for AI (paid) jobs.
PRAGMA foreign_keys = ON;

ALTER TABLE developer_build_jobs
ADD COLUMN manual_retries INTEGER NOT NULL DEFAULT 0
CHECK (manual_retries BETWEEN 0 AND 1);

CREATE INDEX IF NOT EXISTS developer_jobs_stale
ON developer_build_jobs(status,started_at);
