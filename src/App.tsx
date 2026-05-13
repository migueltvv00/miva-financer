import { useEffect, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { AppLayout } from '@/components/AppLayout';
import { AuthScreen } from '@/features/auth/AuthScreen';
import { EntryScreen } from '@/features/transactions/EntryScreen';
import { TransactionListScreen } from '@/features/transactions/TransactionListScreen';
import { DashboardScreen } from '@/features/dashboard/DashboardScreen';
import { GoalsScreen } from '@/features/goals/GoalsScreen';
import { InvestmentScreen } from '@/features/investments/InvestmentScreen';
import { NetWorthScreen } from '@/features/net-worth/NetWorthScreen';
import { SettingsScreen } from '@/features/settings/SettingsScreen';
import { ImportScreen } from '@/features/import/ImportScreen';
import { TrendsScreen } from '@/features/trends/TrendsScreen';
import { processRecurringTransactions } from '@/lib/recurringEngine';
import { supabase } from '@/lib/supabase';

function AuthLoadingScreen() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-[var(--color-text-secondary)]">A carregar…</div>
    </div>
  );
}

function useLoadingTimeout(isLoading: boolean, timeoutMs = 5000) {
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setLoadingTimedOut(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setLoadingTimedOut(true);
    }, timeoutMs);

    return () => window.clearTimeout(timer);
  }, [isLoading, timeoutMs]);

  return loadingTimedOut;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const processedUserIdRef = useRef<string | null>(null);
  const loadingTimedOut = useLoadingTimeout(isLoading);

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

  if (isLoading && !loadingTimedOut) {
    return <AuthLoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const loadingTimedOut = useLoadingTimeout(isLoading);

  if (isLoading && !loadingTimedOut) {
    return <AuthLoadingScreen />;
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

export function App() {
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        return;
      }

      void supabase.auth.getSession().then(({ error }) => {
        if (error) {
          console.error('Erro ao revalidar sessão:', error);
        }
      });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

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
          <Route path="investimentos" element={<InvestmentScreen />} />
          <Route path="importar" element={<ImportScreen />} />
          <Route path="definicoes" element={<SettingsScreen />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
