# Architektur-Übersicht (Kurzfassung)

**Stand:** 2026-02-10
**Quelle:** `docs/architecture/*`, `docs/knowledge/*`

## Zielbild (MVP)

- Kanzlei erstellt in <30 Minuten einen konsistenten Vertrag.
- Guided Q&A, Version Pinning, DOCX Export, Tenant-Isolation.
- Modularer Monolith (TypeScript), spätere Service-Extraktion möglich.

## Kern-Module (Bounded Contexts)

| Modul | Verantwortung | Owner |
| --- | --- | --- |
| Identity | Auth, Users, Teams, RBAC, Audit | Team 02 |
| Content | Clauses, Templates, Versioning, Rules, Publishing | Team 03 |
| Interview | Flow-Design, Questions, Conditions, Validation | Team 04 |
| Contract | ContractInstance, LawFirmTemplate, Search | Team 04 |
| Export | ExportJob, DOCX/ODT-Generierung, Styles | Team 05 |

## Architekturelle Leitplanken

- Multi-Tenant Isolation serverseitig (RLS bevorzugt, operationalisiert).
- Immutable Versions + Pinning für Reproduzierbarkeit (spezifiziert).
- Export als separater Worker (asynchroner Job, pgboss Queue).
- ODT optional via DOCX→ODT Konvertierung (LibreOffice headless, Beta).

## Entscheidungen (ADR)

| ADR | Titel | Status |
| --- | --- | --- |
| ADR-001 | Tenant-Isolation (RLS + App-Layer) | Operationalisiert |
| ADR-002 | Version Pinning (ContractInstance) | Spezifiziert |
| ADR-003 | Export-Engine als separater Service | Accepted |
| ADR-004 | ODT via Konvertierung | Accepted |

## Architektur-Backbone Entscheidungen

| ID | Entscheidung |
| --- | --- |
| BB-001 | Modularer Monolith statt Microservices |
| BB-002 | PostgreSQL-basierte Queue (pgboss) |
| BB-003 | TypeScript Full-Stack |
| BB-004 | REST statt GraphQL |
| BB-005 | Keycloak für Identity |
| BB-006 | docxtemplater für DOCX |
| BB-007 | Schema-basierte Module (nicht DB-per-Module) |

## Kern-Artefakte

| Artefakt | Pfad |
| --- | --- |
| Domänenmodell v1 | `docs/knowledge/domain-model-v1.md` |
| Architecture Backbone v1 | `docs/knowledge/architecture-backbone-v1.md` |
| Story-Map MVP | `docs/knowledge/story-map-mvp.md` |
| ADR-001 (operationalisiert) | `docs/knowledge/adr-001-multi-tenant-isolation.md` |
| ADR-002 (spezifiziert) | `docs/knowledge/adr-002-version-pinning.md` |
| ADR-003 | `docs/knowledge/adr-003-export-engine-service.md` |
| ADR-004 | `docs/knowledge/adr-004-odt-strategy.md` |

## Owner Matrix

- ADR-001: Team 01 + Team 02 + Team 07
- ADR-002: Team 01 + Team 03 + Team 04
- ADR-003: Team 01 + Team 05 + Team 07
- ADR-004: Team 01 + Team 05 + Team 07
- Domänenmodell v1: Team 01
- QA-Gates in CI: Team 06
- Deployment-Blueprint: Team 07
