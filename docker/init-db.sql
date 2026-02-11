-- Servanda Office — Initial Database Setup
-- Creates schemas and enables required extensions

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Schemas (modular monolith: one schema per bounded context)
CREATE SCHEMA IF NOT EXISTS platform;
CREATE SCHEMA IF NOT EXISTS content;
CREATE SCHEMA IF NOT EXISTS contract;
CREATE SCHEMA IF NOT EXISTS export;
CREATE SCHEMA IF NOT EXISTS keycloak;

-- Application role for RLS
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'servanda_app') THEN
    CREATE ROLE servanda_app LOGIN PASSWORD 'servanda_app_dev';
  END IF;
END
$$;

-- Grant schema access to application role
GRANT USAGE ON SCHEMA platform TO servanda_app;
GRANT USAGE ON SCHEMA content TO servanda_app;
GRANT USAGE ON SCHEMA contract TO servanda_app;
GRANT USAGE ON SCHEMA export TO servanda_app;

-- RLS helper function: returns current tenant_id from session variable
CREATE OR REPLACE FUNCTION current_tenant_id()
RETURNS UUID AS $$
  SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::UUID;
$$ LANGUAGE SQL STABLE;

COMMENT ON FUNCTION current_tenant_id() IS
  'Returns the tenant_id set via SET LOCAL app.current_tenant_id. Used by RLS policies.';
