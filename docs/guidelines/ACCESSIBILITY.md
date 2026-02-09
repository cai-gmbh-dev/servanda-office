# Accessibility Guidelines - Servanda Office

**Version**: 1.0.0
**Standard**: WCAG 2.1 Level AA

---

## 1. Grundprinzipien

Servanda Office muss für alle Benutzer zugänglich sein, einschließlich Menschen mit:
- Sehbehinderungen (Screen Reader, Vergrößerung)
- Motorischen Einschränkungen (Tastaturnavigation)
- Kognitiven Einschränkungen (Klare Struktur)

---

## 2. Dokumentstruktur

### 2.1 Semantisches HTML

```html
<main id="main-content">
  <article aria-labelledby="page-title">
    <header>
      <h1 id="page-title">Vertrag erstellen</h1>
    </header>

    <nav aria-label="Template Navigation">
      <!-- Template Navigation -->
    </nav>

    <section aria-labelledby="questions-heading">
      <h2 id="questions-heading">Fragen</h2>
      <!-- Question List -->
    </section>
  </article>
</main>
```

### 2.2 Überschriften-Hierarchie

```
h1: Seitentitel (z.B. "Vertrag erstellen")
└── h2: Hauptabschnitte (z.B. "Fragen")
    └── h3: Einzelfrage (z.B. "Laufzeit")
        └── h4: Detail/Erklärung
```

---

## 3. Baumstruktur (Controls/Groups)

### 3.1 ARIA Pattern (Template-Auswahl)

```tsx
<ul role="tree" aria-label="Template Hierarchie">
  {groups.map((group) => (
    <li
      role="treeitem"
      aria-expanded={isExpanded(group.id)}
      aria-level={1}
      tabIndex={isFocused(group.id) ? 0 : -1}
    >
      <div role="group">
        <button
          onClick={() => toggle(group.id)}
          aria-label={`${group.title}, Gruppe mit ${group.controls?.length || 0} Controls`}
        >
          <span aria-hidden="true">{isExpanded(group.id) ? '▼' : '▶'}</span>
          <span>{group.title}</span>
        </button>

        {isExpanded(group.id) && (
          <ul role="group">
            {group.templates?.map((template) => (
              <li role="treeitem" aria-level={2}>
                {template.title}
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  ))}
</ul>
```

### 3.2 Keyboard Navigation

| Taste | Aktion |
|-------|--------|
| ↓ | Nächstes Item |
| ↑ | Vorheriges Item |
| → | Gruppe öffnen / zum Kind |
| ← | Gruppe schließen / zum Parent |
| Enter/Space | Item auswählen |
| Home | Erstes Item |
| End | Letztes Item |
| * | Alle Gruppen öffnen |

---

## 4. File Upload

### 4.1 Drag & Drop mit Tastatur-Alternative

```tsx
<div
  role="region"
  aria-labelledby="dropzone-label"
  onDrop={handleDrop}
  onDragOver={handleDragOver}
>
<h2 id="dropzone-label">Dokumentvorlage laden</h2>

  <p>Ziehen Sie eine Datei hierher oder</p>

  {/* Tastatur-zugängliche Alternative */}
  <label>
    <input
      type="file"
      accept=".json,.xml"
      onChange={handleFileSelect}
      aria-describedby="file-hint"
    />
    <span class="visually-hidden">Datei auswählen</span>
    <span aria-hidden="true">Datei durchsuchen</span>
  </label>

  <p id="file-hint">Akzeptierte Formate: DOCX, ODT</p>
</div>
```

---

## 5. Kontraste und Farben

### 5.1 Farbkontraste

| Element | Verhältnis | Standard |
|---------|------------|----------|
| Normaler Text | 7:1 | AAA |
| Großer Text | 4.5:1 | AA |
| UI-Elemente | 3:1 | AA |

### 5.2 Nicht nur Farbe

```tsx
// Status nicht nur durch Farbe anzeigen
<span class="status status--success">
  <svg aria-hidden="true">✓</svg>
  <span>Implemented</span>
</span>

<span class="status status--error">
  <svg aria-hidden="true">✗</svg>
  <span>Not Implemented</span>
</span>
```

---

## 6. Fokus-Management

### 6.1 Sichtbarer Fokus

```css
:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

/* Custom Focus Ring */
.control-item:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--color-primary-light);
}
```

### 6.2 Skip Links

```tsx
<a href="#main-content" class="skip-link">
  Zum Hauptinhalt springen
</a>

<a href="#control-navigation" class="skip-link">
  Zur Navigation springen
</a>
```

---

## 7. Screen Reader Support

### 7.1 Live Regions

```tsx
// Für dynamische Updates
<div
  role="status"
  aria-live="polite"
  aria-atomic="true"
>
  {statusMessage && <p>{statusMessage}</p>}
</div>

// Beispiel: Nach Datei-Upload
setStatusMessage(`Vorlage "${template.title}" erfolgreich geladen`)
```

### 7.2 Beschreibende Labels

```tsx
// Eindeutige Labels für Controls
<article
  aria-labelledby={`question-${question.id}-title`}
  aria-describedby={`question-${question.id}-desc`}
>
  <h3 id={`question-${question.id}-title`}>
    {question.title}
  </h3>
  <p id={`question-${question.id}-desc`}>
    {question.helpText}
  </p>
</article>
```

---

## 8. Responsive & Zoom

### 8.1 Text-Vergrößerung

```css
/* Relative Einheiten verwenden */
.control-title {
  font-size: 1.25rem; /* Nicht px! */
}

.control-body {
  line-height: 1.6;
  max-width: 75ch; /* Lesbare Zeilenlänge */
}
```

### 8.2 Reflow bei 400% Zoom

```css
/* Keine horizontale Scrollbar bei Zoom */
.container {
  max-width: 100%;
  overflow-wrap: break-word;
}

/* Stack Layout bei Zoom */
@media (max-width: 400px) {
  .control-grid {
    grid-template-columns: 1fr;
  }
}
```

---

## 9. Testing

### 9.1 Automatisierte Tests

```typescript
import { axe, toHaveNoViolations } from 'jest-axe'

expect.extend(toHaveNoViolations)

it('should have no a11y violations', async () => {
  const { container } = render(<ControlView control={mockControl} />)
  const results = await axe(container)
  expect(results).toHaveNoViolations()
})
```

### 9.2 Manuelle Tests

- [ ] Tastatur-Navigation durch gesamte App
- [ ] Screen Reader Test (NVDA, VoiceOver)
- [ ] 200% Browser-Zoom
- [ ] 400% Browser-Zoom
- [ ] High Contrast Mode
- [ ] Reduced Motion

---

## 10. Checkliste pro Feature

- [ ] Semantisches HTML
- [ ] Fokus-Management
- [ ] Keyboard-zugänglich
- [ ] ARIA Labels (wenn nötig)
- [ ] Kontrastverhältnis geprüft
- [ ] axe-core Test bestanden
- [ ] Screen Reader getestet

---

**Letzte Aktualisierung**: 2024
