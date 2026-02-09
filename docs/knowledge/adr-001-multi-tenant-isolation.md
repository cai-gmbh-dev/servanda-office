# ADR-001: Multi-Tenant Isolation serverseitig erzwingen (RLS vs. DB-per-Tenant)

**Status:** Accepted  
**Datum:** 2026-02-09  
**Betroffene Teams:** 01, 02, 07

## Kontext
Servanda Office muss strikte Mandanten-Isolation garantieren (DSGVO, Kanzlei-Compliance).
Es gibt zwei sinnvolle Strategien: Shared DB mit Row-Level Security (RLS) oder DB-per-Tenant.
Enterprise/On-Prem benötigt ggf. maximale Isolation, SME-Cloud benötigt Effizienz.

## Entscheidung (Vorschlag)
Default: **Shared DB + Tenant-ID auf allen Objekten + Postgres RLS** als technisch bevorzugte Isolation.
Option: **DB-per-Tenant** als Enterprise/On-Prem Konfiguration (Feature-Flag).
Zugriffe werden zusätzlich **im Applikationslayer** geprüft (Defense in Depth).

## Konsequenzen
- RLS erfordert klare Tenant-Kontexte in allen Queries und striktes Policy-Management.
- Migrationen müssen RLS-Policies einschließen.
- DB-per-Tenant erhöht Betriebsaufwand, bietet aber stärkere Isolation für Enterprise.

## Implementation Notes
- Alle Repositories/Queries müssen `tenantId` als Pflichtparameter erzwingen.
- Postgres RLS Policies pro Tabelle definieren, Tests mit „deny by default“.
- In CI: Testfall für Cross-Tenant-Zugriff muss scheitern.

## Alternativen
- Nur Applikationslayer-Isolation (weniger robust, höheres Risiko).
- Physische Trennung pro Tenant als Default (teuer, komplex).

## Offene Punkte
- Entscheidungskriterium für DB-per-Tenant (Umsatz/Compliance-Level).
- Zugriffsmuster für Reporting/Analytics in Shared DB.
