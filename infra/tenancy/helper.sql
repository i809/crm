-- Tenancy helper for RLS
CREATE SCHEMA IF NOT EXISTS app;
CREATE OR REPLACE FUNCTION app.current_tenant()
RETURNS TEXT
LANGUAGE SQL
AS $$
  SELECT current_setting('app.tenant_id', true)
$$;
