# ADR-002: Version Pinning für Template/Clause im Vertragsobjekt

**Status:** Accepted → **Spezifiziert**
**Datum:** 2026-02-09 | **Spezifiziert:** 2026-02-10
**Betroffene Teams:** 01, 03, 04

## Kontext

Verträge müssen reproduzierbar bleiben, auch wenn Templates/Klauseln fortentwickelt werden.
Das MVP verlangt konsistente, auditierbare Dokumente.

## Entscheidung

`ContractInstance` speichert:

- `templateVersionId` (immutable)
- Liste `clauseVersionIds`
- Snapshot der Antworten (Interview-Flow)
- Export-Metadaten (Version, Zeitpunkt, Format)

Versionen von Templates/Klauseln sind **immutable**; Änderungen erzeugen neue Versionen.

## Konsequenzen

- Vertragserstellung muss immer Versionen pinnen (keine "latest").
- UI muss Versionen transparent anzeigen (Hinweis auf neuere Published-Versionen).
- Storage erhöht sich (Snapshot der Antworten + Referenzen).

## Alternativen

- Pinning nur auf Template-Version (unzureichend bei Clause-Updates).
- Soft-Links auf "latest" (nicht auditierbar).

---

## Spezifikation: ContractInstance Pinning-Modell

### 1. Datenstruktur ContractInstance (vollständig)

```json
{
  "id": "uuid",
  "tenantId": "uuid",
  "creatorId": "uuid",
  "title": "Arbeitsvertrag Müller GmbH",
  "clientReference": "2026-M-0042",
  "tags": ["arbeitsrecht", "befristet"],

  "templateVersionId": "uuid (immutable nach completed)",
  "clauseVersionIds": ["uuid", "uuid", "..."],

  "answers": {
    "q-001": { "questionId": "uuid", "value": "Müller GmbH", "type": "text" },
    "q-002": { "questionId": "uuid", "value": 15, "type": "number" },
    "q-003": { "questionId": "uuid", "value": "2026-04-01", "type": "date" },
    "q-004": { "questionId": "uuid", "value": ["option-a", "option-c"], "type": "multiple_choice" }
  },

  "selectedSlots": {
    "slot-001": { "slotId": "uuid", "chosenClauseVersionId": "uuid" },
    "slot-002": { "slotId": "uuid", "chosenClauseVersionId": "uuid" }
  },

  "validationState": "valid | has_warnings | has_conflicts",
  "validationMessages": [
    {
      "ruleType": "forbids",
      "severity": "hard",
      "sourceClauseId": "uuid",
      "targetClauseId": "uuid",
      "message": "Exklusivitätsklausel verbietet Drittanbieterklausel",
      "suggestion": "Entfernen Sie die Drittanbieterklausel oder wählen Sie die nicht-exklusive Variante"
    }
  ],

  "status": "draft | completed | archived",
  "visibility": "private | team",
  "teamId": "uuid (optional)",

  "versionInfo": {
    "templateTitle": "Arbeitsvertrag (befristet)",
    "templateVersionNumber": 3,
    "templatePublishedAt": "2026-01-15T10:00:00Z",
    "newerVersionAvailable": true,
    "newerVersionId": "uuid",
    "newerVersionNumber": 4
  },

  "createdAt": "2026-02-10T14:30:00Z",
  "updatedAt": "2026-02-10T15:45:00Z",
  "completedAt": "2026-02-10T15:45:00Z"
}
```

### 2. Pinning-Lifecycle

#### Phase 1: Initialisierung (Vertragserstellung starten)

```text
Nutzer wählt Template
       │
       ▼
System resolvet aktuelle Published-Versions:
  templateVersionId ← Template.currentPublishedVersionId
  clauseVersionIds  ← für jeden Slot in TemplateVersion.structure:
                       Clause.currentPublishedVersionId
       │
       ▼
ContractInstance wird erstellt (status: draft)
  → templateVersionId gesetzt
  → clauseVersionIds[] initial befüllt
  → answers: {} (leer)
  → selectedSlots: {} (Defaults aus Template)
```

**Wichtig:** Das System resolved **einmalig** zum Zeitpunkt der Erstellung.
Ab diesem Moment arbeitet der Vertrag mit den gepinnten Versionen.

#### Phase 2: Bearbeitung (Draft)

Während `status = draft`:

- Nutzer beantwortet Fragen → `answers` wird aktualisiert.
- Nutzer wählt Alternativen → `selectedSlots` wird aktualisiert.
- System validiert live gegen Rules → `validationState` wird aktualisiert.
- **Version-Upgrade ist möglich** (siehe Abschnitt 4).

#### Phase 3: Fertigstellung (Completed)

```text
Nutzer bestätigt Vertrag
       │
       ▼
Preconditions:
  ✓ validationState ≠ has_conflicts
  ✓ alle required Questions beantwortet
  ✓ alle required Slots befüllt
       │
       ▼
status → completed
completedAt → now()
Pins werden IMMUTABLE:
  → templateVersionId: kein Update mehr möglich
  → clauseVersionIds[]: kein Update mehr möglich
  → answers: Snapshot eingefroren
  → selectedSlots: Snapshot eingefroren
```

#### Phase 4: Export

```text
ExportJob wird erstellt
       │
       ▼
Export-Worker lädt:
  → TemplateVersion by gepinntem templateVersionId
  → ClauseVersions by gepinnten clauseVersionIds[]
  → Answers + SelectedSlots aus ContractInstance
  → StyleTemplate (separat referenziert)
       │
       ▼
DOCX wird generiert aus gepinnten Daten
  → Kein "latest"-Lookup, ausschließlich Pins
```

### 3. Reproduzierbarkeit-Garantie

| Eigenschaft | Garantie |
| --- | --- |
| Gleicher Export, gleiche Daten | Identisches DOCX bei erneutem Export (gleiche Pins + Answers) |
| Template-Update hat keinen Einfluss | Neue TemplateVersion ändert bestehende Verträge nicht |
| Clause-Update hat keinen Einfluss | Neue ClauseVersion ändert bestehende Verträge nicht |
| Deprecated-Version bleibt nutzbar | Completed-Verträge exportieren auch mit deprecated Pins |
| Audit-Trail | Jede Pin-Änderung (Draft-Upgrade) wird als AuditEvent protokolliert |

### 4. Version-Upgrade (nur Draft)

Ein Draft-Vertrag kann auf neuere Published-Versionen aktualisiert werden.
Dies ist eine **explizite Nutzeraktion** und wird auditiert.

#### Upgrade-Ablauf

```text
System erkennt: neuere Published-Version verfügbar
       │
       ▼
UI zeigt Hinweis:
  "Template v3 → v4 verfügbar. Änderungen: [Zusammenfassung]"
  [Upgrade] [Später]
       │
       ▼ Nutzer klickt "Upgrade"
       │
Preconditions:
  ✓ status = draft (completed-Verträge: kein Upgrade)
  ✓ neues Template ist published
       │
       ▼
System führt Upgrade durch:
  1. templateVersionId ← neue TemplateVersion.id
  2. clauseVersionIds[] werden neu resolved:
     - Unveränderte Klauseln: Pin bleibt
     - Aktualisierte Klauseln: Pin wird auf neue Published-Version gesetzt
     - Entfernte Klauseln: aus Liste entfernt
     - Neue Klauseln: zur Liste hinzugefügt
  3. answers: werden migriert (Mapping alter → neuer Question-IDs)
     - Fragen mit identischer ID: Antwort bleibt
     - Entfernte Fragen: Antwort wird archiviert (im Audit-Event)
     - Neue Fragen: unbeantwortete Pflichtfragen markiert
  4. selectedSlots: werden migriert
  5. validationState: wird neu berechnet
       │
       ▼
AuditEvent:
  action: contract.version_upgrade
  details: {
    previousTemplateVersionId, newTemplateVersionId,
    addedClauses, removedClauses, updatedClauses,
    migratedAnswers, droppedAnswers
  }
```

#### Upgrade-Konflikte

| Situation | Verhalten |
| --- | --- |
| Neue Pflichtfrage ohne Antwort | Draft bleibt offen, Frage wird hervorgehoben |
| Entfernte Klausel war in selectedSlots | Slot-Auswahl wird zurückgesetzt, Nutzer wird informiert |
| Neue Rules erzeugen Konflikte | validationState wird aktualisiert, Konflikte angezeigt |
| Antwort-Typ hat sich geändert | Antwort wird verworfen, Frage neu präsentiert |

### 5. Deprecated-Version-Handling

| Szenario | Verhalten |
| --- | --- |
| Neue Vertragserstellung mit deprecated Template | **Blockiert** — System bietet aktuelle Published-Version an |
| Neue Vertragserstellung mit deprecated Clause | **Blockiert** — System substituiert aktuelle Published-Version |
| Draft-Vertrag enthält deprecated Pin | **Warnung** — "Version veraltet, Upgrade empfohlen" |
| Completed-Vertrag enthält deprecated Pin | **Erlaubt** — Export funktioniert weiterhin, Warnung in UI |
| Re-Export eines completed Vertrags | **Erlaubt** — nutzt exakt die gepinnten (deprecated) Versionen |

### 6. Datenbank-Schema (Auszug)

```sql
CREATE TABLE contract_instances (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  creator_id      UUID NOT NULL REFERENCES users(id),
  title           VARCHAR(500) NOT NULL,
  client_reference VARCHAR(255),
  tags            TEXT[],

  -- Version Pinning (Kern von ADR-002)
  template_version_id UUID NOT NULL,
  clause_version_ids  UUID[] NOT NULL,
  answers             JSONB NOT NULL DEFAULT '{}',
  selected_slots      JSONB NOT NULL DEFAULT '{}',

  -- Validierung
  validation_state    VARCHAR(20) NOT NULL DEFAULT 'valid'
    CHECK (validation_state IN ('valid', 'has_warnings', 'has_conflicts')),
  validation_messages JSONB,

  -- Lifecycle
  status              VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'completed', 'archived')),
  visibility          VARCHAR(20) NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private', 'team')),
  team_id             UUID REFERENCES teams(id),

  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS (gem. ADR-001)
ALTER TABLE contract_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_instances FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON contract_instances
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Indices
CREATE INDEX idx_ci_tenant ON contract_instances(tenant_id);
CREATE INDEX idx_ci_tenant_status ON contract_instances(tenant_id, status);
CREATE INDEX idx_ci_template_version ON contract_instances(template_version_id);

-- Immutability-Trigger: Verhindert Pin-Änderung nach "completed"
CREATE OR REPLACE FUNCTION prevent_pin_change_after_completed()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'completed' THEN
    IF NEW.template_version_id != OLD.template_version_id
       OR NEW.clause_version_ids != OLD.clause_version_ids
       OR NEW.answers != OLD.answers
       OR NEW.selected_slots != OLD.selected_slots THEN
      RAISE EXCEPTION 'Cannot modify pinned versions on completed contract';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_pin_change
  BEFORE UPDATE ON contract_instances
  FOR EACH ROW
  EXECUTE FUNCTION prevent_pin_change_after_completed();
```

### 7. API-Vertrag (relevante Endpoints)

```yaml
# Vertrag erstellen (Pins werden automatisch resolved)
POST /api/v1/tenants/{tenantId}/contracts
  Request:
    templateId: uuid          # logische Template-ID
  Response:
    contractInstance:
      id: uuid
      templateVersionId: uuid  # automatisch gepinnte Version
      clauseVersionIds: uuid[] # automatisch gepinnte Versionen
      status: "draft"

# Version-Upgrade auslösen (nur draft)
POST /api/v1/tenants/{tenantId}/contracts/{contractId}/upgrade
  Request:
    targetTemplateVersionId: uuid (optional, Default: latest published)
  Response:
    contractInstance: (aktualisiert)
    migrationReport:
      addedClauses: []
      removedClauses: []
      updatedClauses: []
      migratedAnswers: []
      droppedAnswers: []
      newConflicts: []

# Vertrag fertigstellen (Pins werden immutable)
POST /api/v1/tenants/{tenantId}/contracts/{contractId}/complete
  Preconditions:
    - validationState ≠ has_conflicts
    - alle required Questions beantwortet
  Response:
    contractInstance:
      status: "completed"
      completedAt: timestamp

# Versions-Info abfragen
GET /api/v1/tenants/{tenantId}/contracts/{contractId}/version-info
  Response:
    currentTemplateVersion: { id, number, publishedAt }
    newerVersionAvailable: boolean
    newerVersion: { id, number, publishedAt, changelog } | null
    deprecatedPins: [{ clauseId, clauseVersionId, reason }]
```

### 8. Testing-Anforderungen

**Pinning-Tests (CI-Pflicht):**

- Vertragserstellung pinnt korrekte Published-Versions (nicht Draft/Deprecated).
- Completed-Vertrag: `UPDATE template_version_id` wird durch DB-Trigger blockiert.
- Export nutzt ausschließlich gepinnte Versionen (Mock-Verifizierung).
- Draft-Upgrade aktualisiert Pins korrekt und erzeugt AuditEvent.
- Deprecated-Version: Neue Erstellung blockiert, bestehender Export erlaubt.
- Antworten-Snapshot ist vollständig und reproduzierbar.

**Reproduzierbarkeits-Test:**

- Erstelle Vertrag → exportiere → aktualisiere Template → exportiere erneut → DOCX-Inhalte sind identisch.

---

## Offene Punkte (aktualisiert)

- ~~Umgang mit Deprecated-Versionen~~ → Entschieden (siehe Abschnitt 5).
- ~~Migration von Draft-Verträgen~~ → Spezifiziert (siehe Abschnitt 4).
- Bulk-Upgrade-Mechanismus für viele Drafts gleichzeitig (Owner: Team 04, Ziel: Sprint 3).
- Changelog-Format für Template-Versionen (Owner: Team 03, Ziel: Sprint 2).
