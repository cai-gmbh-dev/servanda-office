# Project Memory

## Ausgangslage
- MVP für SME-Kanzleien mit Guided Contract Erstellung unter 30 Minuten.
- Hoher Fokus auf Mandantenfähigkeit, DSGVO, sichere Versionierung und Export.

## Bisherige Meilensteine
- Architektur- und Produktbriefings dokumentiert.
- Engineering- und QA-Leitplanken festgelegt.
- Teamstruktur und Wissensmanagement eingerichtet.
- Phase 0–1 Orchestrierung gestartet (ADRs, Domänenmodell, Rule-Engine, Export-Mapping).
- QA/Guidelines auf Servanda Office angepasst (2026-02-09).
- ADR-001..004 akzeptiert (2026-02-09).
- Sprint-Status-Übersicht eingeführt (`docs/plan/sprint-status.md`).
 - Sprint-1 Kickoff dokumentiert (Team-Updates, Owner Matrix bestätigt).

## Offene Risiken
- Regelwerk für Klausel-Konsistenz kann fachlich komplex werden.
- Exportqualität (DOCX/ODT) benötigt frühe Testdaten.
- On-Prem-Variante kann Security/Betriebstiefe erhöhen.
- QA/Guidelines referenzieren noch "OSCAL Viewer" (Alignment mit Servanda Office erforderlich).
 - QA-Gates sind noch nicht als CI-Jobs umgesetzt (Risiko für Merge-Qualität).
 - Tenancy-Entscheidung ist akzeptiert, aber noch nicht in der Datenzugriffsschicht operationalisiert.
 - Export-Referenzdokumente fehlen für frühe Qualitätsnachweise.

## Nächste Entscheidungen
- Zielarchitektur + Service-Schnitt.
- Priorisierter MVP-Scope pro Epic.
- Quality-Gate-Messbarkeit in CI.
- Update der QA-/Guidelines-Dokumente auf Servanda Office (Owner: Team 06, Ziel: 2026-02-16).
 - RLS-Policies + App-Layer Guardrails verbindlich festlegen (Owner: Team 01 + 02 + 07).
 - ODT-Option als Beta via Konvertierung bestätigen (Owner: Team 05 + 07).
 - QA-Gates als CI-Standard final freigeben (Owner: Team 06).
