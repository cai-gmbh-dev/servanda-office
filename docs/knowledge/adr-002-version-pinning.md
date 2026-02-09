# ADR-002: Version Pinning für Template/Clause im Vertragsobjekt

**Status:** Accepted  
**Datum:** 2026-02-09  
**Betroffene Teams:** 01, 03, 04

## Kontext
Verträge müssen reproduzierbar bleiben, auch wenn Templates/Klauseln fortentwickelt werden.
Das MVP verlangt konsistente, auditierbare Dokumente.

## Entscheidung (Vorschlag)
`ContractInstance` speichert:
- `templateVersionId` (immutable)
- Liste `clauseVersionIds`
- Snapshot der Antworten (Interview-Flow)
- Export-Metadaten (Version, Zeitpunkt, Format)

Versionen von Templates/Klauseln sind **immutable**; Änderungen erzeugen neue Versionen.

## Konsequenzen
- Vertragserstellung muss immer Versionen pinnen (keine "latest").
- UI muss Versionen transparent anzeigen (Hinweis auf neuere Published-Versionen).
- Storage erhöht sich (Snapshot der Antworten + Referenzen).

## Implementation Notes
- `ContractInstance` enthält `templateVersionId` + `clauseVersionIds` + Answers Snapshot.
- Export-Service darf nur auf gepinnte Versionen zugreifen.
- Migration von Draft-Verträgen: explizite Nutzerentscheidung für Upgrade.

## Alternativen
- Pinning nur auf Template-Version (unzureichend bei Clause-Updates).
- Soft-Links auf “latest” (nicht auditierbar).

## Offene Punkte
- Umgang mit „Deprecated“-Versionen (Export weiterhin erlaubt?).
- Migration von Draft-Verträgen auf neue Published-Versionen.
