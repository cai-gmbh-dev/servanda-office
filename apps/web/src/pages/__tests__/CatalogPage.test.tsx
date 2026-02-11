import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, checkA11y } from '../../test-utils';
import { CatalogPage } from '../CatalogPage';

// ---- Mock API ----
const mockGet = vi.fn();
vi.mock('../../lib/api', () => ({
  api: { get: (...args: unknown[]) => mockGet(...args) },
}));

// ---- Mock useNavigate ----
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

// ---- Fixtures ----
const TEMPLATES = [
  {
    id: 't1',
    title: 'Mietvertrag',
    description: 'Standard-Mietvertrag für Wohnräume',
    category: 'Immobilien',
    jurisdiction: 'DE',
    tags: ['Miete', 'Wohnung'],
    latestVersion: { id: 'v1', versionNumber: 1 },
  },
  {
    id: 't2',
    title: 'Arbeitsvertrag',
    description: null,
    category: null,
    jurisdiction: 'DE',
    tags: [],
    latestVersion: { id: 'v2', versionNumber: 2 },
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CatalogPage', () => {
  it('renders loading state initially', () => {
    // Never resolve so we stay in loading state
    mockGet.mockReturnValue(new Promise(() => {}));
    render(<CatalogPage />);
    expect(screen.getByText('Vorlagen werden geladen...')).toBeInTheDocument();
  });

  it('renders template cards after successful fetch', async () => {
    mockGet.mockResolvedValue({ data: TEMPLATES, total: 2, page: 1, hasMore: false });
    render(<CatalogPage />);

    await waitFor(() => {
      expect(screen.getByText('Mietvertrag')).toBeInTheDocument();
    });

    expect(screen.getByText('Arbeitsvertrag')).toBeInTheDocument();
    expect(screen.getByText('Standard-Mietvertrag für Wohnräume')).toBeInTheDocument();
    expect(screen.getByText('Immobilien')).toBeInTheDocument();
  });

  it('renders empty state when no templates', async () => {
    mockGet.mockResolvedValue({ data: [], total: 0, page: 1, hasMore: false });
    render(<CatalogPage />);

    await waitFor(() => {
      expect(
        screen.getByText('Keine veröffentlichten Vorlagen verfügbar.'),
      ).toBeInTheDocument();
    });
  });

  it('renders error state on fetch failure', async () => {
    mockGet.mockRejectedValue(new Error('Netzwerkfehler'));
    render(<CatalogPage />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Netzwerkfehler');
    });
  });

  it('navigates to interview on template select', async () => {
    mockGet.mockResolvedValue({ data: TEMPLATES, total: 2, page: 1, hasMore: false });
    render(<CatalogPage />);

    await waitFor(() => {
      expect(screen.getByText('Mietvertrag')).toBeInTheDocument();
    });

    const button = screen.getByLabelText('Vertrag erstellen mit Vorlage Mietvertrag');
    button.click();

    expect(mockNavigate).toHaveBeenCalledWith('/contracts/new/v1');
  });

  it('each template card has role="listitem"', async () => {
    mockGet.mockResolvedValue({ data: TEMPLATES, total: 2, page: 1, hasMore: false });
    render(<CatalogPage />);

    await waitFor(() => {
      expect(screen.getByText('Mietvertrag')).toBeInTheDocument();
    });

    const listItems = screen.getAllByRole('listitem');
    expect(listItems).toHaveLength(2);
  });

  it('has no axe-core accessibility violations', async () => {
    mockGet.mockResolvedValue({ data: TEMPLATES, total: 2, page: 1, hasMore: false });
    const { container } = render(<CatalogPage />);

    await waitFor(() => {
      expect(screen.getByText('Mietvertrag')).toBeInTheDocument();
    });

    const results = await checkA11y(container);
    expect(results).toHaveNoViolations();
  });
});
