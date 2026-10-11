-- Evidence bytes stored in Postgres so the web service can render report screenshots
-- (worker and web run in separate containers; worker's local EVIDENCE_DIR is not shared).
CREATE TABLE IF NOT EXISTS evidence_blobs (
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  byte_size INT NOT NULL,
  data BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, name)
);
