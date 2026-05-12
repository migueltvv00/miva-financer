import { useEffect, useMemo, useRef, useState } from 'react';
import { Line, LineChart, Pie, PieChart, ResponsiveContainer, Cell, Tooltip, XAxis, YAxis } from 'recharts';
import { useAuth } from '@/hooks/useAuth';
import { formatCents } from '@/lib/utils';
import type { InvestmentAccount, InvestmentSnapshot } from '@/types';
import { AccountModal, type InvestmentAccountFormValues } from './AccountModal';
import { ACCOUNT_TYPE_LABELS } from './constants';
import { useInvestmentData } from './useInvestmentData';
import {
  formatEditableEuro,
  formatMonthLabel,
  getFriendlyErrorMessage,
  parseEuroInput,
  sanitizeEuroInput,
} from './utils';

interface SnapshotDraft {
  value: string;
  valueCents: number | null;
  costBasis: string;
  costBasisCents: number | null;
  dirty: boolean;
}

interface AllocationChartItem {
  accountId: string;
  name: string;
  valueCents: number;
  color: string;
  percentage: number;
}

interface HistoryChartPoint {
  month: string;
  totalValueCents: number;
}

type AccountModalState =
  | { mode: 'create' }
  | { mode: 'edit'; account: InvestmentAccount };

const TOAST_HIDE_DELAY_MS = 3_000;

function createDraftFromSnapshot(snapshot: InvestmentSnapshot | null): SnapshotDraft {
  return {
    value: formatEditableEuro(snapshot?.value_cents),
    valueCents: snapshot?.value_cents ?? null,
    costBasis: formatEditableEuro(snapshot?.cost_basis_cents),
    costBasisCents: snapshot?.cost_basis_cents ?? null,
    dirty: false,
  };
}

function formatPercentage(value: number) {
  return new Intl.NumberFormat('pt-PT', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

function getGainPercentageLabel(valueCents: number | null, costBasisCents: number | null) {
  if (valueCents === null || costBasisCents === null) {
    return '—';
  }

  if (costBasisCents === 0) {
    return 'N/A';
  }

  return `${formatPercentage((valueCents / costBasisCents - 1) * 100)}%`;
}

export function InvestmentScreen() {
  const { user } = useAuth();
  const {
    accounts,
    snapshots,
    isLoading,
    error,
    monthLabel,
    monthKey,
    goToPreviousMonth,
    goToNextMonth,
    createAccount,
    updateAccount,
    deleteAccount,
    saveSnapshot,
    copyFromLastMonth,
    syncToNetWorth,
  } = useInvestmentData(user?.id);

  const [drafts, setDrafts] = useState<Record<string, SnapshotDraft>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [savingSnapshotId, setSavingSnapshotId] = useState<string | null>(null);
  const [pendingDeleteAccountId, setPendingDeleteAccountId] = useState<string | null>(null);
  const [showAccountManagement, setShowAccountManagement] = useState(false);
  const [accountModalState, setAccountModalState] = useState<AccountModalState | null>(null);
  const [accountModalError, setAccountModalError] = useState<string | null>(null);
  const [isSavingAccount, setIsSavingAccount] = useState(false);
  const previousMonthKeyRef = useRef(monthKey);

  useEffect(() => {
    if (!toastMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setToastMessage(null);
    }, TOAST_HIDE_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [toastMessage]);

  const currentMonthSnapshots = useMemo(
    () => snapshots.filter((snapshot) => snapshot.month === monthKey),
    [monthKey, snapshots]
  );
  const currentMonthSnapshotMap = useMemo(
    () => new Map(currentMonthSnapshots.map((snapshot) => [snapshot.account_id, snapshot])),
    [currentMonthSnapshots]
  );
  const currentMonthSnapshotSignature = useMemo(
    () =>
      [...currentMonthSnapshots]
        .sort((left, right) => left.account_id.localeCompare(right.account_id))
        .map(
          (snapshot) =>
            `${snapshot.account_id}:${snapshot.value_cents}:${snapshot.cost_basis_cents}`
        )
        .join('|'),
    [currentMonthSnapshots]
  );

  useEffect(() => {
    setDrafts((currentDrafts) => {
      const monthChanged = previousMonthKeyRef.current !== monthKey;
      const nextDrafts: Record<string, SnapshotDraft> = {};

      for (const account of accounts) {
        const currentDraft = currentDrafts[account.id];
        const snapshot = currentMonthSnapshotMap.get(account.id) ?? null;

        if (!monthChanged && currentDraft?.dirty) {
          nextDrafts[account.id] = currentDraft;
          continue;
        }

        nextDrafts[account.id] = createDraftFromSnapshot(snapshot);
      }

      previousMonthKeyRef.current = monthKey;
      return nextDrafts;
    });
  }, [accounts, currentMonthSnapshotMap, currentMonthSnapshotSignature, monthKey]);

  const accountRows = useMemo(
    () =>
      accounts.map((account) => {
        const draft = drafts[account.id] ?? createDraftFromSnapshot(currentMonthSnapshotMap.get(account.id) ?? null);

        return {
          account,
          draft,
          valueCents: draft.valueCents,
          costBasisCents: draft.costBasisCents,
        };
      }),
    [accounts, currentMonthSnapshotMap, drafts]
  );

  const totalPortfolioValue = useMemo(
    () => accountRows.reduce((total, row) => total + (row.valueCents ?? 0), 0),
    [accountRows]
  );
  const totalInvested = useMemo(
    () => accountRows.reduce((total, row) => total + (row.costBasisCents ?? 0), 0),
    [accountRows]
  );
  const totalGain = totalPortfolioValue - totalInvested;
  const totalGainPercentage = totalInvested === 0 ? 'N/A' : `${formatPercentage((totalPortfolioValue / totalInvested - 1) * 100)}%`;

  const allocationData = useMemo<AllocationChartItem[]>(() => {
    if (totalPortfolioValue <= 0) {
      return [];
    }

    return accountRows
      .filter((row) => (row.valueCents ?? 0) > 0)
      .map((row) => ({
        accountId: row.account.id,
        name: row.account.name,
        valueCents: row.valueCents ?? 0,
        color: row.account.color,
        percentage: ((row.valueCents ?? 0) / totalPortfolioValue) * 100,
      }));
  }, [accountRows, totalPortfolioValue]);

  const historyChartData = useMemo<HistoryChartPoint[]>(() => {
    const totalsByMonth = snapshots.reduce<Record<string, number>>((accumulator, snapshot) => {
      accumulator[snapshot.month] = (accumulator[snapshot.month] ?? 0) + snapshot.value_cents;
      return accumulator;
    }, {});

    return Object.entries(totalsByMonth)
      .sort(([leftMonth], [rightMonth]) => leftMonth.localeCompare(rightMonth))
      .map(([month, totalValueCents]) => ({ month, totalValueCents }));
  }, [snapshots]);

  const messages = useMemo(
    () =>
      Array.from(
        new Set(
          [error, actionError].filter((message): message is string => Boolean(message))
        )
      ),
    [actionError, error]
  );

  const updateDraft = (
    accountId: string,
    field: 'value' | 'costBasis',
    nextValue: string
  ) => {
    setActionError(null);
    setDrafts((currentDrafts) => {
      const currentDraft = currentDrafts[accountId] ?? createDraftFromSnapshot(null);
      const sanitizedValue = sanitizeEuroInput(nextValue);
      const parsedValue = parseEuroInput(sanitizedValue);

      return {
        ...currentDrafts,
        [accountId]: {
          ...currentDraft,
          [field]: sanitizedValue,
          [`${field}Cents`]: parsedValue,
          dirty: true,
        } as SnapshotDraft,
      };
    });
  };

  const handleSaveSnapshot = async (account: InvestmentAccount) => {
    const draft = drafts[account.id] ?? createDraftFromSnapshot(currentMonthSnapshotMap.get(account.id) ?? null);

    if (
      draft.valueCents === null ||
      draft.costBasisCents === null ||
      draft.value.trim() === '' ||
      draft.costBasis.trim() === ''
    ) {
      setActionError(`Preencha o valor atual e o total investido da conta “${account.name}”.`);
      return;
    }

    setActionError(null);
    setToastMessage(null);
    setSavingSnapshotId(account.id);

    try {
      await saveSnapshot(account.id, draft.valueCents, draft.costBasisCents);
      setDrafts((currentDrafts) => ({
        ...currentDrafts,
        [account.id]: {
          ...draft,
          dirty: false,
        },
      }));
      setToastMessage(`Registo guardado para “${account.name}”.`);
    } catch (saveError) {
      console.error('Erro ao guardar registo de investimento:', saveError);
      setActionError(
        getFriendlyErrorMessage(saveError, 'Não foi possível guardar o registo da conta.')
      );
    } finally {
      setSavingSnapshotId(null);
    }
  };

  const handleCopyFromLastMonth = () => {
    setActionError(null);
    setToastMessage(null);

    try {
      copyFromLastMonth();
      setDrafts((currentDrafts) =>
        Object.fromEntries(
          Object.entries(currentDrafts).map(([accountId, draft]) => [
            accountId,
            { ...draft, dirty: false },
          ])
        )
      );
      setToastMessage('Dados copiados do mês anterior.');
    } catch (copyError) {
      console.error('Erro ao copiar dados do mês anterior:', copyError);
      setActionError(
        getFriendlyErrorMessage(copyError, 'Não foi possível copiar os dados do mês anterior.')
      );
    }
  };

  const handleSyncToNetWorth = async () => {
    setActionError(null);
    setToastMessage(null);
    setIsSyncing(true);

    try {
      await syncToNetWorth();
      setToastMessage('Valores sincronizados com o património.');
    } catch (syncError) {
      console.error('Erro ao sincronizar investimentos com património:', syncError);
      setActionError(
        getFriendlyErrorMessage(syncError, 'Não foi possível sincronizar com o património.')
      );
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveAccount = async (values: InvestmentAccountFormValues) => {
    setAccountModalError(null);
    setIsSavingAccount(true);

    try {
      if (accountModalState?.mode === 'edit') {
        await updateAccount(accountModalState.account.id, values);
        setToastMessage('Conta atualizada.');
      } else {
        await createAccount(values);
        setToastMessage('Conta criada.');
      }

      setShowAccountManagement(true);
      setAccountModalState(null);
    } catch (saveError) {
      console.error('Erro ao guardar conta de investimento:', saveError);
      setAccountModalError(
        getFriendlyErrorMessage(saveError, 'Não foi possível guardar a conta de investimento.')
      );
    } finally {
      setIsSavingAccount(false);
    }
  };

  const handleDeleteAccount = async (account: InvestmentAccount) => {
    const confirmed = window.confirm(
      `Tem a certeza que quer eliminar a conta “${account.name}”?`
    );

    if (!confirmed) {
      return;
    }

    setActionError(null);
    setToastMessage(null);
    setPendingDeleteAccountId(account.id);

    try {
      await deleteAccount(account.id);
      setToastMessage('Conta eliminada.');

      if (accountModalState?.mode === 'edit' && accountModalState.account.id === account.id) {
        setAccountModalState(null);
      }
    } catch (deleteError) {
      console.error('Erro ao eliminar conta de investimento:', deleteError);
      setActionError(
        getFriendlyErrorMessage(deleteError, 'Não foi possível eliminar a conta de investimento.')
      );
    } finally {
      setPendingDeleteAccountId(null);
    }
  };

  return (
    <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-4 bg-[var(--color-bg-secondary)] p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">
          Portfólio de Investimentos
        </h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Registe o valor mensal de cada conta de investimento.
        </p>
      </header>

      {toastMessage && (
        <div
          className="rounded-[var(--radius-md)] border border-[var(--color-success)] bg-[var(--color-accent-light)] px-4 py-3 text-sm font-medium text-[var(--color-accent)]"
          aria-live="polite"
        >
          {toastMessage}
        </div>
      )}

      {messages.length > 0 && (
        <div className="flex flex-col gap-3">
          {messages.map((message) => (
            <p
              key={message}
              className="rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-danger)]"
            >
              {message}
            </p>
          ))}
        </div>
      )}

      <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-[var(--color-text)]">Mês</h2>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              Navegue entre os seus registos mensais do portfólio.
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)] p-1">
            <button
              type="button"
              onClick={goToPreviousMonth}
              aria-label="Ver mês anterior"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[var(--radius-md)] border border-transparent text-lg text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg)]"
            >
              ←
            </button>
            <p className="min-w-[8.5rem] text-center text-sm font-semibold text-[var(--color-text)]">
              {monthLabel}
            </p>
            <button
              type="button"
              onClick={goToNextMonth}
              aria-label="Ver mês seguinte"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[var(--radius-md)] border border-transparent text-lg text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg)]"
            >
              →
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
        <div className="border-b border-[var(--color-divider)] pb-3">
          <h2 className="text-base font-semibold text-[var(--color-text)]">
            Resumo do portfólio
          </h2>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Totais calculados para {monthLabel.toLowerCase()}.
          </p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">
              Valor total
            </p>
            <p className="mt-2 text-lg font-semibold text-[var(--color-text)]">
              {formatCents(totalPortfolioValue)}
            </p>
          </div>
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">
              Total investido
            </p>
            <p className="mt-2 text-lg font-semibold text-[var(--color-text)]">
              {formatCents(totalInvested)}
            </p>
          </div>
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">
              Ganho / perda
            </p>
            <p
              className={`mt-2 text-lg font-semibold ${
                totalGain >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'
              }`}
            >
              {formatCents(totalGain)}
            </p>
          </div>
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">
              Rentabilidade
            </p>
            <p
              className={`mt-2 text-lg font-semibold ${
                totalGain >= 0 || totalInvested === 0
                  ? 'text-[var(--color-success)]'
                  : 'text-[var(--color-danger)]'
              }`}
            >
              {totalGainPercentage}
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
          <div className="border-b border-[var(--color-divider)] pb-3">
            <h2 className="text-base font-semibold text-[var(--color-text)]">
              Distribuição atual
            </h2>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              Veja a alocação do seu portfólio por conta.
            </p>
          </div>

          {allocationData.length === 0 ? (
            <div className="mt-4 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-6 text-sm text-[var(--color-text-secondary)]">
              Adicione valores às contas deste mês para ver a alocação do portfólio.
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="relative h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={allocationData}
                      dataKey="valueCents"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius="62%"
                      outerRadius="92%"
                      paddingAngle={2}
                      stroke="var(--color-bg)"
                      strokeWidth={2}
                    >
                      {allocationData.map((item) => (
                        <Cell key={item.accountId} fill={item.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number | string) => formatCents(Number(value))}
                      contentStyle={{
                        borderColor: 'var(--color-border)',
                        borderRadius: '8px',
                        backgroundColor: 'var(--color-bg)',
                        color: 'var(--color-text)',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>

                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--color-text-secondary)]">
                      Total
                    </p>
                    <p className="mt-2 text-sm font-semibold text-[var(--color-text)] sm:text-base">
                      {formatCents(totalPortfolioValue)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {allocationData.map((item) => (
                  <div
                    key={item.accountId}
                    className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)] px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="truncate text-sm font-medium text-[var(--color-text)]">
                        {item.name}
                      </span>
                    </div>
                    <span className="text-sm text-[var(--color-text-secondary)]">
                      {formatPercentage(item.percentage)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
          <div className="border-b border-[var(--color-divider)] pb-3">
            <h2 className="text-base font-semibold text-[var(--color-text)]">Evolução</h2>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              Acompanhe a evolução do valor total do portfólio.
            </p>
          </div>

          {isLoading ? (
            <div className="flex min-h-[240px] items-center justify-center text-sm text-[var(--color-text-secondary)]">
              A carregar portfólio…
            </div>
          ) : historyChartData.length < 2 ? (
            <div className="mt-4 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-6 text-sm text-[var(--color-text-secondary)]">
              Adicione dados de pelo menos 2 meses para ver o gráfico.
            </div>
          ) : (
            <div className="mt-4 h-[240px] w-full">
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={historyChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <XAxis
                    dataKey="month"
                    tickFormatter={(value: string) => formatMonthLabel(value, 'LLL yy')}
                    tick={{ fontSize: 10, fill: 'var(--color-text-secondary)' }}
                    axisLine={{ stroke: 'var(--color-border)' }}
                    tickLine={{ stroke: 'var(--color-border)' }}
                  />
                  <YAxis
                    tickFormatter={(value: number) => formatCents(value)}
                    tick={{ fontSize: 10, fill: 'var(--color-text-secondary)' }}
                    axisLine={{ stroke: 'var(--color-border)' }}
                    tickLine={{ stroke: 'var(--color-border)' }}
                    width={80}
                  />
                  <Tooltip
                    formatter={(value: number | string) => formatCents(Number(value))}
                    labelFormatter={(label) => formatMonthLabel(String(label), 'LLLL yyyy')}
                    contentStyle={{
                      borderColor: 'var(--color-border)',
                      borderRadius: '8px',
                      backgroundColor: 'var(--color-bg)',
                      color: 'var(--color-text)',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="totalValueCents"
                    stroke="var(--color-accent)"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>

      <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-[var(--color-text)]">Ações rápidas</h2>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              Copie valores, sincronize com o património e gira as contas.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              onClick={handleCopyFromLastMonth}
              className="flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg-secondary)]"
            >
              Copiar do mês anterior
            </button>
            <button
              type="button"
              onClick={() => {
                void handleSyncToNetWorth();
              }}
              disabled={isSyncing}
              className="flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-light)] disabled:opacity-50"
            >
              {isSyncing ? 'A sincronizar…' : 'Sincronizar com Património'}
            </button>
            <button
              type="button"
              onClick={() => setShowAccountManagement((currentValue) => !currentValue)}
              className="flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-text-inverse)] transition-colors hover:bg-[var(--color-accent-hover)]"
            >
              Gerir contas
            </button>
          </div>
        </div>
      </section>

      {showAccountManagement && (
        <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
          <div className="flex flex-col gap-3 border-b border-[var(--color-divider)] pb-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-[var(--color-text)]">
                Gestão de contas
              </h2>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                Crie, edite ou elimine as contas do seu portfólio.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setAccountModalError(null);
                setAccountModalState({ mode: 'create' });
              }}
              className="flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-light)]"
            >
              Nova conta
            </button>
          </div>

          {accounts.length === 0 ? (
            <div className="mt-4 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-6 text-sm text-[var(--color-text-secondary)]">
              Ainda não existem contas de investimento. Crie a primeira conta para começar.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {accounts.map((account) => (
                <div
                  key={account.id}
                  className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: account.color }}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--color-text)]">
                        {account.name}
                      </p>
                      <p className="text-xs text-[var(--color-text-secondary)]">
                        {ACCOUNT_TYPE_LABELS[account.type]}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setAccountModalError(null);
                        setAccountModalState({ mode: 'edit', account });
                      }}
                      className="flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg)]"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void handleDeleteAccount(account);
                      }}
                      disabled={pendingDeleteAccountId === account.id}
                      className="flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-danger)] px-3 py-2 text-sm font-medium text-[var(--color-danger)] transition-colors hover:bg-[var(--color-bg)] disabled:opacity-50"
                    >
                      {pendingDeleteAccountId === account.id ? 'A eliminar…' : 'Eliminar'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
        <div className="border-b border-[var(--color-divider)] pb-3">
          <h2 className="text-base font-semibold text-[var(--color-text)]">
            Registos por conta
          </h2>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Atualize o valor atual e o total investido em cada conta.
          </p>
        </div>

        {accounts.length === 0 ? (
          <div className="mt-4 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-6 text-sm text-[var(--color-text-secondary)]">
            Ainda não existem contas. Use “Gerir contas” para adicionar a primeira conta de investimento.
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {accountRows.map(({ account, draft, valueCents, costBasisCents }) => {
              const gain = valueCents !== null && costBasisCents !== null ? valueCents - costBasisCents : null;
              const gainLabel = gain === null ? '—' : formatCents(gain);
              const gainColor = gain === null
                ? 'text-[var(--color-text-secondary)]'
                : gain >= 0
                  ? 'text-[var(--color-success)]'
                  : 'text-[var(--color-danger)]';

              return (
                <article
                  key={account.id}
                  className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4"
                >
                  <div className="flex flex-col gap-3 border-b border-[var(--color-divider)] pb-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: account.color }}
                        />
                        <h3 className="truncate text-base font-semibold text-[var(--color-text)]">
                          {account.name}
                        </h3>
                      </div>
                      <span className="mt-2 inline-flex rounded-full bg-[var(--color-bg)] px-2.5 py-1 text-xs font-medium text-[var(--color-text-secondary)]">
                        {ACCOUNT_TYPE_LABELS[account.type]}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        void handleSaveSnapshot(account);
                      }}
                      disabled={savingSnapshotId === account.id}
                      className="flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-text-inverse)] transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
                    >
                      {savingSnapshotId === account.id ? 'A guardar…' : 'Guardar'}
                    </button>
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
                    <div>
                      <label
                        htmlFor={`investment-value-${account.id}`}
                        className="mb-2 block text-sm font-medium text-[var(--color-text)]"
                      >
                        Valor atual
                      </label>
                      <div className="relative">
                        <input
                          id={`investment-value-${account.id}`}
                          type="text"
                          inputMode="decimal"
                          value={draft.value}
                          onChange={(event) => updateDraft(account.id, 'value', event.target.value)}
                          placeholder="0,00"
                          className="min-h-[44px] w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 pr-10 text-sm text-[var(--color-text)] outline-none transition-colors placeholder:text-[var(--color-text-secondary)] focus:border-[var(--color-accent)]"
                        />
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-[var(--color-text-secondary)]">
                          €
                        </span>
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor={`investment-cost-${account.id}`}
                        className="mb-2 block text-sm font-medium text-[var(--color-text)]"
                      >
                        Total investido
                      </label>
                      <div className="relative">
                        <input
                          id={`investment-cost-${account.id}`}
                          type="text"
                          inputMode="decimal"
                          value={draft.costBasis}
                          onChange={(event) => updateDraft(account.id, 'costBasis', event.target.value)}
                          placeholder="0,00"
                          className="min-h-[44px] w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 pr-10 text-sm text-[var(--color-text)] outline-none transition-colors placeholder:text-[var(--color-text-secondary)] focus:border-[var(--color-accent)]"
                        />
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-[var(--color-text-secondary)]">
                          €
                        </span>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 lg:justify-items-end">
                      <div className="rounded-[var(--radius-md)] bg-[var(--color-bg)] px-3 py-2 text-sm">
                        <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">
                          Ganho / perda
                        </p>
                        <p className={`mt-1 font-semibold ${gainColor}`}>{gainLabel}</p>
                      </div>
                      <div className="rounded-[var(--radius-md)] bg-[var(--color-bg)] px-3 py-2 text-sm">
                        <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">
                          Rentabilidade
                        </p>
                        <p className={`mt-1 font-semibold ${gainColor}`}>
                          {getGainPercentageLabel(valueCents, costBasisCents)}
                        </p>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <AccountModal
        isOpen={accountModalState !== null}
        mode={accountModalState?.mode ?? 'create'}
        account={accountModalState?.mode === 'edit' ? accountModalState.account : null}
        isSubmitting={isSavingAccount}
        errorMessage={accountModalError}
        onClose={() => {
          if (isSavingAccount) {
            return;
          }

          setAccountModalError(null);
          setAccountModalState(null);
        }}
        onSave={handleSaveAccount}
      />
    </div>
  );
}
