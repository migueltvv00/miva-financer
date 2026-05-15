import { useMemo, useState } from 'react';
import { computeSpendingInsights } from '@/features/trends/spendingInsights';
import { formatCents } from '@/lib/utils';
import { useSettingsStore } from '@/store/settingsStore';
import type { Category, Transaction } from '@/types';

interface InsightsCardProps {
  transactions: Transaction[];
  trendTransactions: Transaction[];
  categories: Category[];
  selectedMonth: Date;
}

const percentFormatter = new Intl.NumberFormat('pt-PT', {
  maximumFractionDigits: 0,
});

function formatDeltaPct(value: number) {
  return `${percentFormatter.format(Math.abs(value))}%`;
}

export function InsightsCard({
  transactions,
  trendTransactions,
  categories,
  selectedMonth,
}: InsightsCardProps) {
  const monthStartDay = useSettingsStore((state) => state.settings.monthStartDay);
  const [isOpen, setIsOpen] = useState(false);

  const summary = useMemo(
    () =>
      computeSpendingInsights(
        transactions,
        trendTransactions,
        categories,
        selectedMonth,
        monthStartDay
      ),
    [categories, monthStartDay, selectedMonth, transactions, trendTransactions]
  );

  let summaryText = 'Gastou o mesmo que o período anterior.';
  let summaryClassName = 'text-[var(--color-text-secondary)]';

  if (summary.totalDeltaPct > 0) {
    summaryText = `Gastou ${formatDeltaPct(summary.totalDeltaPct)} mais que o período anterior.`;
    summaryClassName = 'text-[var(--color-danger)]';
  } else if (summary.totalDeltaPct < 0) {
    summaryText = `Gastou ${formatDeltaPct(summary.totalDeltaPct)} menos que o período anterior.`;
    summaryClassName = 'text-[var(--color-success)]';
  }

  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4 shadow-[var(--shadow-sm)]">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex min-h-[44px] w-full items-center justify-between gap-3 text-left"
        aria-expanded={isOpen}
      >
        <div>
          <h2 className="text-base font-semibold text-[var(--color-text)]">
            📊 Comparação com período anterior
          </h2>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Compare a evolução das despesas por categoria.
          </p>
        </div>
        <span
          className={`text-lg text-[var(--color-text-secondary)] transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        >
          ▾
        </span>
      </button>

      <div className="mt-4 rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)] p-4">
        {summary.hasPreviousData ? (
          <>
            <p className={`text-sm font-medium ${summaryClassName}`}>{summaryText}</p>
            <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
              {formatCents(summary.totalCurrentCents)} agora vs {formatCents(summary.totalPreviousCents)} antes.
            </p>
          </>
        ) : (
          <p className="text-sm text-[var(--color-text-secondary)]">
            Sem dados do período anterior para comparar.
          </p>
        )}
      </div>

      {isOpen && summary.hasPreviousData && (
        <div className="mt-4 space-y-3">
          {summary.topChanges.length === 0 ? (
            <p className="text-sm text-[var(--color-text-secondary)]">
              Sem alterações relevantes por categoria.
            </p>
          ) : (
            summary.topChanges.map((insight) => {
              const deltaCents = insight.currentCents - insight.previousCents;
              const isIncrease = deltaCents > 0;
              const toneClassName = isIncrease
                ? 'text-[var(--color-danger)]'
                : 'text-[var(--color-success)]';

              return (
                <div
                  key={insight.categoryId}
                  className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)] px-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--color-text)]">
                      {insight.emoji} {insight.name}
                    </p>
                    <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                      {formatCents(insight.previousCents)} → {formatCents(insight.currentCents)}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className={`text-sm font-semibold ${toneClassName}`}>
                      {isIncrease ? '▲' : '▼'} {formatCents(Math.abs(deltaCents))}
                    </p>
                    <p className={`mt-1 text-xs ${toneClassName}`}>
                      {formatDeltaPct(insight.deltaPct)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </section>
  );
}
