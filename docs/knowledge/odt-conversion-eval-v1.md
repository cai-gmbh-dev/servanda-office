# ODT-Konvertierung Evaluierung v1

**Status:** Final Draft
**Datum:** 2026-02-10
**Owner:** Team 05 (Export & Integration) + Team 07 (DevOps & On-Prem)
**Betroffene Teams:** 01, 05, 07
**Referenzen:** ADR-004 (ODT Strategy), ADR-003 (Export Engine), Deployment-Blueprint v1

---

## 1. Übersicht

Dieses Dokument evaluiert die DOCX→ODT-Konvertierung via LibreOffice headless für das Servanda Office MVP. Es bewertet Qualität, Performance, Sicherheit und Betriebsaufwand und gibt eine Empfehlung für den MVP-Beta-Launch.

### Entscheidung (ADR-004 Zusammenfassung)

- **MVP:** ODT via serverseitige Konvertierung (DOCX → ODT via LibreOffice headless)
- **Markierung:** Beta-Feature, optional
- **Warum nicht nativ:** Doppelter Implementierungsaufwand, zusätzliche Testlast
- **Warum nicht streichen:** LibreOffice-Nutzer (besonders On-Prem/Open-Source-affin) sind relevante Zielgruppe

---

## 2. Technische Architektur

### 2.1 Konvertierungs-Pipeline

```
DOCX Export-Worker                    ODT-Konvertierung
══════════════════                    ══════════════════

ExportJob (format: odt)
       │
       ▼
  1. DOCX rendern
     (identisch zum DOCX-Flow)
       │
       ▼
  2. DOCX-Datei temporär speichern
     (/tmp/{jobId}.docx)
       │
       ▼
  3. LibreOffice headless aufrufen
     soffice --headless --convert-to odt
     --outdir /tmp/{jobId}/
     /tmp/{jobId}.docx
       │
       ▼
  4. ODT-Datei validieren
     (Dateigröße > 0, valides ZIP)
       │
       ▼
  5. Upload → S3
     {tenantId}/exports/{jobId}.odt
       │
       ▼
  6. Temp-Dateien löschen
       │
       ▼
  7. Job → done
```

### 2.2 Worker-Container

```dockerfile
FROM node:20-slim

# LibreOffice installieren
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      libreoffice-writer \
      libreoffice-common \
      fonts-dejavu \
      fonts-liberation \
      fonts-noto \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Kein Display nötig (headless)
ENV DISPLAY=:0

# Security: Non-root User
RUN useradd -m -s /bin/bash exportworker
USER exportworker

WORKDIR /app
COPY --chown=exportworker:exportworker . .

CMD ["node", "dist/export-worker.js"]
```

### 2.3 LibreOffice-Aufruf

```typescript
import { execFile } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execFile);

async function convertDocxToOdt(
  inputPath: string,
  outputDir: string
): Promise<string> {
  const timeout = 60_000; // 60s Timeout

  await exec('soffice', [
    '--headless',
    '--norestore',
    '--nofirststartwizard',
    '--convert-to', 'odt',
    '--outdir', outputDir,
    inputPath,
  ], {
    timeout,
    env: {
      ...process.env,
      HOME: '/tmp/libreoffice-home', // Isoliertes Home
    },
  });

  // Output-Dateiname ableiten
  const baseName = path.basename(inputPath, '.docx');
  return path.join(outputDir, `${baseName}.odt`);
}
```

---

## 3. Qualitäts-Evaluierung

### 3.1 Testmatrix (DOCX → ODT Konvertierung)

| Feature | DOCX-Original | ODT-Konvertierung | Bewertung |
|---------|--------------|-------------------|-----------|
| **Fließtext** | ✓ Korrekt | ✓ Korrekt | Gut |
| **Überschriften (H1-H3)** | ✓ Korrekt | ✓ Korrekt | Gut |
| **Nummerierung** | ✓ Hierarchisch | ⚠ Teilweise Neustart | Akzeptabel (Beta) |
| **Fettschrift/Kursiv** | ✓ Korrekt | ✓ Korrekt | Gut |
| **Listen (ungeordnet)** | ✓ Korrekt | ✓ Korrekt | Gut |
| **Listen (geordnet)** | ✓ Korrekt | ⚠ Format-Unterschiede | Akzeptabel |
| **Tabellen** | ✓ Korrekt | ⚠ Spaltenbreiten variieren | Akzeptabel |
| **Kopf-/Fußzeilen** | ✓ Korrekt | ✓ Korrekt | Gut |
| **Seitenumbrüche** | ✓ Korrekt | ✓ Korrekt | Gut |
| **Schriftarten** | ✓ Korrekt | ⚠ Fallback auf installierte Fonts | Akzeptabel |
| **Seitenränder** | ✓ Korrekt | ✓ Korrekt | Gut |
| **Bilder/Logos** | ✓ Korrekt | ✓ Korrekt | Gut |

### 3.2 Bekannte Einschränkungen

| Einschränkung | Schwere | Workaround |
|--------------|---------|-----------|
| Hierarchische Nummerierung kann bei komplexen Templates zurückgesetzt werden | Medium | Einfachere Nummerierungsstile verwenden |
| Custom Fonts werden durch System-Fonts ersetzt | Low | fonts-liberation + fonts-noto im Container installieren |
| OOXML-spezifische Features (SmartArt, etc.) gehen verloren | Low | Nicht relevant für Vertragsdokumente |
| Makros werden entfernt | N/A | Keine Makros in Verträgen |

### 3.3 Qualitäts-Urteil

**Gesamt-Bewertung: AKZEPTABEL FÜR BETA**

Die Konvertierungsqualität ist für Standardverträge (Fließtext, Überschriften, Listen) ausreichend. Komplexe Formatierungen (verschachtelte Tabellen, spezielle Nummerierungsformate) können Abweichungen aufweisen. Die Beta-Markierung und der Hinweis "Für bestmögliche Qualität DOCX verwenden" sind angemessen.

---

## 4. Performance-Benchmarks

### 4.1 Messungen

| Dokument | Seiten | DOCX-Größe | Konvertierungszeit | ODT-Größe |
|----------|--------|-----------|-------------------|-----------|
| Arbeitsvertrag (einfach) | 3 | 85 KB | ~2s | 45 KB |
| Dienstleistungsvertrag | 6 | 150 KB | ~3s | 80 KB |
| Komplexer Vertrag | 15 | 350 KB | ~5s | 180 KB |
| Maximalgröße (Stresstest) | 50 | 1.2 MB | ~12s | 600 KB |

### 4.2 Cold-Start

LibreOffice headless hat einen Cold-Start von **~3-5s** beim ersten Aufruf. Optionen:

| Strategie | Beschreibung | Empfehlung |
|-----------|-------------|------------|
| **Cold Start (Default)** | LibreOffice wird pro Konvertierung gestartet | MVP: einfach, sicher |
| **Warm Instance** | LibreOffice-Prozess im Hintergrund halten | Phase 2: bessere Performance |
| **Socket-Modus** | LibreOffice als Socket-Server | Phase 2: komplex, aber schnellste |

### 4.3 Performance-Ziele (ODT)

| Metrik | Ziel | Grenzwert |
|--------|------|-----------|
| Konvertierungszeit (5 Seiten) | < 5s | < 15s |
| Konvertierungszeit (20 Seiten) | < 10s | < 30s |
| End-to-End (Queue → Download) | < 25s (P95) | < 90s |
| Memory (Worker-Container) | < 512 MB | < 1 GB |

---

## 5. Sicherheitsmodell

### 5.1 Isolation

| Maßnahme | Beschreibung |
|----------|-------------|
| **Container-Isolation** | Export-Worker in eigenem Container, nicht co-located mit API |
| **Non-Root** | LibreOffice läuft als non-root User `exportworker` |
| **tmpfs** | `/tmp` als tmpfs (RAM-basiert, nicht persistent) |
| **Read-Only Filesystem** | Container-Filesystem read-only (außer /tmp) |
| **Network Policy** | Worker → S3 + DB (Job-Status only), kein Ingress |
| **Resource Limits** | CPU: 1 core, Memory: 512MB (Limit), 256MB (Request) |
| **Timeout** | 60s pro Konvertierung, 120s pro Job |
| **Temp-Cleanup** | Temp-Dateien werden nach Konvertierung sofort gelöscht |

### 5.2 Risiken

| Risiko | Schwere | Mitigation |
|--------|---------|-----------|
| LibreOffice Vulnerability (CVE) | High | Regelmäßige Image-Updates, Trivy-Scan in CI |
| OOM bei großen Dokumenten | Medium | Memory-Limit, Dokumentgröße begrenzen (< 5 MB Input) |
| Temp-Dateien bleiben liegen | Low | Cleanup im Finally-Block + Cronjob |
| Denial-of-Service (viele ODT-Requests) | Medium | Rate Limiting, separate Queue mit niedrigerer Priorität |

### 5.3 Input-Validierung

Bevor LibreOffice aufgerufen wird:
1. Input-Datei ist valides ZIP (DOCX-Format).
2. Dateigröße < 5 MB.
3. Keine Makros (VBA) enthalten.
4. Dateiname sanitized (keine Path-Traversal).

---

## 6. Betriebsaufwand

### 6.1 Container-Image-Größe

| Basis | LibreOffice-Paket | Fonts | Gesamt |
|-------|------------------|-------|--------|
| node:20-slim (174 MB) | libreoffice-writer (280 MB) | 50 MB | ~504 MB |

**Optimierung:** Nur `libreoffice-writer` + `libreoffice-common` installieren (nicht die gesamte Suite).

### 6.2 Skalierung

| Szenario | Worker-Replicas | Begründung |
|----------|----------------|-----------|
| Dev | 0 (ODT deaktiviert) | Ressourcen sparen |
| Stage | 1 | Funktionstest |
| Prod (Start) | 1 | Geringes ODT-Volumen erwartet |
| Prod (Skaliert) | 2-3 | Bei >50 ODT-Exports/Stunde |

### 6.3 Monitoring

| Metrik | Alert-Schwelle |
|--------|---------------|
| `odt_conversion_duration_seconds` | P95 > 15s |
| `odt_conversion_errors_total` | > 5 in 10 Min. |
| `odt_queue_depth` | > 20 |
| `odt_worker_memory_bytes` | > 450 MB |

---

## 7. UX-Integration

### 7.1 Export-Dialog

```
┌──────────────────────────────────────────┐
│  Vertrag exportieren                      │
│                                          │
│  Format:                                 │
│  ● DOCX (Microsoft Word)                │
│  ○ ODT (LibreOffice) — Beta             │
│                                          │
│  Formatvorlage:                          │
│  [Default-Vorlage          ▼]            │
│                                          │
│  ⓘ ODT-Export befindet sich im Beta-    │
│    Stadium. Für bestmögliche Qualität    │
│    empfehlen wir den DOCX-Export.        │
│                                          │
│  [Abbrechen]  [Exportieren]              │
└──────────────────────────────────────────┘
```

### 7.2 Status-Anzeige

```
┌──────────────────────────────────────────┐
│  Export-Status                            │
│                                          │
│  ████████████░░░░░░░░  60%              │
│  Dokument wird konvertiert (ODT)...      │
│                                          │
│  Geschätzte Restzeit: ~10 Sekunden       │
└──────────────────────────────────────────┘
```

---

## 8. Feature-Flag

ODT-Export ist per Feature-Flag steuerbar:

```typescript
const featureFlags = {
  odt_export_enabled: {
    default: false,         // Deaktiviert per Default
    description: 'ODT Export (Beta) aktivieren',
    scope: 'tenant',        // Pro Tenant konfigurierbar
  },
};
```

| Umgebung | Default |
|----------|---------|
| Dev | `true` |
| Stage | `true` |
| Prod | `false` (manuell per Tenant aktivierbar) |

---

## 9. Empfehlung

### 9.1 MVP-Entscheidung

**EMPFEHLUNG: ODT-Export als Beta-Feature im MVP aufnehmen.**

Begründung:
1. Konvertierungsqualität ist für Standard-Verträge ausreichend.
2. Betriebsaufwand ist überschaubar (1 zusätzlicher Container).
3. On-Prem-Kunden erwarten LibreOffice-Kompatibilität.
4. Beta-Markierung setzt korrekte Erwartungen.
5. Feature-Flag erlaubt schrittweisen Rollout.

### 9.2 Nicht empfohlen für MVP

- Native ODT-Generierung (zu hoher Aufwand, zu wenig Mehrwert)
- PDF-Export (anderer Konvertierungspfad, Phase 2)
- Warm-Instance-Modus (Komplexität, Phase 2)

### 9.3 Offene Punkte (ADR-004)

| # | Thema | Owner | Ziel-Sprint |
|---|-------|-------|-------------|
| 1 | Visuelle Regressionstests (Screenshot-Vergleich DOCX vs. ODT) | Team 06 | Sprint 5 |
| 2 | Font-Paket erweitern (Kanzlei-typische Schriften) | Team 07 | Sprint 5 |
| 3 | LibreOffice Socket-Modus für bessere Performance | Team 07 | Phase 2 |
| 4 | Native ODT-Generierung evaluieren (Phase 2) | Team 05 | Phase 2 |
| 5 | ODT-Qualitätsbericht pro Export (Konvertierungswarnungen) | Team 05 | Sprint 6 |
