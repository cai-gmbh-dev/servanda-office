# DOCX Export MVP Spezifikation v1

**Status:** Final Draft
**Datum:** 2026-02-10
**Owner:** Team 05 (Export & Integration)
**Betroffene Teams:** 01, 04, 05, 07
**Referenzen:** ADR-003 (Export Engine), ADR-004 (ODT Strategy), Architecture Backbone v1 (BB-006), Domänenmodell v1

---

## 1. Übersicht

Dieses Dokument spezifiziert die DOCX-Export-Pipeline für das Servanda Office MVP: von der Job-Erstellung über das Template-Rendering mit docxtemplater bis zum Download aus dem Object Storage. Es ist die Implementierungsgrundlage für Team 05.

---

## 2. Export-Pipeline (End-to-End)

```
Kanzlei-Nutzer klickt "Als DOCX exportieren"
       │
       ▼
┌──────────────────────────────────┐
│ 1. API: POST /export-jobs        │
│    - Preconditions prüfen        │
│    - ExportJob erstellen (queued)│
│    - AuditEvent: export.request  │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│ 2. Queue: pgboss                 │
│    - Job in Queue eingereiht     │
│    - Priority: FIFO (Default)    │
│    - Retry-Policy: max 3         │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│ 3. Worker: Export-Worker         │
│    - Job abholen (polling)       │
│    - Status → running            │
│    - Daten laden (gepinnte Vers.)│
│    - Dokument rendern            │
│    - In Object Storage ablegen   │
│    - Status → done               │
│    - AuditEvent: export.complete │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│ 4. API: GET /export-jobs/{id}    │
│    - Status + Download-URL       │
│    - Pre-signed URL (15 Min.)    │
└──────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│ 5. Client: Download              │
│    - Pre-signed URL → Datei      │
│    - AuditEvent: export.download │
└──────────────────────────────────┘
```

---

## 3. Preconditions für Export

| Prüfung | Fehlermeldung | HTTP-Status |
|---------|---------------|-------------|
| ContractInstance existiert | "Vertrag nicht gefunden" | 404 |
| ContractInstance.status ≠ `archived` | "Archivierter Vertrag kann nicht exportiert werden" | 409 |
| validationState ≠ `has_conflicts` | "Offene Konflikte müssen aufgelöst werden" | 409 |
| Nutzer hat Export-Berechtigung (RBAC) | "Keine Berechtigung" | 403 |
| Kein laufender Export für gleichen Vertrag + Format | "Export bereits in Bearbeitung" | 409 |
| StyleTemplate existiert (wenn angegeben) | "Formatvorlage nicht gefunden" | 404 |

---

## 4. Job-Queue (pgboss)

### 4.1 Konfiguration

```typescript
import PgBoss from 'pg-boss';

const boss = new PgBoss({
  connectionString: process.env.DATABASE_URL,
  schema: 'export_queue',
  retryLimit: 3,
  retryDelay: 30,           // 30s zwischen Retries
  retryBackoff: true,        // Exponential Backoff
  expireInSeconds: 120,      // Job-Timeout: 2 Min.
  retentionDays: 7,          // Abgeschlossene Jobs 7 Tage behalten
  archiveCompletedAfterSeconds: 3600,
});

// Queue-Name
const EXPORT_QUEUE = 'export-docx';
const ODT_QUEUE = 'export-odt';
```

### 4.2 Job-Payload

```typescript
interface ExportJobPayload {
  exportJobId: string;        // UUID (ExportJob in DB)
  tenantId: string;
  contractInstanceId: string;
  format: 'docx' | 'odt';
  styleTemplateId: string | null;
  requestedBy: string;        // User-ID
}
```

### 4.3 Job-Lifecycle

```
queued ──→ running ──→ done
  │           │
  │           └──→ failed (retry 1..3)
  │                    │
  │                    └──→ failed (final)
  │
  └──→ expired (Timeout nach 120s)
```

| Status | Beschreibung | Aktion |
|--------|-------------|--------|
| `queued` | Job in Queue eingereiht | Warten auf Worker |
| `running` | Worker verarbeitet Job | Rendering läuft |
| `done` | Erfolgreich abgeschlossen | Datei in Object Storage |
| `failed` | Fehler aufgetreten | Retry oder finaler Fehler |
| `expired` | Timeout überschritten | Automatisch → failed |

---

## 5. Export-Worker

### 5.1 Architektur

```
┌──────────────────────────────────────────────────┐
│                 EXPORT WORKER                      │
│                                                    │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────┐ │
│  │ Data Loader │  │ Document     │  │ Storage │ │
│  │             │  │ Renderer     │  │ Writer  │ │
│  │ - Template  │  │              │  │         │ │
│  │   Version   │  │ - docx-      │  │ - S3    │ │
│  │ - Clause    │  │   templater  │  │   Upload│ │
│  │   Versions  │  │ - Structure  │  │         │ │
│  │ - Answers   │  │   Builder    │  │         │ │
│  │ - Style     │  │ - Style      │  │         │ │
│  │   Template  │  │   Applier    │  │         │ │
│  └──────┬──────┘  └──────┬───────┘  └────┬────┘ │
│         │                │                │       │
│         └────────────────┴────────────────┘       │
│                          │                         │
│                    ┌─────▼──────┐                  │
│                    │ Job Status │                  │
│                    │ Updater    │                  │
│                    └────────────┘                  │
└──────────────────────────────────────────────────┘
```

### 5.2 Rendering-Pipeline

```
1. DATEN LADEN
   │
   ├─ ContractInstance laden (Answers, SelectedSlots)
   ├─ TemplateVersion laden (Structure: Sections, Slots)
   ├─ ClauseVersions laden (alle gepinnten)
   ├─ StyleTemplate laden (oder Default)
   │
   ▼
2. DOKUMENT-STRUKTUR AUFBAUEN
   │
   ├─ Sections durchlaufen
   │   ├─ Section-Überschrift einfügen
   │   ├─ Slots durchlaufen
   │   │   ├─ Required: Klausel-Content direkt einfügen
   │   │   ├─ Optional: Nur wenn in SelectedSlots
   │   │   └─ Alternative: Gewählte Klausel aus SelectedSlots
   │   └─ Parameter in Klausel-Content ersetzen (aus Answers)
   │
   ▼
3. TEMPLATE-RENDERING (docxtemplater)
   │
   ├─ Style-Template als DOCX-Basis laden
   ├─ Platzhalter befüllen:
   │   ├─ {title} → ContractInstance.title
   │   ├─ {date} → Erstellungsdatum
   │   ├─ {sections} → Gerenderte Sections (Loop)
   │   ├─ {header.*} → Kopfzeilen-Daten
   │   └─ {footer.*} → Fußzeilen-Daten
   ├─ Nummerierung/Überschriften sicherstellen
   │
   ▼
4. DATEI SPEICHERN
   │
   ├─ DOCX-Buffer erzeugen
   ├─ Upload → S3: {tenantId}/exports/{exportJobId}.docx
   ├─ Dateigröße erfassen
   │
   ▼
5. JOB ABSCHLIESSEN
   │
   ├─ ExportJob.status → done
   ├─ ExportJob.resultStoragePath setzen
   ├─ ExportJob.resultFileSize setzen
   ├─ ExportJob.completedAt setzen
   └─ AuditEvent: export.complete
```

### 5.3 docxtemplater-Integration

```typescript
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';

interface RenderContext {
  title: string;
  clientReference: string;
  date: string;
  tenantName: string;
  sections: RenderedSection[];
  header: HeaderConfig;
  footer: FooterConfig;
}

interface RenderedSection {
  title: string;
  number: number;
  clauses: RenderedClause[];
}

interface RenderedClause {
  title: string;
  number: string;       // z.B. "3.1", "3.2"
  content: string;      // Klauseltext mit eingesetzten Parametern
  isOptional: boolean;
}

async function renderDocx(
  styleTemplatePath: string,
  context: RenderContext
): Promise<Buffer> {
  // 1. Style-Template laden
  const templateBuffer = await objectStorage.getObject(styleTemplatePath);
  const zip = new PizZip(templateBuffer);

  // 2. Docxtemplater initialisieren
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => '',
  });

  // 3. Daten einsetzen
  doc.render(context);

  // 4. Buffer erzeugen
  return doc.getZip().generate({
    type: 'nodebuffer',
    compression: 'DEFLATE',
  });
}
```

### 5.4 Parameter-Substitution

Klausel-Content enthält Platzhalter im Format `{{parameterKey}}`:

```
Beispiel-Klausel:
"Die {{partyA}} (nachfolgend 'Auftraggeber') beauftragt
die {{partyB}} (nachfolgend 'Auftragnehmer') mit der
Erbringung von {{leistungsbeschreibung}} ab dem {{vertragsbeginn}}."

Answers:
{
  "partyA": "Müller GmbH",
  "partyB": "Schmidt Consulting",
  "leistungsbeschreibung": "IT-Beratungsleistungen",
  "vertragsbeginn": "01.04.2026"
}

Ergebnis:
"Die Müller GmbH (nachfolgend 'Auftraggeber') beauftragt
die Schmidt Consulting (nachfolgend 'Auftragnehmer') mit der
Erbringung von IT-Beratungsleistungen ab dem 01.04.2026."
```

**Regeln:**
- Nicht-befüllte Parameter → leerer String (kein `{{...}}` im Dokument).
- Datum-Parameter → formatiert als `dd.MM.yyyy`.
- Währung-Parameter → formatiert als `#.###,## EUR`.
- Multiple-Choice → kommasepariert.

---

## 6. Style-Templates

### 6.1 Default Style-Template

Das System liefert ein Default-Style-Template (`system/styles/default.docx`) mit:

| Element | Spezifikation |
|---------|---------------|
| **Schriftart** | Arial 11pt (Fließtext), Arial 14pt Bold (Überschriften) |
| **Seitenränder** | 2,5 cm links, 2 cm rechts/oben/unten |
| **Zeilenabstand** | 1,15-fach |
| **Überschriften** | H1: 14pt Bold, H2: 12pt Bold, H3: 11pt Bold |
| **Nummerierung** | Hierarchisch: 1., 1.1, 1.1.1 |
| **Kopfzeile** | {tenantName} | {date} |
| **Fußzeile** | Seite {page} von {totalPages} |
| **Seitenumbruch** | Vor jeder H1-Section |

### 6.2 Kanzlei-Branding (Sprint 5)

Kanzleien können eigene Style-Templates hochladen mit:
- Eigenem Logo in Kopfzeile
- Kanzleiname und Adresse in Fußzeile
- Eigene Schriftart und Farben
- Eigene Nummerierungsformate

### 6.3 Style-Template-Platzhalter

```
DOCX Template Structure:
├── [Header]
│   └── {header.tenantName}  |  {header.date}
├── [Body]
│   └── {title}
│       {#sections}
│       [Heading {number}] {title}
│           {#clauses}
│           [{number}] {title}
│           {content}
│           {/clauses}
│       {/sections}
├── [Footer]
│   └── {footer.tenantName}  |  Seite {page} von {pages}
```

---

## 7. Nummerierung & Dokumentstruktur

### 7.1 Hierarchische Nummerierung

```
1. Präambel
   [Klauseltext ohne Nummerierung]

2. Vertragsparteien
   [Klauseltext]

3. Vergütung
   3.1 Vergütungsmodell
       [Klauseltext: Stundenhonorar]
   3.2 Zahlungsbedingungen
       [Klauseltext]

4. Haftung
   4.1 Haftungsausschluss
       [Klauseltext]
   4.2 Gewährleistung
       [Klauseltext]

5. Laufzeit und Kündigung
   5.1 Vertragslaufzeit
       [Klauseltext: befristet]
   5.2 Kündigungsklausel
       [Klauseltext]
```

### 7.2 Nummerierungsregeln

| Ebene | Format | Anwendung |
|-------|--------|-----------|
| Section (H1) | `1.`, `2.`, `3.` | Template-Sections |
| Clause (H2) | `3.1`, `3.2` | Klauseln innerhalb Section |
| Sub-Paragraph (H3) | `3.1.1`, `3.1.2` | Absätze innerhalb Klausel (optional) |

### 7.3 Qualitätskriterien ("Pixelstabilität")

| Kriterium | Beschreibung | Testmethode |
|-----------|-------------|-------------|
| Nummerierung korrekt | Hierarchisch, lückenlos, kein Reset | Visueller Vergleich + Automated Check |
| Überschriften-Ebenen | H1/H2/H3 korrekt im DOCX-Format | OOXML-Inspection |
| Seitenumbrüche | Vor H1-Sections, nicht mitten in Klauseln | Visueller Vergleich |
| Listen | Aufzählungen korrekt formatiert | OOXML-Inspection |
| Tabellen | Spaltenbreiten erhalten | Visueller Vergleich |
| Schriftformatierung | Fett, Kursiv, Unterstrichen korrekt | Visueller Vergleich |
| Parameter-Werte | Alle Platzhalter ersetzt, korrekt formatiert | Automatisiert |

---

## 8. API-Endpunkte

### 8.1 Export erstellen

```yaml
POST /api/v1/tenants/{tenantId}/export-jobs
  Request:
    contractInstanceId: uuid
    format: "docx" | "odt"
    styleTemplateId?: uuid
  Preconditions:
    - Siehe Abschnitt 3
  Response (201 Created):
    exportJob:
      id: uuid
      contractInstanceId: uuid
      format: "docx"
      status: "queued"
      queuedAt: timestamp
  Error Responses:
    409: "Offene Konflikte" | "Export bereits in Bearbeitung"
    403: "Keine Berechtigung"
    404: "Vertrag nicht gefunden"
```

### 8.2 Export-Status abfragen

```yaml
GET /api/v1/tenants/{tenantId}/export-jobs/{jobId}
  Response:
    exportJob:
      id: uuid
      contractInstanceId: uuid
      format: "docx"
      status: "queued" | "running" | "done" | "failed"
      queuedAt: timestamp
      startedAt?: timestamp
      completedAt?: timestamp
      resultFileSize?: number
      errorMessage?: string

    # Nur wenn status = done:
    downloadUrl: string (Pre-signed URL, 15 Min. gültig)
```

### 8.3 Export-Jobs eines Vertrags auflisten

```yaml
GET /api/v1/tenants/{tenantId}/contracts/{contractId}/export-jobs
  Response:
    exportJobs: ExportJob[]
```

### 8.4 Polling-Strategie (Client)

```typescript
async function waitForExport(jobId: string): Promise<ExportJob> {
  const POLL_INTERVAL = 2000; // 2s
  const MAX_POLLS = 60;       // max 2 Min.

  for (let i = 0; i < MAX_POLLS; i++) {
    const job = await api.getExportJob(jobId);

    if (job.status === 'done') return job;
    if (job.status === 'failed') throw new ExportError(job.errorMessage);

    await sleep(POLL_INTERVAL);
  }

  throw new TimeoutError('Export dauert zu lange');
}
```

**Phase 2:** WebSocket/SSE für Echtzeit-Benachrichtigung statt Polling.

---

## 9. Fehlerbehandlung

| Fehler | Retry | Aktion |
|--------|-------|--------|
| DB-Verbindung zum Lesen fehlgeschlagen | Ja (3x) | Exponential Backoff |
| StyleTemplate nicht im Storage | Nein | Fallback auf Default-Style |
| docxtemplater-Rendering-Fehler | Nein | Job → failed, Fehlermeldung loggen |
| S3-Upload fehlgeschlagen | Ja (3x) | Exponential Backoff |
| Timeout (>120s) | Nein | Job → expired → failed |
| Ungültige Daten (fehlende Pins) | Nein | Job → failed, "Dateninkonsistenz" |

### 9.1 Dead-Letter-Handling

Jobs, die nach 3 Retries fehlschlagen:
1. Status → `failed` (final).
2. AuditEvent: `export.fail` mit Fehlermeldung.
3. UI zeigt: "Export fehlgeschlagen. Bitte erneut versuchen."
4. Admin-Alert in Monitoring (wenn Failure-Rate > 5%).

---

## 10. Referenzdokumente (MVP-Testmuster)

Für die Qualitätssicherung des DOCX-Exports werden 3 Referenzdokumente definiert:

### 10.1 Referenzdokument 1: Arbeitsvertrag (befristet)

| Eigenschaft | Wert |
|-------------|------|
| Sections | 5 (Präambel, Parteien, Vergütung, Haftung, Laufzeit) |
| Klauseln | 8 |
| Parameter | 12 (Firmenname, Stundensatz, Vertragsbeginn, etc.) |
| Listen | 2 (Leistungskatalog, Kündigungsgründe) |
| Seiten (erwartet) | 3-4 |

### 10.2 Referenzdokument 2: Dienstleistungsvertrag

| Eigenschaft | Wert |
|-------------|------|
| Sections | 7 (Präambel, Parteien, Leistung, Vergütung, Haftung, Datenschutz, Schluss) |
| Klauseln | 12 |
| Parameter | 18 |
| Listen | 3 |
| Tabellen | 1 (Preisliste) |
| Seiten (erwartet) | 5-6 |

### 10.3 Referenzdokument 3: Geheimhaltungsvereinbarung (NDA)

| Eigenschaft | Wert |
|-------------|------|
| Sections | 4 (Parteien, Gegenstand, Pflichten, Laufzeit) |
| Klauseln | 6 |
| Parameter | 8 |
| Listen | 1 |
| Seiten (erwartet) | 2 |

### 10.4 Testmatrix

| Test | Ref 1 | Ref 2 | Ref 3 |
|------|-------|-------|-------|
| Nummerierung korrekt | ✓ | ✓ | ✓ |
| Überschriften-Ebenen | ✓ | ✓ | ✓ |
| Parameter-Substitution | ✓ | ✓ | ✓ |
| Listen-Formatierung | ✓ | ✓ | ✓ |
| Tabellen-Formatierung | – | ✓ | – |
| Seitenumbrüche | ✓ | ✓ | – |
| Kopf-/Fußzeilen | ✓ | ✓ | ✓ |
| Kanzlei-Branding | – | – | – |
| Re-Export identisch | ✓ | ✓ | ✓ |

---

## 11. Performance-Ziele

| Metrik | Ziel | Grenzwert |
|--------|------|-----------|
| Queue-Wartezeit | < 5s (P95) | < 15s |
| Rendering-Zeit (5 Seiten) | < 3s | < 10s |
| Rendering-Zeit (20 Seiten) | < 8s | < 30s |
| S3-Upload | < 2s | < 5s |
| End-to-End (Queue → Download) | < 15s (P95) | < 60s |
| Dateigrö0e (5 Seiten) | < 500 KB | < 2 MB |

---

## 12. Security

| Aspekt | Maßnahme |
|--------|----------|
| Tenant-Isolation | Worker prüft `tenantId` vor Datenzugriff |
| Object Storage Pfad | Validierung: `{tenantId}/exports/{jobId}.docx` |
| Pre-signed URL | 15 Min. Gültigkeit, nur für authentifizierten Nutzer |
| Download-Audit | `export.download` Event bei jedem Download |
| Worker-Isolation | Separater Container, kein direkter DB-Write außer Job-Status |
| Input-Sanitization | Klausel-Content wird escaped (kein OOXML-Injection) |

---

## 13. Offene Punkte

| # | Thema | Owner | Ziel-Sprint |
|---|-------|-------|-------------|
| 1 | Wasserzeichen-Support (Draft/Final) | Team 05 | Sprint 5 |
| 2 | PDF-Export (DOCX → PDF Konvertierung) | Team 05 | Phase 2 |
| 3 | Batch-Export (mehrere Verträge) | Team 05 | Phase 2 |
| 4 | WebSocket/SSE statt Polling | Team 05 | Sprint 5 |
| 5 | Style-Template-Editor (Browser-basiert) | Team 05 | Phase 2 |
