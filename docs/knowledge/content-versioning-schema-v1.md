# Content Versioning Schema v1

**Status:** Final Draft
**Datum:** 2026-02-10
**Owner:** Team 03 (Content Editorial)
**Betroffene Teams:** 01, 03, 04
**Referenzen:** ADR-002 (Version Pinning), Domänenmodell v1, Story-Map E2.S1–E2.S4

---

## 1. Übersicht

Dieses Dokument spezifiziert das Versionierungsschema für Verlags-Content (Klauseln und Templates), den Editorial Workflow mit Publishing-Gates und das Datenbank-Schema für die Content-Tabellen im Servanda Office MVP.

### Leitprinzipien

1. **Immutability:** Veröffentlichte Versionen sind unveränderlich.
2. **Traceability:** Jede Änderung ist auditierbar und versioniert.
3. **Four-Eyes:** Publikation erfordert Reviewer-Freigabe (Autor ≠ Reviewer).
4. **Backward Compatibility:** Bestehende Verträge behalten ihre gepinnten Versionen.
5. **Single Published:** Pro logischer Klausel/Template ist genau eine Version `published`.

---

## 2. Editorial Workflow

### 2.1 Status-Lifecycle

```
┌─────────┐    submit     ┌────────┐   approve   ┌──────────┐   publish   ┌───────────┐
│  Draft   │─────────────→│ Review │────────────→│ Approved │───────────→│ Published │
└─────────┘               └────────┘             └──────────┘            └───────────┘
     ▲                         │                                              │
     │                         │ reject                                       │ deprecate
     │                         ▼                                              ▼
     │                    ┌─────────┐                                  ┌────────────┐
     └────────────────────│  Draft  │                                  │ Deprecated │
       (neue Version)     └─────────┘                                  └────────────┘
```

### 2.2 Statusübergänge

| Von | Nach | Aktion | Akteur | Vorbedingungen |
|-----|------|--------|--------|----------------|
| `draft` | `review` | Submit for Review | Autor (Editor/Admin) | Alle Pflichtfelder ausgefüllt; mindestens 1 Rule definiert (bei Klauseln); Content nicht leer |
| `review` | `approved` | Approve | Reviewer (Editor/Admin) | Reviewer ≠ Autor; Review-Kommentar optional |
| `review` | `draft` | Reject | Reviewer | Reject-Kommentar Pflicht; neue Draft-Version wird erstellt |
| `approved` | `published` | Publish | System (automatisch nach Approve) oder Admin manuell | Keine Hard-Conflict-Regeln unaufgelöst; alle referenzierten Klauseln existieren |
| `published` | `deprecated` | Deprecate | Admin | Mindestens eine neuere Published-Version oder explizite Begründung |

### 2.3 Regeln

- **Draft-Phase:** Einzige Phase, in der Inhalte editierbar sind. Nach erstem Statusübergang wird der Inhalt immutable.
- **Rejection:** Erzeugt eine neue ClauseVersion/TemplateVersion im Status `draft` (Kopie mit Änderungsmöglichkeit). Die abgelehnte Version bleibt im Status `review` als Audit-Nachweis.
- **Vier-Augen-Prinzip:** `reviewerId` darf nicht gleich `authorId` sein. System erzwingt dies.
- **Auto-Publish:** Für MVP ist `approved` → `published` automatisch (kein manueller Publish-Schritt). Dies kann in Phase 2 auf manuellen Publish umgestellt werden.
- **Deprecation:** Bestehende Verträge behalten ihre gepinnten Versionen (ADR-002). Neue Vertragserstellung mit deprecated Versionen ist blockiert.

---

## 3. Versionierungsregeln

### 3.1 Versionsnummern

| Entity | Schema | Beispiel |
|--------|--------|----------|
| ClauseVersion | Auto-increment Integer pro Clause | Klausel "Haftungsausschluss" → v1, v2, v3 |
| TemplateVersion | Auto-increment Integer pro Template | Template "Arbeitsvertrag" → v1, v2, v3 |

- Versionsnummern sind **monoton steigend** und **lückenlos** pro logischer Entity.
- Es gibt keine semantische Versionierung (kein SemVer) — jede Änderung erzeugt eine neue Version.
- Version-Nummer wird bei Erstellung automatisch vergeben (DB-Trigger oder Application-Layer).

### 3.2 Immutability-Regeln

| Attribut | Draft | Review+ |
|----------|-------|---------|
| `content` / `structure` | Editierbar | Immutable |
| `parameters` | Editierbar | Immutable |
| `rules` | Editierbar | Immutable |
| `metadata` | Editierbar | Immutable |
| `status` | Änderbar (→ review) | Nur Forward-Transitions |
| `reviewerId` | NULL | Gesetzt bei Approve |
| `publishedAt` | NULL | Gesetzt bei Publish |

### 3.3 Neue Version erstellen

Eine neue Version wird erstellt wenn:

1. **Inhaltliche Änderung:** Autor will bestehende Published-Klausel/Template ändern → Neue Version im Status `draft`.
2. **Rejection:** Reviewer lehnt ab → System erzeugt Kopie im Status `draft`.
3. **Klonvorgang:** "Als Vorlage verwenden" → Neue Version basierend auf bestehender.

```
Autor will Änderung an Published-Klausel
       │
       ▼
System erstellt neue ClauseVersion:
  versionNumber ← MAX(versionNumber) + 1
  content ← Kopie von vorheriger Version
  status ← draft
  authorId ← aktueller User
  reviewerId ← NULL
       │
       ▼
Autor editiert Draft
       │
       ▼
Submit → Review → Approve → Publish
       │
       ▼
Clause.currentPublishedVersionId ← neue Version
Vorherige Published-Version ← deprecated (automatisch)
```

### 3.4 Auto-Deprecation

Wenn eine neue Version `published` wird:
1. Die vorherige `published` Version wird automatisch auf `deprecated` gesetzt.
2. Bestehende ContractInstances behalten ihre gepinnten Versionen (ADR-002).
3. Neue Vertragserstellung nutzt die neue Published-Version.
4. Draft-Verträge erhalten einen Hinweis "Neuere Version verfügbar".

---

## 4. Publishing-Gates (Checkliste)

### 4.1 ClauseVersion Publishing-Gate

| # | Prüfung | Automatisiert | Beschreibung |
|---|---------|---------------|--------------|
| PG-C01 | Content nicht leer | ✓ | `content.length > 0` |
| PG-C02 | Titel ausgefüllt | ✓ | `clause.title.length > 0` |
| PG-C03 | Jurisdiktion gesetzt | ✓ | `clause.jurisdiction` ist gültiger ISO-Code |
| PG-C04 | Parameter-Definitionen valide | ✓ | Jeder Parameter hat `key`, `type`, `label` |
| PG-C05 | Mindestens eine Rule definiert | ✓ | `rules.length >= 1` (konfigurierbar) |
| PG-C06 | Rules referenzieren existierende Klauseln | ✓ | Alle `targetClauseId`s existieren in DB |
| PG-C07 | Keine zirkulären `requires`-Ketten | ✓ | Graph-Traversal (DFS) ohne Zyklen |
| PG-C08 | Reviewer ≠ Autor | ✓ | `reviewerId ≠ authorId` |
| PG-C09 | Review-Kommentar bei Rejection | ✓ | Wenn `review → draft`: Kommentar Pflicht |
| PG-C10 | Keine offenen Hard-Conflicts mit anderen Published-Klauseln | ✓ | Rule-Evaluierung gegen aktuelles Published-Set |

### 4.2 TemplateVersion Publishing-Gate

| # | Prüfung | Automatisiert | Beschreibung |
|---|---------|---------------|--------------|
| PG-T01 | Mindestens eine Section | ✓ | `structure.sections.length >= 1` |
| PG-T02 | Jede Section hat mindestens einen Slot | ✓ | `section.slots.length >= 1` für jede Section |
| PG-T03 | Alle Slot-Referenzen gültig | ✓ | `slot.clauseId` existiert als Clause in DB |
| PG-T04 | Required-Slots referenzieren Published-Klauseln | ✓ | `required`-Slots → Clause hat `currentPublishedVersionId` |
| PG-T05 | Alternative-Slots: alle Alternativen existieren | ✓ | `slot.alternativeClauseIds` → alle existieren und sind published |
| PG-T06 | InterviewFlow vorhanden (wenn Template Fragen hat) | ✓ | `interviewFlowId` gesetzt wenn Slots mit Parametern |
| PG-T07 | InterviewFlow-Questions decken alle Parameter ab | ✓ | Jeder Parameter-Key hat mindestens eine Question |
| PG-T08 | Keine unerreichbaren Fragen (Condition-Zyklen) | ✓ | Condition-Graph ist azyklisch |
| PG-T09 | Reviewer ≠ Autor | ✓ | `reviewerId ≠ authorId` |
| PG-T10 | Rule-Konsistenz: kein inherenter Hard-Conflict in Template-Struktur | ✓ | Evaluierung aller Required-Slots gegen Rule-Matrix |

### 4.3 Gate-Evaluierung

```
Publish-Request
       │
       ▼
  ┌─────────────────────┐
  │ Gate-Evaluator       │
  │ prüft PG-C01..C10   │
  │ oder PG-T01..T10    │
  └──────────┬──────────┘
             │
     ┌───────┴───────┐
     │               │
  ✓ Alle bestanden  ✗ Fehler gefunden
     │               │
     ▼               ▼
  Status →         GateViolation-Response:
  published        [{gate: "PG-C07", message: "..."}]
                   Status bleibt unverändert
```

**GateViolation-Response:**
```json
{
  "success": false,
  "violations": [
    {
      "gate": "PG-C07",
      "severity": "error",
      "message": "Zirkuläre requires-Kette: Klausel A → B → C → A",
      "affectedEntities": ["clause-id-a", "clause-id-b", "clause-id-c"]
    }
  ]
}
```

---

## 5. Changelog-Format

Jede Version soll ein Changelog führen, das die Änderungen gegenüber der Vorgängerversion beschreibt. Dies ist ein offener Punkt aus ADR-002.

### 5.1 Datenstruktur

```json
{
  "changelog": {
    "previousVersionId": "uuid",
    "previousVersionNumber": 2,
    "summary": "Haftungsbegrenzung auf 2x Auftragswert angepasst",
    "changeType": "content_update",
    "changes": [
      {
        "field": "content",
        "description": "Haftungsobergrenze von 1x auf 2x Auftragswert erhöht"
      },
      {
        "field": "rules",
        "description": "Neue Rule: requires Gewährleistungsklausel v3+"
      }
    ],
    "legalImpact": "medium",
    "migrationNotes": "Bestehende Verträge bleiben auf v2 gepinnt. Neue Verträge nutzen v3."
  }
}
```

### 5.2 Change-Types

| Typ | Beschreibung | Beispiel |
|-----|-------------|---------|
| `content_update` | Inhaltliche Änderung am Klauseltext | Formulierung angepasst |
| `parameter_change` | Parameter hinzugefügt/entfernt/geändert | Neuer Parameter "Obergrenze" |
| `rule_change` | Rules hinzugefügt/entfernt/geändert | Neue `requires`-Regel |
| `structure_change` | Template-Struktur geändert (Sections/Slots) | Neue Section "Datenschutz" |
| `metadata_update` | Nur Metadaten geändert (Tags, Jurisdiction) | Jurisdiction DE → AT hinzugefügt |
| `correction` | Fehlerkorrektur (Tippfehler, rechtliche Korrektur) | Paragraph-Referenz korrigiert |

### 5.3 Legal Impact

| Level | Beschreibung | Aktion für Kanzlei |
|-------|-------------|---------------------|
| `low` | Keine inhaltliche Auswirkung (Kosmetik, Metadaten) | Informativ |
| `medium` | Inhaltliche Änderung, bestehende Verträge bleiben gültig | Review empfohlen |
| `high` | Wesentliche rechtliche Änderung, Upgrade dringend empfohlen | Warnung + Handlungsempfehlung |

### 5.4 Changelog in der UI

```
┌────────────────────────────────────────────┐
│ Haftungsausschluss — Version 3             │
│ Veröffentlicht am 15.01.2026              │
│                                            │
│ Änderungen gegenüber v2:                   │
│ ● Haftungsobergrenze von 1x auf 2x        │
│   Auftragswert erhöht                      │
│ ● Neue Abhängigkeit:                       │
│   Gewährleistungsklausel v3+               │
│                                            │
│ Auswirkung: Mittel                         │
│ Bestehende Verträge bleiben auf v2.        │
│ Neue Verträge nutzen automatisch v3.       │
│                                            │
│ [Vollständige Änderungen anzeigen]         │
└────────────────────────────────────────────┘
```

---

## 6. Reviewer-Workflow

### 6.1 Reviewer-Zuweisung

```
Autor submitted ClauseVersion/TemplateVersion
       │
       ▼
  ┌────────────────────────┐
  │ Zuweisungs-Optionen:   │
  │ 1. Autor wählt Reviewer│ ← Default (MVP)
  │ 2. Auto-Assign (Round  │
  │    Robin im Team)      │ ← Phase 2
  │ 3. Team-Lead Default   │ ← Phase 2
  └────────────────────────┘
       │
       ▼
System prüft: Reviewer ≠ Autor?
       │
  ┌────┴────┐
  ✓          ✗ → Fehler: "Selbst-Review nicht erlaubt"
  │
  ▼
Review-Status gesetzt
Reviewer erhält Notification (E-Mail/In-App)
```

### 6.2 Review-Aktionen

| Aktion | Beschreibung | Ergebnis |
|--------|-------------|----------|
| **Approve** | Reviewer bestätigt Inhalt | Status → `approved` → `published` (Auto-Publish) |
| **Reject** | Reviewer lehnt ab | Neue Draft-Version erstellt; Reject-Kommentar gespeichert |
| **Request Changes** | Reviewer gibt Feedback ohne Ablehnung | Status bleibt `review`; Kommentar gespeichert (Phase 2) |

### 6.3 Review-Kommentare

```json
{
  "reviewComments": [
    {
      "id": "uuid",
      "reviewerId": "uuid",
      "action": "reject",
      "comment": "§3 Abs. 2: Formulierung unklar, bitte präzisieren.",
      "createdAt": "2026-02-10T14:00:00Z"
    }
  ]
}
```

### 6.4 Audit-Trail für Reviews

Jede Review-Aktion erzeugt ein AuditEvent:

| Action | Details |
|--------|---------|
| `clause.submit_review` | `{ clauseVersionId, authorId, reviewerId }` |
| `clause.approve` | `{ clauseVersionId, reviewerId, comment? }` |
| `clause.reject` | `{ clauseVersionId, reviewerId, comment, newDraftVersionId }` |
| `clause.publish` | `{ clauseVersionId, previousPublishedVersionId? }` |
| `clause.deprecate` | `{ clauseVersionId, reason, deprecatedBy }` |
| `template.submit_review` | analog zu Clause |
| `template.approve` | analog zu Clause |
| `template.reject` | analog zu Clause |
| `template.publish` | analog zu Clause |
| `template.deprecate` | analog zu Clause |

---

## 7. Datenbank-Schema

### 7.1 Clauses + ClauseVersions

```sql
-- Logische Klausel (Aggregate Root)
CREATE TABLE clauses (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   UUID NOT NULL REFERENCES tenants(id),
  title                       VARCHAR(500) NOT NULL,
  tags                        TEXT[],
  jurisdiction                VARCHAR(10) NOT NULL,
  legal_area                  VARCHAR(100),
  current_published_version_id UUID,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE clauses ENABLE ROW LEVEL SECURITY;
ALTER TABLE clauses FORCE ROW LEVEL SECURITY;

-- Vendor sieht eigene, Kanzlei sieht Published-Klauseln aller Verlage
CREATE POLICY vendor_own ON clauses
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY published_for_lawfirms ON clauses
  FOR SELECT
  USING (
    current_published_version_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM tenants
      WHERE id = clauses.tenant_id AND type = 'vendor'
    )
  );

CREATE INDEX idx_clauses_tenant ON clauses(tenant_id);
CREATE INDEX idx_clauses_jurisdiction ON clauses(jurisdiction);
CREATE INDEX idx_clauses_tags ON clauses USING GIN(tags);

-- Klausel-Versionen (immutable nach Status > draft)
CREATE TABLE clause_versions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clause_id         UUID NOT NULL REFERENCES clauses(id) ON DELETE CASCADE,
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  version_number    INTEGER NOT NULL,
  content           TEXT NOT NULL,
  parameters        JSONB DEFAULT '{}',
  metadata          JSONB DEFAULT '{}',
  rules             JSONB DEFAULT '[]',
  changelog         JSONB,
  status            VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'review', 'approved', 'published', 'deprecated')),
  valid_from        DATE,
  valid_until       DATE,
  author_id         UUID NOT NULL REFERENCES users(id),
  reviewer_id       UUID REFERENCES users(id),
  review_comments   JSONB DEFAULT '[]',
  published_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_clause_version UNIQUE (clause_id, version_number),
  CONSTRAINT chk_reviewer_not_author CHECK (
    reviewer_id IS NULL OR reviewer_id != author_id
  )
);

-- RLS
ALTER TABLE clause_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE clause_versions FORCE ROW LEVEL SECURITY;

CREATE POLICY vendor_own ON clause_versions
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY published_for_lawfirms ON clause_versions
  FOR SELECT
  USING (
    status = 'published'
    AND EXISTS (
      SELECT 1 FROM tenants
      WHERE id = clause_versions.tenant_id AND type = 'vendor'
    )
  );

CREATE INDEX idx_cv_clause ON clause_versions(clause_id);
CREATE INDEX idx_cv_tenant_status ON clause_versions(tenant_id, status);
CREATE INDEX idx_cv_published ON clause_versions(clause_id) WHERE status = 'published';

-- Auto-increment Version-Number
CREATE OR REPLACE FUNCTION auto_version_number_clause()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.version_number IS NULL THEN
    SELECT COALESCE(MAX(version_number), 0) + 1
    INTO NEW.version_number
    FROM clause_versions
    WHERE clause_id = NEW.clause_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_version_clause
  BEFORE INSERT ON clause_versions
  FOR EACH ROW
  EXECUTE FUNCTION auto_version_number_clause();

-- Immutability nach Draft
CREATE OR REPLACE FUNCTION prevent_content_change_after_draft()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status != 'draft' THEN
    IF NEW.content != OLD.content
       OR NEW.parameters != OLD.parameters
       OR NEW.rules != OLD.rules
       OR NEW.metadata != OLD.metadata THEN
      RAISE EXCEPTION 'Cannot modify content of non-draft clause version (status: %)', OLD.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_immutability_clause
  BEFORE UPDATE ON clause_versions
  FOR EACH ROW
  EXECUTE FUNCTION prevent_content_change_after_draft();

-- Auto-Deprecation bei neuem Publish
CREATE OR REPLACE FUNCTION auto_deprecate_previous_published()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'published' AND (OLD.status IS NULL OR OLD.status != 'published') THEN
    -- Deprecate previous published version
    UPDATE clause_versions
    SET status = 'deprecated'
    WHERE clause_id = NEW.clause_id
      AND id != NEW.id
      AND status = 'published';

    -- Update currentPublishedVersionId on Clause
    UPDATE clauses
    SET current_published_version_id = NEW.id,
        updated_at = now()
    WHERE id = NEW.clause_id;

    -- Set publishedAt
    NEW.published_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_deprecate_clause
  BEFORE UPDATE ON clause_versions
  FOR EACH ROW
  EXECUTE FUNCTION auto_deprecate_previous_published();
```

### 7.2 Templates + TemplateVersions

```sql
-- Logisches Template (Aggregate Root)
CREATE TABLE templates (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   UUID NOT NULL REFERENCES tenants(id),
  title                       VARCHAR(500) NOT NULL,
  description                 TEXT,
  category                    VARCHAR(100),
  jurisdiction                VARCHAR(10) NOT NULL,
  legal_area                  VARCHAR(100),
  tags                        TEXT[],
  current_published_version_id UUID,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS (analog zu Clauses)
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates FORCE ROW LEVEL SECURITY;

CREATE POLICY vendor_own ON templates
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY published_for_lawfirms ON templates
  FOR SELECT
  USING (
    current_published_version_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM tenants
      WHERE id = templates.tenant_id AND type = 'vendor'
    )
  );

CREATE INDEX idx_templates_tenant ON templates(tenant_id);
CREATE INDEX idx_templates_category ON templates(category);
CREATE INDEX idx_templates_jurisdiction ON templates(jurisdiction);

-- Template-Versionen (immutable nach Status > draft)
CREATE TABLE template_versions (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id               UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  tenant_id                 UUID NOT NULL REFERENCES tenants(id),
  version_number            INTEGER NOT NULL,
  structure                 JSONB NOT NULL,
  interview_flow_id         UUID,
  default_style_template_id UUID,
  changelog                 JSONB,
  status                    VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'review', 'approved', 'published', 'deprecated')),
  author_id                 UUID NOT NULL REFERENCES users(id),
  reviewer_id               UUID REFERENCES users(id),
  review_comments           JSONB DEFAULT '[]',
  published_at              TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_template_version UNIQUE (template_id, version_number),
  CONSTRAINT chk_reviewer_not_author CHECK (
    reviewer_id IS NULL OR reviewer_id != author_id
  )
);

-- RLS (analog zu ClauseVersions)
ALTER TABLE template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_versions FORCE ROW LEVEL SECURITY;

CREATE POLICY vendor_own ON template_versions
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY published_for_lawfirms ON template_versions
  FOR SELECT
  USING (
    status = 'published'
    AND EXISTS (
      SELECT 1 FROM tenants
      WHERE id = template_versions.tenant_id AND type = 'vendor'
    )
  );

CREATE INDEX idx_tv_template ON template_versions(template_id);
CREATE INDEX idx_tv_tenant_status ON template_versions(tenant_id, status);

-- Auto-increment, Immutability, Auto-Deprecation Trigger analog zu ClauseVersions
-- (gleiche Logik, angepasst auf template_versions-Tabelle)
```

### 7.3 InterviewFlows

```sql
CREATE TABLE interview_flows (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id),
  template_version_id  UUID NOT NULL REFERENCES template_versions(id),
  title                VARCHAR(500) NOT NULL,
  questions            JSONB NOT NULL DEFAULT '[]',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE interview_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_flows FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON interview_flows
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE INDEX idx_if_template_version ON interview_flows(template_version_id);
```

---

## 8. API-Endpunkte (Content CRUD)

### 8.1 Clause-Management

```yaml
# Klausel erstellen
POST /api/v1/tenants/{tenantId}/clauses
  Request:
    title: string
    jurisdiction: string
    tags?: string[]
    legalArea?: string
  Response:
    clause: { id, title, jurisdiction, tags, currentPublishedVersionId: null }

# Klausel-Version erstellen (Draft)
POST /api/v1/tenants/{tenantId}/clauses/{clauseId}/versions
  Request:
    content: string
    parameters?: object
    rules?: Rule[]
    metadata?: object
    basedOnVersionId?: uuid  # für Kopie/Weiterentwicklung
  Response:
    clauseVersion: { id, clauseId, versionNumber, status: "draft", ... }

# Draft editieren
PATCH /api/v1/tenants/{tenantId}/clauses/{clauseId}/versions/{versionId}
  Request:
    content?: string
    parameters?: object
    rules?: Rule[]
    metadata?: object
  Preconditions:
    - status = "draft"
  Response:
    clauseVersion: (aktualisiert)

# Submit for Review
POST /api/v1/tenants/{tenantId}/clauses/{clauseId}/versions/{versionId}/submit
  Request:
    reviewerId: uuid
  Preconditions:
    - status = "draft"
    - Publishing-Gates PG-C01..C07 bestanden
    - reviewerId ≠ authorId
  Response:
    clauseVersion: { status: "review", reviewerId }

# Approve (→ auto-publish)
POST /api/v1/tenants/{tenantId}/clauses/{clauseId}/versions/{versionId}/approve
  Request:
    comment?: string
  Preconditions:
    - status = "review"
    - Caller = reviewerId
    - Publishing-Gates PG-C08..C10 bestanden
  Response:
    clauseVersion: { status: "published", publishedAt }

# Reject
POST /api/v1/tenants/{tenantId}/clauses/{clauseId}/versions/{versionId}/reject
  Request:
    comment: string  # Pflicht
  Preconditions:
    - status = "review"
    - Caller = reviewerId
  Response:
    clauseVersion: { status: "review" }  # bleibt als Audit-Nachweis
    newDraftVersion: { id, versionNumber, status: "draft" }

# Deprecate
POST /api/v1/tenants/{tenantId}/clauses/{clauseId}/versions/{versionId}/deprecate
  Request:
    reason: string
  Preconditions:
    - status = "published"
    - Caller.role = "admin"
  Response:
    clauseVersion: { status: "deprecated" }
```

### 8.2 Template-Management

```yaml
# Analog zu Clause-Management:
POST /api/v1/tenants/{tenantId}/templates
POST /api/v1/tenants/{tenantId}/templates/{templateId}/versions
PATCH /api/v1/tenants/{tenantId}/templates/{templateId}/versions/{versionId}
POST .../submit
POST .../approve
POST .../reject
POST .../deprecate

# Template-Struktur (Section/Slot) Management
PUT /api/v1/tenants/{tenantId}/templates/{templateId}/versions/{versionId}/structure
  Request:
    sections: [
      {
        id: uuid,
        title: string,
        order: number,
        slots: [
          {
            id: uuid,
            clauseId: uuid,
            slotType: "required" | "optional" | "alternative",
            alternativeClauseIds?: uuid[],
            order: number
          }
        ]
      }
    ]
  Preconditions:
    - status = "draft"
  Response:
    templateVersion: (aktualisiert)
```

### 8.3 Published-Content für Kanzleien (Read-Only)

```yaml
# Verfügbare Templates (nur Published)
GET /api/v1/catalog/templates
  Query: jurisdiction?, category?, search?
  Response:
    templates: [{ id, title, category, jurisdiction, currentVersion: { number, publishedAt } }]

# Template-Details (Published-Version)
GET /api/v1/catalog/templates/{templateId}
  Response:
    template: { id, title, description, ... }
    currentVersion: { id, versionNumber, structure, publishedAt }
    changelog: { summary, changeType, legalImpact }

# Klausel-Details (Published-Version)
GET /api/v1/catalog/clauses/{clauseId}
  Response:
    clause: { id, title, jurisdiction, ... }
    currentVersion: { id, versionNumber, content, parameters, publishedAt }
```

---

## 9. Zusammenspiel mit ADR-002 (Version Pinning)

```
PUBLISHER-SEITE                    KANZLEI-SEITE
═══════════════                    ═══════════════

Clause v1 (draft)
    │ submit
    ▼
Clause v1 (review)
    │ approve
    ▼
Clause v1 (published) ──────────→ Kanzlei startet Vertrag
    │                               │
    │                               ▼
    │                             ContractInstance pinnt:
    │                               clauseVersionIds: [v1]
    │                               │
Clause v2 (draft)                   │ Nutzer bearbeitet Vertrag
    │ submit+approve                │
    ▼                               │
Clause v2 (published)               │
Clause v1 (deprecated) ───────→    │ Hinweis: "v2 verfügbar"
    │                               │
    │                               │ Nutzer entscheidet:
    │                               ├─ [Upgrade] → Pin auf v2
    │                               └─ [Behalten] → Pin bleibt v1
    │
    │                             Vertrag completed
    │                               Pins immutable (v1 oder v2)
    │                               Export nutzt gepinnte Version
```

---

## 10. Offene Punkte

| # | Thema | Owner | Ziel-Sprint |
|---|-------|-------|-------------|
| 1 | Diff-View zwischen Versionen (für Reviewer und Kanzlei) | Team 03 + 04 | Sprint 3 |
| 2 | Batch-Operations (Multi-Clause-Publish) | Team 03 | Sprint 4 |
| 3 | Content-Import (CSV/JSON für initiale Befüllung) | Team 03 | Sprint 3 |
| 4 | Volltextsuche über Klausel-Inhalte (OpenSearch) | Team 03 + 07 | Phase 2 |
| 5 | Mehrsprachige Klauseln (i18n) | Team 03 | Phase 2 |
