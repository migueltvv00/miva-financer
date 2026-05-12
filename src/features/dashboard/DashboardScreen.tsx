export function DashboardScreen() {
  return (
    <div className="flex flex-col items-center justify-center h-full p-6">
      <span className="text-5xl mb-4">📊</span>
      <h2 className="text-xl font-semibold text-[var(--color-text)]">
        Resumo Mensal
      </h2>
      <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
        Acompanhe receitas, despesas e orçamentos.
      </p>
    </div>
  );
}
