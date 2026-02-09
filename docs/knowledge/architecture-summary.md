# Architektur-Übersicht (Kurzfassung)

**Stand:** 2026-02-09  
**Quelle:** `docs/architecture/*`, `docs/knowledge/*`

## Zielbild (MVP)
- Kanzlei erstellt in <30 Minuten einen konsistenten Vertrag.
- Guided Q&A, Version Pinning, DOCX Export, Tenant-Isolation.

## Kern-Domänen
- Identity & Access (RBAC, MFA optional)
- Tenant & Org Management
- Content (Template/Clause) inkl. Versionierung
- Interview/Guidance (Q&A Flow)
- Assembly/Validation (Regeln, Konflikte)
- Document Storage (Contract Instances)
- Export Service (DOCX, ODT optional)
- Audit & Compliance

## Architekturelle Leitplanken
- Multi-Tenant Isolation serverseitig (RLS bevorzugt).
- Immutable Versions + Pinning für Reproduzierbarkeit.
- Export als separater Service (asynchroner Job).
- ODT optional via DOCX→ODT Konvertierung.

## Entscheidungen (ADR)
- ADR-001: Tenant-Isolation RLS vs DB-pro-Tenant
- ADR-002: Version Pinning
- ADR-003: Export-Engine Service
- ADR-004: ODT-Strategie

## Implementation Notes (ADR)
- ADR-001: Tenant-Scoping verpflichtend, RLS-Policies definieren, Cross-Tenant Tests.
- ADR-002: ContractInstance pinnt Template/Clause-Versionen, Export nutzt nur gepinnte Versionen.
- ADR-003: Export als Job-Modell, Ergebnisse in Object Storage, isolierter Worker.
- ADR-004: ODT via Konvertierung, Worker isolieren, ODT als optionales Feature.

## Owner Matrix
- ADR-001: Team 01 + Team 02 + Team 07
- ADR-002: Team 01 + Team 03 + Team 04
- ADR-003: Team 01 + Team 05 + Team 07
- ADR-004: Team 01 + Team 05 + Team 07
- Domänenmodell v1: Team 01
- QA-Gates in CI: Team 06
- Deployment-Blueprint: Team 07

## Domänenmodell v0.1
Siehe `docs/knowledge/domain-model-v0.1.md`.
