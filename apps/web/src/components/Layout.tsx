import { Outlet, NavLink } from 'react-router-dom';

export function Layout() {
  return (
    <>
      {/* Skip Link (WCAG 2.4.1) */}
      <a href="#main-content" className="skip-link">
        Zum Hauptinhalt springen
      </a>

      <div style={{ display: 'flex', minHeight: '100vh' }}>
        {/* Sidebar Navigation */}
        <nav
          role="navigation"
          aria-label="Hauptnavigation"
          style={{
            width: 'var(--sidebar-width)',
            borderRight: '1px solid var(--color-border)',
            padding: 'var(--space-4)',
            backgroundColor: 'var(--color-bg-secondary)',
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 'var(--font-size-lg)', marginBottom: 'var(--space-6)' }}>
            Servanda Office
          </div>
          <ul style={{ listStyle: 'none' }}>
            <li><NavLink to="/dashboard">Dashboard</NavLink></li>
            <li><NavLink to="/catalog">Vorlagen-Katalog</NavLink></li>
            <li><NavLink to="/contracts">Verträge</NavLink></li>
          </ul>
        </nav>

        {/* Main Content */}
        <main
          id="main-content"
          role="main"
          style={{ flex: 1, padding: 'var(--space-6)' }}
        >
          <Outlet />
        </main>
      </div>
    </>
  );
}
