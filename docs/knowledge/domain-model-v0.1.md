# Domänenmodell v0.1 (Servanda Office)

**Status:** Draft  
**Datum:** 2026-02-09  
**Owner:** Team 01 (Product Architecture)

## Ziele
- Reproduzierbare Verträge durch Version Pinning
- Strikte Tenant-Isolation
- Klare Trennung zwischen Publisher-Content und Kanzlei-Instanzen

## Kerneinheiten (Entities)
- `Tenant` (type: vendor | lawfirm | individual)
- `User`, `Team`, `Role`, `Permission`
- `Clause` (logical entity)
  - `ClauseVersion` (immutable)
- `Template` (logical entity)
  - `TemplateVersion` (immutable)
- `InterviewFlow`, `Question`, `Condition`, `Explanation`
- `ContractInstance` (mandantenbezogene Instanz)
- `StyleTemplate` (DOCX/ODT Styles)
- `AuditEvent`

## Beziehungen (high-level)
- `Tenant` 1..* `User`, `Team`
- `Template` 1..* `TemplateVersion`
- `Clause` 1..* `ClauseVersion`
- `TemplateVersion` references `ClauseVersion` (by id)
- `InterviewFlow` belongs to `TemplateVersion`
- `ContractInstance` pins `TemplateVersion` + list of `ClauseVersion`

## Versioning-Regeln
- `TemplateVersion` und `ClauseVersion` sind **immutable**
- Status-Workflow: Draft → Review → Approved → Published → Deprecated
- `ContractInstance` speichert:
  - `templateVersionId`
  - `clauseVersionIds`
  - Antworten-Snapshot
  - Export-Metadaten (Format, Zeitstempel)

## Tenant-Isolation
- Alle Entities tragen `tenantId`, außer globale Systemobjekte.
- RLS-Policies in Postgres (Default) + App-Level Checks.
- Option: DB-pro-Tenant für Enterprise/On-Prem (ADR-001).

## Audit & Compliance
- `AuditEvent` für Login, Role Change, Publish, Export, Zugriff auf Dokumente.
- Audit-Records sind tenant-gescoped und unveränderlich.

## Offene Punkte
- Entscheidung zu DB-pro-Tenant Schwellen (ADR-001).
- Feingranulare ACLs pro `ContractInstance`/`Template`.
