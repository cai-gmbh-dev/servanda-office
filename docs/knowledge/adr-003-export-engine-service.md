# ADR-003: Export-Engine als separater Service

**Status:** Accepted  
**Datum:** 2026-02-09  
**Betroffene Teams:** 01, 05, 07

## Kontext
DOCX/ODT Export ist rechenintensiv, benötigt robuste Libraries und ggf. isolierte Runtime.
On-Prem und Compliance verlangen klare Betriebs- und Sicherheitsgrenzen.

## Entscheidung (Vorschlag)
Export läuft als **separater Service** (oder separater Prozess im modularen Monolith),
mit **asynchronem Job-Modell**:
- API nimmt Exportauftrag an
- Export-Service rendert Dokument
- Ergebnis wird im Object Storage abgelegt
- Status per Job-Record/Audit protokolliert

## Konsequenzen
- Stabilere Skalierung und Isolation (Fehler beeinflussen nicht Core API).
- Zusätzlicher Infrastrukturaufwand (Queue/Worker).
- Auditierbarkeit des Exports wird zentral.

## Implementation Notes
- Export-Requests als Job mit Status (`queued`, `running`, `done`, `failed`).
- Ergebnisse in Object Storage, Metadaten im Core DB.
- Export-Worker in isolierter Runtime (kein direkter DB-Write außerhalb Job-Status).

## Alternativen
- In-Process Export im Core-Service (einfacher, aber riskant).
- Client-seitiger Export (nicht akzeptabel für Compliance/Consistency).

## Offene Punkte
- Wahl des Queues (DB-Queue vs. Redis vs. RabbitMQ).
- SLA/Timeouts für Export-Jobs.
