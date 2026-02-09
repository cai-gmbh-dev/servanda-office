# Quality Gates - Servanda Office

**Version**: 1.0.0

---

## 1. Pull Request Gate

### 1.1 Automatische Checks

| Check | Tool | Bedingung | Blocking |
|-------|------|-----------|----------|
| Linting | ESLint | 0 Errors | ✅ |
| Type Check | TypeScript | 0 Errors | ✅ |
| Unit Tests | Vitest | 100% passed | ✅ |
| Coverage | Vitest | ≥ 80% | ✅ |
| Build | Vite | Erfolgreich | ✅ |
| Accessibility | axe-core | 0 Violations | ✅ |
| Bundle Size | size-limit | < 200KB | ⚠️ Warning |

### 1.2 Manuelle Review-Kriterien

- [ ] Tenant-Isolation geprüft (Server-side)
- [ ] Version Pinning geprüft
- [ ] Screen Reader getestet (bei UI-Änderungen)
- [ ] Keine Console-Errors im Browser
- [ ] Performance OK (bei großen Dokumenten)

---

## 2. Main Branch Gate

### 2.1 Post-Merge Checks

```yaml
jobs:
  full-validation:
    steps:
      - run: npm test -- --coverage
      - run: npm run test:e2e
      - run: npm run test:a11y
      - run: npm run lighthouse
```

### 2.2 Kriterien

| Check | Bedingung |
|-------|-----------|
| All Tests | 100% passed |
| E2E Tests | 100% passed |
| Accessibility | 0 Violations |
| Lighthouse Performance | ≥ 90 |
| Lighthouse Accessibility | ≥ 90 |

---

## 3. Produkt-spezifische Gates

### 3.1 Version Compatibility

Jeder PR muss die Versionierung und Pinning-Regeln validieren:

```typescript
describe('Version Pinning', () => {
  it('should pin template and clause versions', () => {
    const contract = createContractInstance()
    expect(contract.templateVersionId).toBeDefined()
    expect(contract.clauseVersionIds.length).toBeGreaterThan(0)
  })
})
```

### 3.2 Document Type Coverage

```typescript
describe('Tenant Isolation', () => {
  it('should scope all queries by tenantId', () => {
    const result = listTemplates({ tenantId: 't-1' })
    expect(result.every(t => t.tenantId === 't-1')).toBe(true)
  })
})
```

---

## 4. Performance Gates

### 4.1 Bundle Size

```javascript
// size-limit.config.js
module.exports = [
  {
    path: 'dist/assets/*.js',
    limit: '80 KB',
    gzip: true
  },
  {
    path: 'dist/assets/*.css',
    limit: '20 KB',
    gzip: true
  }
]
```

### 4.2 Runtime Performance

| Metrik | Threshold |
|--------|-----------|
| Render 100 Fragen | < 50ms |
| Render 1000 Fragen | < 500ms |
| Initial Render | < 150ms |
| First Contentful Paint | < 1.5s |

---

## 5. Accessibility Gates

### 5.1 Automatisierte Checks

```typescript
// Alle Komponenten müssen axe-tests bestehen
const components = [
  'TemplatePicker',
  'QuestionView',
  'ContractPreview',
  'ExportDialog'
]

components.forEach(component => {
  it(`${component} has no a11y violations`, async () => {
    const { container } = render(<Component />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
```

### 5.2 Manuelle Checks (bei UI-Änderungen)

- [ ] Keyboard-only Navigation möglich
- [ ] Focus-Ring immer sichtbar
- [ ] Screen Reader gibt sinnvolle Ausgabe
- [ ] Farben nicht als einziges Unterscheidungsmerkmal

---

## 6. Definition of Done

### 6.1 Feature Complete

- [ ] Funktionalität implementiert
- [ ] Unit Tests geschrieben
- [ ] Integration Tests (wenn relevant)
- [ ] Accessibility Tests bestanden

### 6.2 Code Quality

- [ ] ESLint: 0 Errors
- [ ] TypeScript: Strikte Typen
- [ ] Code Review: Approved

### 6.3 Documentation

- [ ] JSDoc für öffentliche APIs
- [ ] README aktualisiert (wenn relevant)
- [ ] ADR erstellt (bei Architektur-Entscheidungen)

---

## 7. Bypass-Prozess

### 7.1 Wann erlaubt

- Production-kritische Hotfixes
- Tech Lead Approval erforderlich

### 7.2 Anforderungen

```markdown
## Hotfix Exception

- [ ] Production-kritischer Bug
- [ ] Tech Lead Approved: @name
- [ ] Post-Fix Review geplant
- [ ] Rollback-Plan vorhanden
```

---

**Letzte Aktualisierung**: 2024
