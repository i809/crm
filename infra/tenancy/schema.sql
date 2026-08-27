-- RubberTrack Phase 1: schema + RLS + tenant + seed
-- Runs after helper.sql (app schema + current_tenant()).

-- Extensions must exist before any vector column
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Non-superuser app role: the BFF/Directus connect as this role so RLS applies.
-- (PostgreSQL bypasses RLS for superusers and table owners.)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='app_role') THEN
    CREATE ROLE app_role LOGIN PASSWORD 'apppass';
  END IF;
END $$;

-- ============================================================
-- 1. TENANT REGISTRY (control plane; visible to privileged-admin only)
-- ============================================================
CREATE TABLE IF NOT EXISTS app.tenants (
  id          TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  template    TEXT NOT NULL DEFAULT 'rubbertrack',
  tier        TEXT NOT NULL DEFAULT 'A',          -- A=pooled RLS, B=schema, C=db
  status      TEXT NOT NULL DEFAULT 'active',
  theme       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. CORE ENTITY TABLES (all tenant-scoped via tenant_id)
-- ============================================================
CREATE TABLE IF NOT EXISTS records (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES app.tenants(id),
  order_id    TEXT NOT NULL,
  date        DATE,
  customer    TEXT,
  supplier    TEXT,
  grade       TEXT,
  mt          NUMERIC(10,2),
  fcl         INT,
  price_usd   NUMERIC(12,2),
  status      TEXT NOT NULL DEFAULT 'Open',
  extra       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS parties (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES app.tenants(id),
  name        TEXT NOT NULL,
  type        TEXT NOT NULL,                      -- 'supplier' | 'customer'
  contact     JSONB NOT NULL DEFAULT '{}'::jsonb,
  tags        JSONB NOT NULL DEFAULT '[]'::jsonb,
  embedding   VECTOR(768),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tickets (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES app.tenants(id),
  ticket_id   TEXT NOT NULL,
  customer    TEXT,
  supplier    TEXT,
  category    TEXT NOT NULL,                      -- quality | document | shipment
  status      TEXT NOT NULL DEFAULT 'Open',
  description TEXT,
  kind        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hr_events (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES app.tenants(id),
  employee    TEXT NOT NULL,
  department  TEXT,
  present     INT DEFAULT 0,
  absent      INT DEFAULT 0,
  leave       INT DEFAULT 0,
  late        INT DEFAULT 0,
  week        INT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS feed_items (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES app.tenants(id),
  category    TEXT,
  title       TEXT NOT NULL,
  description TEXT,
  priority    TEXT DEFAULT 'normal',
  published_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS checklists (
  id            BIGSERIAL PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES app.tenants(id),
  party_id      BIGINT,
  checklist_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS files (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES app.tenants(id),
  name        TEXT NOT NULL,
  mime        TEXT,
  record_id   TEXT,
  party_id    BIGINT,
  tag         TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unified embeddings table (Cerebras-style) for hybrid search
CREATE TABLE IF NOT EXISTS embeddings (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES app.tenants(id),
  source_type TEXT NOT NULL,                      -- record | party | ticket | file
  source_id   TEXT NOT NULL,
  vector      VECTOR(768) NOT NULL,
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-tenant screen layout config (dashboard panel arrangement). Lets a
-- tenant-admin reconfigure which charts/cards each screen shows without code.
CREATE TABLE IF NOT EXISTS screen_configs (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES app.tenants(id),
  screen      TEXT NOT NULL DEFAULT 'dashboard',  -- dashboard | records | issues
  config      JSONB NOT NULL DEFAULT '{}'::jsonb, -- {panels:[{type,source,title}]}
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_screen_configs_tenant ON screen_configs(tenant_id, screen);

-- AI usage logs: per-tenant accounting of every AI call (cost, tokens, tools).
-- Lets tenant-admins see spend and lets the platform bill tier B/C tenants.
CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES app.tenants(id),
  request_id  TEXT NOT NULL,                     -- client correlation id
  provider    TEXT NOT NULL,                      -- local | openrouter | nim | ollama | openai
  model       TEXT NOT NULL DEFAULT '',
  tool        TEXT NOT NULL DEFAULT '',           -- rag | kpi | search | planner
  tokens_in   INTEGER NOT NULL DEFAULT 0,
  tokens_out  INTEGER NOT NULL DEFAULT 0,
  cost_usd    NUMERIC(10,6) NOT NULL DEFAULT 0,
  latency_ms  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_tenant ON ai_usage_logs(tenant_id, created_at DESC);

-- Insights snapshots: nightly AI-computed insights per tenant (cron job).
-- Lets the Insights screen load the latest snapshot without recomputing.
CREATE TABLE IF NOT EXISTS insights_snapshots (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES app.tenants(id),
  insights    JSONB NOT NULL DEFAULT '[]'::jsonb,   -- array of insight strings
  provider    TEXT NOT NULL DEFAULT 'local',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_insights_tenant ON insights_snapshots(tenant_id, created_at DESC);

-- ============================================================
-- 3. INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_records_tenant      ON records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_records_status      ON records(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_parties_tenant_type ON parties(tenant_id, type);
CREATE INDEX IF NOT EXISTS idx_tickets_tenant      ON tickets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hr_tenant            ON hr_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_feed_tenant          ON feed_items(tenant_id, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_files_tenant         ON files(tenant_id);
CREATE INDEX IF NOT EXISTS idx_embeddings_source    ON embeddings(tenant_id, source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_embeddings_hnsw       ON embeddings USING hnsw (vector vector_cosine_ops);
-- tsvector for keyword search on records
CREATE INDEX IF NOT EXISTS idx_records_fts           ON records USING gin (to_tsvector('english',
                          coalesce(order_id,'') || ' ' || coalesce(customer,'') || ' ' ||
                          coalesce(supplier,'') || ' ' || coalesce(grade,'')));
-- trigram for fuzzy party name search
CREATE INDEX IF NOT EXISTS idx_parties_name_trgm     ON parties USING gin (name gin_trgm_ops);

-- ============================================================
-- 4. ROW-LEVEL SECURITY (the heart of pooled tenancy)
-- ============================================================
ALTER TABLE records    ENABLE ROW LEVEL SECURITY;
ALTER TABLE parties    ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets    ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE files      ENABLE ROW LEVEL SECURITY;
ALTER TABLE embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE screen_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE insights_snapshots ENABLE ROW LEVEL SECURITY;

-- One policy per table: tenant_id must equal the session's app.tenant_id.
CREATE POLICY tenant_isolation ON records    FOR ALL USING (tenant_id = app.current_tenant()) WITH CHECK (tenant_id = app.current_tenant());
CREATE POLICY tenant_isolation ON parties    FOR ALL USING (tenant_id = app.current_tenant()) WITH CHECK (tenant_id = app.current_tenant());
CREATE POLICY tenant_isolation ON tickets    FOR ALL USING (tenant_id = app.current_tenant()) WITH CHECK (tenant_id = app.current_tenant());
CREATE POLICY tenant_isolation ON hr_events  FOR ALL USING (tenant_id = app.current_tenant()) WITH CHECK (tenant_id = app.current_tenant());
CREATE POLICY tenant_isolation ON feed_items FOR ALL USING (tenant_id = app.current_tenant()) WITH CHECK (tenant_id = app.current_tenant());
CREATE POLICY tenant_isolation ON checklists FOR ALL USING (tenant_id = app.current_tenant()) WITH CHECK (tenant_id = app.current_tenant());
CREATE POLICY tenant_isolation ON files      FOR ALL USING (tenant_id = app.current_tenant()) WITH CHECK (tenant_id = app.current_tenant());
CREATE POLICY tenant_isolation ON embeddings FOR ALL USING (tenant_id = app.current_tenant()) WITH CHECK (tenant_id = app.current_tenant());
CREATE POLICY tenant_isolation ON screen_configs FOR ALL USING (tenant_id = app.current_tenant()) WITH CHECK (tenant_id = app.current_tenant());
CREATE POLICY tenant_isolation ON ai_usage_logs FOR ALL USING (tenant_id = app.current_tenant()) WITH CHECK (tenant_id = app.current_tenant());
CREATE POLICY tenant_isolation ON insights_snapshots FOR ALL USING (tenant_id = app.current_tenant()) WITH CHECK (tenant_id = app.current_tenant());

-- ============================================================
-- 5. SEED TENANTS + DEMO DATA
-- ============================================================
INSERT INTO app.tenants (id, label, template, tier) VALUES
  ('rubbertrack', 'RubberTrack Demo', 'rubbertrack', 'A'),
  ('lexley',      'Lexley Rubber',    'rubbertrack', 'A')
ON CONFLICT (id) DO NOTHING;

-- RubberTrack demo records
INSERT INTO records (tenant_id, order_id, date, customer, supplier, grade, mt, fcl, price_usd, status) VALUES
  ('rubbertrack','ORD-2026-0042','2026-08-20','JK Tyre','Tiong Huat','TSR-20',100.8,4,1875,'In Production'),
  ('rubbertrack','ORD-2026-0039','2026-08-18','BKT','Lexley Rubber','T30M',50.4,2,2240,'Docs Pending'),
  ('rubbertrack','ORD-2026-0038','2026-08-15','MRF','Vietnam Rubber','RSS-3',100.8,4,2020,'Shipped'),
  ('rubbertrack','ORD-2026-0035','2026-08-12','CEAT','SMR Malaysia','Latex 60%',21.0,1,2310,'Docs Pending'),
  ('rubbertrack','ORD-2026-0031','2026-08-08','Apollo','SICOM Indonesia','SICOM 20',16.0,1,1840,'Quality Issue'),
  ('rubbertrack','ORD-2026-0027','2026-08-01','JK Tyre','Lexley Rubber','TSR-20',100.8,4,1890,'Delivered'),
  ('rubbertrack','ORD-2026-0022','2026-07-25','BKT','Tiong Huat','RSS-3',50.4,2,2150,'Delivered');

INSERT INTO parties (tenant_id, name, type, contact, tags) VALUES
  ('rubbertrack','Tiong Huat','supplier','{"country":"ID"}','["block rubber"]'),
  ('rubbertrack','Lexley Rubber','supplier','{"country":"TH"}','["TSR","block"]'),
  ('rubbertrack','SMR Malaysia','supplier','{"country":"MY"}','["SMR"]'),
  ('rubbertrack','Vietnam Rubber','supplier','{"country":"VN"}','["RSS"]'),
  ('rubbertrack','SICOM Indonesia','supplier','{"country":"ID"}','["SICOM"]'),
  ('rubbertrack','JK Tyre','customer','{"country":"IN"}','["tyre"]'),
  ('rubbertrack','BKT','customer','{"country":"IN"}','["tyre"]'),
  ('rubbertrack','MRF','customer','{"country":"IN"}','["tyre"]'),
  ('rubbertrack','CEAT','customer','{"country":"IN"}','["tyre"]');

INSERT INTO tickets (tenant_id, ticket_id, customer, supplier, category, status, description, kind) VALUES
  ('rubbertrack','#Q-118','SMR Malaysia','SMR Malaysia','quality','Open','SMR moisture above spec (0.9%)','quality'),
  ('rubbertrack','#Q-117','MRF','Vietnam Rubber','quality','Open','VOCB check failed on 2 lots','quality'),
  ('rubbertrack','#D-204','CEAT','SMR Malaysia','document','Open','Missing COO for O-0035','document'),
  ('rubbertrack','#D-203','BKT','Lexley Rubber','document','Open','B/L amendment pending','document'),
  ('rubbertrack','#S-071','MRF','Vietnam Rubber','shipment','Monitoring','Vessel rollover ETA +9d','shipment'),
  ('rubbertrack','#S-067','Apollo','SICOM Indonesia','shipment','Resolved','QA container damage (photos recvd)','shipment');

INSERT INTO hr_events (tenant_id, employee, department, present, absent, week) VALUES
  ('rubbertrack','A. Checkout','Sales',5,0,34),
  ('rubbertrack','B. Docs','Logistics',5,0,34),
  ('rubbertrack','C. Tech','QA',4,1,34),
  ('rubbertrack','D. Ops','Admin',3,2,34),
  ('rubbertrack','E. Finance','Finance',5,0,34);

INSERT INTO feed_items (tenant_id, category, title, priority, published_at) VALUES
  ('rubbertrack','price','Price alert: TSR-20 +0.8% on SICOM close','high',now()-interval '12 min'),
  ('rubbertrack','order','BKT requested revised PI for O-0038','normal',now()-interval '40 min'),
  ('rubbertrack','issue','Issue #Q-118 assigned to QA team','high',now()-interval '2 hours'),
  ('rubbertrack','doc','Docs complete: O-0031 cleared for shipping','normal',now()-interval '5 hours'),
  ('rubbertrack','order','New order O-0042 created for JK Tyre','normal',now()-interval '1 day');

INSERT INTO checklists (tenant_id, party_id, checklist_json, active) VALUES
  ('rubbertrack', null, '[
    {"text":"Verify FFA % on 14_CL001 (must be < 1.0%)","done":false},
    {"text":"Confirm HS Code 4001.10 with broker","done":true},
    {"text":"Attach packing list (PDF ≤ 2MB) to PI","done":false},
    {"text":"Request TDS/SDS from supplier","done":true},
    {"text":"Log container seals in Doc Tools","done":false},
    {"text":"Update Incoterms DAP → FOB quote","done":true}
  ]'::jsonb, true);

-- Lexley tenant gets 1 record (to prove isolation)
INSERT INTO records (tenant_id, order_id, date, customer, supplier, grade, mt, fcl, price_usd, status) VALUES
  ('lexley','LEX-2026-0001','2026-08-10','Pirelli','Lexley Rubber','TSR-20',50.4,2,1900,'In Production');

-- Default dashboard layout for RubberTrack (panels the preview renders).
INSERT INTO screen_configs (tenant_id, screen, config, active) VALUES
  ('rubbertrack', 'dashboard', '{
    "panels": [
      {"type":"kpi","source":"open_orders","title":"Open Orders"},
      {"type":"kpi","source":"active_mt","title":"Active MT"},
      {"type":"kpi","source":"suppliers","title":"Suppliers"},
      {"type":"kpi","source":"customers","title":"Customers"},
      {"type":"kpi","source":"open_issues","title":"Open Issues"},
      {"type":"table","source":"orders","title":"Recent Orders","limit":4},
      {"type":"table","source":"issues","title":"Open Issues","limit":5},
      {"type":"feed","source":"feed","title":"News & Alerts","limit":8}
    ]
  }'::jsonb, true)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 7. GRANTS + FORCE RLS for app_role
-- ============================================================
GRANT USAGE ON SCHEMA app TO app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO app_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_role;

-- FORCE so even the table owner (postgres) is subject to RLS when connecting as owner.
-- (Superusers still bypass; the app_role guarantee is what matters for the BFF.)
ALTER TABLE records    FORCE ROW LEVEL SECURITY;
ALTER TABLE parties    FORCE ROW LEVEL SECURITY;
ALTER TABLE tickets    FORCE ROW LEVEL SECURITY;
ALTER TABLE hr_events  FORCE ROW LEVEL SECURITY;
ALTER TABLE feed_items FORCE ROW LEVEL SECURITY;
ALTER TABLE checklists FORCE ROW LEVEL SECURITY;
ALTER TABLE files      FORCE ROW LEVEL SECURITY;
ALTER TABLE embeddings FORCE ROW LEVEL SECURITY;
ALTER TABLE screen_configs FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE insights_snapshots FORCE ROW LEVEL SECURITY;

