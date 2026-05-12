import { useLocation, useNavigate } from 'react-router';

const tabs = [
  { path: '/', label: 'Adicionar', icon: '➕' },
  { path: '/transacoes', label: 'Transações', icon: '📋' },
  { path: '/resumo', label: 'Resumo', icon: '📊' },
  { path: '/tendencias', label: 'Tendências', icon: '📈' },
  { path: '/objetivos', label: 'Objetivos', icon: '🎯' },
  { path: '/patrimonio', label: 'Património', icon: '🏦' },
  { path: '/definicoes', label: 'Definições', icon: '⚙️' },
] as const;

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t border-[var(--color-border)] bg-[var(--color-bg)] md:hidden">
      {tabs.map((tab) => {
        const isActive = location.pathname === tab.path;
        return (
          <button
            key={tab.path}
            onClick={() => navigate(tab.path)}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs transition-colors min-h-[56px] ${
              isActive
                ? 'text-[var(--color-accent)] font-semibold'
                : 'text-[var(--color-text-secondary)]'
            }`}
          >
            <span className="text-xl">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
