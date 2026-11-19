-- MapleWeb AI Phase 4: reliable chat -> Developer Agent handoff queue.
-- Apply AFTER migrations 0001, 0002 and 0003; ensure D1 foreign keys are on.
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS developer_build_jobs (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  status TEXT NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','BUILDING','STARTER_READY','FAILED')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0),
  generator TEXT NOT NULL DEFAULT 'fixed-template',
  output_json TEXT,
  error_code TEXT,
  CHECK((status='STARTER_READY' AND output_json IS NOT NULL)
        OR status!='STARTER_READY')
);
CREATE INDEX IF NOT EXISTS developer_jobs_status_created
  ON developer_build_jobs(status,created_at);
