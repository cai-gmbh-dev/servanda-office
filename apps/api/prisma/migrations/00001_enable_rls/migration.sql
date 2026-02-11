-- Servanda Office — RLS Migration v1
-- ADR-001: Shared DB + PostgreSQL Row-Level Security
-- Every tenant-scoped table gets RLS enabled with policies.

-- ============================================================
-- ENABLE RLS ON ALL TENANT-SCOPED TABLES
-- ============================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE clauses ENABLE ROW LEVEL SECURITY;
ALTER TABLE clause_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE law_firm_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE export_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE style_templates ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- PLATFORM CONTEXT POLICIES
-- ============================================================

-- Users: own tenant only
CREATE POLICY tenant_isolation_users ON users
  USING (tenant_id = current_tenant_id());

-- Teams: own tenant only
CREATE POLICY tenant_isolation_teams ON teams
  USING (tenant_id = current_tenant_id());

-- Audit Events: own tenant only (append-only enforced at app layer)
CREATE POLICY tenant_isolation_audit ON audit_events
  USING (tenant_id = current_tenant_id());

-- ============================================================
-- CONTENT CONTEXT POLICIES
-- Content from vendors is readable by all tenants when published.
-- ============================================================

-- Clauses: own tenant OR published vendor content
CREATE POLICY tenant_isolation_clauses ON clauses
  USING (
    tenant_id = current_tenant_id()
    OR current_published_version_id IS NOT NULL
  );

-- Clause Versions: own tenant OR published status
CREATE POLICY tenant_isolation_clause_versions ON clause_versions
  USING (
    tenant_id = current_tenant_id()
    OR status = 'published'
  );

-- Write policy: only own tenant can modify clauses
CREATE POLICY tenant_write_clauses ON clauses
  FOR INSERT
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY tenant_update_clauses ON clauses
  FOR UPDATE
  USING (tenant_id = current_tenant_id());

-- Write policy: only own tenant can modify clause versions
CREATE POLICY tenant_write_clause_versions ON clause_versions
  FOR INSERT
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY tenant_update_clause_versions ON clause_versions
  FOR UPDATE
  USING (tenant_id = current_tenant_id());

-- Templates: own tenant OR published vendor content
CREATE POLICY tenant_isolation_templates ON templates
  USING (
    tenant_id = current_tenant_id()
    OR current_published_version_id IS NOT NULL
  );

-- Template Versions: own tenant OR published status
CREATE POLICY tenant_isolation_template_versions ON template_versions
  USING (
    tenant_id = current_tenant_id()
    OR status = 'published'
  );

-- Write policies for templates
CREATE POLICY tenant_write_templates ON templates
  FOR INSERT
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY tenant_update_templates ON templates
  FOR UPDATE
  USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_write_template_versions ON template_versions
  FOR INSERT
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY tenant_update_template_versions ON template_versions
  FOR UPDATE
  USING (tenant_id = current_tenant_id());

-- Interview Flows: own tenant only
CREATE POLICY tenant_isolation_interview_flows ON interview_flows
  USING (tenant_id = current_tenant_id());

-- ============================================================
-- CONTRACT CONTEXT POLICIES (strict tenant isolation)
-- ============================================================

CREATE POLICY tenant_isolation_contracts ON contract_instances
  USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation_lawfirm_templates ON law_firm_templates
  USING (tenant_id = current_tenant_id());

-- ============================================================
-- EXPORT CONTEXT POLICIES
-- ============================================================

CREATE POLICY tenant_isolation_export_jobs ON export_jobs
  USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation_style_templates ON style_templates
  USING (
    tenant_id = current_tenant_id()
    OR type = 'system'
  );

-- ============================================================
-- IMMUTABILITY TRIGGERS (ADR-002: Version Pinning)
-- ============================================================

-- Prevent modification of completed contract instances' pinned versions
CREATE OR REPLACE FUNCTION prevent_pin_change_after_completion()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'completed' AND (
    NEW.template_version_id != OLD.template_version_id
    OR NEW.clause_version_ids != OLD.clause_version_ids
  ) THEN
    RAISE EXCEPTION 'Cannot modify pinned versions on a completed contract (ADR-002)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_pin_immutability
  BEFORE UPDATE ON contract_instances
  FOR EACH ROW
  EXECUTE FUNCTION prevent_pin_change_after_completion();

-- Prevent content modification of published/deprecated clause versions
CREATE OR REPLACE FUNCTION prevent_content_change_after_draft()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status != 'draft' AND NEW.content != OLD.content THEN
    RAISE EXCEPTION 'Cannot modify content of a non-draft clause version';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_clause_version_immutability
  BEFORE UPDATE ON clause_versions
  FOR EACH ROW
  EXECUTE FUNCTION prevent_content_change_after_draft();

-- ============================================================
-- AUDIT EVENTS IMMUTABILITY
-- ============================================================

-- Prevent any updates or deletes on audit_events
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit events are immutable — updates and deletes are not allowed';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_audit_immutability_update
  BEFORE UPDATE ON audit_events
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_modification();

CREATE TRIGGER enforce_audit_immutability_delete
  BEFORE DELETE ON audit_events
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_modification();
