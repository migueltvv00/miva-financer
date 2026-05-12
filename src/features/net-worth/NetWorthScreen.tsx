import { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale/pt';
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '@/hooks/useAuth';
import { formatCents } from '@/lib/utils';
import { useNetWorthData } from './useNetWorthData';

interface NetWorthFormRow {
  id: string;
  name: string;
  value: string;
  valueCents: number | null;
}

interface NetWorthSectionProps {
  title: string;
  rows: NetWorthFormRow[];
  addLabel: string;
  namePrefix: string;
  onAddRow: () => void;
  onRemoveRow: (id: string) => void;
  onNameChange: (id: string, value: string) => void;
  onValueChange: (id: string, value: string) => void;
}

interface ChartPoint {
  month: string;
  netWorth: number;
}

const TOAST_HIDE_DELAY_MS = 3_000;

function createEmptyRow(): NetWorthFormRow {
  return {
    id: crypto.randomUUID(),
    name: '',
    value: '',
    valueCents: null,
  };
}

function formatEditableEuro(cents: number | null): string {
  if (cents === null) {
    return '';
  }

  return new Intl.NumberFormat('pt-PT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: false,
  }).format(cents / 100);
}

function parseEuroInput(value: string): number | null {
  const cleaned = value.replace(/\s|€/g, '').replace(',', '.');
  const num = Number.parseFloat(cleaned);

  if (Number.isNaN(num)) {
    return null;
  }

  return Math.round(num * 100);
}

function getFriendlyErrorMessage(error: unknown, fallbackMessage: string) {
  return error instanceof Error && error.message ? error.message : fallbackMessage;
}

function mapRecordToRows(record: Record<string, number>): NetWorthFormRow[] {
  const rows = Object.entries(record).map(([name, valueCents]) => ({
    id: crypto.randomUUID(),
    name,
    value: formatEditableEuro(valueCents),
    valueCents,
  }));

  return rows.length > 0 ? rows : [createEmptyRow()];
}

function buildRecordFromRows(
  rows: NetWorthFormRow[],
  label: 'ativos' | 'passivos'
): Record<string, number> {
  return rows.reduce<Record<string, number>>((record, row) => {
    const name = row.name.trim();
    const value = row.value.trim();

    if (!name && !value) {
      return record;
    }

    if (!name || row.valueCents === null) {
      throw new Error(`Preencha o nome e o valor de todos os ${label}.`);
    }

    if (row.valueCents < 0) {
      throw new Error('Introduza apenas valores positivos.');
    }

    if (name in record) {
      throw new Error(`O nome “${name}” está repetido nos ${label}.`);
    }

    record[name] = row.valueCents;
    return record;
  }, {});
}

function sumRows(rows: NetWorthFormRow[]) {
  return rows.reduce((total, row) => total + (row.valueCents ?? 0), 0);
}

function formatMonthLabel(month: string, pattern: 'LLL yy' | 'LLLL yyyy') {
  const label = format(parseISO(month), pattern, { locale: pt });
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}

function NetWorthSection({
  title,
  rows,
  addLabel,
  namePrefix,
  onAddRow,
  onRemoveRow,
  onNameChange,
  onValueChange,
}: NetWorthSectionProps) {
  return (
    <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--color-divider)] pb-3">
        <h2 className="text-base font-semibold text-[var(--color-text)]">{title}</h2>
        <button
          type="button"
          onClick={onAddRow}
          className="flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-accent)] px-3 py-2 text-sm font-medium text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-light)]"
        >
          {addLabel}
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {rows.map((row) => (
          <div
            key={row.id}
            className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_auto] sm:items-end"
          >
            <div>
              <label
                htmlFor={`${namePrefix}-name-${row.id}`}
                className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]"
              >
                Nome
              </label>
              <input
                id={`${namePrefix}-name-${row.id}`}
                type="text"
                value={row.name}
                onChange={(event) => onNameChange(row.id, event.target.value)}
                placeholder="Ex.: Conta à ordem"
                className="min-h-[44px] w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-accent)]"
              />
            </div>

            <div>
              <label
                htmlFor={`${namePrefix}-value-${row.id}`}
                className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]"
              >
                Valor
              </label>
              <input
                id={`${namePrefix}-value-${row.id}`}
                type="text"
                inputMode="decimal"
                value={row.value}
                onChange={(event) => onValueChange(row.id, event.target.value)}
                placeholder="0,00"
                className="min-h-[44px] w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-accent)]"
              />
            </div>

            <button
              type="button"
              onClick={() => onRemoveRow(row.id)}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-lg text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)]"
              aria-label={`Remover ${title.toLowerCase().slice(0, -1)}`}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

export function NetWorthScreen() {
  const { user } = useAuth();
  const {
    entries,
    currentEntry,
    isLoading,
    error,
    monthLabel,
    goToPreviousMonth,
    goToNextMonth,
    saveEntry,
    copyFromLastMonth,
    deleteEntry,
  } = useNetWorthData(user?.id);

  const [assetRows, setAssetRows] = useState<NetWorthFormRow[]>([createEmptyRow()]);
  const [liabilityRows, setLiabilityRows] = useState<NetWorthFormRow[]>([createEmptyRow()]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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

  useEffect(() => {
    setAssetRows(mapRecordToRows(currentEntry?.assets_json ?? {}));
    setLiabilityRows(mapRecordToRows(currentEntry?.liabilities_json ?? {}));
    setActionError(null);
  }, [currentEntry]);

  const chartData = useMemo<ChartPoint[]>(() => {
    return [...entries]
      .sort((left, right) => left.month.localeCompare(right.month))
      .map((entry) => ({
        month: entry.month,
        netWorth:
          Object.values(entry.assets_json).reduce((total, value) => total + value, 0) -
          Object.values(entry.liabilities_json).reduce((total, value) => total + value, 0),
      }));
  }, [entries]);

  const totalAssets = useMemo(() => sumRows(assetRows), [assetRows]);
  const totalLiabilities = useMemo(() => sumRows(liabilityRows), [liabilityRows]);
  const netWorth = totalAssets - totalLiabilities;
  const messages = [error, actionError].filter(
    (message): message is string => Boolean(message)
  );

  const updateRows = (
    rows: NetWorthFormRow[],
    id: string,
    updates: Partial<NetWorthFormRow>
  ) => rows.map((row) => (row.id === id ? { ...row, ...updates } : row));

  const handleAssetNameChange = (id: string, value: string) => {
    setActionError(null);
    setAssetRows((currentRows) => updateRows(currentRows, id, { name: value }));
  };

  const handleAssetValueChange = (id: string, value: string) => {
    setActionError(null);
    setAssetRows((currentRows) =>
      updateRows(currentRows, id, {
        value: value.replace(/[^\d,.\s€-]/g, ''),
        valueCents: parseEuroInput(value),
      })
    );
  };

  const handleLiabilityNameChange = (id: string, value: string) => {
    setActionError(null);
    setLiabilityRows((currentRows) => updateRows(currentRows, id, { name: value }));
  };

  const handleLiabilityValueChange = (id: string, value: string) => {
    setActionError(null);
    setLiabilityRows((currentRows) =>
      updateRows(currentRows, id, {
        value: value.replace(/[^\d,.\s€-]/g, ''),
        valueCents: parseEuroInput(value),
      })
    );
  };

  const handleSave = async () => {
    setActionError(null);
    setToastMessage(null);
    setIsSaving(true);

    try {
      const assets = buildRecordFromRows(assetRows, 'ativos');
      const liabilities = buildRecordFromRows(liabilityRows, 'passivos');
      await saveEntry(assets, liabilities);
      setToastMessage('Património líquido guardado.');
    } catch (saveError) {
      console.error('Erro ao guardar património líquido:', saveError);
      setActionError(
        getFriendlyErrorMessage(saveError, 'Não foi possível guardar o património líquido.')
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyFromLastMonth = () => {
    setActionError(null);
    setToastMessage(null);

    const previousData = copyFromLastMonth();

    if (!previousData) {
      setActionError('Não existem dados no mês anterior para copiar.');
      return;
    }

    setAssetRows(mapRecordToRows(previousData.assets));
    setLiabilityRows(mapRecordToRows(previousData.liabilities));
    setToastMessage('Dados copiados do mês anterior.');
  };

  const handleDelete = async () => {
    if (!currentEntry) {
      return;
    }

    const confirmed = window.confirm(
      `Tem a certeza que quer eliminar a entrada de ${monthLabel.toLowerCase()}?`
    );

    if (!confirmed) {
      return;
    }

    setActionError(null);
    setToastMessage(null);
    setIsDeleting(true);

    try {
      await deleteEntry();
      setToastMessage('Entrada eliminada.');
    } catch (deleteError) {
      console.error('Erro ao eliminar entrada de património líquido:', deleteError);
      setActionError(
        getFriendlyErrorMessage(
          deleteError,
          'Não foi possível eliminar a entrada de património líquido.'
        )
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-4 bg-[var(--color-bg-secondary)] p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">
          Património Líquido
        </h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Registe mensalmente os seus ativos e passivos.
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
              Navegue entre os seus registos mensais.
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)] p-1">
            <button
              type="button"
              onClick={goToPreviousMonth}
              disabled={isSaving || isDeleting}
              aria-label="Ver mês anterior"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[var(--radius-md)] border border-transparent text-lg text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg)] disabled:opacity-40"
            >
              ←
            </button>
            <p className="min-w-[8.5rem] text-center text-sm font-semibold text-[var(--color-text)]">
              {monthLabel}
            </p>
            <button
              type="button"
              onClick={goToNextMonth}
              disabled={isSaving || isDeleting}
              aria-label="Ver mês seguinte"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[var(--radius-md)] border border-transparent text-lg text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg)] disabled:opacity-40"
            >
              →
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
        <div className="border-b border-[var(--color-divider)] pb-3">
          <h2 className="text-base font-semibold text-[var(--color-text)]">Evolução</h2>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Acompanhe a evolução mensal do seu património líquido.
          </p>
        </div>

        {isLoading ? (
          <div className="flex min-h-[200px] items-center justify-center text-sm text-[var(--color-text-secondary)]">
            A carregar património líquido…
          </div>
        ) : chartData.length < 2 ? (
          <div className="mt-4 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-6 text-sm text-[var(--color-text-secondary)]">
            Adicione dados de pelo menos 2 meses para ver o gráfico.
          </div>
        ) : (
          <div className="mt-4 h-[200px] w-full">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
                  dataKey="netWorth"
                  stroke="var(--color-accent)"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
        <div className="border-b border-[var(--color-divider)] pb-3">
          <h2 className="text-base font-semibold text-[var(--color-text)]">
            Resumo do mês atual
          </h2>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Totais calculados para {monthLabel.toLowerCase()}.
          </p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">
              Ativos
            </p>
            <p className="mt-2 text-lg font-semibold text-[var(--color-text)]">
              {formatCents(totalAssets)}
            </p>
          </div>
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">
              Passivos
            </p>
            <p className="mt-2 text-lg font-semibold text-[var(--color-text)]">
              {formatCents(totalLiabilities)}
            </p>
          </div>
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">
              Património líquido
            </p>
            <p
              className={`mt-2 text-lg font-semibold ${
                netWorth >= 0
                  ? 'text-[var(--color-success)]'
                  : 'text-[var(--color-danger)]'
              }`}
            >
              {formatCents(netWorth)}
            </p>
          </div>
        </div>
      </section>

      <NetWorthSection
        title="Ativos"
        rows={assetRows}
        addLabel="Adicionar ativo"
        namePrefix="asset"
        onAddRow={() => {
          setActionError(null);
          setAssetRows((currentRows) => [...currentRows, createEmptyRow()]);
        }}
        onRemoveRow={(id) => {
          setActionError(null);
          setAssetRows((currentRows) => currentRows.filter((row) => row.id !== id));
        }}
        onNameChange={handleAssetNameChange}
        onValueChange={handleAssetValueChange}
      />

      <NetWorthSection
        title="Passivos"
        rows={liabilityRows}
        addLabel="Adicionar passivo"
        namePrefix="liability"
        onAddRow={() => {
          setActionError(null);
          setLiabilityRows((currentRows) => [...currentRows, createEmptyRow()]);
        }}
        onRemoveRow={(id) => {
          setActionError(null);
          setLiabilityRows((currentRows) => currentRows.filter((row) => row.id !== id));
        }}
        onNameChange={handleLiabilityNameChange}
        onValueChange={handleLiabilityValueChange}
      />

      <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            onClick={() => {
              void handleSave();
            }}
            disabled={isSaving || isDeleting}
            className="flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-[var(--color-text-inverse)] transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-40"
          >
            {isSaving ? 'A guardar…' : 'Guardar'}
          </button>
          <button
            type="button"
            onClick={handleCopyFromLastMonth}
            disabled={isSaving || isDeleting}
            className="flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-light)] disabled:opacity-40"
          >
            Copiar do mês anterior
          </button>
          {currentEntry && (
            <button
              type="button"
              onClick={() => {
                void handleDelete();
              }}
              disabled={isSaving || isDeleting}
              className="flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-danger)] px-4 py-2.5 text-sm font-medium text-[var(--color-danger)] transition-colors hover:bg-red-50 disabled:opacity-40"
            >
              {isDeleting ? 'A eliminar…' : 'Eliminar entrada'}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
