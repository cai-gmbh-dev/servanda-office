# Servanda Office -- Anleitung fuer Kanzlei-Administratoren

## Was kann ich als Admin?

Als Kanzlei-Administrator verwalten Sie den gesamten Arbeitsbereich Ihrer Kanzlei in Servanda Office. Sie legen Benutzerkonten an, weisen Rollen zu, konfigurieren das Erscheinungsbild Ihrer Dokumente und behalten ueber Audit-Logs den Ueberblick ueber alle Aktivitaeten. Zusaetzlich ueberwachen Sie den Export-Prozess und koennen bei Problemen gezielt eingreifen.

---

## User-Management

### Benutzer einladen

1. Navigieren Sie zu **Einstellungen > Benutzerverwaltung**.
2. Klicken Sie auf **Benutzer einladen**.
3. Geben Sie die E-Mail-Adresse der Person ein und waehlen Sie eine Rolle.
4. Die eingeladene Person erhaelt eine E-Mail mit einem Aktivierungslink.

### Rollen zuweisen

Servanda Office kennt drei Rollen:

| Rolle | Beschreibung |
|-------|-------------|
| **Admin** | Voller Zugriff auf Verwaltung, Einstellungen und Audit-Logs |
| **Editor** | Erstellt und bearbeitet Klauseln, Templates und den Publishing-Workflow |
| **User** | Nutzt Vorlagen zur Vertragserstellung und exportiert Dokumente |

Um eine Rolle zu aendern, oeffnen Sie das Benutzerprofil und waehlen Sie unter **Rolle** den gewuenschten Wert aus.

### Benutzer aktivieren, deaktivieren und loeschen

- **Deaktivieren**: Sperrt den Zugang voruebergehend. Der Account bleibt erhalten und kann spaeter wieder aktiviert werden.
- **Aktivieren**: Stellt einen deaktivierten Account wieder her.
- **Loeschen**: Entfernt den Account endgueltig. Bereits erstellte Vertraege bleiben im Archiv erhalten, werden aber anonymisiert.

---

## Audit-Logs

Unter **Einstellungen > Audit-Log** sehen Sie saemtliche protokollierten Aktionen innerhalb Ihres Mandanten.

### Filtern

Sie koennen die Eintraege eingrenzen nach:

- **Aktion** -- z. B. "Benutzer angelegt", "Vertrag exportiert", "Klausel veroeffentlicht"
- **Zeitraum** -- Startdatum und Enddatum waehlen
- **Objekt** -- nach einer bestimmten Klausel, einem Template oder Vertrag suchen

Jeder Eintrag zeigt Zeitstempel, ausfuehrende Person, betroffenes Objekt und eine Beschreibung der Aenderung. So erfuellen Sie die Nachweispflichten gemaess DSGVO und internen Compliance-Vorgaben.

---

## Tenant-Einstellungen

### Kanzlei-Profil

Unter **Einstellungen > Kanzlei-Profil** hinterlegen Sie die Stammdaten Ihrer Kanzlei (Name, Adresse, Kontaktdaten). Diese Angaben koennen in Vertragsvorlagen als Platzhalter verwendet werden.

### Branding

Passen Sie das Erscheinungsbild Ihrer exportierten Dokumente an:

- **Logo** -- Laden Sie Ihr Kanzlei-Logo hoch (PNG oder SVG, empfohlen 300 x 100 px).
- **Farben** -- Definieren Sie Primaer- und Sekundaerfarbe fuer Ueberschriften und Hervorhebungen.
- **Schriften** -- Waehlen Sie eine Schriftart fuer Fliestext und Ueberschriften.
- **Seitenraender (Margins)** -- Legen Sie die Seitenraender fuer den DOCX-Export fest (oben, unten, links, rechts in mm).

---

## Style-Templates

Style-Templates bestimmen die Formatierung Ihrer exportierten Vertraege. Sie koennen mehrere Templates anlegen, z. B. eines fuer Mandantenvertraege und eines fuer interne Dokumente.

### Template erstellen

1. Gehen Sie zu **Einstellungen > Style-Templates**.
2. Klicken Sie auf **Neues Style-Template**.
3. Vergeben Sie einen Namen und konfigurieren Sie Schriftgroessen, Absatzformate und Kopf-/Fusszeilen.
4. Speichern Sie das Template.

### Template bearbeiten und loeschen

- Oeffnen Sie ein bestehendes Template und passen Sie die Werte an.
- Ueber das Kontextmenue koennen Sie ein Template loeschen. Bereits exportierte Dokumente bleiben davon unberuehrt.

---

## Export-Monitoring

Der Export-Prozess laeuft im Hintergrund. Falls ein Export fehlschlaegt, landet der Job in der **Dead Letter Queue (DLQ)**.

### DLQ einsehen

Unter **Einstellungen > Export-Monitoring** sehen Sie alle fehlgeschlagenen Export-Jobs mit Fehlermeldung, Zeitstempel und betroffener Vertragsinstanz.

### Fehlgeschlagene Jobs bearbeiten

- **Retry** -- Startet den Export erneut. Sinnvoll, wenn die Ursache ein voruebergehendes Problem war (z. B. Netzwerkfehler).
- **Archivieren** -- Entfernt den Job aus der aktiven Liste, wenn das Problem anderweitig geloest wurde.

Bei wiederholt fehlschlagenden Jobs wenden Sie sich an den technischen Support.

---

*Letzte Aktualisierung: Sprint 8 -- Servanda Office v1.0*
