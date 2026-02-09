# Umsetzung Backlog (operational)

Ziel: Den strategischen Umsetzungsplan in konkrete, teamübergreifende Arbeitspakete übersetzen.

## Sprint 1 (Foundation)
- [ ] Domänenmodell v1 finalisieren (Owner: Team 01, Ref: `docs/knowledge/domain-model-v0.1.md`)
- [ ] ADR-001 Tenancy-Entscheidung operationalisieren (Owner: Team 01 + 02, Ref: `docs/knowledge/adr-001-multi-tenant-isolation.md`)
- [ ] ADR-002 Pinning in ContractInstance spezifizieren (Owner: Team 01 + 03, Ref: `docs/knowledge/adr-002-version-pinning.md`)
- [ ] Tenant-Isolation Threat Model (Owner: Team 02, Ref: `docs/knowledge/adr-001-multi-tenant-isolation.md`)
- [ ] QA Gate Definition als CI-Jobs (Owner: Team 06, Ref: `docs/qa/QUALITY_GATES.md`)
- [ ] Deployment-Environments (dev/stage/prod) skizzieren (Owner: Team 07)

## Sprint 2 (Editorial + Builder)
- [ ] Template/Clause Versioning Schema (Owner: Team 03, Ref: `docs/knowledge/domain-model-v0.1.md`)
- [ ] Interview Flow Wireframes + Save/Resume (Owner: Team 04)
- [ ] Konfliktregeln-Matrix requires/forbids/incompatible (Owner: Team 04 + 03, Ref: `docs/knowledge/adr-002-version-pinning.md`)

## Sprint 3 (Export + Hardening)
- [ ] DOCX Export MVP mit Referenzdokumenten (Owner: Team 05, Ref: `docs/knowledge/adr-003-export-engine-service.md`)
- [ ] ODT-Konvertierung evaluieren (Owner: Team 05 + 07, Ref: `docs/knowledge/adr-004-odt-strategy.md`)
- [ ] Accessibility/Performance Baseline in CI (Owner: Team 06, Ref: `docs/qa/QUALITY_GATES.md`)
- [ ] Audit Logging E2E prüfen (Owner: Team 02 + 07)

## Definition of Ready (DoR)
- User Story mit Akzeptanzkriterien und betroffenen Teams dokumentiert
- Abhängigkeiten + Risiken benannt
- Messkriterium für Done vorhanden

## Definition of Done (DoD)
- Implementiert, getestet und dokumentiert
- Relevante Entscheidung im Knowledge Hub ergänzt
- Team-Update in `.docs/team/<team>/updates.md` eingetragen
