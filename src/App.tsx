import { BrowserRouter, Routes, Route } from 'react-router';
import { AppLayout } from '@/components/AppLayout';
import { EntryScreen } from '@/features/transactions/EntryScreen';
import { TransactionListScreen } from '@/features/transactions/TransactionListScreen';
import { DashboardScreen } from '@/features/dashboard/DashboardScreen';
import { SettingsScreen } from '@/features/settings/SettingsScreen';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<EntryScreen />} />
          <Route path="transacoes" element={<TransactionListScreen />} />
          <Route path="resumo" element={<DashboardScreen />} />
          <Route path="definicoes" element={<SettingsScreen />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
