import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { AppLayout } from '@/components/AppLayout';
import { AuthScreen } from '@/features/auth/AuthScreen';
import { EntryScreen } from '@/features/transactions/EntryScreen';
import { TransactionListScreen } from '@/features/transactions/TransactionListScreen';
import { DashboardScreen } from '@/features/dashboard/DashboardScreen';
import { SettingsScreen } from '@/features/settings/SettingsScreen';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-[var(--color-text-secondary)]">A carregar…</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-[var(--color-text-secondary)]">A carregar…</div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            <PublicRoute>
              <AuthScreen />
            </PublicRoute>
          }
        />
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<EntryScreen />} />
          <Route path="transacoes" element={<TransactionListScreen />} />
          <Route path="resumo" element={<DashboardScreen />} />
          <Route path="definicoes" element={<SettingsScreen />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
