# ADR-004: ODT-Strategie (nativ vs. DOCX→ODT Konvertierung)

**Status:** Accepted  
**Datum:** 2026-02-09  
**Betroffene Teams:** 01, 05, 07

## Kontext
ODT ist optional im MVP, aber wichtig für LibreOffice-Kompatibilität.
Native ODT-Generierung erhöht Implementierungsaufwand und Testlast.

## Entscheidung (Vorschlag)
MVP: **DOCX-Export als Pflicht**, ODT **via serverseitiger Konvertierung**
(LibreOffice headless in isoliertem Worker) als Option.
Native ODT-Generierung wird auf später verschoben.

## Konsequenzen
- Schnellere MVP-Lieferung mit kontrollierbarer Qualität.
- Zusätzliche Betriebsanforderung für LibreOffice-Worker (Isolation, Sicherheit).
- Qualität ODT abhängig von Konvertierung.

## Implementation Notes
- Konvertierung läuft in separatem Worker mit restriktivem FS-Zugriff.
- ODT-Export optional im UI, klare Kennzeichnung „Beta“.
- Referenzdokumente für Konvertierungstests definieren.

## Alternativen
- Native ODT-Generierung (höherer Aufwand, mehr Tests).
- ODT vollständig streichen im MVP (reduziert Scope, weniger Nutzerabdeckung).

## Offene Punkte
- Sicherheitsmodell für Konvertierung (Sandboxing, File-System Limits).
- Qualitätskriterien für ODT (Referenzdokumente, visuelle Tests).
