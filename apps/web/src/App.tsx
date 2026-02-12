import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { CatalogPage } from './pages/CatalogPage';
import { InterviewPage } from './pages/InterviewPage';
import { ContractsPage } from './pages/ContractsPage';
import { ReviewPage } from './pages/ReviewPage';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/catalog" element={<CatalogPage />} />
        <Route path="/contracts" element={<ContractsPage />} />
        <Route path="/contracts/new/:templateId" element={<InterviewPage />} />
        <Route path="/contracts/:id/edit" element={<InterviewPage />} />
        <Route path="/contracts/:id/review" element={<ReviewPage />} />
      </Route>
    </Routes>
  );
}
