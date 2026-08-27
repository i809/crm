-- Phase 3 migration: ai_usage_logs table (run on existing volumes)
CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES app.tenants(id),
  request_id  TEXT NOT NULL,
  provider    TEXT NOT NULL,
  model       TEXT NOT NULL DEFAULT '',
  tool        TEXT NOT NULL DEFAULT '',
  tokens_in   INTEGER NOT NULL DEFAULT 0,
  tokens_out  INTEGER NOT NULL DEFAULT 0,
  cost_usd    NUMERIC(10,6) NOT NULL DEFAULT 0,
  latency_ms  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_tenant ON ai_usage_logs(tenant_id, created_at DESC);
ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON ai_usage_logs;
CREATE POLICY tenant_isolation ON ai_usage_logs FOR ALL USING (tenant_id = app.current_tenant()) WITH CHECK (tenant_id = app.current_tenant());
