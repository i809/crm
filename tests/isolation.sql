-- RubberTrack Phase 0/1 isolation tests — run as app_role (non-superuser)
-- Usage: docker exec -i <pg> psql "postgresql://app_role:apppass@localhost:5432/rubbertrack" < tests/isolation.sql
\set ECHO all

\echo '=== Test A: cross-tenant read/write ==='
SET app.tenant_id='rubbertrack';
\echo 'A.1 rubbertrack sees own records (expect 7):'
SELECT count(*) AS rt_records FROM records;
\echo 'A.2 rubbertrack cannot see lexley rows via filter (expect 0):'
SELECT count(*) AS rt_sees_lexley FROM records WHERE tenant_id='lexley';
\echo 'A.3 rubbertrack cannot INSERT a lexley row (expect BLOCKED):'
DO $$
BEGIN
  INSERT INTO records (tenant_id, order_id, status) VALUES ('lexley','HACK-1','Open');
  RAISE NOTICE 'A.3 FAIL: cross-tenant insert unexpectedly succeeded';
EXCEPTION WHEN with_check_option_violation OR insufficient_privilege OR check_violation THEN
  RAISE NOTICE 'A.3 OK: cross-tenant insert blocked by RLS';
END $$;

\echo ''
\echo '=== Test B: tenant sees only its own data ==='
SET app.tenant_id='lexley';
\echo 'B.1 lexley sees own records (expect 1):'
SELECT count(*) AS lexley_records FROM records;
\echo 'B.2 lexley sees own issues (expect 0 — seeded none):'
SELECT count(*) AS lexley_issues FROM tickets;

\echo ''
\echo '=== Test C: unset tenant_id = zero rows (fail-closed) ==='
RESET app.tenant_id;
\echo 'C.1 no tenant set (expect 0):'
SELECT count(*) AS no_tenant_records FROM records;

\echo ''
\echo '=== Test D: customer role scoped to own company ==='
SET app.tenant_id='rubbertrack';
\echo 'D.1 a customer (CEAT) can only see records for their company (expect 1):'
SELECT count(*) AS ceat_records FROM records WHERE customer = 'CEAT';
\echo 'D.2 a customer cannot see other customers records (expect 5):'
SELECT count(*) AS non_ceat FROM records WHERE customer <> 'CEAT';

\echo ''
\echo '=== Test E: app.current_tenant() reflects session setting ==='
SET app.tenant_id='rubbertrack';
\echo 'E.1 current_tenant() returns rubbertrack (expect rubbertrack):'
SELECT app.current_tenant() AS current;
SET app.tenant_id='lexley';
\echo 'E.2 current_tenant() returns lexley (expect lexley):'
SELECT app.current_tenant() AS current;
RESET app.tenant_id;

\echo ''
\echo '=== Test F: screen_configs isolated per tenant ==='
SET app.tenant_id='rubbertrack';
\echo 'F.1 rubbertrack sees dashboard config (expect 1):'
SELECT count(*) AS rt_configs FROM screen_configs WHERE screen='dashboard';
SET app.tenant_id='lexley';
\echo 'F.2 lexley sees no dashboard config (expect 0):'
SELECT count(*) AS lexley_configs FROM screen_configs WHERE screen='dashboard';
