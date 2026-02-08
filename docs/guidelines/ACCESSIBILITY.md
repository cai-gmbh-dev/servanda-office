# Accessibility Guidelines - OSCAL Viewer

**Version**: 1.0.0
**Standard**: WCAG 2.1 Level AA

---

## 1. Grundprinzipien

Der OSCAL Viewer muss für alle Benutzer zugänglich sein, einschließlich Menschen mit:
- Sehbehinderungen (Screen Reader, Vergrößerung)
- Motorischen Einschränkungen (Tastaturnavigation)
- Kognitiven Einschränkungen (Klare Struktur)

---

## 2. Dokumentstruktur

### 2.1 Semantisches HTML

```html
<main id="main-content">
  <article aria-labelledby="doc-title">
    <header>
      <h1 id="doc-title">NIST 800-53 Catalog</h1>
    </header>

    <nav aria-label="Control Navigation">
      <!-- Group/Control Navigation -->
    </nav>

    <section aria-labelledby="controls-heading">
      <h2 id="controls-heading">Controls</h2>
      <!-- Control List -->
    </section>
  </article>
</main>
```

### 2.2 Überschriften-Hierarchie

```
h1: Dokumenttitel (z.B. "NIST 800-53 Rev 5")
└── h2: Hauptabschnitte (z.B. "Access Control")
    └── h3: Controls (z.B. "AC-1")
        └── h4: Unterabschnitte (z.B. "Parameters")
```

---

## 3. Baumstruktur (Controls/Groups)

### 3.1 ARIA Tree Pattern

```tsx
<ul role="tree" aria-label="OSCAL Control Hierarchy">
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
            {group.controls?.map((control) => (
              <li role="treeitem" aria-level={2}>
                {control.title}
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
  <h2 id="dropzone-label">OSCAL Dokument laden</h2>

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

  <p id="file-hint">Akzeptierte Formate: JSON, XML</p>
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
setStatusMessage(`Katalog "${doc.metadata.title}" erfolgreich geladen`)
```

### 7.2 Beschreibende Labels

```tsx
// Eindeutige Labels für Controls
<article
  aria-labelledby={`control-${control.id}-title`}
  aria-describedby={`control-${control.id}-desc`}
>
  <h3 id={`control-${control.id}-title`}>
    {control.id}: {control.title}
  </h3>
  <p id={`control-${control.id}-desc`}>
    {control.parts?.find(p => p.name === 'statement')?.prose}
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
