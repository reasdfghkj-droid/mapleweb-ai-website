-- Phase 2 customer-order and delivery workflow for Cloudflare D1.
-- Apply only AFTER 0001_secure_sales_submissions.sql and before enabling intake.
-- All client-visible website drafts are PRIVATE, never directly served by the public Worker.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL UNIQUE REFERENCES submissions(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'NEW'
    CHECK (status IN ('NEW','REVIEWING','QUOTED','ACCEPTED','BUILDING','PREVIEW_READY','DELIVERED','CANCELLED')),
  current_version INTEGER NOT NULL DEFAULT 1 CHECK(current_version > 0),
  generator TEXT NOT NULL DEFAULT 'fixed-template',
  draft_html TEXT NOT NULL,
  quote_approved_version INTEGER,
  customer_approved_version INTEGER,
  owner_approved_version INTEGER,
  preview_verified INTEGER NOT NULL DEFAULT 0 CHECK(preview_verified IN (0,1)),
  security_check_passed INTEGER NOT NULL DEFAULT 0 CHECK(security_check_passed IN (0,1)),
  outstanding_revisions INTEGER NOT NULL DEFAULT 0 CHECK(outstanding_revisions IN (0,1)),
  approved_final_total_cad_cents INTEGER,
  owner_approved_invoice_total_cad_cents INTEGER,
  quote_accepted_at TEXT,
  delivered_at TEXT,
  delivery_confirmed_at TEXT,
  delivery_evidence_reference TEXT,
  quote_evidence_reference TEXT,
  quote_acceptance_evidence_reference TEXT,
  customer_approval_evidence_reference TEXT,
  customer_receipt_evidence_reference TEXT,
  revision_evidence_reference TEXT,
  invoice_due_days INTEGER,
  invoice_due_terms_accepted INTEGER NOT NULL DEFAULT 0 CHECK(invoice_due_terms_accepted IN (0,1)),
  owner_approved_invoice INTEGER NOT NULL DEFAULT 0 CHECK(owner_approved_invoice IN (0,1)),
  stripe_invoice_id TEXT UNIQUE,
  stripe_customer_id TEXT,
  invoice_status TEXT,
  paid_at TEXT,
  row_version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS projects_status_created ON projects(status,created_at DESC);
CREATE INDEX IF NOT EXISTS projects_submission ON projects(submission_id);

-- Audit trail contains limited metadata; NEVER put API keys, card numbers, raw IPs, or raw PII in details_json.
CREATE TABLE IF NOT EXISTS project_events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS project_events_by_project ON project_events(project_id,created_at DESC);

-- Event replay guard, available after a verified Stripe webhook is configured.
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  stripe_event_id TEXT PRIMARY KEY,
  received_at TEXT NOT NULL,
  type TEXT NOT NULL
);

-- This reserved ledger prevents accidental multiple invoice drafts per project.
-- MANUAL_REVIEW is required if a partial Stripe API operation occurs.
CREATE TABLE IF NOT EXISTS invoice_operations (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('RESERVED','DRAFT_CREATED','MANUAL_REVIEW','SENT','PAID')),
  stripe_customer_id TEXT,
  stripe_invoice_id TEXT UNIQUE,
  idempotency_key TEXT NOT NULL UNIQUE
);
