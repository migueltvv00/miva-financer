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

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <aside className="hidden md:flex w-60 flex-col border-r border-[var(--color-border)] bg-[var(--color-bg-secondary)] h-full">
      <div className="flex items-center gap-2 px-5 py-6">
        <span className="text-2xl">💶</span>
        <h1 className="text-lg font-bold text-[var(--color-text)]">Fluxo</h1>
      </div>
      <nav className="flex flex-col gap-1 px-3">
        {tabs.map((tab) => {
          const isActive = location.pathname === tab.path;
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className={`flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-sm transition-colors text-left min-h-[44px] ${
                isActive
                  ? 'bg-[var(--color-accent-light)] text-[var(--color-accent)] font-semibold'
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]'
              }`}
            >
              <span className="text-lg">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
