/**
 * App — Sprint 13 (Team 04)
 *
 * Root routing component with code-splitting via React.lazy().
 * Each page is loaded on demand to improve initial bundle size.
 * Suspense fallback shows a centered spinner with ARIA status.
 */

import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { LoadingSpinner } from './components/LoadingSpinner';
import { DashboardPage } from './pages/DashboardPage';

// Lazy-loaded page components (code-splitting)
const CatalogPage = React.lazy(() =>
  import('./pages/CatalogPage').then((m) => ({ default: m.CatalogPage })),
);
const ContractsPage = React.lazy(() =>
  import('./pages/ContractsPage').then((m) => ({ default: m.ContractsPage })),
);
const InterviewPage = React.lazy(() =>
  import('./pages/InterviewPage').then((m) => ({ default: m.InterviewPage })),
);
const ReviewPage = React.lazy(() =>
  import('./pages/ReviewPage').then((m) => ({ default: m.ReviewPage })),
);

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route
          path="/catalog"
          element={
            <React.Suspense fallback={<LoadingSpinner />}>
              <CatalogPage />
            </React.Suspense>
          }
        />
        <Route
          path="/contracts"
          element={
            <React.Suspense fallback={<LoadingSpinner />}>
              <ContractsPage />
            </React.Suspense>
          }
        />
        <Route
          path="/contracts/new/:templateId"
          element={
            <React.Suspense fallback={<LoadingSpinner />}>
              <InterviewPage />
            </React.Suspense>
          }
        />
        <Route
          path="/contracts/:id/edit"
          element={
            <React.Suspense fallback={<LoadingSpinner />}>
              <InterviewPage />
            </React.Suspense>
          }
        />
        <Route
          path="/contracts/:id/review"
          element={
            <React.Suspense fallback={<LoadingSpinner />}>
              <ReviewPage />
            </React.Suspense>
          }
        />
      </Route>
    </Routes>
  );
}
