import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { AdminLayout } from './layouts/AdminLayout.js';
import { ProtectedRoute } from './components/ProtectedRoute.js';
import {
  LoginPage, DashboardPage, CampaignsPage, GroupsPage,
  ContactsPage, MessagesPage, FlowsPage, AiPage,
  TemplatesPage, IntegrationsPage, ImportsPage, AuditPage, SettingsPage,
  PrivacyPolicyPage,
} from './pages/index.js';

function LoginGuard() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: '100vh' }}>
        <div className="text-secondary">Carregando...</div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return <LoginPage />;
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/privacy" element={<PrivacyPolicyPage />} />
          <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
          <Route path="/data-deletion" element={<PrivacyPolicyPage />} />
          <Route path="/login" element={<LoginGuard />} />
          <Route
            element={
              <ProtectedRoute>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="campaigns" element={<CampaignsPage />} />
            <Route path="groups" element={<GroupsPage />} />
            <Route path="contacts" element={<ContactsPage />} />
            <Route path="messages" element={<MessagesPage />} />
            <Route path="templates" element={<TemplatesPage />} />
            <Route path="flows" element={<FlowsPage />} />
            <Route path="ai" element={<AiPage />} />
            <Route path="integrations" element={<IntegrationsPage />} />
            <Route path="imports" element={<ImportsPage />} />
            <Route path="audit" element={<AuditPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
