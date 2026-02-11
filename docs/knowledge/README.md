# Zentrales Wissensmanagement & Memory

Ziel: Ein gemeinsamer Ort für Entscheidungswissen, Projektgedächtnis und teamübergreifende Standards.

## Struktur

- `adr-log.md` – Architekturentscheidungen (ADR-Index)
- `adr-001..004-*.md` – ADR-Dokumente (Details + Implementation Specs)
- `architecture-summary.md` – Kurzfassung der Architektur
- `architecture-backbone-v1.md` – Architecture Backbone v1 (Service-Architektur, Tech-Stack, Deployment)
- `decision-register.md` – Operative/produktseitige Entscheidungen
- `domain-model-v1.md` – Domänenmodell v1 (Entities, Beziehungen, Invarianten)
- `domain-model-v0.1.md` – Domänenmodell v0.1 (historisch, ersetzt durch v1)
- `story-map-mvp.md` – Priorisierte Story-Map nach MVP-Epics
- `threat-model-tenant-isolation.md` – STRIDE Threat Model für Tenant-Isolation
- `rbac-iam-model-v1.md` – RBAC/IAM-Modell v1 (Rollen, Auth, Sessions, MFA)
- `audit-compliance-v1.md` – Audit-Event-Katalog + DSGVO-Compliance-Checkliste
- `qa-gates-ci-v1.md` – QA-Gates CI-Spezifikation (GitHub Actions Workflows, Gate-Matrix, Security-Tests)
- `test-strategy-v1.md` – Teststrategie v1 (Pyramide, Kategorien, Fixtures, Coverage, Toolchain)
- `compliance-evidence-checklist-v1.md` – Compliance Evidence Checklist (72 Items, 9 Kategorien, Reifegradmodell)
- `deployment-blueprint-v1.md` – Deployment-Blueprint (dev/stage/prod, K8s-Manifeste, On-Prem, Backup, Observability)
- `cicd-skeleton-v1.md` – CI/CD Skeleton (GitHub Actions Workflows, Image-Build, Deploy, Release-Prozess)
- `secrets-key-handling-v1.md` – Secrets & Key-Handling (Inventar, Storage, Rotation, Vault, Audit)
- `content-versioning-schema-v1.md` – Content Versioning Schema (Editorial Workflow, Publishing-Gates, DB-Schema, Changelog-Format)
- `interview-flow-design-v1.md` – Interview Flow Design & Rule Engine (Guided Flow, Save/Resume, Validation, UX)
- `conflict-rules-matrix-v1.md` – Konfliktregeln-Matrix (5 Regeltypen, Evaluierung, Beispiel-Matrix, Lösungsvorschläge)
- `docx-export-spec-v1.md` – DOCX Export MVP Spezifikation (Pipeline, pgboss, docxtemplater, Style-Templates, Referenzdokumente)
- `odt-conversion-eval-v1.md` – ODT-Konvertierung Evaluierung (LibreOffice headless, Qualität, Performance, Sicherheit, Beta-Empfehlung)
- `a11y-performance-baseline-v1.md` – Accessibility & Performance Baseline (WCAG 2.1 AA, Lighthouse CI, Core Web Vitals, Bundle-Budgets)
- `audit-logging-e2e-v1.md` – Audit Logging E2E Spezifikation (AuditService, Partitionierung, Retention, Query-API, Monitoring, E2E-Tests)
- `project-memory.md` – Laufendes Gedächtnis (Meilensteine, offene Risiken, Learnings)
- `glossar.md` – Einheitliche Begriffe

## Regeln
1. Jede finale Entscheidung bekommt eine ID und Datum.
2. Jede Entscheidung referenziert betroffene Teams.
3. Offene Punkte werden mit Owner + Zieltermin geführt.
4. Keine Team-Insellösungen: zentrale Erkenntnisse müssen hier gespiegelt werden.

## Decision Map
- ADRs: `adr-log.md` + `adr-001-multi-tenant-isolation.md` bis `adr-004-odt-strategy.md`
- Entscheidungen: `decision-register.md`
- Architektur: `architecture-summary.md`
- Domänenmodell: `domain-model-v0.1.md`
- Aktueller Status: `project-memory.md`
