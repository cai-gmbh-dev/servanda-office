# Briefing für Software-Architekt: Mandantenfähige Legal-Tech-Plattform für Vertrags-/Dokumenten-Services

## 1) Zielbild und Produktvision
Wir entwickeln eine **Plattform (Cloud & On-Premise-fähig)**, auf der **Verlage (Vendors)** Vertrags- und Dokumentenmuster bereitstellen und pflegen können. **Mandanten** (Einzelperson oder Kanzlei) erstellen daraus **geführte, konsistente Verträge** (Q&A-Flow), speichern diese, leiten eigene Muster ab und exportieren in **Word/LibreOffice**. Die Plattform muss **mandantenfähig**, **hoch-sicher**, **DSGVO/Europa-konform** sein und später **API-Integration + Signatur-Integration** ermöglichen.

---

## 2) Rollen / Personas & Kern-Use-Cases
### Rollen
1. **Plattform-Admin (Betreiber)**: Systembetrieb, Mandantenverwaltung, Policies, Key-Management, Audits.  
2. **Verlag-Admin**: Verlag konfigurieren, Autoren/Redakteure verwalten, Muster freigeben.  
3. **Autor/Redakteur**: Muster/Klauseln erstellen, pflegen, versionieren, veröffentlichen; optional „nur für einen Verlag“ arbeiten.  
4. **Mandant (Einzelperson/Kanzlei)**: Muster nutzen, guided contract generation, eigene Muster erstellen/ableiten, Dokumente verwalten/exportieren.  
5. **Kanzlei-Org-Admin** (optional): User/Teams/Rechte, Kanzlei-Templates, Zugriffspolicies.

### Kern-Use-Cases
- Verlag stellt **Musterkatalog** bereit (mit Metadaten, Jurisdiktion, Gültigkeit, Versionen).
- Autoren pflegen Muster/Klauseln **mit Versionierung, Review, Freigabe, Publikation**.
- Mandant beantwortet Fragen → System assembliert Vertrag aus Grundmustern/Alternativen/Zusätzen.
- **Klausel-Konsistenz**: System verhindert widersprüchliche Klauselkombinationen (Regeln + fachliche Vorgaben).
- Speicherung, Reuse als eigenes Muster, Export (DOCX/ODT), Verwaltung von Formatvorlagen.
- Später: API für Integration in Drittsysteme + Signatur/Unterzeichnung (FP-Design).

---

## 3) Produktumfang (MVP vs. Ausbaustufen)

### MVP (Release 1)
#### Content & Publishing
- Klausel-/Muster-Repository je Verlag
- Versionierung (semantisch + Stand/Status)
- Workflow: Draft → Review → Approved → Published → Deprecated
- Rollen & Rechte (RBAC) inkl. “Autor nur für Verlag X”

#### Contract Builder
- Q&A-Flow (geführte Erstellung) inkl. Erläuterungen (vertraglich + thematische Vertiefung)
- Assemblierung aus: Grundmuster + Alternativen + Zusätzen
- Klausel-Konsistenzprüfung (regelbasiert, inkl. Konfliktmatrix/Constraints)
- Speichern von erstellten Verträgen + Ableitung eigener Muster

#### Export & Styles
- Export nach DOCX (Pflicht), ODT (optional im MVP, je Aufwand)
- Verwaltung von Formatvorlagen (Basis: docx-template + Styles)

#### Mandantenfähigkeit & Security
- Multi-Tenant, Tenant-Isolation (mind. logisch; optional physisch je On-Prem)
- Verschlüsselung: in transit + at rest, optional tenant-spezifische Keys
- Audit-Logs, Berechtigungen, Datenhaltung EU-konform

### Roadmap (Release 2+)
- Öffentliche/Partner-API (REST/GraphQL) + Webhooks
- Signatur-Integration + API-Adapter zu „FP-Design“ (inkl. Signatur-Status/Events)
- Clause-rule-engine ausbaubar (z.B. formale Logik, Constraints, Jurisdiction-Scoping)
- Mehrsprachigkeit, Mandanten-spezifische Klauselbibliotheken
- Content-Marketplace / Monetarisierung pro Verlag

---

## 4) Funktionale Anforderungen (kompakt, aber architekturrelevant)

### 4.1 Mandantenfähigkeit / Tenancy
- **Tenant-Typen**: Verlag, Kanzlei, Einzelmandant (jeweils eigenständige Tenants oder Sub-Tenants)
- **Isolation**:
  - Daten: Tenant-ID Pflicht auf allen Datenobjekten
  - Optional: separate Datenbanken je Tenant (On-Prem/Enterprise)
- **Rechte**:
  - Systemweite RBAC + Tenant-RBAC
  - Objektbasierte ACL für Muster/Verträge (z.B. „nur Kanzlei-Team A“)

### 4.2 Content-Modell (Klauseln, Muster, Bausteine)
- **Klausel**: textlicher Baustein + Parameter/Variablen + Metadaten
- **Muster (Template)**: Struktur/Gliederung + Referenzen auf Klauseln/Slots
- **Alternative**: Auswahlknoten (entweder/oder)
- **Zusatz**: optionaler Baustein (add-on)
- **Metadaten**: Jurisdiktion, Rechtsgebiet, Zielgruppe, Gültig ab/bis, Tags, Sprache, Publisher

### 4.3 Versionierung & Status
- Version pro Klausel und pro Muster (immutable Versionen)
- Status-Übergänge mit Audit:
  - Draft → Review → Approved → Published (nur Published ist mandanten-sichtbar)
- „Stand“: Aktuelle veröffentlichte Version + Historie + Deprecation-Regeln
- Verträge speichern mit **„version pinning“** (welche Klausel-/Muster-Versionen wurden verwendet)

### 4.4 Konsistenz / Widerspruchsfreiheit
- **Regelmodell** (MVP pragmatisch):
  - Klausel-Constraints: `requires`, `forbids`, `incompatible_with`, `depends_on_answer`, `jurisdiction_scope`
  - Konfliktmatrix + Validierungsregeln beim Zusammenbau
- **Fachliche Prüfung**: Workflow mit Review/Approval erzwingt, dass Klauseln Regeln tragen müssen (Definition of Done)
- UI: Konflikte erklären + Lösungsvorschläge (z.B. „Alternative A statt B“)

### 4.5 Guided User Experience (Fragen & Erläuterungen)
- Fragebogen/Interview-Engine:
  - Fragetypen (Single/Multiple Choice, Text, Datum, Betrag)
  - Conditional Logic (wenn Antwort X → Frage Y)
  - Erläuterungen pro Frage + Deep-Dive-Artikel/FAQ
- Ergebnis: Contract Assembly + Preview + Änderungsmodus

### 4.6 Speicherung, Reuse, eigene Muster
- Vertrag als „Document Instance“ im Mandantenbereich
- Ableitung als eigenes Muster („Clone as Template“) inkl. Rechte/Team-Sichtbarkeit
- Vorlagenverwaltung (Layout/Format)

### 4.7 Export
- DOCX Export: Template-basierter Generator (Styles, Header/Footer, Nummerierung)
- ODT/LibreOffice:
  - Option A: ODT native Generierung
  - Option B: DOCX → ODT Konvertierung serverseitig (On-Prem: LibreOffice headless) – sicherheitlich isoliert

### 4.8 API & Integrationen (später)
- Public API: Auth (OAuth2/OIDC), Tenant-Scoping, Rate Limits
- Signatur-API Adapter: Dokument übergeben, Signatur-Workflow starten, Status-Callback, signed PDF zurückführen

---

## 5) Nicht-funktionale Anforderungen (NFR) – „höchste Sicherheitsanforderungen“
### Security
- TLS überall, HSTS, sichere Cookies, CSP
- Verschlüsselung at rest (DB + Object Storage)
- Tenant-spezifische Schlüssel möglich (KMS/HSM); On-Prem: BYOK/HSM-Integration
- Least Privilege (RBAC/ABAC), vollständige Audit-Trails (wer hat was gesehen/geändert/exportiert)
- Secrets Management (Vault o.ä.), regelmäßige Rotation
- Secure SDLC, SAST/DAST, Dependency Scanning, SBOM

### Datenschutz / EU
- DSGVO: Data Minimization, Zweckbindung, Löschkonzepte, Export/Portabilität
- Auftragsverarbeitung: Mandantenrollen, Logging, TOMs
- Datenresidenz EU (Cloud) + On-Prem Option
- Optional: ISO 27001-Ausrichtung, BSI/Grundschutz-Anleihen (je Zielmarkt)

### Betrieb
- Cloud & On-Prem: Kubernetes-fähig oder alternativ „single-node“ für kleine On-Prem
- Observability: Metrics/Logs/Traces, SIEM-Export
- Backup/Restore, DR-Konzept, Migrationen
- Performance: schnelle Suche/Preview, Caching, skalierbarer Export-Service

---

## 6) Architekturvorschlag (Start-Architektur)
**Empfehlung: modulare Plattform (modular monolith oder service-orientiert), sauber getrennte Domänen, API-first.**

### 6.1 Domänen / Komponenten
1. **Identity & Access**  
   - OIDC/SAML (Enterprise), MFA, RBAC/ABAC, Tenant Context
2. **Tenant & Org Management**
   - Tenants, Sub-Tenants, Teams, Policies
3. **Content Service (Publisher)**
   - Klauseln, Muster, Regeln, Versionen, Workflow, Freigabe
4. **Interview/Guidance Service**
   - Fragebögen, Conditions, Erläuterungen, Knowledge-Artikel
5. **Assembly/Validation Engine**
   - Auswahl/Composition, Regelprüfung, Konfliktauflösung, Rendering-Model
6. **Document Storage**
   - Verträge, eigene Muster, Attachments, immutable snapshots
7. **Export Service**
   - DOCX/ODT Generierung, Template/Style Management
8. **Audit & Compliance**
   - Auditlog, Data Access Log, Reports
9. **Public API Gateway (später)**
   - Rate limiting, keys, scopes
10. **Signature Integration Adapter (später)**
   - Connector zu FP-Design

### 6.2 Datenhaltung
- **Relationale DB** (PostgreSQL) für Metadaten, Versionen, Rechte
- **Object Storage** (S3-kompatibel / MinIO On-Prem) für Binärartefakte (DOCX, Attachments)
- **Search Index** (OpenSearch/Elasticsearch) optional: Volltextsuche über Klauseln/Muster/Knowledge

### 6.3 Mandanten-Isolation (technische Leitlinie)
- Default: shared DB + Tenant-ID + Row-Level Security (Postgres RLS) **oder** strikt in Applikationslayer enforced (RLS bevorzugt)
- Enterprise/On-Prem: optional „DB pro Tenant“ (Konfigurationsflag)
- Object Storage: Bucket/Prefix pro Tenant + serverseitige Verschlüsselung + ggf. per-tenant keys

---

## 7) Kern-Datenmodell (Startpunkt für Architekt)
### Objekte (vereinfacht)
- `Tenant` (type: vendor / lawfirm / individual)
- `User`, `Team`, `Role`, `Permission`, `Policy`
- `Clause` (logical id)  
  - `ClauseVersion` (immutable): content, parameters, metadata, rules, status
- `Template` (Muster logical id)  
  - `TemplateVersion`: structure (sections, slots), references, status
- `Rule` (embedded in ClauseVersion oder separate Rule-Entity)
- `InterviewFlow` + `Question` + `Condition` + `Explanation`
- `ContractInstance` (created by tenant user)
  - references `TemplateVersion` + list of `ClauseVersion` used + answers snapshot
- `StyleTemplate` (docx/odt styles)
- `AuditEvent` (who, what, when, tenant, object, diff pointers)

**Wichtig: „Immutable Versions“ + „Pins“**  
Verträge müssen exakt reproduzierbar bleiben, auch wenn Muster sich weiterentwickeln.

---

## 8) Konsistenzprüfung: MVP-Regelwerk (konkret genug zum Bauen)
### Regeltypen
- `requires`: Klausel A benötigt Klausel B (oder eine aus Set)
- `forbids`: Klausel A verbietet Klausel B
- `incompatible_with`: symmetrischer Konflikt
- `scoped_to`: gilt nur für Jurisdiktion X / Vertragstyp Y
- `requires_answer`: hängt an Interview-Antwort (z.B. „nur wenn Mitarbeiter > 10“)

### Validierungszeitpunkte
1. Beim Publizieren (Vendor QA): „Regeln vollständig?“ „Keine offenen Konflikte?“  
2. Beim Zusammenbau (Mandant): Sofortige Konfliktanzeige + Vorschläge  
3. Beim Speichern: finaler Validator + Snapshot  

---

## 9) UX-Prinzipien (für technische Umsetzung relevant)
- **Wizard/Interview** mit Progress, Kontext, Inline-Preview
- **Erklärungen**: Kurzinfo + „Mehr erfahren“ (Knowledge Artikel)
- **Konflikte**: verständliche Meldung, „Warum?“ + Klick zum Fix
- **Version-Transparenz**: „Dieses Dokument basiert auf Muster vX.Y“ + Hinweis bei neueren Versionen (ohne automatische Änderung)

---

## 10) Security-by-Design: Minimum Controls (Startdefinition)
- OIDC/SAML, MFA optional, Passwortpolicy falls local auth
- Granulare Berechtigungen: Lesen/Schreiben/Veröffentlichen/Exportieren
- Audit:  
  - Content-Änderungen (diff), Publikationsereignisse  
  - Zugriff auf Mandantenverträge (Data Access Log)
- Verschlüsselung:
  - TLS 1.2+ (besser 1.3)
  - DB TDE + Field-level encryption für besonders sensible Felder (optional)
  - Per-Tenant key wrapping (KMS/HSM)
- On-Prem Hardening: separate Services, minimal privileges, network policies

---

## 11) Deployment- und Betriebsanforderungen (Cloud & On-Prem)
- Containerisierung (Docker) + Orchestrierung (Kubernetes empfohlen)
- On-Prem „offline-fähig“: keine harten Cloud-Abhängigkeiten
- Konfigurierbar: DB, Object Storage, Search, KMS/HSM
- Observability Stack: Prometheus + Grafana + zentralisiertes Logging (ELK/OpenSearch) + Tracing (OTel)

---

## 12) Schnittstellen (intern + extern)
### Interne APIs
- Domain APIs zwischen Content, Assembly, Interview, Export
- Eventing (optional): „Template published“, „Clause deprecated“, „Contract exported“

### Externe API (später)
- REST endpoints z.B.:
  - `/tenants/{id}/contracts` create/read/export
  - `/vendors/{id}/templates` list published
  - `/signature/jobs` create/status/webhook
- Auth: OAuth2/OIDC, scopes pro Tenant/Vendor, webhooks signiert

---

## 13) Offene Risiken / Architektur-Entscheidungen (ADR-Kandidaten)
1. **Tenancy-Modell**: shared DB + RLS vs DB-per-tenant (Kosten vs Isolation)
2. **ODT-Strategie**: native vs serverseitige Konvertierung (Security/Komplexität)
3. **Regel-Engine**: MVP constraints vs formale Logik (Wartbarkeit, UX)
4. **Content-Rechte**: Kann Mandant vendor content „forken“? Lizenz/Mandantenfähigkeit
5. **Search**: notwendig im MVP oder später?

---

## 14) Konkrete Startaufgaben für Architektur & Team (erste 4–6 Wochen, ohne Timing-Versprechen)
- Architektur-Blueprint + ADRs (Tenancy, Storage, Export, Rule Engine)
- Domain-Modell & API-Spezifikation (OpenAPI)
- Prototyp: Klausel/Muster-Versionierung + Publikationsworkflow
- Prototyp: Interview-Flow → Assembly → DOCX Export (End-to-End)
- Security-Baseline: OIDC, RBAC, Auditlog, Verschlüsselungssetup, Secrets mgmt
- On-Prem Deploy Spike: minimaler Kubernetes-Stack + MinIO + Postgres

---

## Ergebnis-Erwartung an den Software-Architekten
Bitte liefere als Startartefakte:
1. **High-Level Architekturdiagramm** (Komponenten, Datenflüsse, Tenancy)
2. **ADR-Dokumente** zu den Punkten in Abschnitt 13
3. **Datenmodell v0.1** (Entities + Versioning-Strategie + Tenant Isolation)
4. **API Contract v0.1** (interne APIs + späterer Public API-Schnitt)
5. **Security & Compliance Baseline** (Controls, Logging, Key-Management, On-Prem Guidelines)
6. **MVP Delivery Plan** (Meilensteine nach Funktionen, nicht nach Zeit)
