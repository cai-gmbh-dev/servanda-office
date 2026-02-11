import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, checkA11y } from '../../test-utils';
import { ContractsPage } from '../ContractsPage';

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
const CONTRACTS = [
  {
    id: 'c1',
    title: 'Mietvertrag Müller',
    clientReference: 'AZ-2024-001',
    status: 'draft',
    validationState: 'valid',
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-06-20T14:30:00Z',
  },
  {
    id: 'c2',
    title: 'Arbeitsvertrag Schmidt',
    clientReference: null,
    status: 'completed',
    validationState: 'has_warnings',
    createdAt: '2024-03-01T09:00:00Z',
    updatedAt: '2024-07-10T11:00:00Z',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ContractsPage', () => {
  it('renders loading state', () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    render(<ContractsPage />);
    expect(screen.getByText('Verträge werden geladen...')).toBeInTheDocument();
  });

  it('renders contracts table with status badges', async () => {
    mockGet.mockResolvedValue({ data: CONTRACTS, total: 2, page: 1, hasMore: false });
    render(<ContractsPage />);

    await waitFor(() => {
      expect(screen.getByText('Mietvertrag Müller')).toBeInTheDocument();
    });

    expect(screen.getByText('Arbeitsvertrag Schmidt')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Vertragsliste' })).toBeInTheDocument();
  });

  it('shows correct status text (Entwurf/Abgeschlossen)', async () => {
    mockGet.mockResolvedValue({ data: CONTRACTS, total: 2, page: 1, hasMore: false });
    render(<ContractsPage />);

    await waitFor(() => {
      expect(screen.getByText('Entwurf')).toBeInTheDocument();
    });

    expect(screen.getByText('Abgeschlossen')).toBeInTheDocument();
    expect(screen.getByText('Gültig')).toBeInTheDocument();
    expect(screen.getByText('Warnungen')).toBeInTheDocument();
  });

  it('renders empty state when no contracts', async () => {
    mockGet.mockResolvedValue({ data: [], total: 0, page: 1, hasMore: false });
    render(<ContractsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Noch keine Verträge erstellt/)).toBeInTheDocument();
    });
  });

  it('has no axe-core accessibility violations', async () => {
    mockGet.mockResolvedValue({ data: CONTRACTS, total: 2, page: 1, hasMore: false });
    const { container } = render(<ContractsPage />);

    await waitFor(() => {
      expect(screen.getByText('Mietvertrag Müller')).toBeInTheDocument();
    });

    const results = await checkA11y(container);
    expect(results).toHaveNoViolations();
  });
});
