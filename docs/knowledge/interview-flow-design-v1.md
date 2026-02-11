# Interview Flow Design & Rule Engine v1

**Status:** Final Draft
**Datum:** 2026-02-10
**Owner:** Team 04 (Contract Builder)
**Betroffene Teams:** 01, 03, 04
**Referenzen:** ADR-002 (Version Pinning), Domänenmodell v1, Story-Map E3.S1–E3.S3, E4.S1

---

## 1. Übersicht

Dieses Dokument spezifiziert den geführten Interview-Flow (Guided Contract Builder), die Save/Resume-Mechanik und die Rule-Engine für das Servanda Office MVP. Es umfasst den UX-Flow, die technische Architektur und das Validierungskonzept.

---

## 2. Interview-Engine Architektur

### 2.1 Systemkontext

```
┌────────────────────────────────────────────────────────┐
│                  CONTRACT BUILDER UI                     │
│                                                          │
│  ┌──────────┐  ┌───────────┐  ┌────────────────────┐   │
│  │ Question  │  │ Progress  │  │  Live-Preview       │   │
│  │ Panel     │  │ Sidebar   │  │  (Outline)          │   │
│  └─────┬────┘  └───────────┘  └────────────────────┘   │
│        │                                                  │
│        ▼                                                  │
│  ┌──────────────────────────────────────────────┐       │
│  │           Interview-Engine (Client)            │       │
│  │  ┌──────────┐  ┌───────────┐  ┌───────────┐  │       │
│  │  │ Flow     │  │ Condition │  │ Answer     │  │       │
│  │  │ Manager  │  │ Evaluator │  │ Store      │  │       │
│  │  └──────────┘  └───────────┘  └───────────┘  │       │
│  └───────────────────────┬──────────────────────┘       │
│                          │                                │
└──────────────────────────┼────────────────────────────────┘
                           │ API Calls
                           ▼
┌──────────────────────────────────────────────────────────┐
│                     BACKEND API                           │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────┐  │
│  │ Contract     │  │ Rule          │  │ Version      │  │
│  │ Service      │  │ Validator     │  │ Resolver     │  │
│  └──────────────┘  └───────────────┘  └──────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### 2.2 Komponenten

| Komponente | Verantwortung | Location |
|-----------|---------------|----------|
| **Flow Manager** | Steuert Fragenreihenfolge, evaluiert Conditions, navigiert Forward/Back | Client |
| **Condition Evaluator** | Wertet `show`/`hide`/`skip`-Conditions gegen bisherige Answers aus | Client |
| **Answer Store** | Hält aktuellen Answer-State, synchronisiert mit Backend | Client |
| **Contract Service** | CRUD für ContractInstance, Save/Resume, Completion | Backend |
| **Rule Validator** | Evaluiert Rules gegen aktuelle Klausel-Auswahl + Answers | Backend |
| **Version Resolver** | Löst Published-Versionen auf, prüft Deprecation-Status | Backend |

---

## 3. Geführter Flow (UX)

### 3.1 Flow-Phasen

```
Phase 1: TEMPLATE-AUSWAHL
│
│  Nutzer wählt Template aus Katalog
│  System resolved Published-Versionen (ADR-002)
│  ContractInstance wird erstellt (Draft)
│
▼
Phase 2: INTERVIEW
│
│  Fragen werden sequentiell präsentiert
│  Conditional Logic steuert Sichtbarkeit
│  Antworten werden laufend gespeichert
│  Live-Validierung zeigt Konflikte
│
▼
Phase 3: REVIEW & RESOLVE
│
│  Zusammenfassung aller Antworten + gewählter Klauseln
│  Offene Konflikte müssen aufgelöst werden
│  Nutzer kann Antworten korrigieren
│
▼
Phase 4: COMPLETION
│
│  Vertrag wird finalisiert (Status → completed)
│  Pins werden immutable
│  Export-Option wird angeboten
```

### 3.2 Interview-Screen Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Servanda Office    [Speichern]  [Später fortsetzen]        │
├───────────┬─────────────────────────────────┬───────────────┤
│           │                                  │               │
│ PROGRESS  │  FRAGE-BEREICH                   │ PREVIEW       │
│           │                                  │               │
│ ✓ Allg.   │  Abschnitt: Vergütung           │ Outline:      │
│ ✓ Parteien│                                  │               │
│ ● Vergüt. │  Wie wird die Vergütung          │ 1. Präambel   │
│ ○ Haftung │  geregelt?                       │ 2. Parteien   │
│ ○ Laufzeit│                                  │ 3. Vergütung ←│
│           │  ○ Pauschalhonorar               │ 4. Haftung    │
│           │  ○ Stundenhonorar                │ 5. Laufzeit   │
│           │  ○ Erfolgshonorar                │               │
│           │                                  │ ⚠ 1 Warnung   │
│           │  ℹ Erklärung:                    │               │
│           │  Das Honorarmodell bestimmt...   │               │
│           │                                  │               │
│           │  [← Zurück]  [Weiter →]          │               │
│           │                                  │               │
├───────────┴─────────────────────────────────┴───────────────┤
│  Frage 5 von 12  │  ████████░░░░  42%  │  Auto-Save: ✓     │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 Fragetypen und Rendering

| Fragetyp | UI-Element | Beispiel |
|----------|-----------|---------|
| `single_choice` | Radio-Buttons | Vergütungsmodell: Pauschal / Stunde / Erfolg |
| `multiple_choice` | Checkboxen | Zusatzleistungen: Reisekosten / Spesen / Materialkosten |
| `text` | Text-Input (einzeilig) | Firmenname: _________ |
| `number` | Number-Input mit Validierung | Mitarbeiterzahl: [___] |
| `date` | Date-Picker | Vertragsbeginn: [📅] |
| `currency` | Number-Input + Währung | Auftragswert: [___] EUR |
| `yes_no` | Toggle oder Radio | Probezeit vereinbaren? [Ja] [Nein] |

### 3.4 Conditional Logic

Conditions steuern, welche Fragen angezeigt werden:

```
Frage Q1: "Vergütungsmodell?" (single_choice)
  → Antwort: "Stundenhonorar"

Frage Q2: "Stundensatz?" (currency)
  condition: {
    sourceQuestionId: Q1,
    operator: "equals",
    value: "Stundenhonorar",
    logic: "show"
  }
  → Q2 wird nur angezeigt, wenn Q1 = "Stundenhonorar"

Frage Q3: "Pauschalbetrag?" (currency)
  condition: {
    sourceQuestionId: Q1,
    operator: "equals",
    value: "Pauschalhonorar",
    logic: "show"
  }
  → Q3 wird nur angezeigt, wenn Q1 = "Pauschalhonorar"
```

**Evaluierung (Client-Side):**

```typescript
interface ConditionEvaluator {
  /**
   * Prüft ob eine Frage sichtbar ist basierend auf bisherigen Antworten.
   * @returns true wenn die Frage angezeigt werden soll
   */
  isQuestionVisible(
    question: Question,
    answers: Record<string, AnswerValue>
  ): boolean;

  /**
   * Berechnet die effektive Fragenliste (ohne übersprungene/ausgeblendete).
   */
  getVisibleQuestions(
    allQuestions: Question[],
    answers: Record<string, AnswerValue>
  ): Question[];
}
```

**Evaluierungsregeln:**
1. Frage ohne Conditions → immer sichtbar.
2. Mehrere Conditions auf einer Frage → **AND-Verknüpfung** (alle müssen erfüllt sein).
3. `show`: Frage wird angezeigt wenn Condition erfüllt.
4. `hide`: Frage wird ausgeblendet wenn Condition erfüllt.
5. `skip`: Frage wird übersprungen (und Antwort gelöscht) wenn Condition erfüllt.
6. Antworten auf nicht-sichtbare Fragen werden **nicht** in den Snapshot übernommen.

---

## 4. Save & Resume

### 4.1 Auto-Save

```
Nutzer beantwortet Frage
       │
       ▼
  ┌────────────────────────┐
  │ Client: Answer Store   │
  │ aktualisiert lokalen   │
  │ State                  │
  └──────────┬─────────────┘
             │ Debounce (2s)
             ▼
  ┌────────────────────────┐
  │ API: PATCH Contract    │
  │ Instance               │
  │ {answers, selectedSlots│
  │  updatedAt}            │
  └──────────┬─────────────┘
             │
     ┌───────┴───────┐
     │               │
   ✓ Saved         ✗ Error
     │               │
     ▼               ▼
  UI: "✓ Gespeichert" UI: "⚠ Speichern fehlgeschlagen"
  (timestamp)         [Erneut versuchen]
```

**Auto-Save-Strategie:**

| Event | Aktion |
|-------|--------|
| Antwort geändert | Debounce 2s → PATCH |
| Slot-Auswahl geändert | Debounce 2s → PATCH |
| Navigation (Weiter/Zurück) | Sofort → PATCH |
| Browser-Unload (beforeunload) | Sofort → PATCH (best effort) |
| Explizit "Speichern" | Sofort → PATCH |

### 4.2 Resume-Flow

```
Nutzer öffnet Dashboard
       │
       ▼
  ┌────────────────────────┐
  │ GET /contracts?status=  │
  │ draft                   │
  └──────────┬─────────────┘
             │
             ▼
  ┌────────────────────────┐
  │ Dashboard zeigt:       │
  │ "Entwürfe"             │
  │                        │
  │ ┌────────────────────┐ │
  │ │ Arbeitsvertrag     │ │
  │ │ Müller GmbH        │ │
  │ │ Zuletzt: vor 2h    │ │
  │ │ 5/12 Fragen        │ │
  │ │ [Fortsetzen]       │ │
  │ └────────────────────┘ │
  └──────────┬─────────────┘
             │ Klick "Fortsetzen"
             ▼
  ┌────────────────────────┐
  │ System lädt:           │
  │ - ContractInstance     │
  │ - Gepinnte Versions    │
  │ - InterviewFlow        │
  │ - Gespeicherte Answers │
  └──────────┬─────────────┘
             │
             ▼
  ┌────────────────────────┐
  │ Interview-Engine        │
  │ setzt fort:            │
  │ - Answers restored     │
  │ - Progress berechnet   │
  │ - Erste unbeantwortete │
  │   Frage angezeigt      │
  └────────────────────────┘
```

### 4.3 API-Endpunkte (Save/Resume)

```yaml
# Auto-Save (Antworten + Slot-Auswahlen)
PATCH /api/v1/tenants/{tenantId}/contracts/{contractId}
  Request:
    answers?: Record<questionId, AnswerValue>
    selectedSlots?: Record<slotId, { chosenClauseVersionId: uuid }>
  Preconditions:
    - status = "draft"
  Response:
    contractInstance: (aktualisiert)
    validationState: "valid" | "has_warnings" | "has_conflicts"
    validationMessages: ValidationMessage[]

# Resume (Vertrag laden für Fortsetzung)
GET /api/v1/tenants/{tenantId}/contracts/{contractId}
  Response:
    contractInstance: (vollständig)
    templateVersion: (gepinnte Version mit Structure)
    interviewFlow: (Questions + Conditions)
    clauseVersions: (alle gepinnten Versionen)
    progress: {
      totalQuestions: number,
      answeredQuestions: number,
      percentComplete: number,
      firstUnansweredQuestionId: uuid
    }

# Draft-Verträge auflisten
GET /api/v1/tenants/{tenantId}/contracts?status=draft
  Response:
    contracts: [{
      id, title, clientReference,
      templateTitle, templateVersionNumber,
      progress: { percentComplete },
      updatedAt
    }]
```

### 4.4 Offline-/Fehlerbehandlung

| Szenario | Verhalten |
|----------|----------|
| Netzwerk-Timeout beim Auto-Save | Retry mit Exponential Backoff (max 3x), dann Fehler-UI |
| Browser-Tab wird geschlossen | `beforeunload`: synchroner PATCH (best effort) |
| Lokaler State vs. Server-State Konflikt | Server-State gewinnt; Warnung an Nutzer |
| Gepinnte Version wurde deprecated während Bearbeitung | Warnung: "Version veraltet, Upgrade empfohlen" |
| Session-Timeout | Automatische Weiterleitung zu Login; nach Re-Auth: Resume |

---

## 5. Progress-Tracking

### 5.1 Berechnung

```typescript
interface ProgressCalculator {
  calculate(
    questions: Question[],
    answers: Record<string, AnswerValue>,
    conditions: Condition[]
  ): Progress;
}

interface Progress {
  totalQuestions: number;      // Gesamtanzahl sichtbarer Fragen
  answeredQuestions: number;   // Davon beantwortet
  percentComplete: number;    // 0-100
  sections: SectionProgress[]; // Pro Section
  firstUnansweredQuestionId: string | null;
}

interface SectionProgress {
  sectionId: string;
  sectionTitle: string;
  totalQuestions: number;
  answeredQuestions: number;
  status: 'complete' | 'in_progress' | 'not_started';
}
```

**Regeln:**
- Nur **sichtbare** Fragen (nach Condition-Evaluierung) zählen.
- Nur **required** Fragen müssen für `percentComplete = 100` beantwortet sein.
- Optional-Fragen werden als "beantwortet" gezählt wenn ausgefüllt, beeinflussen aber nicht die 100%-Schwelle.

### 5.2 Section-Zuordnung

Fragen werden Sections zugeordnet über die Template-Struktur:

```
TemplateVersion.structure
  └── Section "Vergütung"
        └── Slot → Clause "Honorarmodell"
              └── InterviewFlow.questions
                    ├── Q1: "Vergütungsmodell?"
                    ├── Q2: "Stundensatz?"
                    └── Q3: "Pauschalbetrag?"
```

Die Zuordnung erfolgt über `Question.targetClauseIds` → `Slot.clauseId` → `Section`.

---

## 6. Rule Engine

### 6.1 Architektur

```
                    ┌─────────────────────┐
                    │   Rule Validator     │
                    │   (Backend Service)  │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                 │
              ▼                ▼                 ▼
      ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
      │ Dependency   │ │ Conflict     │ │ Scope        │
      │ Checker      │ │ Detector     │ │ Evaluator    │
      │              │ │              │ │              │
      │ requires     │ │ forbids      │ │ scoped_to    │
      │              │ │ incompatible │ │ requires_    │
      │              │ │ _with        │ │ answer       │
      └──────────────┘ └──────────────┘ └──────────────┘
```

### 6.2 Evaluierungszeitpunkte

| Zeitpunkt | Trigger | Scope | Response |
|-----------|---------|-------|----------|
| **Slot-Auswahl** | Nutzer wählt Alternative in Slot | Betroffene Rules | Sofortige Warnung/Fehler |
| **Antwort-Eingabe** | Nutzer beantwortet Frage | `requires_answer`-Rules | Sofortige Reevaluierung |
| **Auto-Save** | Debounced PATCH | Alle Rules | `validationState` + `validationMessages` |
| **Completion** | Nutzer klickt "Fertigstellen" | Alle Rules (final) | Block bei Hard Conflicts |
| **Export** | ExportJob erstellt | Hard Conflicts prüfen | Block bei `has_conflicts` |

### 6.3 Evaluierungsalgorithmus

```
Input:
  - selectedClauseVersionIds: UUID[]  (aktive Klauseln im Vertrag)
  - answers: Record<questionId, value> (bisherige Antworten)
  - allRules: Rule[]                   (aus allen aktiven ClauseVersions)

Output:
  - validationState: 'valid' | 'has_warnings' | 'has_conflicts'
  - messages: ValidationMessage[]

Algorithmus:

1. Sammle alle Rules aus allen selectedClauseVersionIds
2. Für jede Rule:
   a. SCOPE CHECK:
      - Wenn scoped_to: Prüfe ob Jurisdiktion/Vertragstyp passt
      - Wenn requires_answer: Prüfe ob Bedingung erfüllt
      - Falls Scope nicht erfüllt → Rule wird übersprungen

   b. DEPENDENCY CHECK (requires):
      - Prüfe ob targetClauseId in selectedClauseVersionIds enthalten
      - Oder ob mindestens eine aus targetClauseIds enthalten
      - Falls nicht → Violation erzeugen

   c. CONFLICT CHECK (forbids):
      - Prüfe ob targetClauseId in selectedClauseVersionIds enthalten
      - Falls ja → Violation erzeugen

   d. INCOMPATIBILITY CHECK (incompatible_with):
      - Prüfe ob targetClauseId in selectedClauseVersionIds enthalten
      - Falls ja → Violation erzeugen (symmetrisch)

3. Klassifiziere Violations:
   - severity = 'hard' → has_conflicts (blockiert Export)
   - severity = 'soft' → has_warnings (Warnung, erlaubt Export)

4. Generiere Lösungsvorschläge:
   - requires-Violation → "Fügen Sie [Klauselname] hinzu"
   - forbids-Violation → "Entfernen Sie [Klauselname] oder wählen Sie Alternative"
   - incompatible-Violation → "Wählen Sie eine der Alternativen"
```

### 6.4 Validierungs-Response

```json
{
  "validationState": "has_conflicts",
  "validationMessages": [
    {
      "id": "val-001",
      "ruleType": "forbids",
      "severity": "hard",
      "sourceClauseId": "uuid-exklusivitaet",
      "sourceClauseTitle": "Exklusivitätsklausel",
      "targetClauseId": "uuid-drittanbieter",
      "targetClauseTitle": "Drittanbieterklausel",
      "message": "Die Exklusivitätsklausel verbietet die gleichzeitige Verwendung der Drittanbieterklausel.",
      "suggestion": "Entfernen Sie die Drittanbieterklausel oder wählen Sie die nicht-exklusive Variante.",
      "resolutionOptions": [
        {
          "action": "remove_clause",
          "targetClauseId": "uuid-drittanbieter",
          "label": "Drittanbieterklausel entfernen"
        },
        {
          "action": "replace_clause",
          "targetClauseId": "uuid-exklusivitaet",
          "replacementClauseId": "uuid-nicht-exklusiv",
          "label": "Nicht-exklusive Variante wählen"
        }
      ]
    },
    {
      "id": "val-002",
      "ruleType": "requires",
      "severity": "soft",
      "sourceClauseId": "uuid-haftung",
      "sourceClauseTitle": "Haftungsausschluss",
      "targetClauseId": "uuid-gewaehrleistung",
      "targetClauseTitle": "Gewährleistungsklausel",
      "message": "Der Haftungsausschluss empfiehlt die Gewährleistungsklausel.",
      "suggestion": "Fügen Sie die Gewährleistungsklausel hinzu für vollständigen Schutz.",
      "resolutionOptions": [
        {
          "action": "add_clause",
          "targetClauseId": "uuid-gewaehrleistung",
          "label": "Gewährleistungsklausel hinzufügen"
        }
      ]
    }
  ]
}
```

### 6.5 Konfliktauflösungs-UX

```
┌──────────────────────────────────────────────────┐
│  ⚠ 1 Konflikt  │  ⓘ 1 Warnung                   │
├──────────────────────────────────────────────────┤
│                                                   │
│  🔴 KONFLIKT (blockiert Export)                   │
│                                                   │
│  "Die Exklusivitätsklausel verbietet die         │
│   gleichzeitige Verwendung der                    │
│   Drittanbieterklausel."                          │
│                                                   │
│  Lösungsmöglichkeiten:                            │
│  ┌─────────────────────────────────────────────┐ │
│  │ ○ Drittanbieterklausel entfernen            │ │
│  │ ○ Nicht-exklusive Variante wählen           │ │
│  └─────────────────────────────────────────────┘ │
│  [Lösung anwenden]                                │
│                                                   │
│  ────────────────────────────────────────         │
│                                                   │
│  🟡 WARNUNG (Export möglich)                      │
│                                                   │
│  "Der Haftungsausschluss empfiehlt die            │
│   Gewährleistungsklausel."                        │
│                                                   │
│  [Gewährleistungsklausel hinzufügen]              │
│  [Warnung ignorieren]                             │
│                                                   │
└──────────────────────────────────────────────────┘
```

---

## 7. Completion-Flow

### 7.1 Preconditions

```
Nutzer klickt "Vertrag fertigstellen"
       │
       ▼
  ┌────────────────────────────────┐
  │ Precondition-Check:            │
  │                                │
  │ ✓ Alle Required-Fragen        │
  │   beantwortet?                 │
  │ ✓ Alle Required-Slots         │
  │   befüllt?                     │
  │ ✓ validationState ≠            │
  │   has_conflicts?               │
  │ ✓ Alle Hard-Conflicts          │
  │   aufgelöst?                   │
  └──────────┬─────────────────────┘
             │
     ┌───────┴───────┐
     │               │
  ✓ Alle erfüllt  ✗ Nicht erfüllt
     │               │
     ▼               ▼
  Review-Screen    Fehler-Dialog:
  anzeigen         "Folgende Punkte
                    müssen noch
                    bearbeitet werden:"
                   - Frage 7 unbeantwortet
                   - 1 Hard Conflict offen
```

### 7.2 Review-Screen

```
┌──────────────────────────────────────────────────┐
│  Vertrag: Arbeitsvertrag Müller GmbH             │
│  Template: Arbeitsvertrag (befristet) v3         │
├──────────────────────────────────────────────────┤
│                                                   │
│  ZUSAMMENFASSUNG                                  │
│                                                   │
│  1. Allgemein                                     │
│     Firmenname: Müller GmbH                      │
│     Mitarbeiterzahl: 15                          │
│     Vertragsbeginn: 01.04.2026                   │
│                                                   │
│  2. Vergütung                                     │
│     Modell: Stundenhonorar                       │
│     Stundensatz: 250 EUR                         │
│                                                   │
│  3. Haftung                                       │
│     Haftungsausschluss: Ja                       │
│     Obergrenze: 2x Auftragswert                 │
│                                                   │
│  GEWÄHLTE KLAUSELN (5)                            │
│  ✓ Präambel (Standard) v2                        │
│  ✓ Vergütung (Stundenhonorar) v1                 │
│  ✓ Haftungsausschluss v3                         │
│  ✓ Gewährleistung v2                             │
│  ✓ Laufzeit (befristet) v1                       │
│                                                   │
│  ⓘ 0 Konflikte │ 0 Warnungen                     │
│                                                   │
│  [← Zurück bearbeiten]  [Vertrag fertigstellen]  │
└──────────────────────────────────────────────────┘
```

### 7.3 Post-Completion

Nach Fertigstellung:
1. `status` → `completed`, `completedAt` gesetzt
2. Pins werden immutable (DB-Trigger aus ADR-002)
3. UI zeigt: "Vertrag fertiggestellt" + Optionen:
   - [Als DOCX exportieren]
   - [Als Kanzlei-Template speichern]
   - [Zur Vertragsübersicht]

---

## 8. Navigation

### 8.1 Forward/Back

| Aktion | Verhalten |
|--------|----------|
| **Weiter** | Speichert aktuelle Antwort → Zeigt nächste sichtbare Frage |
| **Zurück** | Zeigt vorherige Frage → Antwort bleibt erhalten |
| **Section-Klick** (Sidebar) | Springt zur ersten Frage der Section |
| **Keyboard** | Enter = Weiter, Shift+Enter = Zurück (wenn unterstützt) |

### 8.2 Navigation bei Condition-Änderung

```
Nutzer ändert Antwort auf Q1 (Vergütungsmodell)
       │
       ▼
Condition Evaluator:
  Q2 (Stundensatz) wird ausgeblendet
  Q3 (Pauschalbetrag) wird eingeblendet
       │
       ▼
Antwort auf Q2 wird aus Answer Store entfernt
Q3 wird als "unbeantwortet" markiert
Progress wird neu berechnet
```

---

## 9. Live-Preview (Outline)

### 9.1 Funktionsweise

Die Live-Preview zeigt eine Gliederungsansicht des entstehenden Vertrags:

```typescript
interface OutlineGenerator {
  /**
   * Generiert eine Outline basierend auf Template-Struktur
   * und aktuellen Antworten/Slot-Auswahlen.
   */
  generate(
    templateVersion: TemplateVersion,
    selectedSlots: Record<string, SelectedSlot>,
    answers: Record<string, AnswerValue>
  ): OutlineSection[];
}

interface OutlineSection {
  id: string;
  title: string;
  clauses: OutlineClause[];
  isActive: boolean;  // Aktuell bearbeitete Section
}

interface OutlineClause {
  id: string;
  title: string;
  status: 'selected' | 'pending' | 'conflict';
  preview?: string;  // Erste ~100 Zeichen des Klauseltexts mit eingesetzten Parametern
}
```

### 9.2 Aktualisierung

- Preview wird bei jeder Antwort-Änderung aktualisiert (Client-side, kein API-Call).
- Parameter-Platzhalter werden durch aktuelle Antworten ersetzt.
- Nicht-ausgefüllte Parameter werden als `[___]` dargestellt.
- Klauseln mit Konflikten werden rot markiert.

---

## 10. Technische Datenstrukturen

### 10.1 Client-State

```typescript
interface InterviewState {
  contractInstance: ContractInstance;
  templateVersion: TemplateVersion;
  interviewFlow: InterviewFlow;
  clauseVersions: Map<string, ClauseVersion>;

  // Laufender State
  currentQuestionIndex: number;
  answers: Record<string, AnswerValue>;
  selectedSlots: Record<string, SelectedSlot>;
  validationState: ValidationState;
  validationMessages: ValidationMessage[];
  progress: Progress;

  // UI-State
  isDirty: boolean;          // Ungespeicherte Änderungen
  lastSavedAt: Date | null;
  saveError: string | null;
  isSubmitting: boolean;
}

type AnswerValue =
  | { type: 'text'; value: string }
  | { type: 'number'; value: number }
  | { type: 'date'; value: string }
  | { type: 'currency'; value: number; currency: string }
  | { type: 'yes_no'; value: boolean }
  | { type: 'single_choice'; value: string }
  | { type: 'multiple_choice'; value: string[] };

interface SelectedSlot {
  slotId: string;
  chosenClauseVersionId: string;
}
```

### 10.2 Backend-Validation-Service

```typescript
interface RuleValidationService {
  /**
   * Evaluiert alle Rules gegen aktuelle Klausel-Auswahl und Antworten.
   * Wird bei jedem Auto-Save aufgerufen.
   */
  validate(
    clauseVersionIds: string[],
    answers: Record<string, AnswerValue>,
    jurisdiction: string
  ): Promise<ValidationResult>;
}

interface ValidationResult {
  validationState: 'valid' | 'has_warnings' | 'has_conflicts';
  messages: ValidationMessage[];
}

interface ValidationMessage {
  id: string;
  ruleType: 'requires' | 'forbids' | 'incompatible_with' | 'scoped_to' | 'requires_answer';
  severity: 'hard' | 'soft';
  sourceClauseId: string;
  sourceClauseTitle: string;
  targetClauseId: string;
  targetClauseTitle: string;
  message: string;
  suggestion: string;
  resolutionOptions: ResolutionOption[];
}

interface ResolutionOption {
  action: 'add_clause' | 'remove_clause' | 'replace_clause';
  targetClauseId: string;
  replacementClauseId?: string;
  label: string;
}
```

---

## 11. Offene Punkte

| # | Thema | Owner | Ziel-Sprint |
|---|-------|-------|-------------|
| 1 | Accessibility (ARIA, Keyboard Navigation) für Interview-Flow | Team 04 | Sprint 3 |
| 2 | Mobile/Responsive Layout für Interview-Screen | Team 04 | Sprint 4 |
| 3 | Bulk-Upgrade für Draft-Verträge (viele Drafts gleichzeitig upgraden) | Team 04 | Sprint 3 |
| 4 | "Mehr erfahren" Overlay mit ausführlicher Erklärung pro Frage | Team 04 + 03 | Sprint 4 |
| 5 | Live-Preview mit vollständigem Clause-Text (statt nur Outline) | Team 04 | Sprint 4 |
| 6 | Undo/Redo im Interview-Flow | Team 04 | Phase 2 |
