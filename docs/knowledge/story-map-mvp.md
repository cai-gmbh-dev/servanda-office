# Story-Map MVP — Priorisiert nach Epics

**Status:** Final Draft
**Datum:** 2026-02-10
**Owner:** Team 01 (Product Architecture)

---

## Priorisierungsprinzip

Stories sind nach **Abhängigkeitskette** und **MVP-Kritikalität** priorisiert:

1. **P0 (Blocker):** Ohne diese Story kann nichts anderes gebaut werden.
2. **P1 (Kern):** Kern-MVP-Funktionalität, muss für ersten Piloten vorhanden sein.
3. **P2 (Wichtig):** Wichtig für MVP-Qualität, aber nicht blocking für andere Stories.
4. **P3 (Nice-to-have):** Wertvoll, kann aber nach MVP-Launch nachgeliefert werden.

---

## Release-Planung (3 Slices)

```text
Slice 1: FOUNDATION          Slice 2: CORE FLOW           Slice 3: POLISH & LAUNCH
(Sprint 1-2)                 (Sprint 3-5)                 (Sprint 6-7)
─────────────────────        ─────────────────────        ─────────────────────
Tenant + Identity            Guided Contract Builder      Onboarding Wizard
DB + RLS Setup               Rule-Validation live         In-Product Hilfe
Content CRUD + Versioning    Version-Pinning E2E          ODT Export (Beta)
Publishing Workflow          DOCX Export                  Search & Filter
Interview Flow Design        Kanzlei-Templates            Advanced Audit
Basic Audit                  Conflict Resolution          Style-Management
                                                          Performance Tuning
```

---

## Story-Map nach Epic

### EPIC 1 — Mandantenfähigkeit & Identity

| Prio | Story-ID | Story | Sprint | Team | Abhängigkeit |
| --- | --- | --- | --- | --- | --- |
| P0 | E1.S0 | DB-Schema + RLS-Policies aufsetzen (ADR-001) | 1 | 02, 07 | — |
| P0 | E1.S1 | Kanzlei-Mandant anlegen (Name, Adresse, Jurisdiktion, Sprache) | 1 | 02 | E1.S0 |
| P0 | E1.S2 | Nutzer einladen (E-Mail), Rollen vergeben (Admin, Editor, User) | 1 | 02 | E1.S1 |
| P0 | E1.S3 | Login + Tenant-Isolation (nur eigene Daten sichtbar) | 1 | 02 | E1.S0, E1.S2 |
| P1 | E1.S4 | Berechtigungen für Templates/Verträge steuern (RBAC) | 2 | 02 | E1.S3 |
| P2 | E1.S5 | Security-Settings (Passwortregeln, MFA optional, Session Timeout) | 3 | 02 | E1.S3 |

**Akzeptanz-Gate:** Cross-Tenant-Zugriff scheitert in CI (ADR-001 Test).

---

### EPIC 2 — Verlags-Content: Muster/Klauseln + Versionierung + Publishing

| Prio | Story-ID | Story | Sprint | Team | Abhängigkeit |
| --- | --- | --- | --- | --- | --- |
| P0 | E2.S1 | Klausel anlegen (Text, Parameter, Tags, Jurisdiktion) | 2 | 03 | E1.S0 |
| P0 | E2.S2 | Muster/Template anlegen (Sections, Slots, Klausel-Referenzen) | 2 | 03 | E2.S1 |
| P0 | E2.S3 | Versionen erstellen (immutable) + Status-Workflow (Draft→Published) | 2 | 03 | E2.S1 |
| P1 | E2.S4 | Reviewer zuweisen + Freigabe erzwingen (Release Gate) | 2 | 03 | E2.S3 |
| P1 | E2.S5 | Kanzlei sieht nur Published-Versionen (Version + Datum) | 3 | 03, 04 | E2.S3, E1.S3 |
| P2 | E2.S6 | Hinweis bei neueren Versionen (kein Auto-Update) | 4 | 03, 04 | E2.S5 |

**Akzeptanz-Gate:** Published-Versionen sind immutable. Nicht-Published für Kanzlei unsichtbar.

---

### EPIC 3 — Guided Contract Builder (Interview-Engine)

| Prio | Story-ID | Story | Sprint | Team | Abhängigkeit |
| --- | --- | --- | --- | --- | --- |
| P0 | E3.S1 | Fragenkatalog definieren (Fragetypen, Reihenfolge) | 2 | 04, 03 | E2.S2 |
| P1 | E3.S2 | Conditional Logic (wenn Antwort X → zeige Frage Y) | 3 | 04 | E3.S1 |
| P1 | E3.S3 | Geführter Flow (Progress, Zwischenspeichern, Zurück/Weiter) | 3 | 04 | E3.S1 |
| P2 | E3.S4 | Erläuterungen + "Mehr erfahren" pro Frage | 4 | 04, 03 | E3.S3 |
| P2 | E3.S5 | Live-Preview/Outline (Kapitelstruktur) | 4 | 04 | E3.S3 |

**Akzeptanz-Gate:** Entwurf kann gespeichert und später fortgesetzt werden.

---

### EPIC 4 — Klausel-Konsistenz & Validierung (MVP Rules)

| Prio | Story-ID | Story | Sprint | Team | Abhängigkeit |
| --- | --- | --- | --- | --- | --- |
| P0 | E4.S1 | Rules definieren pro Klausel (requires/forbids/incompatible_with/scoped_to/requires_answer) | 2 | 03, 04 | E2.S1 |
| P1 | E4.S2 | Validierung bei Publikation (keine offenen Konflikte, Rules vorhanden) | 3 | 03 | E4.S1, E2.S3 |
| P1 | E4.S3 | Live-Konfliktmeldungen beim Zusammenbau + Lösungsvorschläge | 4 | 04 | E4.S1, E3.S3 |
| P1 | E4.S4 | Konflikte auflösen (Alternative wählen, Zusatz entfernen) | 4 | 04 | E4.S3 |

**Akzeptanz-Gate:** Kein Export bei Hard Conflicts. Konflikte verständlich formuliert.

---

### EPIC 5 — Dokumentinstanzen: Speichern, Verwalten, Ableiten

| Prio | Story-ID | Story | Sprint | Team | Abhängigkeit |
| --- | --- | --- | --- | --- | --- |
| P1 | E5.S1 | Vertrag speichern (Name, Mandant/Projekt, Tags) + Version-Pinning | 3 | 04 | E3.S3, ADR-002 |
| P1 | E5.S2 | Vertrag als Kanzlei-Template ableiten ("Clone as Template") | 5 | 04 | E5.S1 |
| P2 | E5.S3 | Bibliothek eigener Templates verwalten (Draft/Published) | 5 | 04 | E5.S2 |
| P2 | E5.S4 | Verträge suchen/filtern (Name, Tag, Datum) | 6 | 04 | E5.S1 |

**Akzeptanz-Gate:** Vertrag speichert Answers + gepinnte Versions (Reproduzierbarkeit).

---

### EPIC 6 — Export (DOCX Pflicht, ODT optional)

| Prio | Story-ID | Story | Sprint | Team | Abhängigkeit |
| --- | --- | --- | --- | --- | --- |
| P0 | E6.S0 | Export-Service Infrastruktur (Job-Queue, Worker, Object Storage) (ADR-003) | 3 | 05, 07 | E1.S0 |
| P1 | E6.S1 | DOCX Export (saubere Nummerierung/Überschriften) | 4 | 05 | E6.S0, E5.S1 |
| P2 | E6.S2 | Formatvorlage/Style-Template auswählen (Default + Kanzlei-Branding) | 5 | 05 | E6.S1 |
| P2 | E6.S3 | Kopf-/Fußzeilen konfigurieren (Kanzleiname, Adresse) | 5 | 05 | E6.S2 |
| P3 | E6.S4 | ODT Export (DOCX→ODT Konvertierung, Beta) (ADR-004) | 6 | 05, 07 | E6.S1 |

**Akzeptanz-Gate:** DOCX bei 2-3 MVP-Mustern "pixelstabil" (Listen, Überschriften, Seitenumbrüche).

---

### EPIC 7 — Security, Audit & DSGVO-Basics

| Prio | Story-ID | Story | Sprint | Team | Abhängigkeit |
| --- | --- | --- | --- | --- | --- |
| P0 | E7.S0 | Audit-Event-Infrastruktur (append-only, tenant-gescoped) | 2 | 02 | E1.S0 |
| P1 | E7.S1 | Audit-Logs einsehen (Login, Rollenwechsel, Publish, Export, Zugriff) | 4 | 02 | E7.S0 |
| P1 | E7.S2 | Verschlüsselung in transit (TLS) und at rest (DB TDE, SSE) | 3 | 07 | E1.S0 |
| P2 | E7.S3 | Verträge löschen/archivieren (Retention optional) | 5 | 04, 02 | E5.S1 |
| P2 | E7.S4 | Daten exportieren (Portabilität: Metadaten + Dokumente) | 6 | 05, 02 | E5.S1, E6.S1 |

**Akzeptanz-Gate:** Auditlog tenant-gescoped, immutable. Löschkonzept dokumentiert.

---

### EPIC 8 — SME Onboarding & In-Product Hilfe

| Prio | Story-ID | Story | Sprint | Team | Abhängigkeit |
| --- | --- | --- | --- | --- | --- |
| P2 | E8.S1 | Guided Onboarding (1-2 Min.) mit erstem Beispielvertrag | 6 | 04 | E3.S3, E6.S1 |
| P2 | E8.S2 | Kontextuelle Hilfe (Tooltips, kurze Erklärungen) | 6 | 04, 03 | E3.S3 |
| P3 | E8.S3 | Feedback-Widget ("War diese Frage hilfreich?") | 7 | 04 | E8.S2 |

**Akzeptanz-Gate:** Erster Vertrag in <10 Minuten möglich. Hilfetexte redaktionell pflegbar.

---

## Abhängigkeitsgraph (kritischer Pfad)

```text
E1.S0 (DB+RLS) ──────────────────────────────────────────────────────┐
  │                                                                    │
  ├→ E1.S1 (Tenant) → E1.S2 (Users) → E1.S3 (Login+Isolation)       │
  │                                        │                           │
  ├→ E2.S1 (Clause) → E2.S2 (Template) → E2.S3 (Versioning)         │
  │    │                    │                  │                        │
  │    │                    │                  ├→ E2.S4 (Release Gate) │
  │    │                    │                  │                        │
  │    ├→ E4.S1 (Rules) ───┤                  ├→ E2.S5 (Published)    │
  │    │                    │                  │                        │
  │    │                    ├→ E3.S1 (Questions)                       │
  │    │                    │    │                                      │
  │    │                    │    ├→ E3.S2 (Conditions)                 │
  │    │                    │    ├→ E3.S3 (Flow UI)                    │
  │    │                    │         │                                 │
  │    │                    │         ├→ E5.S1 (Vertrag speichern)     │
  │    │                    │         │    │                            │
  │    │                    │         │    ├→ E5.S2 (Clone Template)   │
  │    │                    │         │                                 │
  │    │                    │         ├→ E4.S3 (Konflikt-UI)           │
  │    │                    │                                          │
  ├→ E6.S0 (Export Infra) ──────────→ E6.S1 (DOCX Export)            │
  │                                        │                           │
  │                                        ├→ E6.S2 (Styles)          │
  │                                        ├→ E6.S4 (ODT Beta)        │
  │                                                                    │
  ├→ E7.S0 (Audit Infra) ──→ E7.S1 (Audit UI)                       │
  └→ E7.S2 (Encryption)                                               │
                                                                       │
KRITISCHER PFAD:                                                       │
E1.S0 → E2.S1 → E2.S2 → E3.S1 → E3.S3 → E5.S1 → E6.S1             │
(DB)    (Clause) (Templ) (Q&A)   (Flow)  (Save)   (Export)           │
```

---

## Sprint-Zuordnung (Zusammenfassung)

| Sprint | Fokus | Stories | Meilenstein |
| --- | --- | --- | --- |
| **1** | Foundation | E1.S0, E1.S1, E1.S2, E1.S3 | Tenant-Isolation funktionsfähig |
| **2** | Content + Rules | E2.S1-S4, E3.S1, E4.S1, E7.S0, E1.S4 | Klausel/Template CRUD + Versioning |
| **3** | Builder + Export Infra | E3.S2, E3.S3, E5.S1, E6.S0, E7.S2, E4.S2 | Geführter Flow + Speichern funktionsfähig |
| **4** | Validation + DOCX | E4.S3, E4.S4, E6.S1, E7.S1, E2.S5, E3.S4, E3.S5 | Erster vollständiger Vertrag + Export |
| **5** | Templates + Styles | E5.S2, E5.S3, E6.S2, E6.S3, E7.S3, E2.S6 | Kanzlei-Templates + Branding |
| **6** | Polish + ODT | E5.S4, E6.S4, E7.S4, E8.S1, E8.S2 | ODT Beta, Onboarding, Suche |
| **7** | Launch-Ready | E1.S5, E8.S3, Performance Tuning, Bug Fixing | MVP-Launch |

---

## Pilot-Kriterien (MVP-Launch)

Der MVP ist pilot-ready wenn:

- [ ] 2-3 Muster vollständig mit Fragen/Rules/Klauseln gepflegt
- [ ] Geführter Flow von Template-Auswahl bis DOCX-Export funktioniert E2E
- [ ] Tenant-Isolation in CI verifiziert (ADR-001 Tests grün)
- [ ] Version-Pinning verifiziert (ADR-002 Tests grün)
- [ ] Kein Hard Conflict erlaubt Export
- [ ] DOCX "pixelstabil" bei MVP-Mustern
- [ ] Audit-Logs vollständig und tenant-gescoped
- [ ] Erster Vertrag in <10 Minuten möglich (Usability-Test)
- [ ] Lighthouse Performance ≥90, Accessibility ≥90
