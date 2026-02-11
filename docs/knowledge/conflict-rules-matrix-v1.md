# Konfliktregeln-Matrix v1

**Status:** Final Draft
**Datum:** 2026-02-10
**Owner:** Team 04 (Contract Builder) + Team 03 (Content Editorial)
**Betroffene Teams:** 01, 03, 04
**Referenzen:** Domänenmodell v1 (Rule Value Object), Interview Flow Design v1, Content Versioning Schema v1

---

## 1. Übersicht

Die Konfliktregeln-Matrix definiert alle Regeltypen für die Klausel-Konsistenzprüfung im Servanda Office MVP. Sie beschreibt Semantik, Evaluierung, Prioritäten und enthält eine Beispiel-Matrix für typische Vertragsmuster.

---

## 2. Regeltypen (Vollständige Spezifikation)

### 2.1 `requires` — Abhängigkeit

| Eigenschaft | Wert |
|-------------|------|
| **Semantik** | Klausel A benötigt Klausel B (oder mindestens eine aus Set {B, C, D}). |
| **Richtung** | Gerichtet (A → B). Nicht symmetrisch. |
| **Evaluierung** | Prüfe ob `targetClauseId` (oder eine aus `targetClauseIds`) in `selectedClauseVersionIds` enthalten. |
| **Fehlfall** | Violation: "A erfordert B." |
| **Typischer Einsatz** | Haftungsausschluss erfordert Gewährleistungsklausel. |

**Varianten:**

| Variante | Schema | Semantik |
|----------|--------|----------|
| Single Dependency | `{ type: "requires", targetClauseId: "B" }` | A erfordert genau B |
| Set Dependency (OR) | `{ type: "requires", targetClauseIds: ["B", "C"] }` | A erfordert mindestens eine aus {B, C} |

### 2.2 `forbids` — Ausschluss

| Eigenschaft | Wert |
|-------------|------|
| **Semantik** | Klausel A verbietet Klausel B. |
| **Richtung** | Gerichtet (A → B). B verbietet nicht zwingend A (asymmetrisch). |
| **Evaluierung** | Prüfe ob `targetClauseId` in `selectedClauseVersionIds` enthalten. |
| **Fehlfall** | Violation: "A verbietet B." |
| **Typischer Einsatz** | Exklusivitätsklausel verbietet Drittanbieterklausel. |

**Hinweis:** Wenn die Beziehung symmetrisch sein soll, stattdessen `incompatible_with` verwenden.

### 2.3 `incompatible_with` — Symmetrischer Konflikt

| Eigenschaft | Wert |
|-------------|------|
| **Semantik** | Klausel A und Klausel B sind gegenseitig unvereinbar. |
| **Richtung** | Symmetrisch (A ↔ B). Rule muss nur auf einer Seite definiert werden. |
| **Evaluierung** | Prüfe ob `targetClauseId` in `selectedClauseVersionIds` enthalten. |
| **Fehlfall** | Violation: "A und B sind unvereinbar." |
| **Typischer Einsatz** | Pauschalhonorar unvereinbar mit Stundenhonorar. |

**Symmetrie-Handling:**
- Rule wird nur auf Klausel A definiert (nicht auf beiden).
- Die Rule Engine evaluiert `incompatible_with` symmetrisch: Wenn A im Vertrag → prüfe ob B auch → Conflict. Wenn B im Vertrag → prüfe ob A auch → Conflict.
- **Implementierung:** Beim Laden der Rules werden `incompatible_with`-Rules bidirektional in den Evaluator geladen.

### 2.4 `scoped_to` — Gültigkeitsbereich

| Eigenschaft | Wert |
|-------------|------|
| **Semantik** | Klausel A gilt nur für bestimmte Jurisdiktion oder Vertragstyp. |
| **Richtung** | Bezogen auf die Klausel selbst. |
| **Evaluierung** | Prüfe ob `jurisdictionScope` mit Vertrag-Jurisdiktion übereinstimmt. |
| **Fehlfall** | Violation: "A ist nur gültig in [Jurisdiktion]." |
| **Typischer Einsatz** | "Diese Klausel ist nur für deutsches Recht anwendbar." |

**Schema:**
```json
{
  "type": "scoped_to",
  "jurisdictionScope": "DE",
  "severity": "hard",
  "message": "Diese Klausel ist nur für deutsches Recht anwendbar."
}
```

**Evaluierung:**
- Wenn Vertrag-Jurisdiktion ≠ `jurisdictionScope` → Klausel darf nicht verwendet werden.
- `scoped_to`-Rules werden VOR den anderen Rules evaluiert (Filter-Phase).

### 2.5 `requires_answer` — Antwortabhängig

| Eigenschaft | Wert |
|-------------|------|
| **Semantik** | Klausel A ist nur relevant/erforderlich wenn eine bestimmte Interview-Antwort vorliegt. |
| **Richtung** | Bezogen auf Interview-Antworten. |
| **Evaluierung** | Prüfe ob `condition` gegen `answers` erfüllt ist. |
| **Fehlfall** | Violation: "A ist erforderlich weil [Bedingung]." |
| **Typischer Einsatz** | "Datenschutzklausel erforderlich wenn Mitarbeiterzahl > 10." |

**Schema:**
```json
{
  "type": "requires_answer",
  "condition": {
    "questionId": "q-mitarbeiterzahl",
    "operator": "greater_than",
    "value": 10
  },
  "severity": "hard",
  "message": "Bei mehr als 10 Mitarbeitern ist die Datenschutzklausel erforderlich.",
  "suggestion": "Fügen Sie die Datenschutzklausel hinzu."
}
```

**Operatoren:**

| Operator | Typen | Beschreibung |
|----------|-------|-------------|
| `equals` | alle | Exakter Vergleich |
| `not_equals` | alle | Ungleich |
| `greater_than` | number, currency | Größer als |
| `less_than` | number, currency | Kleiner als |
| `contains` | text, multiple_choice | Enthält Wert |
| `in` | single_choice | Wert ist in Set |

---

## 3. Severity-Klassifikation

| Severity | Symbol | Beschreibung | Auswirkung |
|----------|--------|-------------|------------|
| `hard` | 🔴 | Rechtlich kritischer Konflikt | Blockiert Export + Completion |
| `soft` | 🟡 | Empfehlung/Warnung | Erlaubt Export, zeigt Warnung |

### 3.1 Severity-Richtlinien

| Szenario | Empfohlene Severity | Begründung |
|----------|-------|------------|
| Widersprüchliche Klauseln (z.B. exklusiv + nicht-exklusiv) | `hard` | Rechtlich unhaltbar |
| Fehlende gesetzlich erforderliche Klausel | `hard` | Vertrag wäre unwirksam |
| Fehlende empfohlene Klausel | `soft` | Vertrag ist gültig, aber unvollständig |
| Jurisdiktion-Mismatch | `hard` | Klausel nicht anwendbar |
| Stilistisch unpassende Kombination | `soft` | Kein rechtlicher Fehler |

---

## 4. Evaluierungsreihenfolge

Die Rule Engine evaluiert in fester Reihenfolge:

```
Phase 1: SCOPE FILTER
─────────────────────
Für jede Klausel im Vertrag:
  1. scoped_to evaluieren
  2. Klausel aus Scope? → Violation (hard)
  3. requires_answer evaluieren
  4. Antwort-Bedingung nicht erfüllt? → Violation oder Skip

Phase 2: DEPENDENCY CHECK
─────────────────────────
Für jede Klausel im Vertrag:
  5. requires evaluieren
  6. Abhängigkeit fehlt? → Violation

Phase 3: CONFLICT CHECK
───────────────────────
Für jede Klausel im Vertrag:
  7. forbids evaluieren
  8. incompatible_with evaluieren
  9. Verbotene Klausel vorhanden? → Violation

Phase 4: AGGREGATION
─────────────────────
  10. Alle Violations sammeln
  11. Deduplizieren (incompatible_with symmetrisch)
  12. Nach Severity sortieren (hard vor soft)
  13. validationState bestimmen:
      - Mindestens 1 hard → has_conflicts
      - Nur soft → has_warnings
      - Keine → valid
```

### 4.1 Zyklen-Erkennung

`requires`-Regeln können Zyklen bilden (A requires B, B requires C, C requires A). Dies wird bei der **Publikation** geprüft (Publishing-Gate PG-C07), nicht zur Laufzeit.

**Erkennung:** DFS (Depth-First Search) über den `requires`-Graphen:

```
Input: Alle Published ClauseVersions mit ihren requires-Rules
Output: Liste zirkulärer Ketten

für jede Klausel K:
  DFS(K, visited=[], path=[])
    für jede requires-Rule R von K:
      wenn R.target in path → Zyklus gefunden
      DFS(R.target, visited + [K], path + [K])
```

---

## 5. Beispiel-Matrix (MVP-Vertragsmuster: Arbeitsvertrag)

### 5.1 Klausel-Inventar

| ID | Klausel | Kategorie | Jurisdiktion |
|----|---------|-----------|-------------|
| C01 | Präambel (Standard) | Allgemein | DE, AT, CH |
| C02 | Vertragsparteien | Allgemein | DE, AT, CH |
| C03 | Vergütung (Pauschal) | Vergütung | DE, AT, CH |
| C04 | Vergütung (Stunde) | Vergütung | DE, AT, CH |
| C05 | Vergütung (Erfolg) | Vergütung | DE |
| C06 | Haftungsausschluss | Haftung | DE, AT |
| C07 | Haftungsbegrenzung | Haftung | DE, AT, CH |
| C08 | Gewährleistung (Standard) | Gewährleistung | DE, AT, CH |
| C09 | Gewährleistung (Erweitert) | Gewährleistung | DE |
| C10 | Vertraulichkeit | Datenschutz | DE, AT, CH |
| C11 | Datenschutz (DSGVO) | Datenschutz | DE, AT |
| C12 | Wettbewerbsverbot | Wettbewerb | DE |
| C13 | Laufzeit (befristet) | Laufzeit | DE, AT, CH |
| C14 | Laufzeit (unbefristet) | Laufzeit | DE, AT, CH |
| C15 | Kündigungsklausel | Laufzeit | DE, AT, CH |
| C16 | Probezeit | Laufzeit | DE, AT |
| C17 | Gerichtsstandsvereinbarung (DE) | Schlussbestimmungen | DE |

### 5.2 Konfliktregeln-Matrix

```
        C01  C02  C03  C04  C05  C06  C07  C08  C09  C10  C11  C12  C13  C14  C15  C16  C17
C01  │  ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─
C02  │  ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─
C03  │  ─    ─    ─   INC   INC  ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─
C04  │  ─    ─   INC   ─   INC   ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─
C05  │  ─    ─   INC  INC   ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─
C06  │  ─    ─    ─    ─    ─    ─   INC  REQ   ─    ─    ─    ─    ─    ─    ─    ─    ─
C07  │  ─    ─    ─    ─    ─   INC   ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─
C08  │  ─    ─    ─    ─    ─    ─    ─    ─   INC   ─    ─    ─    ─    ─    ─    ─    ─
C09  │  ─    ─    ─    ─    ─    ─    ─   INC   ─    ─   REQ   ─    ─    ─    ─    ─    ─
C10  │  ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─
C11  │  ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─
C12  │  ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─   REQ   ─    ─
C13  │  ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─   INC  REQ   ─    ─
C14  │  ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─   INC   ─   REQ   ─    ─
C15  │  ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─
C16  │  ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─
C17  │  ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─    ─
```

**Legende:** `REQ` = requires, `FOR` = forbids, `INC` = incompatible_with, `─` = keine Regel

### 5.3 Detaillierte Regeln

| # | Source | Type | Target | Severity | Message |
|---|--------|------|--------|----------|---------|
| R01 | C03 (Pauschal) | `incompatible_with` | C04 (Stunde) | `hard` | Pauschalhonorar und Stundenhonorar sind unvereinbar. Wählen Sie ein Vergütungsmodell. |
| R02 | C03 (Pauschal) | `incompatible_with` | C05 (Erfolg) | `hard` | Pauschalhonorar und Erfolgshonorar sind unvereinbar. |
| R03 | C04 (Stunde) | `incompatible_with` | C05 (Erfolg) | `hard` | Stundenhonorar und Erfolgshonorar sind unvereinbar. |
| R04 | C06 (Haftungsausschluss) | `requires` | C08 (Gewährleistung Std.) | `soft` | Haftungsausschluss empfiehlt eine Gewährleistungsklausel. |
| R05 | C06 (Haftungsausschluss) | `incompatible_with` | C07 (Haftungsbegrenzung) | `hard` | Haftungsausschluss und Haftungsbegrenzung sind unvereinbar. Wählen Sie eine Variante. |
| R06 | C08 (Gewährleistung Std.) | `incompatible_with` | C09 (Gewährleistung Erw.) | `hard` | Standard- und erweiterte Gewährleistung sind unvereinbar. |
| R07 | C09 (Gewährleistung Erw.) | `requires` | C11 (Datenschutz DSGVO) | `soft` | Erweiterte Gewährleistung empfiehlt Datenschutzklausel. |
| R08 | C12 (Wettbewerbsverbot) | `requires` | C15 (Kündigung) | `hard` | Wettbewerbsverbot erfordert Kündigungsklausel. |
| R09 | C13 (befristet) | `incompatible_with` | C14 (unbefristet) | `hard` | Befristete und unbefristete Laufzeit sind unvereinbar. |
| R10 | C13 (befristet) | `requires` | C15 (Kündigung) | `soft` | Befristete Laufzeit empfiehlt Kündigungsklausel. |
| R11 | C14 (unbefristet) | `requires` | C15 (Kündigung) | `hard` | Unbefristete Laufzeit erfordert Kündigungsklausel. |
| R12 | C05 (Erfolg) | `scoped_to` | — | `hard` | Erfolgshonorar ist nur für deutsches Recht verfügbar. (jurisdictionScope: "DE") |
| R13 | C09 (Gewährleistung Erw.) | `scoped_to` | — | `hard` | Erweiterte Gewährleistung nur für deutsches Recht. (jurisdictionScope: "DE") |
| R14 | C12 (Wettbewerbsverbot) | `scoped_to` | — | `hard` | Wettbewerbsverbot nur für deutsches Recht. (jurisdictionScope: "DE") |
| R15 | C17 (Gerichtsstand DE) | `scoped_to` | — | `hard` | Gerichtsstandsvereinbarung DE nur für deutsches Recht. (jurisdictionScope: "DE") |

### 5.4 Antwortabhängige Regeln

| # | Source | Type | Condition | Severity | Message |
|---|--------|------|-----------|----------|---------|
| RA01 | C11 (Datenschutz DSGVO) | `requires_answer` | `mitarbeiterzahl > 10` | `hard` | Bei mehr als 10 Mitarbeitern ist die Datenschutzklausel erforderlich. |
| RA02 | C16 (Probezeit) | `requires_answer` | `vertragstyp = "befristet"` | `soft` | Bei befristeten Verträgen wird eine Probezeit empfohlen. |
| RA03 | C10 (Vertraulichkeit) | `requires_answer` | `branche in ["IT", "Pharma", "Forschung"]` | `soft` | In dieser Branche wird eine Vertraulichkeitsklausel empfohlen. |

---

## 6. Lösungsvorschläge (Resolution)

### 6.1 Automatische Lösungsvorschläge

Die Rule Engine generiert für jede Violation Lösungsvorschläge:

| Rule-Typ | Lösungs-Strategie | Beispiel |
|----------|-------------------|---------|
| `requires` (fehlt) | `add_clause` | "Fügen Sie die Gewährleistungsklausel hinzu." |
| `forbids` (vorhanden) | `remove_clause` oder `replace_clause` | "Entfernen Sie die Drittanbieterklausel." |
| `incompatible_with` | `replace_clause` | "Wählen Sie Pauschal ODER Stunde." |
| `scoped_to` (Mismatch) | `remove_clause` | "Diese Klausel ist für AT nicht verfügbar. Entfernen." |
| `requires_answer` | `add_clause` | "Fügen Sie die Datenschutzklausel hinzu." |

### 6.2 Automatische Resolution-Optionen

```json
{
  "resolutionOptions": [
    {
      "action": "add_clause",
      "targetClauseId": "uuid",
      "label": "Gewährleistungsklausel hinzufügen",
      "autoApplicable": true
    },
    {
      "action": "remove_clause",
      "targetClauseId": "uuid",
      "label": "Drittanbieterklausel entfernen",
      "autoApplicable": true
    },
    {
      "action": "replace_clause",
      "targetClauseId": "uuid-alt",
      "replacementClauseId": "uuid-neu",
      "label": "Nicht-exklusive Variante wählen",
      "autoApplicable": false
    }
  ]
}
```

**autoApplicable:** Gibt an, ob die Lösung mit einem Klick anwendbar ist (ohne weitere Nutzer-Interaktion). `replace_clause` ist typischerweise `false`, da der Nutzer die Alternative bestätigen muss.

---

## 7. Rule-Definition durch Publisher

### 7.1 UI für Rule-Erstellung (Redaktionsansicht)

```
┌──────────────────────────────────────────────────┐
│  Klausel: Haftungsausschluss (v3 Draft)          │
├──────────────────────────────────────────────────┤
│                                                   │
│  KONSISTENZREGELN (3)                             │
│                                                   │
│  ┌────────────────────────────────────────────┐  │
│  │ ① requires: Gewährleistung (Standard)      │  │
│  │    Severity: ⚠ Soft (Empfehlung)           │  │
│  │    Message: "Haftungsausschluss empfiehlt   │  │
│  │    eine Gewährleistungsklausel."            │  │
│  │    [Bearbeiten] [Löschen]                   │  │
│  └────────────────────────────────────────────┘  │
│                                                   │
│  ┌────────────────────────────────────────────┐  │
│  │ ② incompatible_with: Haftungsbegrenzung    │  │
│  │    Severity: 🔴 Hard (Blockiert Export)     │  │
│  │    Message: "Haftungsausschluss und         │  │
│  │    Haftungsbegrenzung sind unvereinbar."    │  │
│  │    [Bearbeiten] [Löschen]                   │  │
│  └────────────────────────────────────────────┘  │
│                                                   │
│  ┌────────────────────────────────────────────┐  │
│  │ ③ scoped_to: DE, AT                        │  │
│  │    Severity: 🔴 Hard                        │  │
│  │    Message: "Nur für DE/AT anwendbar."      │  │
│  │    [Bearbeiten] [Löschen]                   │  │
│  └────────────────────────────────────────────┘  │
│                                                   │
│  [+ Regel hinzufügen]                             │
│                                                   │
└──────────────────────────────────────────────────┘
```

### 7.2 Rule-Validierung bei Publikation

Bei `submit` (draft → review) werden die Rules validiert:

| Prüfung | Beschreibung |
|---------|-------------|
| Referenzierte Klauseln existieren | Alle `targetClauseId` / `targetClauseIds` zeigen auf existierende Clauses |
| Keine Selbstreferenz | `targetClauseId` ≠ eigene `clauseId` |
| Keine Zyklen (requires) | DFS über requires-Graph |
| Message nicht leer | Jede Rule hat eine verständliche Fehlermeldung |
| Severity gesetzt | Jede Rule hat `hard` oder `soft` |
| Condition valide (requires_answer) | `questionId` existiert, Operator ist gültig |

---

## 8. Graph-Visualisierung (Tooling)

Für Publisher und Architekten: Eine Visualisierung des Rule-Graphen.

```
VERGÜTUNG                           HAFTUNG
═════════                           ═══════
┌──────────┐    INC     ┌──────────┐         ┌─────────────┐
│ Pauschal │◄──────────►│  Stunde  │         │ Haftungs-   │
│   (C03)  │            │  (C04)   │         │ ausschluss  │
└──────────┘            └──────────┘         │   (C06)     │
     ▲ INC                   ▲ INC           └──────┬──────┘
     │                       │                  │       │
     └───────────┬───────────┘             REQ(soft) INC(hard)
                 │                              │       │
            ┌────┴─────┐                        ▼       ▼
            │  Erfolg  │                ┌──────────┐ ┌─────────┐
            │  (C05)   │                │ Gewährl. │ │ Haftungs│
            │  DE only │                │ Standard │ │ begrenz.│
            └──────────┘                │  (C08)   │ │  (C07)  │
                                        └──────────┘ └─────────┘
                                             ▲ INC
LAUFZEIT                                     │
════════                                ┌────┴─────┐
┌──────────┐    INC     ┌──────────┐    │ Gewährl. │
│ Befristet│◄──────────►│Unbefristet│   │ Erweit.  │──REQ(soft)──→ Datenschutz
│  (C13)   │            │  (C14)   │    │  (C09)   │              DSGVO (C11)
└──────┬───┘            └────┬─────┘    │  DE only │
  REQ  │                REQ  │          └──────────┘
 (soft)│               (hard)│
       ▼                     ▼
  ┌──────────┐          ┌──────────┐
  │ Kündigung│          │ Kündigung│
  │  (C15)   │◄─────────│  (C15)   │
  └──────────┘          └──────────┘
       ▲
  REQ  │
 (hard)│
  ┌────┴─────┐
  │Wettbewerb│
  │ verbot   │
  │  (C12)   │
  │  DE only │
  └──────────┘
```

---

## 9. Performance-Überlegungen

### 9.1 Evaluierungs-Komplexität

| Metrik | MVP-Erwartung | Grenzwert |
|--------|--------------|-----------|
| Klauseln pro Vertrag | 5–20 | max 100 |
| Rules pro Klausel | 1–5 | max 20 |
| Total Rules pro Evaluierung | 5–100 | max 2000 |
| Evaluierungszeit (Backend) | < 50ms | < 200ms |

### 9.2 Optimierungen

1. **Caching:** Published-Rules werden beim Start der Vertragserstellung einmalig geladen und im Client gecacht.
2. **Incremental Evaluation:** Bei Slot-Änderung nur betroffene Rules neu evaluieren (nicht alle).
3. **Rule-Index:** Backend hält Index `clauseId → Rule[]` für schnellen Lookup.
4. **Batch-Evaluation:** Bei Auto-Save werden alle Rules in einem Request evaluiert.

---

## 10. Testing-Anforderungen

### 10.1 Unit-Tests (Rule Engine)

| Test | Beschreibung |
|------|-------------|
| requires — Klausel vorhanden | Keine Violation |
| requires — Klausel fehlt | Violation mit korrekter Message |
| requires (Set) — eine vorhanden | Keine Violation |
| requires (Set) — keine vorhanden | Violation |
| forbids — Klausel nicht vorhanden | Keine Violation |
| forbids — Klausel vorhanden | Violation |
| incompatible_with — beide vorhanden | Violation (symmetrisch) |
| incompatible_with — nur eine vorhanden | Keine Violation |
| scoped_to — Jurisdiktion passt | Keine Violation |
| scoped_to — Jurisdiktion passt nicht | Violation |
| requires_answer — Bedingung erfüllt | Violation wenn Klausel fehlt |
| requires_answer — Bedingung nicht erfüllt | Keine Violation |
| Zyklen-Erkennung | Zyklus wird gefunden |
| Hard/Soft Aggregation | Korrekter validationState |
| Leere Rule-Liste | validationState = valid |

### 10.2 Integration-Tests

| Test | Beschreibung |
|------|-------------|
| Vertrag mit allen Regeln evaluieren | E2E: Erstellen → Antworten → Validieren |
| Slot-Wechsel triggert Re-Evaluation | Änderung der Klausel-Auswahl → neue Validation |
| Hard Conflict blockiert Completion | `has_conflicts` → Completion-Endpoint gibt 409 |
| Soft Warning erlaubt Completion | `has_warnings` → Completion-Endpoint gibt 200 |
| Resolution anwenden löst Konflikt | add/remove/replace → Re-Evaluation → valid |

---

## 11. Offene Punkte

| # | Thema | Owner | Ziel-Sprint |
|---|-------|-------|-------------|
| 1 | Gewichtung bei mehreren Lösungsvorschlägen (Priorisierung) | Team 04 | Sprint 4 |
| 2 | Batch-Validation bei Template-Publish (alle möglichen Kombinationen) | Team 03 | Sprint 3 |
| 3 | Rule-Import/Export (JSON) für Redaktions-Tooling | Team 03 | Sprint 4 |
| 4 | Cross-Template-Rules (Klausel in Template A beeinflusst Template B) | Team 03 + 04 | Phase 2 |
| 5 | Natural-Language Rule Suggestions (AI-gestützt) | Team 01 | Phase 2 |
