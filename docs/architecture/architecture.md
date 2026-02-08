# MVP-Definition (Epics + Stories) & Packaging/Preismodell (SME-Kanzleien) – Verlagsszenario (DE)

## Kontext
- **Verlag (Deutschland, mittelgroß)** mit Kundenstamm in **Rechts- und Steuerkanzleien**
- Bisher: einfacher Rollout von **Musterverträgen (CD/Web)**
- Ziel: **kleine und mittlere Kanzleien** unter **Ressourcen- und Kostendruck**
- Differenzierung: **Guided Erstellung**, **Versionierung**, **Klausel-Konsistenz**, **Export (Word/LibreOffice)**, **Kanzlei-Templates**, **Security/DSGVO**, optional **On-Prem**

---

## Ziel-MVP (Outcome)
In <30 Minuten soll eine Kanzlei:
1) ein Muster auswählen,  
2) durch einen geführten Fragenflow gehen,  
3) einen widerspruchsfreien Vertrag erzeugen,  
4) speichern und als DOCX (und optional ODT) exportieren,  
5) als Kanzlei-Template wiederverwenden können.

---

# 1) Konkrete MVP-Definition (Epics + Stories)

## EPIC 1 – Mandantenfähigkeit & Identity (SME-ready)
**Ziel:** Kanzlei kann als Mandant starten, Nutzer einladen, Rollen vergeben.

### User Stories
- **E1.S1** Als Kanzlei-Admin kann ich einen Kanzlei-Mandanten anlegen (Name, Adresse, Default-Jurisdiktion, Sprache).
- **E1.S2** Als Kanzlei-Admin kann ich Nutzer einladen (E-Mail), Rollen vergeben (Admin, Editor, Nutzer).
- **E1.S3** Als Nutzer kann ich mich anmelden und sehe nur Daten meiner Kanzlei (Tenant Isolation).
- **E1.S4** Als Admin kann ich Berechtigungen für Templates/Verträge (lesen/schreiben/exportieren) steuern.
- **E1.S5** Als Admin kann ich grundlegende Security-Settings sehen (Passwortregeln/MFA optional, Session Timeout).

### Akzeptanzkriterien (Auszug)
- Alle Datenobjekte sind tenant-gescoped, Zugriffe werden serverseitig erzwungen.
- Audit-Events für Login, Invite, Role-Change vorhanden.

---

## EPIC 2 – Verlags-Content: Muster/Klauseln + Versionierung + Publishing
**Ziel:** Verlag kann Muster professionell pflegen und veröffentlichen; Kanzleien sehen nur „Published“.

### User Stories
- **E2.S1** Als Verlag-Redakteur kann ich eine Klausel anlegen (Text, Parameter, Tags, Jurisdiktion, Rechtsgebiet).
- **E2.S2** Als Verlag-Redakteur kann ich ein Muster anlegen, das aus Sections/Slots und Klausel-Referenzen besteht.
- **E2.S3** Als Verlag-Redakteur kann ich Versionen erstellen (immutable) und Status setzen: Draft → Review → Approved → Published.
- **E2.S4** Als Verlag-Admin kann ich Reviewer zuweisen und Freigaben erzwingen (Release Gate).
- **E2.S5** Als Kanzlei-Nutzer sehe ich nur „Published“-Versionen und erkenne den Stand (Version, Veröffentlichungsdatum).
- **E2.S6** Als Kanzlei kann ich Hinweise erhalten, wenn es neuere Versionen gibt (ohne Auto-Update).

### Akzeptanzkriterien
- Vertragserstellung nutzt immer eine eindeutige TemplateVersion/ClauseVersion (Pinning).
- Veröffentlichte Versionen sind unveränderlich; Änderungen erzeugen neue Version.

---

## EPIC 3 – Guided Contract Builder (Interview-Engine)
**Ziel:** Fragenflow führt zur Auswahl von Alternativen/Zusätzen; Erklärungen erhöhen Adoption.

### User Stories
- **E3.S1** Als Verlag-Redakteur kann ich zu einem Muster einen Fragenkatalog definieren (Fragetypen, Reihenfolge).
- **E3.S2** Als Verlag-Redakteur kann ich Conditional Logic definieren (wenn Antwort X, zeige Frage Y).
- **E3.S3** Als Kanzlei-Nutzer werde ich durch den Flow geführt (Progress, Zwischenspeichern, Zurück/Weiter).
- **E3.S4** Als Kanzlei-Nutzer sehe ich zu jeder Frage kurze Erläuterungen + „Mehr erfahren“ (fachliche Vertiefung).
- **E3.S5** Als Kanzlei-Nutzer kann ich eine Live-Preview/Outline sehen (mindestens Kapitelstruktur).

### Akzeptanzkriterien
- Flow ist für SME „idiotensicher“: klare Defaults, wenige Pflichtfelder, klare Sprache.
- Entwurf kann gespeichert und später fortgesetzt werden.

---

## EPIC 4 – Klausel-Konsistenz & Validierung (MVP Rules)
**Ziel:** Widersprüche werden verhindert oder erklärt; Vertrauen aufbauen.

### User Stories
- **E4.S1** Als Verlag-Redakteur kann ich pro Klausel Rules definieren: requires / forbids / incompatible_with / scoped_to / requires_answer.
- **E4.S2** Als System validiere ich bei der Publikation: keine offenen Konflikte, Rules vorhanden (Definition of Done).
- **E4.S3** Als Kanzlei-Nutzer erhalte ich beim Zusammenbau sofort Konfliktmeldungen mit Lösungsvorschlägen.
- **E4.S4** Als Kanzlei-Nutzer kann ich Konflikte auflösen (Alternative wählen, Zusatz entfernen) und sehe das Ergebnis.

### Akzeptanzkriterien
- Kein finaler Export möglich, wenn „hard conflicts“ bestehen.
- Konflikte sind verständlich formuliert (nicht technisch).

---

## EPIC 5 – Dokumentinstanzen: Speichern, Verwalten, Ableiten (Kanzlei)
**Ziel:** Kanzleien arbeiten wiederholt, nicht nur „one-off“.

### User Stories
- **E5.S1** Als Kanzlei-Nutzer kann ich erstellte Verträge speichern (Name, Mandant/Projekt, Tags).
- **E5.S2** Als Kanzlei-Nutzer kann ich aus einem Vertrag ein Kanzlei-Template ableiten („Clone as Template“).
- **E5.S3** Als Kanzlei kann ich eine Bibliothek eigener Templates verwalten (Versionierung light: Draft/Published).
- **E5.S4** Als Kanzlei kann ich Verträge suchen/filtern (mindestens nach Name/Tag/Datum).

### Akzeptanzkriterien
- Vertrag speichert Answers + TemplateVersion + ClauseVersions (Reproduzierbarkeit).
- Rechte: Templates können teamweit oder privat sein.

---

## EPIC 6 – Export (DOCX Pflicht, ODT optional) & Formatvorlagen
**Ziel:** Word-first, verlässlicher Export, Kanzlei-Branding.

### User Stories
- **E6.S1** Als Kanzlei kann ich einen Vertrag als **DOCX** exportieren, inklusive sauberer Nummerierung/Überschriften.
- **E6.S2** Als Kanzlei-Admin kann ich eine Formatvorlage/Style-Template auswählen (Default, Kanzlei-Branding).
- **E6.S3** Als Kanzlei kann ich Kopf-/Fußzeilen (Kanzleiname, Adresse) konfigurieren.
- **E6.S4 (optional)** Als Kanzlei kann ich als **ODT** exportieren (oder DOCX→ODT Konvertierung, isoliert).

### Akzeptanzkriterien
- Export muss bei den 2–3 MVP-Mustern „pixelstabil“ wirken (Listen, Überschriften, Seitenumbrüche).
- Styles sind zentral verwaltbar und wiederverwendbar.

---

## EPIC 7 – Security, Audit & DSGVO-Basics
**Ziel:** Mindeststandard für Kanzlei/Verlag + spätere Enterprise-Edition vorbereiten.

### User Stories
- **E7.S1** Als Admin sehe ich Audit-Logs (Login, Rollenwechsel, Publish, Export, Zugriff auf Dokument).
- **E7.S2** Als System verschlüssele ich Daten in transit und at rest.
- **E7.S3** Als Kanzlei-Admin kann ich Verträge löschen/archivieren (Retention-Policy optional).
- **E7.S4** Als Kanzlei kann ich meine Daten exportieren (Portabilität: Metadaten + Dokumente).

### Akzeptanzkriterien
- Auditlog ist tenant-gescoped und unveränderlich.
- DSGVO: Löschkonzept dokumentiert, minimale personenbezogene Daten im System.

---

## EPIC 8 – SME Onboarding & In-Product Hilfe (Adoption)
**Ziel:** „Time-to-first-contract“ minimieren, Supportkosten reduzieren.

### User Stories
- **E8.S1** Als neuer Nutzer bekomme ich ein Guided Onboarding (1–2 Minuten) mit erstem Beispielvertrag.
- **E8.S2** Als Nutzer sehe ich kontextuelle Hilfe (Tooltips, kurze Erklärungen).
- **E8.S3** Als Nutzer kann ich Feedback geben („War diese Frage hilfreich?“) – anonymisiert/tenant-optional.

### Akzeptanzkriterien
- Erster Vertrag (MVP-Muster) in <10 Minuten möglich.
- Hilfetexte sind redaktionell pflegbar.

---

## MVP-Inhalte (Empfehlung)
**Start mit 2–3 Mustern** aus dem bestehenden Verlagssortiment (nach Nutzung):
- Muster A (häufig, standardisiert, geringer Sonderfallanteil)
- Muster B (häufig, klarer Fragenflow)
- Muster C (optional, wenn Export/Regeln stabil)

Pro Muster:
- 10–30 Klauseln
- 15–40 Fragen
- 20–60 Rules (requires/forbids/incompatibilities), je nach Komplexität

---

# 2) Packaging & Preismodell (SME-Kanzleien)

## Grundprinzipien (für SME)
- **Einfach** (wenige Pakete), klare Limits (Nutzer/Template-Anzahl/Exports)
- **Schneller Start**: Self-service, kein Projekt
- **Upsell** über Teams, Kanzlei-Templates, erweiterte Audit/SSO/On-Prem

> Zahlen sind Platzhalter zur Preislogik; finale Werte hängen von Content/Support-Kosten und Wettbewerb ab.

---

## Paket 1: **Starter (Solo)**
**Zielgruppe:** Einzelanwalt / sehr kleine Kanzlei (1–2 Nutzer)

**Inklusive**
- Zugriff auf **veröffentlichte Verlagsmuster (MVP-Katalog)**
- Guided Erstellung + Konsistenzprüfung
- Speichern von Verträgen
- DOCX Export
- 1 Standard-Style

**Limits**
- Bis 2 Nutzer
- Begrenzte Anzahl Kanzlei-Templates (z. B. 5)

**Preismodelle**
- Monatliches Abo (Entry-Level)
- Optional: rabattierte Jahreszahlung

---

## Paket 2: **Team (SME-Kanzlei)**
**Zielgruppe:** kleine/mittlere Kanzleien (3–20 Nutzer)

**Inklusive (alles aus Starter +)**
- Team-Rollen (Admin/Editor/User)
- Kanzlei-Template-Bibliothek (z. B. 50 Templates)
- Erweiterte Suche/Filter
- Style-Management: mehrere Styles, Kanzlei-Branding (Header/Footer)
- Basic Audit-Logs (z. B. 90 Tage)

**Limits**
- Nutzerstaffel (z. B. 3–20)
- API: noch nicht enthalten oder „Read-only“ (optional)

**Preismodelle**
- Abo pro Kanzlei + Nutzerstaffel (oder pro Nutzer mit Mindestpreis)

---

## Paket 3: **Pro (Compliance & Productivity)**
**Zielgruppe:** Kanzleien mit höherem Standardisierungsbedarf (10–50 Nutzer)

**Inklusive (alles aus Team +)**
- Erweiterte Audit-Logs (z. B. 365 Tage)
- Export-Erweiterungen (z. B. Batch Export, Wasserzeichen, Vorlagen-Sets)
- Erweiterte Kanzlei-Standards (Policy-Layer light: bevorzugte Alternativen)
- Optional: ODT Export (wenn umgesetzt)

**Preismodelle**
- Höherer Kanzlei-Grundpreis + Nutzerstaffel
- Optional: Add-on „Advanced Styles“

---

## Paket 4: **Enterprise / On-Prem (Premium Edition)**
**Zielgruppe:** größere Kanzleien/regulierte Branchen/IT-Security-Heavy

**Inklusive (alles aus Pro +)**
- **On-Prem Deployment** (Kubernetes/VM)
- SSO (SAML/OIDC), ggf. SCIM
- BYOK/HSM-Integration (optional)
- SIEM-Export, erweiterte Compliance Reports
- SLA/Supportvertrag

**Preismodelle**
- Jahreslizenz + Setup + Wartung/Support
- Optional: „Tenant pro Environment“ (Prod/Staging)

---

## Add-ons (Cross-Sell, später)
- **Weitere Musterpakete/Rechtsgebiete** (Content Bundles)
- **Word-Add-in** (Adoption Booster)
- **Public API** (Integrationen in DMS/CRM)
- **Signatur-Integration** (FP-Design Adapter) inkl. Workflows & Webhooks

---

# 3) KPI/Erfolgsmessung (MVP)
- **Time-to-first-contract** (Ziel: <10 Min)
- **Completion Rate** im Guided Flow
- **Konflikt-Rate** (wie oft treten Rules-Konflikte auf, wie schnell gelöst)
- **Export Success Rate** (DOCX ohne Formatprobleme)
- **Retention**: Verträge/Template-Reuse pro Kanzlei (monatlich)
- **Support Tickets pro 100 Kanzleien** (Kostenkontrolle)

---

# 4) Risiken & Mitigations (SME-Fokus)
## Hauptrisiken
1. **Export-Qualität** (Formatfehler killen Vertrauen)
2. **Content-Pflege** (Aktualität/Haftung/Governance)
3. **Onboarding-Komplexität** (SME bricht schnell ab)
4. **Regel-Engine** (zu schwach → Widersprüche; zu komplex → Pflegeaufwand)

## Mitigation
- Export: zuerst nur 2–3 Muster „perfekt“, klare Style-Defaults, Test-Suite pro Muster
- Content: strenger Redaktionsworkflow, Release Gates, klare „Gültig ab/bis“ Metadaten, Changelog
- Onboarding: Setup Wizard, Templates out-of-the-box, In-App Hilfe, „Demo-Fall“ mit Ergebnis
- Regeln: MVP-Constraints, klare Konventionen, automatisch generierte Konfliktreports für Redaktion

---

## Nächste Schritte (konkret)
1. **Top-10 Muster** aus CD/Web nach Nutzung identifizieren → daraus 2–3 MVP-Muster auswählen
2. Für jedes Muster: Questions/Rules/Clauses definieren (Redaktionsworkshop)
3. DOCX-Template/Styles definieren (Kanzlei-Branding minimal)
4. Pilot mit 5–10 Kanzleien aus Bestandskundenstamm (Feedback zu Flow/Export/Konflikten)
