# Sprint-Status – Übersicht

**Stand:** 2026-02-09  
**Sprint:** 1 (Foundation)

## Ziele
- Domänenmodell v1 finalisieren
- Tenancy-Entscheidung operationalisieren
- QA-Gates in CI überführen
- Deployment-Blueprint v1 skizzieren

## Fortschritt (Teams)
- Team 01: gestartet (Architektur-Backbone, ADRs, Domänenmodell)
- Team 02: gestartet (Threat Model, RBAC/IAM)
- Team 03: gestartet (Versioning-Regeln, Publishing)
- Team 04: gestartet (Rule-Engine, UX-Konzept)
- Team 05: gestartet (DOCX Export Referenzen, Mapping)
- Team 06: gestartet (QA-Gates, Teststrategie)
- Team 07: gestartet (CI/CD Skeleton, Deployment-Blueprint)

## Risiken/Blocker
- QA/Guidelines Altinhalte wurden bereinigt, müssen noch in CI reflektiert werden.
- Export-Qualität benötigt Referenzdokumente früh.
- Tenancy-Entscheidung muss in Datenzugriffsschicht verankert werden.

## Owner Matrix
- ADR-001: Team 01 + Team 02 + Team 07
- ADR-002: Team 01 + Team 03 + Team 04
- ADR-003: Team 01 + Team 05 + Team 07
- ADR-004: Team 01 + Team 05 + Team 07
- Domänenmodell v1: Team 01
- QA-Gates in CI: Team 06
- Deployment-Blueprint: Team 07

## Nächste Schritte
- ADRs in Architektur-Backbone einarbeiten.
- Threat Model validieren.
- CI-Jobs für Lint/Typecheck/Test/A11y einrichten.

## Open Items (Entscheidungen)
- RLS-Policies + App-Layer Guardrails verbindlich festlegen (Owner: Team 01 + 02 + 07).
- ODT-Option als Beta via Konvertierung bestätigen (Owner: Team 05 + 07).
- QA-Gates als CI-Standard final freigeben (Owner: Team 06).
