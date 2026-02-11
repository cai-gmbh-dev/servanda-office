# Updates – Export & Integration

## Initial
- Team aufgesetzt.
- Fokus auf MVP-Export und spätere Integrationsfähigkeit.

## 2026-02-09
- Start Phase 0–1 Orchestrierung.
- Deliverables diese Woche: DOCX Export Referenzdokumente, Export-Mapping v0.1, ODT-Optionenbewertung.
- Abhängigkeiten: ADR-003/004 Input an Team 01, Content-Struktur von Team 03.
- Referenzen: `docs/knowledge/adr-003-export-engine-service.md`, `docs/knowledge/adr-004-odt-strategy.md`, `docs/knowledge/domain-model-v0.1.md`.
- Architektur-Übersicht: `docs/knowledge/architecture-summary.md`.
- Owner Matrix bestätigt: `docs/plan/sprint-status.md`.

## 2026-02-10

**Sprint-3 Deliverables abgeschlossen.**

Erstellte Artefakte:

- **DOCX Export MVP Spezifikation** (`docs/knowledge/docx-export-spec-v1.md`)
  End-to-End Export-Pipeline: API → pgboss Queue → Worker → Object Storage → Pre-signed URL Download. docxtemplater-Integration mit RenderContext, Parameter-Substitution (Datum, Währung, Leerfeld-Handling). Style-Templates (Default: Arial 11pt, hierarchische Nummerierung §/Abs/lit). 3 Referenzdokumente (Arbeitsvertrag, Dienstleistungsvertrag, NDA). Performance-Ziel: <15s E2E P95 (5 Seiten). Error-Handling mit Dead-Letter-Queue und Retry (3x).

- **ODT-Konvertierung Evaluierung** (`docs/knowledge/odt-conversion-eval-v1.md`) — gemeinsam mit Team 07
  DOCX→ODT via LibreOffice headless. Dockerfile mit libreoffice-writer + Fonts. Qualitäts-Testmatrix (12 Features, Gesamt: AKZEPTABEL FÜR BETA). Bekannte Einschränkungen: hierarchische Nummerierung, Font-Fallback. Performance: 2-5s typische Dokumente, Cold-Start 3-5s. Sicherheitsmodell: Container-Isolation, Non-Root, tmpfs, Read-Only FS, Network Policies. Feature-Flag (odt_export_enabled, per Tenant, Default: false in Prod). Empfehlung: Beta-Feature im MVP aufnehmen.

Input-Quellen:

- ADR-003 Export Engine Service (Team 01)
- ADR-004 ODT Strategy (Team 01)
- Content Versioning Schema v1 (Team 03)
- Deployment-Blueprint v1 (Team 07)

Nächste Schritte Team 05:

- Sprint 4: Export-Worker implementieren (pgboss + docxtemplater).
- Referenzdokument-Templates erstellen und Qualitäts-Baseline messen.
- ODT Feature-Flag in Config-Service integrieren.
- Kanzlei-Branding Style-Template (Sprint 5).

## 2026-02-11 (Sprint 4)

**Sprint-4 Deliverables abgeschlossen.**

Erstellte Code-Artefakte:

- **Export Worker Skeleton** (`apps/export-worker/`)
  - pgboss-Integration mit Concurrency-Steuerung, Retry (3x), Timeout (120s), Graceful Shutdown
  - `export-handler.ts`: Pipeline Load Data → Render DOCX → (ODT) → Upload → Update Status
  - `docx-renderer.ts`: docxtemplater-Integration mit RenderContext, Parameter-Substitution, hierarchische Nummerierung
  - `odt-converter.ts`: LibreOffice headless Konvertierung mit isoliertem tmpdir, 60s Timeout, Cleanup
  - `s3-client.ts`: S3/MinIO Upload + Pre-signed URL Generation
  - `data-loader.ts`: Interface + Mock-Implementation (DB-Integration Sprint 5)

Nächste Schritte Team 05:

- Sprint 5: Data-Loader mit echter DB-Anbindung (Prisma, gepinnte Versionen laden).
- Referenz-DOCX-Templates erstellen und Rendering-Qualität testen.
- Export-API-Endpunkte mit pgboss-Job-Erstellung verbinden.
- ODT Feature-Flag in Tenant-Config integrieren.

## 2026-02-11 (Sprint 5)

**Sprint-5 Deliverables abgeschlossen.**

Erstellte Code-Artefakte:

- **Export API** (`apps/api/src/modules/export/routes.ts`, ~172 Zeilen)
  POST / — Create Export Job (validates Contract ownership, checks ODT Feature-Flag, creates ExportJob Record, enqueues to pgboss). GET /:id — Job Status (pending/processing/completed/failed). GET /:id/download — Redirect (302) to Pre-signed S3 URL. Lazy pgboss Initialization.

- **Data-Loader DB Integration** (`apps/export-worker/src/data/data-loader.ts`, ~137 Zeilen)
  Echte Prisma-Queries statt Mock-Daten. RLS-Context setzen. ContractInstance laden mit pinnedClauseVersionIds/pinnedTemplateVersionId. TemplateVersion.structure laden. ClauseVersions nach gepinnten IDs laden. Slot-Resolution: selectedSlots überschreiben default, optionale Slots ohne Selektion werden übersprungen, fehlende required Slots erhalten Platzhalter. StyleTemplate laden (falls gesetzt).

Nächste Schritte Team 05:

- Sprint 6: Referenz-DOCX-Templates (.docx Vorlagen) erstellen und Rendering-Qualität testen.
- ODT Feature-Flag in Tenant-Config (DB) integrieren.
- Dead-Letter-Queue Monitoring für fehlgeschlagene Export-Jobs.
- Kanzlei-Branding Style-Templates (Logo, Fonts, Farben).

## 2026-02-11 (Sprint 6)

**Sprint-6 Deliverables abgeschlossen (gemeinsam mit Team 03).**

Erstellte Artefakte:

- **Referenz-DOCX-Template Generator** (`apps/export-worker/templates/generate-template.ts`) — gemeinsam mit Team 03
  Script generiert `default.docx` mit korrekten docxtemplater-Tags für Vertragsstruktur. OpenXML-konform, PizZip-basiert. npm Script `generate:template` in package.json ergänzt. Template enthält Sections/Clauses Loop, Metadata-Header, Nummerierung, Servanda-Office-Footer.

Nächste Schritte Team 05:

- Sprint 7: Template generieren und Rendering-Qualität mit Seed-Daten testen.
- ODT Feature-Flag in Tenant-Config (DB) integrieren.
- Dead-Letter-Queue Monitoring für fehlgeschlagene Export-Jobs.
- Kanzlei-Branding Style-Templates (Logo, Fonts, Farben).

## 2026-02-11 (Sprint 7)

**Sprint-7 Deliverables abgeschlossen.**

Erstellte Code-Artefakte:

- **Export Rendering-Tests** (`apps/export-worker/src/__tests__/rendering.test.ts`, 12 Tests)
  RenderContext-Konstruktion, Template-Loading, Dokument-Generierung, Seed-Daten-Szenarien (Arbeitsvertrag, optionale Klauseln, Datums-/Währungsformatierung). Testet docxtemplater-Integration mit hierarchischer Nummerierung und Parameter-Substitution.

- **Feature-Flag-System** (`apps/export-worker/src/config/feature-flags.ts`)
  `isOdtExportEnabled(tenantSettings)` und `isFeatureEnabled(flagName, tenantSettings)`. Dreistufige Resolution: Tenant-DB-Settings → Environment-Variable-Fallback → Default false. Unterstützt beliebige Feature-Flags pro Tenant.

- **Feature-Flag-Tests** (`apps/export-worker/src/__tests__/feature-flags.test.ts`, 11 Tests)
  Tenant-Settings-Priorität, Env-Fallback, Defaults, Precedence-Logik. Testet alle 3 Resolution-Stufen.

Nächste Schritte Team 05:

- Sprint 8: Dead-Letter-Queue Monitoring für fehlgeschlagene Export-Jobs.
- Kanzlei-Branding Style-Templates (Logo, Fonts, Farben).
- Export-Performance-Optimierung (Template-Caching).
- Batch-Export für mehrere Verträge.

## 2026-02-11 (Sprint 8)

**Sprint-8 Deliverables abgeschlossen.**

Erstellte Code-Artefakte:

- **Dead-Letter-Queue Routes** (`apps/api/src/modules/export/dlq-routes.ts`, Neu)
  GET /failed — Liste fehlgeschlagener Export-Jobs (paginiert). POST /:id/retry — Fehlgeschlagenen Job erneut in pgboss-Queue einreihen. POST /:id/archive — Job archivieren. GET /stats — DLQ-Statistiken (Anzahl fehlgeschlagen, archiviert, ältester Job).

- **Kanzlei-Branding Routes** (`apps/api/src/modules/export/branding-routes.ts`, Neu)
  StyleTemplate CRUD: POST /branding/style-templates — Erstellen (fonts, colors, logo, margins). GET /branding/style-templates — Liste für Tenant. GET /branding/style-templates/:id — Einzelnes Template. PATCH /branding/style-templates/:id — Aktualisieren. DELETE /branding/style-templates/:id — Löschen.

- Router in `apps/api/src/main.ts` gemountet auf `/api/v1/export-jobs` (DLQ) und `/api/v1/export` (Branding) + Legacy-Pfade.

Nächste Schritte Team 05:

- Sprint 9: Export-Performance-Optimierung (Template-Caching, Pre-Warm).
- Batch-Export für mehrere Verträge.
- Logo-Upload für Branding (S3-Integration).
- DLQ-Dashboard-UI im Frontend.
