import { lazy, Suspense, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { useAuth } from '@/contexts/AuthContext';
import { AuthProvider } from '@/contexts/AuthProvider';
import { AppLayout } from '@/components/AppLayout';
import { AuthScreen } from '@/features/auth/AuthScreen';
import { ScreenSkeleton } from '@/components/ScreenSkeleton';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useTheme } from '@/hooks/useTheme';
import { processRecurringTransactions } from '@/lib/recurringEngine';

// Lazy-loaded route screens
const EntryScreen = lazy(() => import('@/features/transactions/EntryScreen'));
const TransactionListScreen = lazy(() => import('@/features/transactions/TransactionListScreen'));
const DashboardScreen = lazy(() => import('@/features/dashboard/DashboardScreen'));
const GoalsScreen = lazy(() => import('@/features/goals/GoalsScreen'));
const InvestmentScreen = lazy(() => import('@/features/investments/InvestmentScreen'));
const NetWorthScreen = lazy(() => import('@/features/net-worth/NetWorthScreen'));
const SettingsScreen = lazy(() => import('@/features/settings/SettingsScreen'));
const ImportScreen = lazy(() => import('@/features/import/ImportScreen'));
const TrendsScreen = lazy(() => import('@/features/trends/TrendsScreen'));

function AuthLoadingScreen() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-3 border-[var(--color-bg-tertiary)] border-t-[var(--color-accent)]" />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const processedUserIdRef = useRef<string | null>(null);

  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId || processedUserIdRef.current === userId) return;
    processedUserIdRef.current = userId;
    void processRecurringTransactions(userId).catch((error) => {
      console.error('Erro ao processar transações recorrentes:', error);
    });
  }, [userId]);

  if (isLoading) return <AuthLoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <AuthLoadingScreen />;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function LazyRoute({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<ScreenSkeleton />}>
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}

function ThemeApplier() {
  useTheme();
  return null;
}

export function App() {
  return (
    <AuthProvider>
      <ThemeApplier />
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
            <Route index element={<LazyRoute><EntryScreen /></LazyRoute>} />
            <Route path="transacoes" element={<LazyRoute><TransactionListScreen /></LazyRoute>} />
            <Route path="resumo" element={<LazyRoute><DashboardScreen /></LazyRoute>} />
            <Route path="tendencias" element={<LazyRoute><TrendsScreen /></LazyRoute>} />
            <Route path="objetivos" element={<LazyRoute><GoalsScreen /></LazyRoute>} />
            <Route path="patrimonio" element={<LazyRoute><NetWorthScreen /></LazyRoute>} />
            <Route path="investimentos" element={<LazyRoute><InvestmentScreen /></LazyRoute>} />
            <Route path="importar" element={<LazyRoute><ImportScreen /></LazyRoute>} />
            <Route path="definicoes" element={<LazyRoute><SettingsScreen /></LazyRoute>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
