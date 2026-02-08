# Umsetzungsplan – Servanda Office (MVP)

## Phase 0 – Setup (Woche 1)
- Team-Kickoff je Kommunikationsordner in `.docs/team/*`.
- Backlog-Baseline aus Epics/Stories erstellen.
- ADR-Liste und Entscheiderunden aufsetzen.

## Phase 1 – Architektur & Security Fundament (Wochen 2–3)
- Domänenmodell (Tenant, User, Role, Template, Clause, Contract, Version) finalisieren.
- RBAC/IAM und Tenant-Isolation spezifizieren.
- Audit- und Compliance-Baseline definieren.

## Phase 2 – Content + Builder Kern (Wochen 4–6)
- Editorial Workflow (Draft→Review→Approved→Published) umsetzen.
- Guided Q&A Flow mit Save/Resume entwickeln.
- Rule-Engine für Klausel-Konsistenz initial liefern.

## Phase 3 – Export + Qualitätstore (Wochen 7–8)
- DOCX-Export MVP liefern (ODT optional).
- CI-Gates für Lint/Typecheck/Tests/Coverage/A11y aktivieren.
- End-to-End Happy Path abdecken.

## Phase 4 – Hardening + Betriebsfähigkeit (Wochen 9–10)
- Performance- und Security-Hardening.
- Betriebsrunbooks und Monitoring ergänzen.
- On-Prem Readiness Assessment durchführen.

## Arbeitspakete je Team
- **01 Product Architecture**: Zielarchitektur, ADR-Moderation, Story-Priorisierung.
- **02 Security & Identity**: RBAC, Session-Policies, Audit Trails, DSGVO-Controls.
- **03 Content Editorial**: Authoring, Versionierung, Publishing-Gates.
- **04 Contract Builder**: Q&A-Engine, Conditional Logic, Konfliktauflösung.
- **05 Export & Integration**: Exportpipeline, Mapping, Integrationsschnittstellen.
- **06 QA & Compliance**: Gate-Implementierung, Testautomatisierung, Evidence.
- **07 DevOps & On-Prem**: CI/CD, Deployments, Operations, On-Prem Blueprint.

## Steuerung / Cadence
- Wöchentlich: Architekturboard + Risiko-Review.
- Zweiwöchentlich: Cross-Team Demo + Scope-Repriorisierung.
- Monatlich: Compliance-Review inkl. Audit-Nachweise.

## Operative Verknüpfung
- Detaillierte Sprint-Arbeitspakete: `./umsetzung-backlog.md`.
- Team-Status wird in `.docs/team/*/updates.md` fortgeführt.
