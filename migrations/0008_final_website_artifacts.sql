-- Phase 10: protected final website bundles stored in private Cloudflare R2.
-- Run after migration 0007; never expose this R2 bucket publicly.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS final_website_artifacts (
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 version INTEGER NOT NULL CHECK(version>0),
 storage_key TEXT NOT NULL UNIQUE,
 sha256_hex TEXT NOT NULL CHECK(length(sha256_hex)=64),
 byte_size INTEGER NOT NULL CHECK(byte_size>100 AND byte_size<=7500000),
 file_count INTEGER NOT NULL CHECK(file_count BETWEEN 1 AND 60),
 created_at TEXT NOT NULL,
 upload_confirmed_by TEXT NOT NULL DEFAULT 'owner',
 PRIMARY KEY(project_id,version)
);
CREATE INDEX IF NOT EXISTS final_website_artifacts_created
 ON final_website_artifacts(created_at DESC);
