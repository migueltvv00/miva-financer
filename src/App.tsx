import { useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { AppLayout } from '@/components/AppLayout';
import { AuthScreen } from '@/features/auth/AuthScreen';
import { EntryScreen } from '@/features/transactions/EntryScreen';
import { TransactionListScreen } from '@/features/transactions/TransactionListScreen';
import { DashboardScreen } from '@/features/dashboard/DashboardScreen';
import { GoalsScreen } from '@/features/goals/GoalsScreen';
import { NetWorthScreen } from '@/features/net-worth/NetWorthScreen';
import { SettingsScreen } from '@/features/settings/SettingsScreen';
import { TrendsScreen } from '@/features/trends/TrendsScreen';
import { processRecurringTransactions } from '@/lib/recurringEngine';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const processedUserIdRef = useRef<string | null>(null);

  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) {
      processedUserIdRef.current = null;
      return;
    }

    if (processedUserIdRef.current === userId) {
      return;
    }

    processedUserIdRef.current = userId;

    void processRecurringTransactions(userId).catch((error) => {
      console.error('Erro ao processar transações recorrentes:', error);
    });
  }, [userId]);

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
          <Route path="tendencias" element={<TrendsScreen />} />
          <Route path="objetivos" element={<GoalsScreen />} />
          <Route path="patrimonio" element={<NetWorthScreen />} />
          <Route path="definicoes" element={<SettingsScreen />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
