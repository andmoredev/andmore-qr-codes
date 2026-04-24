import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ReactNode } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { QrListPage } from './pages/QrListPage';
import { QrEditorPage } from './pages/QrEditorPage';
import { QrDetailPage } from './pages/QrDetailPage';
import { PresenterPage } from './pages/PresenterPage';
import { PageListPage } from './pages/PageListPage';
import { PageEditorPage } from './pages/PageEditorPage';
import { PagePreviewPage } from './pages/PagePreviewPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { PublicPage } from './pages/PublicPage';

const authed = (el: ReactNode) => (
  <ProtectedRoute>
    <Layout>{el}</Layout>
  </ProtectedRoute>
);

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/p/:slug" element={<PublicPage />} />

          <Route path="/" element={authed(<DashboardPage />)} />
          <Route path="/qrs" element={authed(<QrListPage />)} />
          <Route path="/qrs/new" element={authed(<QrEditorPage />)} />
          <Route path="/qrs/:qrId" element={authed(<QrDetailPage />)} />
          <Route path="/qrs/:qrId/edit" element={authed(<QrEditorPage />)} />
          <Route
            path="/qrs/:qrId/present"
            element={
              <ProtectedRoute>
                <PresenterPage />
              </ProtectedRoute>
            }
          />
          <Route path="/pages" element={authed(<PageListPage />)} />
          <Route path="/pages/new" element={authed(<PageEditorPage />)} />
          <Route path="/pages/:pageId" element={authed(<PageEditorPage />)} />
          <Route
            path="/pages/:pageId/preview"
            element={
              <ProtectedRoute>
                <PagePreviewPage />
              </ProtectedRoute>
            }
          />
          <Route path="/analytics" element={authed(<AnalyticsPage />)} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
