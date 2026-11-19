-- MapleWeb AI Phase 3: private, expiring customer previews and owner notification inbox.
-- Apply AFTER 0001 and 0002 before activating secure submissions.
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS preview_shares (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK(version>0),
  token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash)=64),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  views INTEGER NOT NULL DEFAULT 0 CHECK(views>=0),
  max_views INTEGER NOT NULL DEFAULT 30 CHECK(max_views BETWEEN 1 AND 100)
);
CREATE INDEX IF NOT EXISTS preview_shares_project ON preview_shares(project_id,created_at DESC);
CREATE INDEX IF NOT EXISTS preview_shares_expiry ON preview_shares(expires_at);

-- Privacy-safe internal notification queue: NO email, phone, IP or message body.
-- Notifications appear ONLY in the separately authenticated Manager dashboard.
-- An inbox record does NOT mean a customer email or push notification was sent.
CREATE TABLE IF NOT EXISTS owner_notifications (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK(category IN ('NEW_REQUEST','REVISION_REQUESTED','READY_FOR_REVIEW','DELIVERY_RECORDED')),
  created_at TEXT NOT NULL,
  read_at TEXT,
  delivered_externally INTEGER NOT NULL DEFAULT 0 CHECK(delivered_externally=0)
);
CREATE INDEX IF NOT EXISTS owner_notifications_unread ON owner_notifications(read_at,created_at DESC);
