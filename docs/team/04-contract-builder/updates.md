# Updates – Contract Builder

## Initial
- Team aufgesetzt.
- Fokus auf EPIC 3 + EPIC 4 Abhängigkeiten.

## 2026-02-09
- Start Phase 0–1 Orchestrierung.
- Deliverables diese Woche: Rule-Engine Spezifikation v0.1, Konfliktauflösungs-UX Konzept.
- Abhängigkeiten: Versioning-Regeln von Team 03, ADR-002 Pinning-Konzept von Team 01.
- Referenzen: `docs/knowledge/adr-002-version-pinning.md`, `docs/knowledge/domain-model-v0.1.md`.
- Architektur-Übersicht: `docs/knowledge/architecture-summary.md`.
- Owner Matrix bestätigt: `docs/plan/sprint-status.md`.

## 2026-02-10 — Sprint 2 Deliverables abgeschlossen

### Interview Flow Design & Rule Engine v1 (`docs/knowledge/interview-flow-design-v1.md`)

- Interview-Engine Architektur: Flow Manager, Condition Evaluator, Answer Store (Client) + Contract Service, Rule Validator, Version Resolver (Backend).
- Geführter 4-Phasen-Flow: Template-Auswahl → Interview → Review & Resolve → Completion.
- Screen-Layout spezifiziert: Question Panel, Progress Sidebar, Live-Preview (Outline).
- 7 Fragetypen: single_choice, multiple_choice, text, number, date, currency, yes_no.
- Conditional Logic: show/hide/skip mit AND-Verknüpfung, Client-seitige Evaluierung.
- Save & Resume: Auto-Save (Debounce 2s), Resume-Flow mit Progress-Berechnung.
- Completion-Flow: Precondition-Check, Review-Screen, Post-Completion-Optionen.
- Rule Engine: 3-Phasen-Evaluierung (Scope Filter → Dependency Check → Conflict Check).
- Konfliktauflösungs-UX: Hard/Soft-Trennung, Resolution-Optionen (add/remove/replace).
- TypeScript-Interfaces für Client-State und Backend-Validation-Service.

### Konfliktregeln-Matrix v1 (`docs/knowledge/conflict-rules-matrix-v1.md`) — gemeinsam mit Team 03

- 5 Regeltypen vollständig: requires, forbids, incompatible_with, scoped_to, requires_answer.
- Severity-Klassifikation: hard (blockiert Export) vs. soft (Warnung).
- 4-Phasen-Evaluierungsreihenfolge definiert.
- Zyklen-Erkennung (DFS) für requires-Graphen bei Publikation.
- Beispiel-Matrix: 17 Klauseln, 15 statische Regeln, 3 antwortabhängige Regeln.
- Automatische Lösungsvorschläge mit autoApplicable-Flag.
- UI-Mockup für Rule-Erstellung in Redaktionsansicht.
- Testing-Anforderungen: 15 Unit-Tests, 5 Integration-Tests.

### Abhängigkeiten

- Input von Team 01: ADR-002 Pinning Spec, Domänenmodell v1.
- Input von Team 03: Content Versioning Schema v1 (Publishing-Gates, Workflow).
- Output: Builder-Spec als Grundlage für Sprint 3 Implementation.

## 2026-02-11 (Sprint 4)

**Sprint-4 Deliverables abgeschlossen.**

Erstellte Code-Artefakte:

- **Frontend Scaffold React + Vite + TypeScript** (`apps/web/`)
  React 18 + react-router-dom 6 + Vite 5. TypeScript Strict-Mode. Proxy `/api` → `localhost:3000`. CSS Custom Properties für Design Tokens. Skip-Link (WCAG 2.4.1), `:focus-visible` Styling. `Layout.tsx` mit Sidebar-Navigation (`aria-label`), `role="main"`. 6 Routen: `/`, `/dashboard`, `/catalog`, `/contracts`, `/contracts/new/:templateId`, `/contracts/:id/edit`. Page-Scaffolds: DashboardPage, CatalogPage, ContractsPage, InterviewPage. Fetch-basierter API-Client (`lib/api.ts`) mit Tenant-Header-Propagation.

Nächste Schritte Team 04:

- Sprint 5: Interview-Flow UI implementieren (Question Panel, Progress Sidebar, Live-Preview).
- Template-Katalog-Ansicht mit Filter/Suche (CatalogPage).
- Contracts-Liste mit Status-Anzeige (ContractsPage).
- Anbindung an Content-API und Contract-API (Backend-Integration).

## 2026-02-11 (Sprint 5)

**Sprint-5 Deliverables abgeschlossen.**

Erstellte Code-Artefakte:

- **Contract API** (`apps/api/src/modules/contract/routes.ts`, ~377 Zeilen)
  POST / — Create Contract (resolves Template→Clauses→published VersionIDs für Pinning). GET / — Paginated List (filterable by status). GET /:id — Detail. PATCH /:id — Auto-Save answers/selectedSlots (merge, draft-only guard). POST /:id/complete — ADR-002 Completion (pins immutable, Hard-Conflict-Check). POST /:id/validate — Rule-Evaluierung (requires/forbids/incompatible_with/requires_answer).

- **CatalogPage** (`apps/web/src/pages/CatalogPage.tsx`)
  Template-Grid von /content/catalog/templates. Karten mit Title, Description, Category, Jurisdiction, Tags. "Vertrag erstellen" Button navigiert zu /contracts/new/:templateVersionId. Loading/Error States mit aria-live.

- **ContractsPage** (`apps/web/src/pages/ContractsPage.tsx`)
  Contract-Tabelle von /contracts. Status-Badges (Entwurf/Abgeschlossen/Archiviert), Validierungs-Badges (Gültig/Warnungen/Konflikte). Bearbeiten/Ansehen-Aktionen.

- **InterviewPage** (`apps/web/src/pages/InterviewPage.tsx`, ~369 Zeilen)
  Vollständiger Interview-Flow: Question Panel mit QuestionInput (text, number, currency, date, yes_no, single_choice). Progress Sidebar mit Progressbar + Step-Navigation. Auto-Save (2s Debounce via useRef). Contract-Erstellung aus Template oder Resume. Validierung + Completion-Flow. ARIA: progressbar, aria-current="step", aria-required, sr-only legend.

Nächste Schritte Team 04:

- Sprint 6: Live-Preview Panel (Vertrags-Outline basierend auf Antworten).
- multiple_choice Fragetyp implementieren.
- Conditional Logic (show/hide/skip basierend auf Antworten).
- Filter/Suche in CatalogPage erweitern (Kategorie, Rechtsgebiet).

## 2026-02-11 (Sprint 6)

**Sprint 6 — keine Team-04-spezifischen Code-Deliverables.** Sprint 6 fokussierte auf Testing + Hardening.

Nächste Schritte Team 04:

- Sprint 7: Live-Preview Panel (Vertrags-Outline basierend auf Antworten).
- multiple_choice Fragetyp implementieren.
- Conditional Logic (show/hide/skip basierend auf Antworten).
- Filter/Suche in CatalogPage erweitern (Kategorie, Rechtsgebiet).

## 2026-02-11 (Sprint 7)

**Sprint-7 Deliverables abgeschlossen.**

Erstellte Code-Artefakte:

- **LivePreviewPanel** (`apps/web/src/components/LivePreviewPanel.tsx`, ~110 Zeilen)
  Echtzeit-Vertragsvorschau: Zeigt Sections, Slots und Clause-Previews. Slot-Resolution (alternative/optional). Parameter-Substitution `{{key}}` → Antwort-Werte. Deutsche Formatierung (Zahlen, Booleans). Props: contractTitle, sections, answers, selectedSlots, clausePreviews.

- **QuestionInput** (`apps/web/src/components/QuestionInput.tsx`, ~160 Zeilen)
  Extrahiert aus InterviewPage, unterstützt 7 Fragetypen inkl. neuem `multiple_choice` (Checkbox-Gruppe, speichert als string[]). `evaluateConditions()`: Evaluiert Frage-Sichtbarkeit mit 4 Operatoren (equals, not_equals, contains, is_truthy), AND-Verknüpfung. Exportiert `Question`-Interface mit optionalem `conditions`-Array.

- **InterviewPage Refactoring** (`apps/web/src/pages/InterviewPage.tsx`, ~337 Zeilen)
  Drei-Spalten-Layout: Sidebar + Main + Live-Preview. `visibleQuestions = useMemo(() => questions.filter(q => evaluateConditions(q.conditions, answers)))`. Navigation über visibleQuestions (Conditional Skip). Auto-Save für answers UND selectedSlots. Lädt Template-Structure für LivePreview. Conditional-Hint wenn Fragen ausgeblendet sind.

Nächste Schritte Team 04:

- Sprint 8: Filter/Suche in CatalogPage erweitern (Kategorie, Rechtsgebiet).
- Conflict-Resolution UI (Hard/Soft-Trennung, Resolution-Optionen).
- Review-Screen vor Completion implementieren.
- Keyboard-Navigation für Interview-Flow optimieren.

## 2026-02-11 (Sprint 8)

**Sprint-8 Deliverables abgeschlossen.**

Erstellte Code-Artefakte:

- **CatalogPage Filter/Suche** (`apps/web/src/pages/CatalogPage.tsx`, ~183 Zeilen, Rewrite)
  URL-param-basierte Filter via `useSearchParams`: Textsuche (q) über title/description/tags, Kategorie-Dropdown, Rechtsgebiet-Dropdown. Kategorien und Jurisdictions dynamisch aus geladenen Templates extrahiert via `useMemo`. Filter-Bar mit Suchfeld, 2 Select-Dropdowns, "Filter zurücksetzen"-Button, Filteranzahl-Anzeige. Client-seitige Filterung.

- **ConflictResolutionPanel** (`apps/web/src/components/ConflictResolutionPanel.tsx`, ~115 Zeilen, Neu)
  Hard-Konflikte (blockierend, &#9888;-Icon) und Soft-Warnungen getrennt dargestellt. Hard-Konflikte zeigen Meldung + betroffene Klausel-ID. Soft-Warnungen mit "Ausblenden"-Button (dismissed Set-State). "Erneut validieren"-Button ruft `POST /contracts/:id/validate`. Valid-State: Grünes &#10003; "Keine Konflikte — Vertrag kann abgeschlossen werden." ARIA: role="status", role="region", aria-label auf allen Abschnitten.

Nächste Schritte Team 04:

- Sprint 9: Review-Screen vor Completion implementieren.
- Batch-Clause-Content-Endpoint für Live-Preview-Integration.

## 2026-02-11 (Sprint 9)

**Sprint-9 Deliverables abgeschlossen.**

Erstellte Code-Artefakte:

- **Batch-Clause-Content-Endpoint** (`apps/api/src/modules/content/routes.ts`)
  POST `/clauses/batch-content` — Akzeptiert Array von clauseVersionIds (max 50), gibt Clause-Version-Content in einem Request zurück. Zod-Validierung (min 1, max 50 IDs). Optimierte DB-Query mit `findMany({ where: { id: { in: ids } } })`. Verwendet für Live-Preview und Review-Screen.

- **ReviewPage** (`apps/web/src/pages/ReviewPage.tsx`, ~200+ Zeilen)
  Pre-Completion Review-Screen: Lädt Contract-Details + Clause-Contents via Batch-Endpoint. Zeigt Zusammenfassung (Titel, Mandantenreferenz, alle Interview-Antworten). Rendert Klausel-Inhalte mit Parameter-Substitution (Antworten ersetzen `{{key}}` Platzhalter). Validierungsstatus (gültig/Warnungen/Konflikte) mit farblicher Kennzeichnung. Zwei Aktionen: "Zurück zum Interview" und "Vertrag abschließen". ARIA: role="status", aria-live für Validierung.

Nächste Schritte Team 04:

- Sprint 10: Keyboard-Navigation für Interview-Flow optimieren.
- Changelog-UI im Frontend (Abstimmung mit Team 03).
- Export-Trigger aus Review-Screen (nach Completion → direkt Export starten).
- Responsive Design für Interview + Review (Tablet-Optimierung).

## 2026-02-11 (Sprint 10)

**Sprint-10 Deliverables abgeschlossen.**

Erstellte Code-Artefakte:

- **Export-Trigger aus ReviewPage** (`apps/web/src/pages/ReviewPage.tsx`)
  Nach Vertragabschluss (Completion) wird automatisch ein Export-Job via POST /export erstellt. Polling auf Export-Status (2s Intervall). Download-Button erscheint nach Fertigstellung. Fortschrittsanzeige (Pending → Processing → Completed). Fehlerbehandlung mit Retry-Option.

- **Keyboard-Navigation Interview-Flow** (`apps/web/src/pages/InterviewPage.tsx`)
  Enter: Nächste Frage. Shift+Enter: Vorherige Frage. Ctrl+S: Manuelles Speichern. `useEffect`-basierte Keyboard-Event-Handler. Fokus-Management bei Frage-Wechsel. Screen-Reader-Ankündigung bei Navigation (aria-live).

Nächste Schritte Team 04:

- Drag-and-Drop für Klausel-Reihenfolge im Contract Builder.
- Offline-Fähigkeit für Interview-Flow (Service Worker).

## 2026-02-11 (Sprint 11)

**Sprint-11 Deliverables abgeschlossen.**

Erstellte Code-Artefakte:

- **Responsive Design** (`apps/web/src/styles/responsive.css`)
  Breakpoints: Desktop (≥1024px, 3-Spalten Interview), Tablet (768–1023px, 2-Spalten, LivePreview als Drawer), Mobile (≤767px, Single-Column, Progress als Stepper). Interview-Page: Sidebar collapsible auf Tablet, Stack-Layout auf Mobile. Review-Page: Zwei-Spalten auf Tablet, Single-Column auf Mobile. CatalogPage: Grid responsive (4→3→2→1 Spalten). Touch-Targets ≥44px (WCAG 2.5.5).

- **Changelog-UI** (`apps/web/src/components/ChangelogPanel.tsx`)
  Slide-over Panel (rechts, 400px): Zeigt Version-History für Clauses/Templates. Changelog-Einträge gruppiert nach Version (Nummer + Datum). Change-Type-Badges (content, legal, editorial, structure). Legal-Impact-Anzeige (breaking=rot, minor=gelb, none=grau). Lazy-Loading via Intersection Observer. Keyboard-Dismissal (Escape). ARIA: role="dialog", aria-label, Focus-Trap.

Nächste Schritte Team 04:

- Drag-and-Drop für Klausel-Reihenfolge im Contract Builder.
- Offline-Fähigkeit für Interview-Flow (Service Worker).
- Multi-Language-Support (i18n-Framework).

## 2026-02-11 (Sprint 12)

**Sprint-12 Deliverables abgeschlossen.**

Erstellte Code-Artefakte:

- **ClauseReorderPanel** (`apps/web/src/components/ClauseReorderPanel.tsx`)
  Drag-and-Drop für Klausel-Reihenfolge innerhalb Sections. HTML5 DnD API (keine Library). Nur optional/alternative Slots verschiebbar. Visuelles Feedback: Drag-Handle, Drop-Zone, Drag-Over-Indicator. ARIA: aria-grabbed, aria-dropeffect.

- **i18n-Framework** (`apps/web/src/i18n/index.ts`, `de.json`, `en.json`)
  Leichtgewichtiges i18n ohne externe Dependencies. React Context + JSON-Translations. `useTranslation()` Hook mit Interpolation. Default: Deutsch. TypeScript-typisiert.

- **i18n-Tests** (`apps/web/src/i18n/__tests__/i18n.test.ts`)
  Tests für Translation-Lookup, Fallback, Interpolation, Locale-Switch.
