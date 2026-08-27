-- Weekly-feature migration: insights_snapshots + RLS (run on existing volumes)
CREATE TABLE IF NOT EXISTS insights_snapshots (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES app.tenants(id),
  insights    JSONB NOT NULL DEFAULT '[]'::jsonb,
  provider    TEXT NOT NULL DEFAULT 'local',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_insights_tenant ON insights_snapshots(tenant_id, created_at DESC);
ALTER TABLE insights_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE insights_snapshots FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON insights_snapshots;
CREATE POLICY tenant_isolation ON insights_snapshots FOR ALL USING (tenant_id = app.current_tenant()) WITH CHECK (tenant_id = app.current_tenant());
