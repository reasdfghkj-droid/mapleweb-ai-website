-- MapleWeb AI Phase 7: versioned final customer website handover/QA records.
-- After 0005_agent_recovery.sql. Private Manager only.
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS delivery_quality_reviews (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK(version>0),
  created_at TEXT NOT NULL,
  approved_by TEXT NOT NULL DEFAULT 'owner',
  delivery_method TEXT NOT NULL CHECK(delivery_method IN ('SOURCE_TRANSFER','HOSTED_WEBSITE')),
  final_artifact_reference TEXT NOT NULL,
  functional_test_reference TEXT NOT NULL,
  security_test_reference TEXT NOT NULL,
  mobile_accessibility_reference TEXT NOT NULL,
  ownership_handover_reference TEXT NOT NULL,
  customer_support_reference TEXT NOT NULL,
  checklist_json TEXT NOT NULL,
  approved INTEGER NOT NULL DEFAULT 1 CHECK(approved=1),
  PRIMARY KEY(project_id,version)
);
CREATE INDEX IF NOT EXISTS delivery_quality_reviews_recent
ON delivery_quality_reviews(created_at DESC);
