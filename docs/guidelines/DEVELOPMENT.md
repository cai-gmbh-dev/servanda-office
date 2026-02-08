# Development Guidelines - OSCAL Viewer

**Version**: 1.0.0

---

## 1. Entwicklungsprinzipien

### 1.1 Clean Code

- **Lesbarkeit**: Code wird häufiger gelesen als geschrieben
- **Einfachheit**: Die einfachste Lösung ist oft die beste (KISS)
- **DRY**: Don't Repeat Yourself
- **YAGNI**: You Ain't Gonna Need It

### 1.2 OSCAL-Spezifisch

- Alle OSCAL-Versionen (1.0.x - aktuell) unterstützen
- Typsichere Parser für alle Dokumenttypen
- Defensive Programmierung bei der Dokumentverarbeitung

---

## 2. Code-Organisation

### 2.1 Verzeichnisstruktur

```
src/
├── components/       # UI-Komponenten
│   ├── common/       # Wiederverwendbare Komponenten
│   │   ├── Button.tsx
│   │   └── LoadingSpinner.tsx
│   └── features/     # Feature-spezifische Komponenten
│       ├── FileDropZone.tsx
│       ├── ControlView.tsx
│       └── GroupTree.tsx
├── hooks/            # Custom Hooks
│   ├── useDocument.ts
│   └── useFileParser.ts
├── services/         # Business Logic
│   ├── parser/
│   │   ├── catalog.ts
│   │   ├── profile.ts
│   │   ├── ssp.ts
│   │   └── detector.ts
│   └── validators/
├── types/            # TypeScript Typen
│   ├── oscal.ts
│   └── document.ts
├── utils/            # Hilfsfunktionen
└── styles/           # CSS
```

### 2.2 Datei-Benennung

| Typ | Konvention | Beispiel |
|-----|------------|----------|
| Komponenten | PascalCase | `ControlView.tsx` |
| Hooks | camelCase mit `use` | `useDocument.ts` |
| Parser | camelCase | `catalogParser.ts` |
| Types | PascalCase | `OscalTypes.ts` |
| Tests | `.test.ts` Suffix | `parser.test.ts` |

---

## 3. TypeScript Best Practices

### 3.1 OSCAL Type Definitions

```typescript
// Basistypen
interface OscalDocument {
  uuid: string
  metadata: Metadata
}

// Spezialisierte Typen
interface Catalog extends OscalDocument {
  groups?: Group[]
  controls?: Control[]
}

// Union für alle Dokumenttypen
type AnyOscalDocument = Catalog | Profile | ComponentDefinition | SystemSecurityPlan

// Type Guards
function isCatalog(doc: unknown): doc is Catalog {
  return isObject(doc) && 'catalog' in (doc as object)
}
```

### 3.2 Parser Patterns

```typescript
// Result Pattern für Parser
type ParseResult<T> =
  | { success: true; data: T; version: string }
  | { success: false; error: ParseError }

function parseCatalog(json: unknown): ParseResult<Catalog> {
  const version = detectVersion(json)

  try {
    const catalog = parseVersionSpecific(json, version)
    return { success: true, data: catalog, version }
  } catch (e) {
    return { success: false, error: new ParseError(e.message) }
  }
}
```

---

## 4. Error Handling

### 4.1 Parse Errors

```typescript
class OscalParseError extends Error {
  constructor(
    message: string,
    public readonly documentType?: string,
    public readonly location?: string
  ) {
    super(message)
    this.name = 'OscalParseError'
  }
}

// Verwendung
throw new OscalParseError(
  'Missing required field "uuid"',
  'catalog',
  'catalog.uuid'
)
```

### 4.2 User Feedback

```typescript
// Benutzerfreundliche Fehlermeldungen
function getErrorMessage(error: Error): string {
  if (error instanceof OscalParseError) {
    return `Das Dokument konnte nicht gelesen werden: ${error.message}`
  }
  if (error instanceof SyntaxError) {
    return 'Die Datei enthält kein gültiges JSON'
  }
  return 'Ein unerwarteter Fehler ist aufgetreten'
}
```

---

## 5. Performance

### 5.1 Große Dokumente

```typescript
// Virtualisierung für große Listen
function ControlList({ controls }: { controls: Control[] }) {
  return (
    <VirtualList
      items={controls}
      itemHeight={80}
      overscan={5}
      renderItem={(control) => <ControlRow control={control} />}
    />
  )
}

// Lazy Loading für Untergruppen
const GroupDetails = lazy(() => import('./GroupDetails'))
```

### 5.2 Memoization

```typescript
// Parser-Ergebnisse cachen
const parsedDocument = useMemo(
  () => parseDocument(rawJson),
  [rawJson]
)

// Gefilterte Listen cachen
const filteredControls = useMemo(
  () => controls.filter(c => matchesSearch(c, searchTerm)),
  [controls, searchTerm]
)
```

---

## 6. Accessibility

### 6.1 ARIA für Baumstrukturen

```tsx
<ul role="tree" aria-label="Control Hierarchy">
  {groups.map(group => (
    <li
      key={group.id}
      role="treeitem"
      aria-expanded={expanded[group.id]}
      aria-level={1}
    >
      <button
        onClick={() => toggleExpand(group.id)}
        aria-label={`${group.title}, ${expanded[group.id] ? 'eingeklappt' : 'ausgeklappt'}`}
      >
        {group.title}
      </button>
      {expanded[group.id] && <GroupChildren group={group} />}
    </li>
  ))}
</ul>
```

### 6.2 Keyboard Navigation

```typescript
function handleKeyDown(e: KeyboardEvent) {
  switch (e.key) {
    case 'ArrowDown':
      focusNextItem()
      break
    case 'ArrowUp':
      focusPreviousItem()
      break
    case 'ArrowRight':
      expandItem()
      break
    case 'ArrowLeft':
      collapseItem()
      break
    case 'Enter':
    case ' ':
      selectItem()
      break
  }
}
```

---

## 7. Testing

### 7.1 Parser Tests

```typescript
describe('Catalog Parser', () => {
  it('should parse OSCAL 1.0.4 catalog', () => {
    const result = parseCatalog(oscal104Sample)
    expect(result.success).toBe(true)
    expect(result.version).toBe('1.0.4')
  })

  it('should parse OSCAL 1.1.2 catalog', () => {
    const result = parseCatalog(oscal112Sample)
    expect(result.success).toBe(true)
    expect(result.version).toBe('1.1.2')
  })

  it('should handle missing metadata gracefully', () => {
    const result = parseCatalog({ catalog: {} })
    expect(result.success).toBe(false)
  })
})
```

### 7.2 Component Tests

```typescript
describe('ControlView', () => {
  it('should render control title', () => {
    render(<ControlView control={mockControl} />)
    expect(screen.getByText(mockControl.title)).toBeInTheDocument()
  })

  it('should be keyboard accessible', async () => {
    render(<ControlView control={mockControl} />)
    await userEvent.tab()
    expect(screen.getByRole('button')).toHaveFocus()
  })
})
```

---

## 8. Commit Guidelines

### 8.1 Commit Messages

```
feat(parser): add support for OSCAL 1.1.2
fix(viewer): correct nested group rendering
docs(readme): update installation instructions
test(parser): add edge cases for version detection
```

### 8.2 PR Checkliste

- [ ] Tests hinzugefügt/aktualisiert
- [ ] Dokumentation aktualisiert
- [ ] Accessibility geprüft
- [ ] Alle OSCAL-Versionen funktionieren

---

**Letzte Aktualisierung**: 2024
