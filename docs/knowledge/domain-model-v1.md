# Domänenmodell v1 (Servanda Office)

**Status:** Final Draft
**Datum:** 2026-02-10
**Owner:** Team 01 (Product Architecture)
**Vorgänger:** `domain-model-v0.1.md`

---

## 1. Übersicht

Dieses Domänenmodell definiert alle Kerneinheiten, ihre Attribute, Beziehungen und Invarianten für das Servanda Office MVP. Es ist die verbindliche Referenz für alle Teams.

### Aggregate-Übersicht

```
┌─────────────────────────────────────────────────────────────┐
│                    PLATFORM CONTEXT                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │   Tenant     │  │    User      │  │   AuditEvent     │  │
│  │  Aggregate   │  │  Aggregate   │  │   Aggregate      │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│                   CONTENT CONTEXT (Publisher)                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │   Clause     │  │   Template   │  │ InterviewFlow    │  │
│  │  Aggregate   │  │  Aggregate   │  │   Aggregate      │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│                  CONTRACT CONTEXT (Tenant)                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  Contract    │  │   LawFirm    │  │  StyleTemplate   │  │
│  │  Instance    │  │   Template   │  │   Aggregate      │  │
│  │  Aggregate   │  │  Aggregate   │  │                  │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│                    EXPORT CONTEXT                            │
│  ┌──────────────┐                                           │
│  │  ExportJob   │                                           │
│  │  Aggregate   │                                           │
│  └──────────────┘                                           │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Bounded Contexts

| Context | Verantwortung | Owner-Teams |
|---------|--------------|-------------|
| **Platform** | Tenant-Verwaltung, Identity, Audit | 01, 02 |
| **Content** | Muster/Klauseln, Versionierung, Interview-Design, Publishing | 01, 03 |
| **Contract** | Vertragserstellung, Kanzlei-Templates, Dokumentinstanzen | 01, 04 |
| **Export** | Dokumentgenerierung, Style-Management, Job-Queue | 01, 05 |

---

## 3. Entity-Definitionen

### 3.1 Platform Context

#### Tenant (Aggregate Root)

| Attribut | Typ | Constraints | Beschreibung |
|----------|-----|-------------|--------------|
| `id` | UUID | PK | Eindeutige Tenant-ID |
| `name` | String(255) | NOT NULL | Anzeigename (Kanzlei/Verlag) |
| `type` | Enum | `vendor`, `lawfirm`, `individual` | Tenant-Typ |
| `slug` | String(63) | UNIQUE, NOT NULL | URL-sicherer Bezeichner |
| `address` | Embedded | optional | Adressdaten (Straße, PLZ, Ort, Land) |
| `defaultJurisdiction` | String(10) | NOT NULL | ISO-Länderkürzel (z.B. `DE`) |
| `defaultLanguage` | String(5) | NOT NULL, Default `de` | ISO-Sprachkürzel |
| `settings` | JSONB | optional | Tenant-spezifische Konfiguration |
| `status` | Enum | `active`, `suspended`, `deleted` | Lifecycle-Status |
| `createdAt` | Timestamp | NOT NULL | Erstellungszeitpunkt |
| `updatedAt` | Timestamp | NOT NULL | Letztes Update |

**Invarianten:**
- `slug` ist global eindeutig und unveränderlich nach Erstellung.
- `type` ist unveränderlich nach Erstellung.
- Ein `deleted` Tenant kann nicht reaktiviert werden.

---

#### User

| Attribut | Typ | Constraints | Beschreibung |
|----------|-----|-------------|--------------|
| `id` | UUID | PK | Eindeutige User-ID |
| `tenantId` | UUID | FK → Tenant, NOT NULL | Zugehöriger Tenant |
| `email` | String(255) | UNIQUE per Tenant | Login-Adresse |
| `displayName` | String(255) | NOT NULL | Anzeigename |
| `role` | Enum | `admin`, `editor`, `user` | RBAC-Rolle im Tenant |
| `status` | Enum | `invited`, `active`, `disabled` | Lifecycle-Status |
| `mfaEnabled` | Boolean | Default `false` | MFA aktiviert |
| `lastLoginAt` | Timestamp | optional | Letzter Login |
| `createdAt` | Timestamp | NOT NULL | Erstellungszeitpunkt |

**Invarianten:**
- `email` ist eindeutig innerhalb eines Tenants.
- Mindestens ein `admin` pro Tenant (Lösch-/Downgrade-Schutz).
- `role` bestimmt die Berechtigungsebene (siehe RBAC-Matrix unten).

---

#### Team

| Attribut | Typ | Constraints | Beschreibung |
|----------|-----|-------------|--------------|
| `id` | UUID | PK | |
| `tenantId` | UUID | FK → Tenant, NOT NULL | |
| `name` | String(255) | NOT NULL, UNIQUE per Tenant | Team-Bezeichnung |
| `memberIds` | UUID[] | FK → User | Zugehörige Nutzer |
| `createdAt` | Timestamp | NOT NULL | |

**Invarianten:**
- Team-Mitglieder müssen dem gleichen Tenant angehören.

---

#### RBAC-Matrix (MVP)

| Berechtigung | Admin | Editor | User |
|-------------|-------|--------|------|
| Tenant-Einstellungen verwalten | ✓ | – | – |
| Nutzer einladen/verwalten | ✓ | – | – |
| Kanzlei-Templates verwalten | ✓ | ✓ | – |
| Verträge erstellen | ✓ | ✓ | ✓ |
| Verträge exportieren | ✓ | ✓ | ✓ |
| Audit-Logs einsehen | ✓ | – | – |
| Style-Templates verwalten | ✓ | ✓ | – |

---

#### AuditEvent (Aggregate Root, Append-Only)

| Attribut | Typ | Constraints | Beschreibung |
|----------|-----|-------------|--------------|
| `id` | UUID | PK | |
| `tenantId` | UUID | NOT NULL | Tenant-Scope |
| `actorId` | UUID | FK → User, optional | Auslösender Nutzer (NULL bei System-Events) |
| `action` | Enum | NOT NULL | Art des Events (siehe Katalog) |
| `objectType` | String(100) | NOT NULL | Betroffener Entity-Typ |
| `objectId` | UUID | NOT NULL | Betroffene Entity-ID |
| `details` | JSONB | optional | Diff/Zusatzinformationen |
| `ipAddress` | String(45) | optional | Quell-IP |
| `timestamp` | Timestamp | NOT NULL | Event-Zeitpunkt |

**Audit-Event-Katalog (MVP):**
- `user.login`, `user.logout`, `user.invite`, `user.role_change`
- `clause.create`, `clause.publish`, `clause.deprecate`
- `template.create`, `template.publish`, `template.deprecate`
- `contract.create`, `contract.update`, `contract.delete`
- `export.request`, `export.complete`, `export.fail`
- `tenant.settings_change`

**Invarianten:**
- AuditEvents sind **immutable** (kein Update, kein Delete).
- AuditEvents sind immer tenant-gescoped.
- Retention-Policy konfigurierbar pro Tenant (Default: 90 Tage Starter, 365 Tage Pro).

---

### 3.2 Content Context (Publisher)

#### Clause (Aggregate Root)

| Attribut | Typ | Constraints | Beschreibung |
|----------|-----|-------------|--------------|
| `id` | UUID | PK | Logische Klausel-ID |
| `tenantId` | UUID | FK → Tenant (vendor), NOT NULL | Zugehöriger Verlag |
| `title` | String(500) | NOT NULL | Klauseltitel |
| `tags` | String[] | optional | Schlagworte zur Kategorisierung |
| `jurisdiction` | String(10) | NOT NULL | ISO-Länderkürzel |
| `legalArea` | String(100) | optional | Rechtsgebiet |
| `currentPublishedVersionId` | UUID | FK → ClauseVersion, optional | Aktuelle Published-Version |
| `createdAt` | Timestamp | NOT NULL | |
| `updatedAt` | Timestamp | NOT NULL | |

---

#### ClauseVersion (immutable)

| Attribut | Typ | Constraints | Beschreibung |
|----------|-----|-------------|--------------|
| `id` | UUID | PK | Eindeutige Versions-ID |
| `clauseId` | UUID | FK → Clause, NOT NULL | Zugehörige logische Klausel |
| `tenantId` | UUID | FK → Tenant, NOT NULL | Verlag-Tenant |
| `versionNumber` | Integer | NOT NULL, auto-increment per Clause | Aufsteigende Versionsnummer |
| `content` | Text | NOT NULL | Klauseltext (Markdown/strukturiert) |
| `parameters` | JSONB | optional | Platzhalter/Variablen-Definition |
| `metadata` | JSONB | optional | Zusätzliche Metadaten |
| `rules` | Rule[] | embedded | Konsistenzregeln (siehe Rule) |
| `status` | Enum | `draft`, `review`, `approved`, `published`, `deprecated` | Workflow-Status |
| `validFrom` | Date | optional | Gültigkeit ab |
| `validUntil` | Date | optional | Gültigkeit bis |
| `authorId` | UUID | FK → User | Ersteller |
| `reviewerId` | UUID | FK → User, optional | Freigeber |
| `publishedAt` | Timestamp | optional | Zeitpunkt der Veröffentlichung |
| `createdAt` | Timestamp | NOT NULL | |

**Invarianten:**
- ClauseVersion ist nach Erstellung **immutable** (Inhalt unveränderlich).
- Statusübergänge: `draft` → `review` → `approved` → `published` → `deprecated`.
- Nur `draft`-Versionen dürfen editiert werden (vor dem ersten Status-Übergang).
- Nur eine Version pro Clause darf `published` sein (die `currentPublishedVersionId`).
- `deprecated`-Versionen bleiben für bestehende Verträge referenzierbar.

---

#### Rule (Value Object, embedded in ClauseVersion)

| Attribut | Typ | Constraints | Beschreibung |
|----------|-----|-------------|--------------|
| `type` | Enum | NOT NULL | Regeltyp (siehe unten) |
| `targetClauseId` | UUID | FK → Clause, optional | Ziel-Klausel |
| `targetClauseIds` | UUID[] | optional | Ziel-Klauseln (für Set-Regeln) |
| `condition` | JSONB | optional | Bedingung (für `requires_answer`) |
| `jurisdictionScope` | String(10) | optional | Einschränkung auf Jurisdiktion |
| `severity` | Enum | `hard`, `soft` | Hard = blockiert Export, Soft = Warnung |
| `message` | String(1000) | NOT NULL | Benutzerfreundliche Fehlermeldung |
| `suggestion` | String(1000) | optional | Lösungsvorschlag |

**Regeltypen:**
| Typ | Semantik | Beispiel |
|-----|---------|---------|
| `requires` | Klausel A benötigt Klausel B (oder eine aus Set) | „Haftungsausschluss erfordert Gewährleistungsklausel" |
| `forbids` | Klausel A verbietet Klausel B | „Exklusivitätsklausel verbietet Drittanbieterklausel" |
| `incompatible_with` | Symmetrischer Konflikt A ↔ B | „Pauschalhonorar unvereinbar mit Stundenhonorar" |
| `scoped_to` | Gilt nur für bestimmte Jurisdiktion/Vertragstyp | „Nur anwendbar in DE" |
| `requires_answer` | Abhängig von Interview-Antwort | „Nur wenn Mitarbeiterzahl > 10" |

---

#### Template (Aggregate Root)

| Attribut | Typ | Constraints | Beschreibung |
|----------|-----|-------------|--------------|
| `id` | UUID | PK | Logische Template-ID |
| `tenantId` | UUID | FK → Tenant (vendor), NOT NULL | Zugehöriger Verlag |
| `title` | String(500) | NOT NULL | Muster-Titel |
| `description` | Text | optional | Kurzbeschreibung |
| `category` | String(100) | optional | Vertragstyp-Kategorie |
| `jurisdiction` | String(10) | NOT NULL | ISO-Länderkürzel |
| `legalArea` | String(100) | optional | Rechtsgebiet |
| `tags` | String[] | optional | Schlagworte |
| `currentPublishedVersionId` | UUID | FK → TemplateVersion, optional | Aktuelle Published-Version |
| `createdAt` | Timestamp | NOT NULL | |
| `updatedAt` | Timestamp | NOT NULL | |

---

#### TemplateVersion (immutable)

| Attribut | Typ | Constraints | Beschreibung |
|----------|-----|-------------|--------------|
| `id` | UUID | PK | Eindeutige Versions-ID |
| `templateId` | UUID | FK → Template, NOT NULL | Zugehöriges logisches Template |
| `tenantId` | UUID | FK → Tenant, NOT NULL | Verlag-Tenant |
| `versionNumber` | Integer | NOT NULL, auto-increment per Template | Aufsteigende Versionsnummer |
| `structure` | Section[] | NOT NULL | Dokumentstruktur (Sections mit Slots) |
| `interviewFlowId` | UUID | FK → InterviewFlow, optional | Zugehöriger Fragenkatalog |
| `defaultStyleTemplateId` | UUID | FK → StyleTemplate, optional | Default-Formatvorlage |
| `status` | Enum | `draft`, `review`, `approved`, `published`, `deprecated` | Workflow-Status |
| `authorId` | UUID | FK → User | Ersteller |
| `reviewerId` | UUID | FK → User, optional | Freigeber |
| `publishedAt` | Timestamp | optional | |
| `createdAt` | Timestamp | NOT NULL | |

**Invarianten:**
- TemplateVersion ist nach Erstellung **immutable**.
- Gleiche Statusübergänge wie ClauseVersion.
- `structure` referenziert ClauseVersions nur über `clauseId` (aufgelöst zur jeweils aktuellen Published-Version beim Erstellen eines Vertrags, dann gepinnt).

---

#### Section (Value Object, embedded in TemplateVersion.structure)

| Attribut | Typ | Constraints | Beschreibung |
|----------|-----|-------------|--------------|
| `id` | UUID | lokal eindeutig | Section-Identifier |
| `title` | String(500) | NOT NULL | Abschnitts-Überschrift |
| `order` | Integer | NOT NULL | Sortierung |
| `slots` | Slot[] | NOT NULL | Klausel-Plätze in dieser Section |

---

#### Slot (Value Object, embedded in Section)

| Attribut | Typ | Constraints | Beschreibung |
|----------|-----|-------------|--------------|
| `id` | UUID | lokal eindeutig | Slot-Identifier |
| `clauseId` | UUID | FK → Clause | Referenzierte Klausel |
| `slotType` | Enum | `required`, `optional`, `alternative` | Pflicht/Optional/Auswahl |
| `alternativeClauseIds` | UUID[] | optional | Alternativen (bei `alternative`) |
| `order` | Integer | NOT NULL | Sortierung innerhalb der Section |

---

### 3.3 Interview Context

#### InterviewFlow (Aggregate Root)

| Attribut | Typ | Constraints | Beschreibung |
|----------|-----|-------------|--------------|
| `id` | UUID | PK | |
| `tenantId` | UUID | FK → Tenant (vendor), NOT NULL | Verlag-Tenant |
| `templateVersionId` | UUID | FK → TemplateVersion | Zugehöriges Template |
| `title` | String(500) | NOT NULL | Flow-Bezeichnung |
| `questions` | Question[] | NOT NULL | Geordnete Fragenliste |
| `createdAt` | Timestamp | NOT NULL | |

---

#### Question (Value Object, embedded in InterviewFlow)

| Attribut | Typ | Constraints | Beschreibung |
|----------|-----|-------------|--------------|
| `id` | UUID | lokal eindeutig | Frage-Identifier |
| `order` | Integer | NOT NULL | Sortierung |
| `text` | String(2000) | NOT NULL | Fragetext |
| `type` | Enum | NOT NULL | Fragetyp (siehe unten) |
| `options` | JSONB | optional | Auswahloptionen (für `single_choice`, `multiple_choice`) |
| `defaultValue` | JSONB | optional | Vorausgefüllter Standardwert |
| `required` | Boolean | Default `true` | Pflichtfeld |
| `helpText` | String(1000) | optional | Kurzinfo/Tooltip |
| `explanation` | Text | optional | Ausführliche Erklärung ("Mehr erfahren") |
| `conditions` | Condition[] | optional | Anzeigebedingungen |
| `targetClauseIds` | UUID[] | optional | Beeinflusste Klauseln |
| `targetParameterKey` | String(100) | optional | Parameter-Schlüssel in der Klausel |

**Fragetypen:**
`single_choice`, `multiple_choice`, `text`, `number`, `date`, `currency`, `yes_no`

---

#### Condition (Value Object, embedded in Question)

| Attribut | Typ | Constraints | Beschreibung |
|----------|-----|-------------|--------------|
| `sourceQuestionId` | UUID | NOT NULL | Referenz auf vorherige Frage |
| `operator` | Enum | `equals`, `not_equals`, `greater_than`, `less_than`, `contains`, `in` | Vergleichsoperator |
| `value` | JSONB | NOT NULL | Vergleichswert |
| `logic` | Enum | `show`, `hide`, `skip` | Aktion bei Erfüllung |

**Invarianten:**
- `sourceQuestionId` muss eine Frage mit niedrigerem `order` referenzieren (keine Zirkelreferenzen).
- Conditions werden bei der Publikation validiert (keine unerreichbaren Fragen).

---

### 3.4 Contract Context (Tenant)

#### ContractInstance (Aggregate Root) — Version-Pinning gem. ADR-002

| Attribut | Typ | Constraints | Beschreibung |
|----------|-----|-------------|--------------|
| `id` | UUID | PK | |
| `tenantId` | UUID | FK → Tenant (lawfirm), NOT NULL | Kanzlei-Tenant |
| `creatorId` | UUID | FK → User, NOT NULL | Ersteller |
| `title` | String(500) | NOT NULL | Vertragsbezeichnung |
| `clientReference` | String(255) | optional | Mandant/Projekt-Referenz |
| `tags` | String[] | optional | Schlagworte |
| `templateVersionId` | UUID | NOT NULL | **Gepinnte** TemplateVersion |
| `clauseVersionIds` | UUID[] | NOT NULL | **Gepinnte** Liste der verwendeten ClauseVersions |
| `answers` | JSONB | NOT NULL | Antworten-Snapshot (questionId → value) |
| `selectedSlots` | JSONB | NOT NULL | Slot-Auswahlen (slotId → gewählte clauseVersionId) |
| `validationState` | Enum | `valid`, `has_warnings`, `has_conflicts` | Ergebnis der letzten Validierung |
| `validationMessages` | JSONB | optional | Aktuelle Validierungsmeldungen |
| `status` | Enum | `draft`, `completed`, `archived` | Lifecycle-Status |
| `completedAt` | Timestamp | optional | Zeitpunkt der Fertigstellung |
| `visibility` | Enum | `private`, `team` | Sichtbarkeit innerhalb des Tenants |
| `teamId` | UUID | FK → Team, optional | Team-Zuordnung (bei `team`-Sichtbarkeit) |
| `sourceTemplateId` | UUID | FK → LawFirmTemplate, optional | Falls aus Kanzlei-Template erstellt |
| `createdAt` | Timestamp | NOT NULL | |
| `updatedAt` | Timestamp | NOT NULL | |

**Invarianten (ADR-002):**
- `templateVersionId` und `clauseVersionIds` sind **immutable nach Fertigstellung** (`completed`).
- Bei `draft` dürfen Versionen aktualisiert werden (explizite Nutzerentscheidung, mit Audit).
- `answers` wird als vollständiger Snapshot gespeichert (Reproduzierbarkeit).
- Export ist nur möglich bei `validationState` ≠ `has_conflicts`.
- Kein automatisches Version-Upgrade; neue Published-Versionen werden als Hinweis angezeigt.

---

#### LawFirmTemplate (Aggregate Root)

| Attribut | Typ | Constraints | Beschreibung |
|----------|-----|-------------|--------------|
| `id` | UUID | PK | |
| `tenantId` | UUID | FK → Tenant (lawfirm), NOT NULL | Kanzlei-Tenant |
| `title` | String(500) | NOT NULL | Template-Bezeichnung |
| `description` | Text | optional | Beschreibung |
| `sourceContractInstanceId` | UUID | FK → ContractInstance, optional | Ursprungsvertrag ("Clone as Template") |
| `sourceTemplateVersionId` | UUID | NOT NULL | Basis-TemplateVersion |
| `customAnswers` | JSONB | optional | Vorausgefüllte Standard-Antworten |
| `customSlotSelections` | JSONB | optional | Vorausgefüllte Slot-Auswahlen |
| `status` | Enum | `draft`, `published` | Vereinfachter Status |
| `visibility` | Enum | `private`, `team` | Sichtbarkeit |
| `teamId` | UUID | FK → Team, optional | |
| `tags` | String[] | optional | |
| `createdAt` | Timestamp | NOT NULL | |
| `updatedAt` | Timestamp | NOT NULL | |

**Invarianten:**
- Maximal 5 Templates (Starter), 50 (Team), unbegrenzt (Pro/Enterprise).
- `sourceTemplateVersionId` wird gepinnt; Hinweis bei neuerer Verlagsversion.

---

### 3.5 Export Context

#### ExportJob (Aggregate Root) — gem. ADR-003

| Attribut | Typ | Constraints | Beschreibung |
|----------|-----|-------------|--------------|
| `id` | UUID | PK | |
| `tenantId` | UUID | FK → Tenant, NOT NULL | |
| `contractInstanceId` | UUID | FK → ContractInstance, NOT NULL | Zu exportierender Vertrag |
| `requestedBy` | UUID | FK → User, NOT NULL | Auslöser |
| `format` | Enum | `docx`, `odt` | Exportformat |
| `styleTemplateId` | UUID | FK → StyleTemplate, optional | Gewählte Formatvorlage |
| `status` | Enum | `queued`, `running`, `done`, `failed` | Job-Status |
| `resultStoragePath` | String(1000) | optional | Pfad in Object Storage |
| `resultFileSize` | Long | optional | Dateigröße in Bytes |
| `errorMessage` | String(2000) | optional | Fehlermeldung bei `failed` |
| `queuedAt` | Timestamp | NOT NULL | Einreihungszeitpunkt |
| `startedAt` | Timestamp | optional | Verarbeitungsstart |
| `completedAt` | Timestamp | optional | Abschluss |

**Invarianten (ADR-003):**
- Export-Worker greift **nur auf gepinnte Versionen** zu (kein "latest"-Lookup).
- Ergebnis wird in Object Storage abgelegt (Bucket: `{tenantId}/exports/`).
- Jobs haben ein Timeout (konfigurierbar, Default: 120s).
- `odt`-Jobs nutzen LibreOffice-Konvertierung (ADR-004), markiert als "Beta".

---

#### StyleTemplate

| Attribut | Typ | Constraints | Beschreibung |
|----------|-----|-------------|--------------|
| `id` | UUID | PK | |
| `tenantId` | UUID | FK → Tenant, NOT NULL | Owner (Vendor oder Kanzlei) |
| `name` | String(255) | NOT NULL | Bezeichnung |
| `description` | String(1000) | optional | |
| `type` | Enum | `system`, `vendor`, `lawfirm` | Herkunft |
| `templateFile` | String(1000) | NOT NULL | Pfad zum DOCX-Template in Object Storage |
| `headerConfig` | JSONB | optional | Kopfzeilen-Konfiguration |
| `footerConfig` | JSONB | optional | Fußzeilen-Konfiguration |
| `isDefault` | Boolean | Default `false` | Standard-Vorlage |
| `createdAt` | Timestamp | NOT NULL | |
| `updatedAt` | Timestamp | NOT NULL | |

---

## 4. Beziehungsdiagramm (Entity-Relationship)

```
Tenant (vendor)
  │
  ├── 1..* Clause
  │         └── 1..* ClauseVersion (immutable)
  │                    └── 0..* Rule (embedded)
  │
  ├── 1..* Template
  │         └── 1..* TemplateVersion (immutable)
  │                    ├── 1..* Section
  │                    │        └── 1..* Slot → references Clause
  │                    └── 0..1 InterviewFlow
  │                               └── 1..* Question
  │                                        └── 0..* Condition
  │
  └── 0..* StyleTemplate (type: vendor/system)

Tenant (lawfirm)
  │
  ├── 1..* User
  │         └── role: admin | editor | user
  ├── 0..* Team
  │         └── 0..* User (members)
  │
  ├── 0..* ContractInstance
  │         ├── pins → TemplateVersion (immutable ref)
  │         ├── pins → ClauseVersion[] (immutable refs)
  │         ├── stores → answers snapshot
  │         └── stores → selectedSlots
  │
  ├── 0..* LawFirmTemplate
  │         ├── references → TemplateVersion
  │         └── stores → customAnswers, customSlotSelections
  │
  ├── 0..* ExportJob
  │         ├── references → ContractInstance
  │         └── references → StyleTemplate
  │
  ├── 0..* StyleTemplate (type: lawfirm)
  │
  └── 0..* AuditEvent (append-only)
```

---

## 5. Tenant-Isolation (ADR-001 Referenz)

### Scoping-Regel
Jede Entity (außer globale Systemobjekte wie `system`-StyleTemplates) trägt `tenantId`.

### Datenzugriffsmuster

| Szenario | Zulässig | Mechanismus |
|----------|----------|-------------|
| Kanzlei liest eigene Verträge | ✓ | RLS: `tenant_id = current_tenant()` |
| Kanzlei liest Published-Content anderer Verlage | ✓ | Spezielle RLS-Policy: `status = 'published'` für Content-Tabellen |
| Kanzlei liest Verträge anderer Kanzlei | ✗ | RLS blockiert |
| Verlag liest Kanzlei-Verträge | ✗ | RLS blockiert |
| System-Admin liest über Tenants hinweg | ✓ | Superuser-Policy (nur Platform-Admin) |

### Cross-Tenant Content-Zugriff (Publisher → Kanzlei)
- Verlags-Content (`published` ClauseVersions/TemplateVersions) ist für alle Kanzleien **lesbar**.
- Dies wird über eine **dedizierte RLS-Policy** auf Content-Tabellen realisiert:
  - `WHERE tenant_id = current_tenant() OR (status = 'published' AND tenant_type = 'vendor')`
- Kanzleien können Verlags-Content **nicht editieren**, nur referenzieren.

---

## 6. Status-Workflow (Publisher Content)

```
┌─────────┐    submit     ┌────────┐   approve   ┌──────────┐   publish   ┌───────────┐
│  Draft   │─────────────→│ Review │────────────→│ Approved │───────────→│ Published │
└─────────┘               └────────┘             └──────────┘            └───────────┘
                               │                                              │
                               │ reject                                       │ deprecate
                               ▼                                              ▼
                          ┌─────────┐                                  ┌────────────┐
                          │  Draft  │                                  │ Deprecated │
                          └─────────┘                                  └────────────┘
```

**Regeln:**
- `Draft` → `Review`: Alle Pflichtfelder ausgefüllt, mindestens eine Rule definiert.
- `Review` → `Approved`: Reviewer-Freigabe (darf nicht Autor sein).
- `Approved` → `Published`: Setzt `publishedAt`, aktualisiert `currentPublishedVersionId` auf der logischen Entity.
- `Published` → `Deprecated`: Bestehende Verträge behalten Referenz, neue Erstellung nutzt nächste Published-Version.
- Rückweisung (`Review` → `Draft`): Reviewer-Kommentar Pflicht.

---

## 7. Version-Pinning Lifecycle (ADR-002 Referenz)

```
Kanzlei-Nutzer startet Vertragserstellung
        │
        ▼
  ┌────────────────────────┐
  │ System resolved aktuelle │
  │ Published-Versions:      │
  │ - TemplateVersion        │
  │ - ClauseVersions[]       │
  └────────┬───────────────┘
           │
           ▼
  ┌────────────────────────┐
  │ ContractInstance (draft) │
  │ pins:                    │
  │ - templateVersionId      │
  │ - clauseVersionIds[]     │
  │ - answers (laufend)      │
  └────────┬───────────────┘
           │
           │ Nutzer beantwortet Fragen,
           │ wählt Alternativen
           │
           ▼
  ┌────────────────────────┐
  │ Validierung:             │  ← Rules werden gegen gepinnte
  │ - Rules prüfen           │    Versionen evaluiert
  │ - Konflikte melden       │
  └────────┬───────────────┘
           │
           │ Nutzer löst Konflikte,
           │ bestätigt Vertrag
           │
           ▼
  ┌────────────────────────┐
  │ ContractInstance        │
  │ status: completed       │
  │ Pins sind IMMUTABLE     │
  └────────┬───────────────┘
           │
           ▼
  ┌────────────────────────┐
  │ ExportJob erstellt       │
  │ Nutzt nur gepinnte       │
  │ Versionen + Answers      │
  └────────────────────────┘
```

### Umgang mit neueren Versionen
- System zeigt Hinweis: „Neuere Version verfügbar (vX → vY)".
- Bei `draft`: Nutzer kann Version-Upgrade auslösen (explizite Aktion, wird auditiert).
- Bei `completed`: Kein Upgrade möglich. Neuer Vertrag auf Basis neuerer Version muss separat erstellt werden.

### Umgang mit Deprecated-Versionen
- Export bleibt für `completed`-Verträge mit deprecated Versionen **erlaubt**.
- Neue Vertragserstellung mit deprecated Versionen ist **nicht möglich**.
- UI zeigt Warnung: „Dieses Template basiert auf einer veralteten Version."

---

## 8. Validierungszeitpunkte

| Zeitpunkt | Scope | Akteur | Konsequenz |
|-----------|-------|--------|------------|
| **Publikation** (Publisher) | ClauseVersion Rules vollständig? Template-Struktur konsistent? | System + Reviewer | Blockiert `Published`-Status bei Fehlern |
| **Zusammenbau** (Vertragserstellung) | Rules gegen gewählte Klauseln + Antworten | System (live) | Sofortige Konfliktmeldung + Lösungsvorschlag |
| **Speichern** (ContractInstance) | Finaler Validator | System | `validationState` wird gesetzt |
| **Export** (ExportJob) | Hard Conflicts vorhanden? | System | Blockiert Export bei `has_conflicts` |

---

## 9. Object Storage Layout (S3/MinIO)

```
bucket: servanda-office-{environment}
├── {tenantId}/
│   ├── exports/
│   │   └── {exportJobId}.docx / .odt
│   ├── styles/
│   │   └── {styleTemplateId}.docx
│   └── attachments/
│       └── {contractInstanceId}/
│           └── ...
├── system/
│   └── styles/
│       └── default.docx
```

---

## 10. Glossar-Erweiterungen (v1)

| Begriff | Definition |
|---------|-----------|
| **Aggregate Root** | Einstiegspunkt für Zugriff auf einen Aggregate-Cluster (nur über Root direkt zugreifbar) |
| **Slot** | Platzhalter in einer Template-Section, der eine Klausel aufnimmt |
| **Alternative** | Slot-Typ, bei dem der Nutzer aus mehreren Klauseln wählt |
| **Answers Snapshot** | Vollständige Kopie aller Interview-Antworten, gespeichert im ContractInstance |
| **Version-Upgrade** | Explizite Nutzeraktion, um einen Draft-Vertrag auf eine neuere Published-Version umzustellen |
| **Hard Conflict** | Regelverstoß, der den Export blockiert |
| **Soft Conflict** | Regelverstoß, der als Warnung angezeigt wird |

---

## 11. Offene Punkte (für Sprint 2+)

| # | Thema | Owner | Ziel-Sprint |
|---|-------|-------|-------------|
| 1 | Feingranulare ACLs pro ContractInstance/Template | Team 02 | Sprint 2 |
| 2 | Mehrsprachigkeit (Content + UI) | Team 03 | Phase 2 |
| 3 | Content-Marketplace / Cross-Vendor Discovery | Team 01 | Phase 2 |
| 4 | Sub-Tenant-Hierarchien | Team 01 + 02 | Phase 2 |
| 5 | OpenSearch-Integration für Volltextsuche | Team 07 | Phase 2 |
| 6 | Public API (REST/GraphQL) | Team 05 | Phase 2 |
