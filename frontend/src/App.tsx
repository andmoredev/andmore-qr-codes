import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ReactNode } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { QrListPage } from './pages/QrListPage';
import { QrEditorPage } from './pages/QrEditorPage';
import { QrDetailPage } from './pages/QrDetailPage';
import { PageListPage } from './pages/PageListPage';
import { PageEditorPage } from './pages/PageEditorPage';
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

          <Route path="/" element={authed(<HomePage />)} />
          <Route path="/qrs" element={authed(<QrListPage />)} />
          <Route path="/qrs/new" element={authed(<QrEditorPage />)} />
          <Route path="/qrs/:qrId" element={authed(<QrDetailPage />)} />
          <Route path="/qrs/:qrId/edit" element={authed(<QrEditorPage />)} />
          <Route path="/pages" element={authed(<PageListPage />)} />
          <Route path="/pages/new" element={authed(<PageEditorPage />)} />
          <Route path="/pages/:pageId" element={authed(<PageEditorPage />)} />
          <Route path="/analytics" element={authed(<AnalyticsPage />)} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
