# Blue/Green Deployment-Strategie v1

> **Team 07 — DevOps & On-Prem | Sprint 12**
> Status: APPROVED | Zuletzt aktualisiert: 2026-02-11

---

## 1. Konzept

Blue/Green Deployment ist eine Release-Strategie mit **zwei identischen Produktionsumgebungen**:

- **Blue** = aktuell aktive Version, die Live-Traffic bedient
- **Green** = neue Version, die parallel deployt und validiert wird

Der Traffic-Wechsel erfolgt atomar durch Umschalten des Kubernetes **Service-Selectors**. Dies garantiert:

- **Zero-Downtime**: Kein Moment ohne laufende Pods
- **Sofortiger Rollback**: Service-Selector zurück auf Blue (< 30 Sekunden)
- **Validierung vor Go-Live**: Smoke-Tests gegen Green bevor Traffic umgeleitet wird

### Abgrenzung zu Rolling Updates

| Kriterium              | Rolling Update          | Blue/Green                |
|------------------------|-------------------------|---------------------------|
| Downtime               | Minimal                 | Zero                      |
| Rollback-Zeit          | ~60-120s (Rollout undo) | < 30s (Selector-Switch)   |
| Ressourcen-Overhead    | Temporär +50%           | Temporär +100%            |
| Validierung vor Switch | Nicht möglich            | Smoke-Test gegen Green    |
| DB-Migration-Risiko    | Hoch (mixed versions)   | Niedrig (expand-contract) |

**Entscheidung**: Blue/Green wird für Servanda Office eingesetzt wegen der strikten SLA-Anforderungen (Kanzlei-Betrieb) und der Notwendigkeit, DB-Migrationen sicher zu handhaben.

---

## 2. Implementierung fuer Servanda Office

### 2.1 Label-basiertes Routing

Jedes Deployment erhalt ein zusatzliches Label fuer die Version:

```yaml
metadata:
  labels:
    app: servanda
    component: api
    app.kubernetes.io/version: blue   # oder "green"
```

Der Service selektiert aktiv eine Farbe:

```yaml
spec:
  selector:
    app: servanda
    component: api
    app.kubernetes.io/version: blue   # Wechselt zwischen blue/green
```

### 2.2 Komponenten-Scope

Blue/Green wird angewendet auf:

| Komponente     | Blue/Green | Begruendung                              |
|----------------|------------|------------------------------------------|
| API Server     | Ja         | User-Facing, Zero-Downtime erforderlich  |
| Export Worker   | Nein       | Async Job-Queue, Rolling Update genuegt  |
| Web Frontend   | Nein       | Statische Assets, CDN-Cache, Rolling OK  |
| PostgreSQL     | Nein       | StatefulSet, eigene HA-Strategie         |

### 2.3 Netzwerk-Architektur

```
                    ┌──────────────┐
                    │   Ingress    │
                    │ (NGINX+TLS)  │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  api-service │
                    │  selector:   │
                    │  version=blue│  ← Wechselt atomar
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │                         │
     ┌────────▼────────┐     ┌─────────▼────────┐
     │  api-blue (v1)  │     │ api-green (v2)   │
     │  replicas: 3    │     │ replicas: 3      │
     │  LIVE TRAFFIC   │     │ SMOKE-TEST ONLY  │
     └─────────────────┘     └──────────────────┘
```

### 2.4 Interner Smoke-Test-Service

Fuer Tests gegen die Green-Umgebung vor dem Traffic-Switch existiert ein separater ClusterIP-Service:

```yaml
# api-service-green (intern, kein Ingress)
spec:
  selector:
    app: servanda
    component: api
    app.kubernetes.io/version: green
```

Dieser Service wird nur fuer den Smoke-Test verwendet und ist nicht von aussen erreichbar.

---

## 3. Deployment-Ablauf (10 Schritte)

### Schritt 1: Green Deployment erstellen (neue Version)

```bash
# Neues Deployment mit inaktiver Farbe erstellen
kubectl apply -f api-deployment-green.yaml
# Image-Tag aktualisieren
kubectl set image deployment/servanda-api-green \
  servanda-api=ghcr.io/cai-gmbh-dev/servanda-office/api:<new-tag>
```

### Schritt 2: Green Pods warten auf Ready

```bash
kubectl rollout status deployment/servanda-api-green \
  --namespace=servanda-office \
  --timeout=300s
```

Kriterien fuer "Ready":
- Alle Pods im `Running`-Status
- Readiness-Probe (`/api/health`) erfolgreich
- Mindest-Replica-Count erreicht (3 Pods)

### Schritt 3: Smoke-Test gegen Green-Service (intern)

```bash
# Smoke-Test gegen den internen Green-Service
./k8s/scripts/smoke-test.sh \
  --namespace servanda-office \
  --host http://servanda-api-green:3000
```

Geprueft werden:
- Health-Endpoint (GET /api/v1/health -> 200)
- Datenbank-Konnektivitaet (Seed-Data-Abfrage)
- Export-Endpoint-Erreichbarkeit
- Response-Zeiten < 2s (P95)

### Schritt 4: DB-Migration ausfuehren (wenn noetig)

```bash
# Prisma Migration gegen Produktions-DB
kubectl exec -it deployment/servanda-api-green -- \
  npx prisma migrate deploy
```

**Wichtig**: Nur backward-compatible Migrationen (siehe Abschnitt 5).

### Schritt 5: Service-Selector auf Green umstellen

```bash
# Atomarer Traffic-Wechsel
kubectl patch service servanda-api \
  -p '{"spec":{"selector":{"app.kubernetes.io/version":"green"}}}'
```

Dieser Befehl ist atomar: Alle neuen Requests gehen sofort an Green-Pods.

### Schritt 6: Health-Check gegen Live-Traffic

```bash
# 30 Sekunden Health-Check gegen Live-Ingress
for i in $(seq 1 30); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://app.servanda.de/api/v1/health)
  if [ "$STATUS" != "200" ]; then
    echo "HEALTH CHECK FAILED at second $i"
    exit 1
  fi
  sleep 1
done
```

### Schritt 7: Bei Fehler — Sofort Rollback auf Blue

```bash
# Rollback: Service-Selector zurueck auf Blue (< 30 Sekunden)
kubectl patch service servanda-api \
  -p '{"spec":{"selector":{"app.kubernetes.io/version":"blue"}}}'

# Green-Deployment herunterfahren
kubectl scale deployment/servanda-api-green --replicas=0
```

### Schritt 8: Bei Erfolg — Blue-Deployment herunterfahren (nach 10min)

```bash
# 10 Minuten warten (verbleibende Requests abarbeiten)
sleep 600

# Blue-Deployment auf 0 skalieren
kubectl scale deployment/servanda-api-blue --replicas=0
```

Die 10-Minuten-Wartezeit stellt sicher:
- Laufende Long-Polling-Requests werden abgeschlossen
- Export-Jobs, die ueber die API gestartet wurden, sind verarbeitet
- Monitoring-Metriken zeigen stabile Green-Performance

### Schritt 9: Green wird zum neuen Blue

Nach erfolgreichem Deployment wird die Farb-Zuordnung fuer den naechsten Release invertiert:
- Green (aktiv) → wird beim naechsten Release als "aktive Farbe" behandelt
- Blue (inaktiv) → wird beim naechsten Release mit der neuen Version beschrieben

Das Script `blue-green-deploy.sh` erkennt die aktive Farbe automatisch.

### Schritt 10: Metrics monitoren (Error-Rate, Latenz)

Post-Deployment-Monitoring fuer 30 Minuten:

| Metrik                    | Schwellwert     | Aktion bei Ueberschreitung |
|---------------------------|-----------------|----------------------------|
| HTTP 5xx Error-Rate       | > 1%            | Automatischer Rollback     |
| API Response P95          | > 2s            | Alert + manueller Review   |
| Export Job Failure-Rate   | > 5%            | Alert + manueller Review   |
| Pod Restarts              | > 2 in 5min     | Automatischer Rollback     |
| DB Connection Pool Usage  | > 80%           | Alert                      |

Referenz: Alerting-Rules in `docker/prometheus/alerting-rules.yml`.

---

## 4. Rollback-Garantie

### Rollback-Zeiten

| Szenario                  | Rollback-Methode        | Zeit    |
|---------------------------|-------------------------|---------|
| Nach Traffic-Switch       | Service-Selector-Patch  | < 30s   |
| Vor Traffic-Switch        | Green-Deployment loeschen | < 10s   |
| DB-Migration-Fehler       | Selector + Migration undo | < 60s  |

### Automatischer Rollback

Das `blue-green-deploy.sh` Script fuehrt automatischen Rollback durch bei:
- Smoke-Test-Fehler (vor Traffic-Switch)
- Health-Check-Fehler (nach Traffic-Switch)
- Rollout-Timeout (Pods werden nicht Ready)

### Manueller Rollback

```bash
# Aktive Farbe ermitteln
ACTIVE=$(kubectl get svc servanda-api \
  -o jsonpath='{.spec.selector.app\.kubernetes\.io/version}')

# Auf andere Farbe wechseln
if [ "$ACTIVE" == "green" ]; then
  kubectl patch service servanda-api \
    -p '{"spec":{"selector":{"app.kubernetes.io/version":"blue"}}}'
else
  kubectl patch service servanda-api \
    -p '{"spec":{"selector":{"app.kubernetes.io/version":"green"}}}'
fi
```

---

## 5. DB-Migration-Strategie: Expand-and-Contract

### Prinzip

Alle Datenbankmigrationen muessen **backward-compatible** sein, damit sowohl Blue als auch Green gleichzeitig funktionieren koennen.

### Expand-Phase (Migration VOR dem Deployment)

| Erlaubt                          | Verboten                        |
|----------------------------------|---------------------------------|
| Neue Spalte mit DEFAULT-Wert     | Spalte umbenennen               |
| Neuer Index                      | Spalte loeschen                 |
| Neue Tabelle                     | Spaltentyp aendern              |
| View erstellen                   | NOT NULL ohne DEFAULT hinzufuegen|

### Contract-Phase (Cleanup NACH dem Deployment)

Erst wenn Blue heruntergefahren ist (Schritt 8 abgeschlossen):

```sql
-- Beispiel: Alte Spalte entfernen (Contract-Phase)
ALTER TABLE contracts DROP COLUMN old_status;
```

### Migrations-Ablauf

```
1. Expand-Migration deployen (Blue + Green kompatibel)
2. Green Deployment starten
3. Traffic auf Green wechseln
4. Blue herunterfahren
5. Contract-Migration deployen (nur Green laeuft)
```

### Prisma-Integration

```bash
# Expand-Migration erstellen
npx prisma migrate dev --name expand_add_new_column

# Contract-Migration (separater PR, nach erfolgreichem Blue/Green)
npx prisma migrate dev --name contract_remove_old_column
```

---

## 6. Voraussetzungen

### Cluster-Anforderungen

- Kubernetes 1.28+
- NGINX Ingress Controller
- cert-manager (TLS)
- Ausreichend Kapazitaet fuer 2x API-Pods (temporaer)

### Resource-Overhead

| Phase                    | API Pods | Zusaetzliche Ressourcen |
|--------------------------|----------|-------------------------|
| Normalbetrieb            | 3        | 0                       |
| Waehrend Blue/Green      | 6        | +3 Gi Memory, +3000m CPU|
| Nach Cleanup (10min)     | 3        | 0                       |

### CI/CD-Integration

Das Blue/Green-Script wird in den bestehenden `build-push.yml` Workflow integriert:

```yaml
# .github/workflows/deploy.yml (Erweiterung)
deploy-prod:
  needs: [build-push]
  steps:
    - name: Blue/Green Deploy
      run: |
        ./k8s/scripts/blue-green-deploy.sh ${{ github.sha }} servanda-office
```

---

## 7. Referenzen

- `k8s/scripts/blue-green-deploy.sh` — Deployment-Script
- `k8s/base/blue-green/` — Blue/Green K8s-Manifeste
- `k8s/scripts/smoke-test.sh` — Smoke-Test-Script (Sprint 11)
- `docker/prometheus/alerting-rules.yml` — Alerting-Regeln
- `docs/knowledge/deployment-blueprint-v1.md` — Deployment-Blueprint
- `docs/knowledge/cicd-skeleton-v1.md` — CI/CD-Pipeline
