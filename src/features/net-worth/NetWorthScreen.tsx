import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useAuth } from '@/contexts/AuthContext';
import { formatCents } from '@/lib/utils';
import { useNetWorthItems } from './useNetWorthItems';
import { useNetWorthData } from './useNetWorthData';
import type { NetWorthItem } from '@/types';

const TOAST_HIDE_DELAY_MS = 3_000;

function parseEuroInput(value: string): number | null {
  const cleaned = value.replace(/\s|€/g, '').replace(',', '.');
  const num = Number.parseFloat(cleaned);
  if (Number.isNaN(num)) return null;
  return Math.round(num * 100);
}

function formatMonthLabel(month: string, pattern: 'LLL yy' | 'LLLL yyyy') {
  const label = format(parseISO(month), pattern, { locale: pt });
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}

interface ItemRowProps {
  item: NetWorthItem;
  onUpdateValue: (id: string, cents: number) => void;
  onRemove: (id: string) => void;
}

function ItemRow({ item, onUpdateValue, onRemove }: ItemRowProps) {
  const [editValue, setEditValue] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const isSynced = item.source !== 'manual';

  const handleBlur = () => {
    setIsEditing(false);
    const cents = parseEuroInput(editValue);
    if (cents !== null && cents !== item.value_cents) {
      onUpdateValue(item.id, cents);
    }
  };

  const handleFocus = () => {
    setIsEditing(true);
    setEditValue(
      item.value_cents > 0
        ? (item.value_cents / 100).toFixed(2).replace('.', ',')
        : ''
    );
  };

  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2">
      <span className="text-lg">{item.emoji}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--color-text)] truncate">
          {item.name}
          {isSynced && (
            <span className="ml-1 text-xs text-[var(--color-text-tertiary)]">🔗</span>
          )}
        </p>
      </div>
      {isSynced ? (
        <span className="text-sm font-semibold text-[var(--color-text)] whitespace-nowrap">
          {formatCents(item.value_cents)}
        </span>
      ) : (
        <input
          type="text"
          inputMode="decimal"
          value={isEditing ? editValue : formatCents(item.value_cents)}
          onFocus={handleFocus}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleBlur}
          className="w-28 min-h-[36px] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-right text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
        />
      )}
      {!isSynced && (
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] transition-colors"
          aria-label={`Remover ${item.name}`}
        >
          ×
        </button>
      )}
    </div>
  );
}

interface AddItemFormProps {
  type: 'asset' | 'liability';
  onAdd: (name: string, emoji: string, valueCents: number) => void;
}

function AddItemForm({ type, onAdd }: AddItemFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(type === 'asset' ? '💰' : '💳');
  const [value, setValue] = useState('');

  const handleSubmit = () => {
    const trimmed = name.trim();
    const cents = parseEuroInput(value);
    if (!trimmed || cents === null || cents < 0) return;
    onAdd(trimmed, emoji, cents);
    setName('');
    setEmoji(type === 'asset' ? '💰' : '💳');
    setValue('');
    setIsOpen(false);
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] px-4 py-3 text-sm font-medium text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-light)]"
      >
        + {type === 'asset' ? 'Novo ativo' : 'Novo passivo'}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-accent)] bg-[var(--color-bg)] p-3">
      <div className="grid grid-cols-[3rem_1fr] gap-2">
        <input
          type="text"
          value={emoji}
          onChange={(e) => setEmoji(e.target.value)}
          maxLength={2}
          className="min-h-[44px] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-center text-lg outline-none focus:border-[var(--color-accent)]"
        />
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={type === 'asset' ? 'Ex.: Conta poupança' : 'Ex.: Crédito habitação'}
          className="min-h-[44px] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 text-sm outline-none focus:border-[var(--color-accent)]"
        />
      </div>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Valor (ex: 1500,00)"
        className="min-h-[44px] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 text-sm outline-none focus:border-[var(--color-accent)]"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          className="flex-1 min-h-[44px] rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-text-inverse)] transition-colors hover:bg-[var(--color-accent-hover)]"
        >
          Adicionar
        </button>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="min-h-[44px] rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)]"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

export function NetWorthScreen() {
  const { user } = useAuth();
  const {
    assets,
    liabilities,
    totalAssets,
    totalLiabilities,
    netWorth,
    isLoading,
    addItem,
    updateItem,
    removeItem,
    takeSnapshot,
  } = useNetWorthItems(user?.id);

  const { entries, isLoading: isHistoryLoading } = useNetWorthData(user?.id);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!toastMessage) return;
    const id = window.setTimeout(() => setToastMessage(null), TOAST_HIDE_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [toastMessage]);

  const chartData = useMemo(() => {
    return [...entries]
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((entry) => ({
        month: entry.month,
        netWorth:
          Object.values(entry.assets_json).reduce((t, v) => t + v, 0) -
          Object.values(entry.liabilities_json).reduce((t, v) => t + v, 0),
      }));
  }, [entries]);

  const handleUpdateValue = useCallback(
    async (id: string, cents: number) => {
      try {
        await updateItem(id, { value_cents: cents });
      } catch (err) {
        setErrorMessage('Não foi possível atualizar o valor.');
        console.error(err);
      }
    },
    [updateItem]
  );

  const handleRemove = useCallback(
    async (id: string) => {
      if (!window.confirm('Remover este item do patrimônio?')) return;
      try {
        await removeItem(id);
        setToastMessage('Item removido.');
      } catch (err) {
        setErrorMessage('Não foi possível remover o item.');
        console.error(err);
      }
    },
    [removeItem]
  );

  const handleAddItem = useCallback(
    async (type: 'asset' | 'liability', name: string, emoji: string, valueCents: number) => {
      try {
        await addItem({
          name,
          type,
          value_cents: valueCents,
          source: 'manual',
          source_id: null,
          emoji,
          sort_order: type === 'asset' ? assets.length : liabilities.length,
        });
        setToastMessage('Item adicionado.');
      } catch (err) {
        setErrorMessage('Não foi possível adicionar o item.');
        console.error(err);
      }
    },
    [addItem, assets.length, liabilities.length]
  );

  const handleSnapshot = useCallback(async () => {
    setIsSaving(true);
    try {
      await takeSnapshot();
      setToastMessage('📸 Snapshot guardado para o histórico.');
    } catch (err) {
      setErrorMessage('Não foi possível guardar o snapshot.');
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  }, [takeSnapshot]);

  if (isLoading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center text-sm text-[var(--color-text-secondary)]">
        A carregar patrimônio…
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-4 bg-[var(--color-bg-secondary)] p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">
          Património Líquido
        </h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Os seus ativos e passivos — atualizados em tempo real.
        </p>
      </header>

      {toastMessage && (
        <div className="rounded-[var(--radius-md)] border border-[var(--color-success)] bg-[var(--color-accent-light)] px-4 py-3 text-sm font-medium text-[var(--color-accent)]" aria-live="polite">
          {toastMessage}
        </div>
      )}

      {errorMessage && (
        <div className="rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-[var(--color-bg)] px-4 py-3 text-sm text-[var(--color-danger)]">
          {errorMessage}
          <button type="button" onClick={() => setErrorMessage(null)} className="ml-2 underline">fechar</button>
        </div>
      )}

      {/* Summary Card */}
      <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4 shadow-[var(--shadow-sm)]">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xs font-medium text-[var(--color-text-secondary)]">Ativos</p>
            <p className="mt-1 text-lg font-semibold text-[var(--color-success)]">{formatCents(totalAssets)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-[var(--color-text-secondary)]">Passivos</p>
            <p className="mt-1 text-lg font-semibold text-[var(--color-danger)]">{formatCents(totalLiabilities)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-[var(--color-text-secondary)]">Líquido</p>
            <p className={`mt-1 text-lg font-bold ${netWorth >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}>
              {formatCents(netWorth)}
            </p>
          </div>
        </div>
      </section>

      {/* Assets */}
      <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
        <h2 className="text-base font-semibold text-[var(--color-text)] border-b border-[var(--color-divider)] pb-3">
          📈 Ativos
        </h2>
        <div className="mt-3 flex flex-col gap-2">
          {assets.length === 0 && (
            <p className="text-sm text-[var(--color-text-secondary)] py-3">
              Nenhum ativo registado. Adicione o primeiro abaixo.
            </p>
          )}
          {assets.map((item) => (
            <ItemRow key={item.id} item={item} onUpdateValue={handleUpdateValue} onRemove={handleRemove} />
          ))}
          <AddItemForm type="asset" onAdd={(name, emoji, v) => handleAddItem('asset', name, emoji, v)} />
        </div>
      </section>

      {/* Liabilities */}
      <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
        <h2 className="text-base font-semibold text-[var(--color-text)] border-b border-[var(--color-divider)] pb-3">
          📉 Passivos
        </h2>
        <div className="mt-3 flex flex-col gap-2">
          {liabilities.length === 0 && (
            <p className="text-sm text-[var(--color-text-secondary)] py-3">
              Nenhum passivo registado.
            </p>
          )}
          {liabilities.map((item) => (
            <ItemRow key={item.id} item={item} onUpdateValue={handleUpdateValue} onRemove={handleRemove} />
          ))}
          <AddItemForm type="liability" onAdd={(name, emoji, v) => handleAddItem('liability', name, emoji, v)} />
        </div>
      </section>

      {/* Snapshot Button */}
      <button
        type="button"
        onClick={handleSnapshot}
        disabled={isSaving || (assets.length === 0 && liabilities.length === 0)}
        className="flex min-h-[44px] items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-accent)] px-4 py-3 text-sm font-medium text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-light)] disabled:opacity-40"
      >
        📸 Guardar snapshot mensal
      </button>

      {/* Historical Chart */}
      <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
        <div className="border-b border-[var(--color-divider)] pb-3">
          <h2 className="text-base font-semibold text-[var(--color-text)]">Evolução</h2>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Histórico mensal do seu patrimônio líquido.
          </p>
        </div>

        {isHistoryLoading ? (
          <div className="flex min-h-[200px] items-center justify-center text-sm text-[var(--color-text-secondary)]">
            A carregar histórico…
          </div>
        ) : chartData.length < 2 ? (
          <div className="mt-4 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-6 text-sm text-[var(--color-text-secondary)]">
            Guarde snapshots em pelo menos 2 meses para ver o gráfico.
          </div>
        ) : (
          <div className="mt-4 h-[200px] w-full">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <XAxis
                  dataKey="month"
                  tickFormatter={(v: string) => formatMonthLabel(v, 'LLL yy')}
                  tick={{ fontSize: 10, fill: 'var(--color-text-secondary)' }}
                  axisLine={{ stroke: 'var(--color-border)' }}
                  tickLine={{ stroke: 'var(--color-border)' }}
                />
                <YAxis
                  tickFormatter={(v: number) => formatCents(v)}
                  tick={{ fontSize: 10, fill: 'var(--color-text-secondary)' }}
                  axisLine={{ stroke: 'var(--color-border)' }}
                  tickLine={{ stroke: 'var(--color-border)' }}
                  width={80}
                />
                <Tooltip
                  formatter={(v: number | string) => formatCents(Number(v))}
                  labelFormatter={(l) => formatMonthLabel(String(l), 'LLLL yyyy')}
                  contentStyle={{
                    borderColor: 'var(--color-border)',
                    borderRadius: '8px',
                    backgroundColor: 'var(--color-bg)',
                    color: 'var(--color-text)',
                  }}
                />
                <Line type="monotone" dataKey="netWorth" stroke="var(--color-accent)" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
    </div>
  );
}
export default NetWorthScreen;
