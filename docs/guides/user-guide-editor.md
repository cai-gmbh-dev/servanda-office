# Servanda Office -- Anleitung fuer Vertrags-Redakteure

## Was kann ich als Editor?

Als Editor erstellen und pflegen Sie die inhaltlichen Bausteine von Servanda Office: Klauseln, Vertragsvorlagen und die zugehoerigen Interview-Ablaeufe. Sie arbeiten mit dem Publishing-Workflow und sorgen dafuer, dass nur gepruefte Inhalte fuer die Anwender sichtbar werden. Das Vier-Augen-Prinzip stellt dabei sicher, dass jede Aenderung vor der Veroeffentlichung von einer zweiten Person freigegeben wird.

---

## Klausel-Verwaltung

### Neue Klausel erstellen

1. Navigieren Sie zu **Inhalte > Klauseln**.
2. Klicken Sie auf **Neue Klausel**.
3. Geben Sie einen Titel, ein Rechtsgebiet und den Klauseltext ein.
4. Speichern Sie die Klausel. Sie befindet sich zunachst im Status **Draft**.

### Neue Version anlegen

Klauseln sind versioniert. Wenn Sie eine bestehende Klausel ueberarbeiten moechten, erstellen Sie eine neue Version. Die vorherige Version bleibt unveraendert erhalten, damit laufende Vertraege stabil bleiben.

1. Oeffnen Sie die Klausel und klicken Sie auf **Neue Version**.
2. Bearbeiten Sie den Text.
3. Speichern Sie -- die neue Version erhaelt automatisch eine fortlaufende Versionsnummer.

### Parameter definieren

Klauseln koennen Platzhalter (Parameter) enthalten, die spaeter im Interview ausgefuellt werden. Beispiele:

- `{{vertragspartner_name}}` -- Name des Vertragspartners
- `{{laufzeit_monate}}` -- Vertragslaufzeit in Monaten
- `{{kuendigungsfrist}}` -- Kuendigungsfrist

Definieren Sie fuer jeden Parameter einen Typ (Text, Zahl, Datum, Auswahl) und optional einen Standardwert.

### Regeln festlegen

Regeln steuern, welche Klauseln miteinander kombiniert werden koennen:

| Regeltyp | Bedeutung |
|----------|-----------|
| **requires** | Klausel A erfordert, dass Klausel B ebenfalls im Vertrag enthalten ist |
| **forbids** | Klausel A schliesst Klausel B aus -- beide duerfen nicht gleichzeitig vorkommen |
| **incompatible_with** | Weicher Konflikt -- eine Warnung wird angezeigt, der Anwender kann entscheiden |

---

## Template-Verwaltung

### Neues Template erstellen

1. Navigieren Sie zu **Inhalte > Templates**.
2. Klicken Sie auf **Neues Template**.
3. Vergeben Sie einen Titel, ein Rechtsgebiet und eine Kategorie.

### Slots definieren

Ein Template besteht aus Slots, in die Klauseln eingefuegt werden. Jeder Slot hat einen Typ:

- **Required** -- Muss immer befuellt werden. Genau eine Klausel ist vorausgewaehlt.
- **Optional** -- Kann vom Anwender aktiviert oder uebersprungen werden.
- **Alternative** -- Der Anwender waehlt aus mehreren Klausel-Varianten eine aus.

Ordnen Sie die Slots in der gewuenschten Reihenfolge an -- diese Reihenfolge bestimmt die Struktur des fertigen Vertrags.

### Interview-Flow zuweisen

Jedes Template hat einen Interview-Flow, der die Reihenfolge der Fragen im gefuehrten Q&A bestimmt. Ordnen Sie die Parameter der Klauseln den Interview-Schritten zu und definieren Sie optionale bedingte Logik (z. B. "Frage nach Kuendigungsfrist nur anzeigen, wenn Vertragslaufzeit > 12 Monate").

---

## Publishing-Workflow

Der Publishing-Workflow stellt sicher, dass Inhalte nur nach Pruefung veroeffentlicht werden:

```
Draft --> Review --> Approve/Reject --> Published
```

### Ablauf

1. **Draft** -- Sie erstellen oder ueberarbeiten eine Klausel oder ein Template.
2. **Review einreichen** -- Klicken Sie auf **Zur Pruefung einreichen**. Der Status wechselt zu "In Review".
3. **Reviewer pruefen** -- Die zugewiesene Person prueft die Aenderungen.
4. **Approve** -- Bei Freigabe wird der Inhalt veroeffentlicht und ist fuer Anwender sichtbar.
5. **Reject** -- Bei Ablehnung erhalten Sie einen Kommentar mit den gewuenschten Aenderungen. Ueberarbeiten Sie den Inhalt und reichen Sie erneut ein.

### Reviewer zuweisen

Beim Einreichen zur Pruefung waehlen Sie einen Reviewer aus der Liste der verfuegbaren Editoren. Wichtig: Sie koennen Ihre eigenen Inhalte nicht selbst freigeben (Vier-Augen-Prinzip).

### Aenderungen anfordern

Als Reviewer koennen Sie gezielt Aenderungen anfordern, indem Sie einen Kommentar hinterlassen und den Status auf **Changes Requested** setzen. Der Autor sieht den Kommentar und kann die Klausel oder das Template ueberarbeiten.

---

## Changelog

Unter **Inhalte > Changelog** sehen Sie den vollstaendigen Versionsverlauf aller Klauseln und Templates. Jeder Eintrag zeigt:

- Versionsnummer
- Autor und Zeitstempel
- Art der Aenderung (neu erstellt, ueberarbeitet, veroeffentlicht)
- Pruefstatus und Reviewer

So behalten Sie den Ueberblick, wer wann welche inhaltlichen Aenderungen vorgenommen hat.

---

*Letzte Aktualisierung: Sprint 8 -- Servanda Office v1.0*
