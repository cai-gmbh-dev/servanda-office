# CSRF-Evaluierung: Servanda Office SPA

**Status:** Abgeschlossen
**Datum:** 2026-02-11
**Owner:** Team 02 (Platform Security & Identity)
**Referenzen:** ADR-001, Threat Model Tenant-Isolation, Architecture Backbone v1, Helmet/CORS-Hardening (Sprint 8)

---

## 1. Kontext & Fragestellung

Muss die Servanda Office SPA einen zusaetzlichen CSRF-Schutz (Synchronizer Token, Double Submit Cookie, etc.) implementieren?

Hintergrund: Klassische CSRF-Angriffe funktionieren, weil Browser bei Cross-Origin-Requests automatisch Cookies mitsenden. Wenn die Applikation Cookie-basierte Authentifizierung nutzt, kann ein Angreifer ueber eine boeswillige Seite authentifizierte Requests ausfuehren, ohne dass der Benutzer es bemerkt.

---

## 2. Architektur-Analyse

### 2.1 Authentifizierungsfluss

```text
Browser (React SPA)
    |
    |-- Login via Keycloak (OIDC Authorization Code Flow + PKCE)
    |-- Erhaelt JWT Access Token + Refresh Token
    |-- Speichert Tokens im Memory (NICHT in Cookies, NICHT in localStorage)
    |
    |-- API-Request:
    |     fetch('/api/v1/...', {
    |       headers: { 'Authorization': 'Bearer <JWT>' }
    |     })
    |
API Server (Express)
    |-- Helmet (CSP, CORP, COOP, Referrer-Policy)
    |-- CORS (Origin-Whitelist)
    |-- JWT-Validierung via authenticate-Middleware
```

### 2.2 Wesentliche Architektur-Merkmale

| Merkmal | Implementierung | CSRF-Relevanz |
| --- | --- | --- |
| **Auth-Mechanismus** | Bearer JWT im `Authorization`-Header | Wird NICHT automatisch gesendet |
| **Token-Speicher** | In-Memory (React State/Context) | Nicht von Drittseiten auslesbar |
| **Session-Cookie** | Keycloak setzt `KEYCLOAK_SESSION` Cookie fuer eigene Login-Seite | Gilt nur fuer Keycloak-Domain, nicht fuer API |
| **CORS** | Origin-Whitelist (`http://localhost:5173` bzw. Prod-Domain) | Verhindert Cross-Origin-Requests |
| **CSP** | `default-src 'self'`, `frame-ancestors 'none'` | Verhindert Embedding und XSS |
| **API-Design** | Alle state-changing Endpoints erfordern JWT in Header | Kein Cookie-basiertes Auth |

---

## 3. CSRF-Risiko-Analyse

### 3.1 Warum klassisches CSRF hier nicht greift

CSRF-Angriffe basieren auf einer zentralen Voraussetzung: **Der Browser sendet automatisch Authentifizierungs-Credentials bei Cross-Origin-Requests mit.** Das ist bei Cookies der Fall, aber nicht bei `Authorization`-Headern.

In der Servanda Office Architektur:

1. **Kein Cookie-basiertes Auth fuer die API:** Die API authentifiziert ausschliesslich ueber den `Authorization: Bearer <JWT>`-Header. Dieser Header wird von `fetch()` explizit gesetzt und NICHT automatisch bei Cross-Origin-Requests hinzugefuegt.

2. **CORS blockiert Cross-Origin-Requests:** Selbst wenn ein Angreifer versucht, einen `fetch()` von einer boeswilligen Seite auszufuehren, wird der Browser den Request aufgrund der CORS-Policy ablehnen (Preflight schlaegt fehl).

3. **SameSite-Attribut bei Keycloak-Cookies:** Die Keycloak-Session-Cookies gelten nur fuer die Keycloak-Domain und nicht fuer die API-Domain. Zudem sollten sie `SameSite=Lax` oder `SameSite=Strict` gesetzt haben.

**Ergebnis:** Standard-CSRF ist bei dieser Architektur **nicht anwendbar**.

### 3.2 Verbleibende Angriffsvektoren

| Vektor | Beschreibung | Risiko | Mitigation |
| --- | --- | --- | --- |
| **V-01: Token-Theft via XSS** | Angreifer injiziert Script, liest JWT aus Memory | **HOCH** (wenn XSS moeglich) | CSP `script-src 'self'`, Helmet, Input-Sanitization, keine `eval()` |
| **V-02: Token-Theft via localStorage** | Wenn Tokens in localStorage gespeichert wuerden | **MITTEL** (aktuell nicht zutreffend) | Tokens nur in Memory speichern, niemals localStorage/sessionStorage |
| **V-03: Clickjacking** | Angreifer bettet SPA in iframe ein | **NIEDRIG** | `X-Frame-Options: DENY`, CSP `frame-ancestors 'none'` |
| **V-04: CORS-Misconfiguration** | Wildcard-Origin oder Reflection | **MITTEL** (wenn konfiguriert) | Origin-Whitelist (nicht Wildcard), `credentials: true` nur fuer definierte Origins |
| **V-05: Subdomain-Takeover** | Angreifer uebernimmt Subdomain, umgeht CORS | **NIEDRIG** | DNS-Monitoring, keine Wildcard-Subdomains |
| **V-06: Open Redirect in Auth-Flow** | Angreifer leitet nach Login auf boeswillige Seite um | **MITTEL** | Redirect-URI-Validation in Keycloak, strikte redirect_uri-Konfiguration |

### 3.3 Kritischer Vektor: XSS als CSRF-Ersatz

Bei einer Bearer-Token-Architektur wird **XSS zum primaeren Angriffsvektor**, da es CSRF als Bedrohung ersetzt:

- Wenn ein Angreifer XSS ausfuehren kann, kann er:
  - Den JWT aus dem Memory lesen (je nach Framework-Implementierung)
  - Direkt authentifizierte API-Calls aus dem Browser-Kontext ausfuehren
  - Die Sitzung vollstaendig uebernehmen

Daher ist **XSS-Praevention die wichtigste Sicherheitsmassnahme** in dieser Architektur.

---

## 4. Implementierungsstatus: Massnahmen-Matrix

| ID | Massnahme | Status | Implementierung | Verantwortlich |
| --- | --- | --- | --- | --- |
| **M-01** | Bearer JWT statt Cookie-Auth | IMPLEMENTIERT | `authenticate` Middleware prueft `Authorization`-Header | Team 02 (Sprint 5) |
| **M-02** | CORS Origin-Whitelist | IMPLEMENTIERT | `cors({ origin: env.CORS_ORIGIN })` in `main.ts` | Team 01 (Sprint 8) |
| **M-03** | CSP via Helmet | IMPLEMENTIERT | `default-src 'self'`, `script-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'` | Team 01 (Sprint 8) |
| **M-04** | `Cross-Origin-Embedder-Policy` | IMPLEMENTIERT | `crossOriginEmbedderPolicy: true` | Team 01 (Sprint 8) |
| **M-05** | `Cross-Origin-Opener-Policy` | IMPLEMENTIERT | `crossOriginOpenerPolicy: 'same-origin'` | Team 01 (Sprint 8) |
| **M-06** | `Cross-Origin-Resource-Policy` | IMPLEMENTIERT | `crossOriginResourcePolicy: 'same-origin'` | Team 01 (Sprint 8) |
| **M-07** | `Referrer-Policy` | IMPLEMENTIERT | `strict-origin-when-cross-origin` | Team 01 (Sprint 8) |
| **M-08** | Token in Memory (nicht localStorage) | IMPLEMENTIERT | React State/Context Token-Speicherung | Team 04 (Sprint 5) |
| **M-09** | SameSite Cookie-Attribute (Keycloak) | AUSSTEHEND | Keycloak-Konfiguration: `SameSite=Strict` fuer Session-Cookies | Team 02 (Sprint 12) |
| **M-10** | Input-Sanitization (API) | TEILWEISE | JSON-Schema-Validierung in Content/Contract-APIs, HTML-Escape noch nicht flaechendeckend | Team 03 + 04 |
| **M-11** | CSP Nonce fuer Inline-Scripts | AUSSTEHEND | Aktuell `'unsafe-inline'` bei `style-src`, sollte durch Nonce ersetzt werden | Team 01 (Sprint 12) |
| **M-12** | Subresource Integrity (SRI) | AUSSTEHEND | Build-Pipeline soll SRI-Hashes fuer JS/CSS-Bundles generieren | Team 07 (Sprint 12) |
| **M-13** | JWT Lifetime kurz halten | IMPLEMENTIERT | Access Token TTL: 5 min, Refresh Token: 30 min (Keycloak-Realm) | Team 02 (Sprint 5) |
| **M-14** | PKCE fuer Authorization Code Flow | IMPLEMENTIERT | Keycloak-Client mit PKCE-Pflicht konfiguriert | Team 02 (Sprint 5) |

---

## 5. Entscheidung

### Kein zusaetzlicher CSRF-Token erforderlich

**Begruendung:**

1. Die API verwendet ausschliesslich Bearer-Token-Authentifizierung via `Authorization`-Header. Dieser Header wird nicht automatisch bei Cross-Origin-Requests mitgesendet. Damit ist die zentrale Voraussetzung fuer CSRF-Angriffe nicht gegeben.

2. CORS ist restriktiv konfiguriert mit einer Origin-Whitelist (kein Wildcard, keine Reflection). Cross-Origin-Requests mit Custom-Headers werden per Preflight blockiert.

3. Die Einfuehrung eines CSRF-Tokens wuerde:
   - Architektur-Komplexitaet erhoehen (Token-Generierung, Verteilung, Validierung)
   - Keinen zusaetzlichen Schutz bieten bei Bearer-Token-Auth
   - Potentiell eine Cookie-basierte Komponente einfuehren, die neue Angriffsflaeche schafft

### Kritische Bedingungen fuer diese Entscheidung

Die Entscheidung gegen CSRF-Token gilt **nur**, solange folgende Bedingungen eingehalten werden:

| Bedingung | Beschreibung | Pruefbar durch |
| --- | --- | --- |
| **B-01** | API authentifiziert NIEMALS via Cookie | Code-Review, Security-Test T-02 |
| **B-02** | CORS Origin ist KEINE Wildcard `*` | CI-Check, Konfigurationstest |
| **B-03** | JWT wird NICHT in Cookie gespeichert | Frontend Code-Review |
| **B-04** | CSP verhindert Inline-Script-Injection | Helmet-Konfiguration, Lighthouse |
| **B-05** | Keycloak-Cookies haben SameSite-Attribut | Keycloak-Konfiguration |

**Falls eine dieser Bedingungen verletzt wird, muss die CSRF-Entscheidung neu evaluiert werden.**

---

## 6. Offene Massnahmen (Sprint 12+)

| Prio | Massnahme | Ticket | Beschreibung |
| --- | --- | --- | --- |
| **P1** | M-09: SameSite Cookies Keycloak | SEC-041 | `SameSite=Strict` fuer alle Keycloak-Session-Cookies konfigurieren |
| **P1** | M-11: CSP style-src Nonce | SEC-042 | `'unsafe-inline'` in `style-src` durch Nonce-basiertes System ersetzen |
| **P2** | M-10: Input-Sanitization | SEC-043 | Flaechendeckende HTML-Escape-Validierung in allen API-Endpoints |
| **P2** | M-12: SRI Build-Integration | SEC-044 | Subresource Integrity Hashes fuer alle JS/CSS-Assets generieren |
| **P3** | Security-Regression-Test | SEC-045 | Automatisierter Test: API darf NIE Cookie-basiertes Auth akzeptieren |

---

## 7. Zusammenfassung

```text
+------------------------------------------+-------------------+
|              Bedrohung                   |     Status        |
+------------------------------------------+-------------------+
| Klassisches CSRF (Cookie-Replay)         | NICHT ANWENDBAR   |
| Token-Theft via XSS                      | MITIGIERT (CSP)   |
| Clickjacking                             | MITIGIERT (CSP)   |
| CORS-Misconfiguration                    | MITIGIERT (Strict)|
| Open Redirect                            | MITIGIERT (KC)    |
| Cookie-basiertes Auth versehentlich      | MONITORING NOETIG  |
+------------------------------------------+-------------------+

Entscheidung: KEIN zusaetzlicher CSRF-Token noetig.
Prioritaet: XSS-Praevention ist die kritischste Massnahme.
```

---

*Erstellt von Team 02 (Platform Security & Identity) -- Sprint 11*
*Review erforderlich durch: Team 01 (Product Architecture), Team 06 (QA & Compliance)*
