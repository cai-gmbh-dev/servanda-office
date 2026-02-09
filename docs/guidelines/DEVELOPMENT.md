# Development Guidelines - Servanda Office

**Version**: 1.0.0

---

## 1. Entwicklungsprinzipien

### 1.1 Clean Code

- **Lesbarkeit**: Code wird häufiger gelesen als geschrieben
- **Einfachheit**: Die einfachste Lösung ist oft die beste (KISS)
- **DRY**: Don't Repeat Yourself
- **YAGNI**: You Ain't Gonna Need It

### 1.2 Produkt-spezifisch (Servanda Office)

- Mandanten-Isolation serverseitig erzwingen
- Immutable Versionen für Templates und Klauseln
- Defensive Verarbeitung von Content und Exportdaten

---

## 2. Code-Organisation

### 2.1 Verzeichnisstruktur (Beispiel)

```
src/
├── components/       # UI-Komponenten
│   ├── common/
│   └── features/
├── hooks/
├── services/         # Business Logic
│   ├── content/
│   ├── builder/
│   └── export/
├── types/
├── utils/
└── styles/
```

### 2.2 Datei-Benennung

| Typ | Konvention | Beispiel |
|-----|------------|----------|
| Komponenten | PascalCase | `ControlView.tsx` |
| Hooks | camelCase mit `use` | `useDocument.ts` |
| Services | camelCase | `exportService.ts` |
| Types | PascalCase | `ContractTypes.ts` |
| Tests | `.test.ts` Suffix | `parser.test.ts` |

---

## 3. TypeScript Best Practices

### 3.1 Domänen-Typen

```typescript
// Basistypen
interface TenantScopedEntity {
  tenantId: string
}

interface TemplateVersion {
  id: string
  status: 'Draft' | 'Review' | 'Approved' | 'Published' | 'Deprecated'
}
```

### 3.2 Result Pattern

```typescript
// Result Pattern für Parser
type Result<T> =
  | { success: true; data: T }
  | { success: false; error: Error }
```

---

## 4. Error Handling

### 4.1 Parse Errors

```typescript
class DomainValidationError extends Error {
  constructor(
    message: string,
    public readonly entityType?: string,
    public readonly location?: string
  ) {
    super(message)
    this.name = 'DomainValidationError'
  }
}

// Verwendung
throw new DomainValidationError(
  'Missing required field "templateVersionId"',
  'contract',
  'contract.templateVersionId'
)
```

### 4.2 User Feedback

```typescript
// Benutzerfreundliche Fehlermeldungen
function getErrorMessage(error: Error): string {
  if (error instanceof DomainValidationError) {
    return `Die Eingabe ist unvollständig: ${error.message}`
  }
  return 'Ein unerwarteter Fehler ist aufgetreten'
}
```

---

## 5. Performance

### 5.1 Große Dokumente

```typescript
// Virtualisierung für große Listen
function TemplateList({ templates }: { templates: Template[] }) {
  return (
    <VirtualList
      items={templates}
      itemHeight={80}
      overscan={5}
      renderItem={(template) => <TemplateRow template={template} />}
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
describe('Template Versioning', () => {
  it('should create immutable versions', () => {
    const v1 = createTemplateVersion()
    const v2 = createTemplateVersion()
    expect(v1.id).not.toBe(v2.id)
  })
})
```

### 7.2 Component Tests

```typescript
describe('ContractBuilder', () => {
  it('should render question title', () => {
    render(<QuestionView question={mockQuestion} />)
    expect(screen.getByText(mockQuestion.title)).toBeInTheDocument()
  })

  it('should be keyboard accessible', async () => {
    render(<QuestionView question={mockQuestion} />)
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
