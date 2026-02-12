# Updates – Content Editorial

## Initial
- Team aufgesetzt.
- Fokus auf EPIC 2 und Redaktionsfluss.

## 2026-02-09
- Start Phase 0–1 Orchestrierung.
- Deliverables diese Woche: Versioning-Regeln v0.1 (Clause/Template), Publishing-Checklist, Pinning-Definition.
- Abhängigkeiten: Input an Team 01 (Domänenmodell), Team 04 (Rule-Engine Specs).
- Referenzen: `docs/knowledge/adr-002-version-pinning.md`, `docs/knowledge/domain-model-v0.1.md`.
- Architektur-Übersicht: `docs/knowledge/architecture-summary.md`.
- Owner Matrix bestätigt: `docs/plan/sprint-status.md`.

## 2026-02-10 — Sprint 2 Deliverables abgeschlossen

### Content Versioning Schema v1 (`docs/knowledge/content-versioning-schema-v1.md`)
- Editorial Workflow komplett spezifiziert: Draft → Review → Approved → Published → Deprecated.
- Vier-Augen-Prinzip erzwungen (Reviewer ≠ Autor, DB-Constraint).
- 10 Publishing-Gates für ClauseVersions (PG-C01..C10), 10 für TemplateVersions (PG-T01..T10).
- Vollständiges DB-Schema: clauses, clause_versions, templates, template_versions, interview_flows.
- RLS-Policies: Vendor sieht eigene, Kanzlei sieht nur Published-Content.
- DB-Trigger: Auto-Version-Number, Immutability nach Draft, Auto-Deprecation bei neuem Publish.
- Changelog-Format spezifiziert (offener Punkt aus ADR-002 geschlossen): changeType, legalImpact, migrationNotes.
- Reviewer-Workflow: Zuweisung, Approve/Reject/Request Changes, Review-Kommentare, Audit-Trail.
- API-Endpunkte für Clause/Template CRUD + Status-Transitions + Catalog (Read-Only für Kanzleien).

### Konfliktregeln-Matrix v1 (`docs/knowledge/conflict-rules-matrix-v1.md`) — gemeinsam mit Team 04
- Alle 5 Regeltypen vollständig spezifiziert: requires, forbids, incompatible_with, scoped_to, requires_answer.
- Beispiel-Matrix für MVP-Muster "Arbeitsvertrag" (17 Klauseln, 15 Regeln + 3 antwortabhängige Regeln).
- Graph-Visualisierung der Regel-Beziehungen.
- Performance-Richtlinien: < 50ms Evaluierung, max 2000 Rules.

### Abhängigkeiten
- Input von Team 01: Domänenmodell v1, ADR-002 Spezifikation.
- Output an Team 04: Content Versioning Schema als Grundlage für Builder-Integration.
- Offener Punkt gelöst: Changelog-Format (ADR-002).

## 2026-02-11 (Sprint 5)

**Sprint-5 Deliverables abgeschlossen.**

Erstellte Code-Artefakte:

- **Content API — Clause + Template CRUD mit Versioning** (`apps/api/src/modules/content/routes.ts`, ~594 Zeilen)
  - Clause-Endpoints: POST /clauses, GET /clauses (paginiert), GET /clauses/:id (mit Versions-Liste)
  - ClauseVersion-Lifecycle: POST /clauses/:id/versions (auto-increment versionNumber), PATCH /clauses/:id/versions/:vid/status
  - Status-Transitions: draft→review→approved→published→deprecated (VALID_TRANSITIONS Map). Publish setzt publishedAt, reviewerId, updatedcurrentPublishedVersionId.
  - Template-Endpoints: POST/GET/GET:id mit gleichem Pattern
  - TemplateVersion-Lifecycle: POST /templates/:id/versions, PATCH status
  - **Published Catalog**: GET /catalog/templates — Cross-Tenant Read (Kanzleien sehen published Vendor-Content), filtert Vendor-Tenants mit veröffentlichten Versionen
  - Zod-Schemas für alle Inputs. Formatter-Funktionen für konsistente Response-Struktur. RLS-Transaktionen überall.

Nächste Schritte Team 03:

- Sprint 6: Referenz-DOCX-Templates (.docx Vorlagen) für die 4 Seed-Klauseln erstellen.
- Changelog-API für ClauseVersions implementieren (changeType, legalImpact, migrationNotes).
- Publishing-Gate-Validierung (PG-C01..C10) als Pre-Publish-Checks.
- Reviewer-Workflow: Zuweisung + Approve/Reject API-Endpoints.

## 2026-02-11 (Sprint 6)

**Sprint-6 Deliverables abgeschlossen (gemeinsam mit Team 05).**

Erstellte Artefakte:

- **Referenz-DOCX-Template Generator** (`apps/export-worker/templates/generate-template.ts`)
  Generiert `default.docx` als minimale OpenXML-Struktur mit PizZip. docxtemplater-Tags: `{{contractTitle}}`, `{{clientReference}}`, `{{createdDate}}`, `{#sections}/{/sections}` Loop mit `{sectionNumber}`, `{sectionTitle}`, `{#clauses}/{/clauses}` Loop mit `{clauseNumber}`, `{clauseContent}`. Styles: Arial 11pt (Normal), 14pt bold (Heading1), 12pt bold (Heading2). Hierarchische Nummerierung § / Abs. npm Script: `generate:template`.

Nächste Schritte Team 03:

- Sprint 7: Changelog-API für ClauseVersions implementieren.
- Publishing-Gate-Validierung (PG-C01..C10) als Pre-Publish-Checks.
- Reviewer-Workflow: Zuweisung + Approve/Reject API-Endpoints.
- Weitere .docx-Vorlagen für verschiedene Vertragstypen.

## 2026-02-11 (Sprint 7)

**Sprint-7 Deliverables abgeschlossen.**

Erstellte Code-Artefakte:

- **Changelog-API** (`apps/api/src/modules/content/changelog.ts`, ~130 Zeilen)
  POST /clauses/:id/versions/:vid/changelog — Erstellt Changelog-Eintrag in version.metadata.changelog (append-only Array). GET /clauses/:id/versions/:vid/changelog — Einträge für spezifische Version. GET /clauses/:id/changelog — Einträge über alle Versionen. Zod-Schema: changeType (content|legal|editorial|structure), legalImpact (breaking|minor|none), summary, migrationNotes, affectedSections. Router in main.ts gemountet.

- **Publishing-Gate-Validierung** (`apps/api/src/modules/content/publishing-gates.ts`, ~250 Zeilen)
  `validateClausePublishingGates()`: 10 Gates (PG-C01..C10) — Titel, Content, Changelog, Reviewer≠Author, Review-Status, Pflicht-Metadaten, Konfliktregeln-Konsistenz, Deprecated-Erkennung, Vorgänger-Deprecation, Tenant-Ownership. `validateTemplatePublishingGates()`: 10 Gates (PG-T01..T10) — Titel, Sections, Interview-Flow, Reviewer≠Author, Review-Status, Pflicht-Metadaten, Clauses-Published, Zirkuläre Referenzen, Vorgänger-Deprecation, Tenant-Ownership. Returns `{ canPublish, gates[] }` mit Severity (error/warning). Integriert in Content-API: Publish-Transition wirft ConflictError bei fehlgeschlagenen Gates. GET-Endpoints für Pre-Flight-Checks.

Nächste Schritte Team 03:

- Sprint 8: Reviewer-Workflow: Zuweisung + Approve/Reject API-Endpoints.
- Weitere .docx-Vorlagen für verschiedene Vertragstypen (Dienstleistungsvertrag, NDA).
- Changelog-UI im Frontend (Team 04 Abstimmung).
- Bulk-Publishing für Template-Updates.

## 2026-02-11 (Sprint 8)

**Sprint-8 Deliverables abgeschlossen.**

Erstellte Code-Artefakte:

- **Reviewer-Workflow** (`apps/api/src/modules/content/reviewer.ts`, ~400 Zeilen)
  10 Endpoints für Clause- und Template-Version-Reviews:
  - POST /clauses/:id/versions/:vid/assign-reviewer — Reviewer-Zuweisung (Vier-Augen-Prinzip: Reviewer ≠ Author).
  - POST /clauses/:id/versions/:vid/approve — Genehmigung (Author kann eigene Version nicht genehmigen).
  - POST /clauses/:id/versions/:vid/reject — Ablehnung mit Kommentar, Status zurück auf draft.
  - POST /clauses/:id/versions/:vid/request-changes — Änderungen anfordern mit Kommentar + betroffene Sektionen.
  - GET /clauses/:id/versions/:vid/reviews — Review-History.
  - Gleiches Pattern für Template-Versions (5 weitere Endpoints).
  Review-History als append-only Array in `version.metadata.reviewHistory`. Jeder Eintrag: action, reviewerId, comment?, affectedSections?, timestamp.
  Router in main.ts gemountet auf `/api/v1/content` und `/api/content`.

Nächste Schritte Team 03:

- Weitere .docx-Vorlagen für verschiedene Vertragstypen (Dienstleistungsvertrag, NDA).
- Bulk-Publishing für Template-Updates.
- Review-Dashboard für Reviewer-Übersicht.

## 2026-02-11 (Sprint 11)

**Sprint-11 Deliverables abgeschlossen.**

Erstellte Code-Artefakte:

- **Content-Import Service** (`apps/api/src/modules/content/import.ts`)
  Bulk-Import von Clauses, Templates und InterviewFlows aus JSON-Dateien. Zod-Validierung (`contentImportSchema`). Transaktionale Erstellung mit RLS-Context. Unterstützt verschachtelte Versions-Erstellung (Clause → ClauseVersion, Template → TemplateVersion). Import-Report mit Zusammenfassung (erstellt/fehlgeschlagen pro Typ) und Detail-Fehlern.

- **Content-Import Unit-Tests** (`apps/api/src/modules/content/import.test.ts`)
  Tests für: Single-Clause-Import, Multi-Clause-Import, Template-Import mit Versions, Validierungsfehler (fehlende Pflichtfelder), leerer Import.

- **Import-Endpoint** (`apps/api/src/modules/content/routes.ts`)
  POST `/import` — Admin-only, Zod-Validierung, Audit-Log. Integriert in Content-Router.

Nächste Schritte Team 03:

- Weitere .docx-Vorlagen für verschiedene Vertragstypen.
- Bulk-Publishing für Template-Updates.
- Review-Dashboard für Reviewer-Übersicht.

## 2026-02-11 (Sprint 12)

**Sprint-12 Deliverables abgeschlossen.**

Erstellte Artefakte:

- **Pilot-Content: Dienstleistungsvertrag** (`apps/api/prisma/fixtures/dienstleistungsvertrag.json`)
  Vollständiges Template mit Klauseln (Leistungsbeschreibung, Vergütung, Laufzeit/Kündigung, Haftung, Geheimhaltung, Schlussbestimmungen). Interview-Flow mit 12+ Fragen. Conditional Logic. Konfliktregeln.

- **Pilot-Content: NDA/Geheimhaltungsvereinbarung** (`apps/api/prisma/fixtures/nda.json`)
  Vollständiges Template für NDA (Definition vertraulicher Informationen, Schutzpflichten, Ausnahmen, Vertragsstrafe, Laufzeit). Interview-Flow. Einseitige und gegenseitige NDAs via Conditional Logic.
