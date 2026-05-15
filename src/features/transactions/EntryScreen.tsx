import { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { NumPad } from '@/components/NumPad';
import { useCategoryData } from '@/features/categories/useCategoryData';
import { IncomeSourceSelector } from '@/features/income-sources/IncomeSourceSelector';
import { useIncomeSourceData } from '@/features/income-sources/useIncomeSourceData';
import { useAuth } from '@/contexts/AuthContext';
import { useCategorySuggestion } from '@/hooks/useCategorySuggestion';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { addToQueue, flushQueue } from '@/lib/offlineQueue';
import { supabase } from '@/lib/supabase';
import { formatCents } from '@/lib/utils';
import { useCategoryStore } from '@/store/categoryStore';
import { useTransactionStore } from '@/store/transactionStore';
import {
  PAYMENT_METHOD_OPTIONS,
  PAYMENT_METHOD_SHORT_LABELS,
  type PaymentMethod,
  type Transaction,
} from '@/types';

const MAX_AMOUNT_CENTS = 99_999_999;
const SUCCESS_FADE_DELAY_MS = 700;
const SUCCESS_HIDE_DELAY_MS = 1_100;
const TOAST_HIDE_DELAY_MS = 3_500;
const LAST_PAYMENT_METHOD_KEY = 'fluxo-last-payment-method';

const TYPE_LABELS: Record<Transaction['type'], string> = {
  expense: 'Despesa',
  income: 'Receita',
};

const RECURRENCE_OPTIONS: Array<{
  value: NonNullable<Transaction['recurrence_rule']>;
  label: string;
}> = [
  { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensal' },
  { value: 'yearly', label: 'Anual' },
];

function getTodayDateValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function normalizeAmountInput(value: string) {
  if (!value) {
    return '';
  }

  if (value.includes('.')) {
    const [wholePart = '0', decimalPart = ''] = value.split('.');
    const normalizedWholePart = wholePart.replace(/^0+(?=\d)/, '') || '0';
    return `${normalizedWholePart}.${decimalPart}`;
  }

  return value.replace(/^0+(?=\d)/, '');
}

function parseAmountInputToCents(value: string) {
  if (!value) {
    return 0;
  }

  if (value.includes('.')) {
    const [wholePart = '0', decimalPart = ''] = value.split('.');

    if (!/^\d+$/.test(wholePart) || !/^\d*$/.test(decimalPart)) {
      return 0;
    }

    const cents = Number(wholePart) * 100 + Number((decimalPart + '00').slice(0, 2));
    return Number.isFinite(cents) ? Math.min(cents, MAX_AMOUNT_CENTS) : 0;
  }

  if (!/^\d+$/.test(value)) {
    return 0;
  }

  const cents = Number(value);
  return Number.isFinite(cents) ? Math.min(cents, MAX_AMOUNT_CENTS) : 0;
}

function appendAmountInput(currentValue: string, key: string) {
  if (key === '.') {
    if (currentValue.includes('.')) {
      return currentValue;
    }

    return currentValue ? `${currentValue}.` : '0.';
  }

  if (!/^\d$/.test(key)) {
    return currentValue;
  }

  if (currentValue.includes('.')) {
    const [wholePart, decimalPart = ''] = currentValue.split('.');
    if (decimalPart.length >= 2) {
      return currentValue;
    }

    const nextValue = normalizeAmountInput(`${wholePart}.${decimalPart}${key}`);
    return parseAmountInputToCents(nextValue) > MAX_AMOUNT_CENTS
      ? currentValue
      : nextValue;
  }

  const nextValue = normalizeAmountInput(`${currentValue}${key}`);
  return parseAmountInputToCents(nextValue) > MAX_AMOUNT_CENTS
    ? currentValue
    : nextValue;
}

function backspaceAmountInput(currentValue: string) {
  const nextValue = currentValue.slice(0, -1);
  return normalizeAmountInput(nextValue);
}

function formatEntryDate(dateValue: string) {
  if (!dateValue) return '—';
  const d = new Date(`${dateValue}T12:00:00`);
  if (isNaN(d.getTime())) return dateValue;
  return format(d, 'd MMM yyyy', { locale: pt });
}

export function EntryScreen() {
  const { user } = useAuth();
  const isOnline = useOnlineStatus();
  const categories = useCategoryStore((state) => state.categories);
  const isLoadingCategories = useCategoryStore((state) => state.isLoading);
  const transactions = useTransactionStore((state) => state.transactions);
  const addTransaction = useTransactionStore((state) => state.addTransaction);
  const removeTransaction = useTransactionStore((state) => state.removeTransaction);

  const { error: categoryError } = useCategoryData(user?.id);

  const [type, setType] = useState<Transaction['type']>('expense');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(() => {
    if (typeof window === 'undefined') {
      return null;
    }

    const storedPaymentMethod = window.localStorage.getItem(LAST_PAYMENT_METHOD_KEY);
    return (
      PAYMENT_METHOD_OPTIONS.find((option) => option.value === storedPaymentMethod)?.value ??
      null
    );
  });
  const [amountInput, setAmountInput] = useState('');
  const [note, setNote] = useState('');
  const [manualCategoryOverride, setManualCategoryOverride] = useState(false);
  const [date, setDate] = useState(getTodayDateValue());
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceRule, setRecurrenceRule] = useState<
    NonNullable<Transaction['recurrence_rule']>
  >('monthly');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [successToken, setSuccessToken] = useState(0);
  const [isSuccessVisible, setIsSuccessVisible] = useState(false);
  const [isSuccessFading, setIsSuccessFading] = useState(false);

  const { error: incomeSourceError } = useIncomeSourceData(user?.id, {
    enabled: type === 'income',
  });

  const numPadRef = useRef<HTMLDivElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);

  const amountCents = useMemo(
    () => parseAmountInputToCents(amountInput),
    [amountInput]
  );

  const filteredCategories = useMemo(
    () => categories.filter((category) => category.type === type),
    [categories, type]
  );
  const suggestion = useCategorySuggestion(note, type, transactions);

  useEffect(() => {
    setManualCategoryOverride(false);
  }, [note]);

  useEffect(() => {
    if (!selectedCategoryId) {
      return;
    }

    const categoryExists = filteredCategories.some(
      (category) => category.id === selectedCategoryId
    );

    if (!categoryExists) {
      setSelectedCategoryId(null);
    }
  }, [filteredCategories, selectedCategoryId]);

  useEffect(() => {
    if (type !== 'income') {
      setSelectedSourceId(null);
    }
  }, [type]);

  useEffect(() => {
    if (
      !suggestion ||
      manualCategoryOverride ||
      !filteredCategories.some((category) => category.id === suggestion.categoryId)
    ) {
      return;
    }

    setSelectedCategoryId(suggestion.categoryId);
  }, [filteredCategories, manualCategoryOverride, suggestion]);

  useEffect(() => {
    if (!isOnline || !user) {
      return;
    }

    let isActive = true;

    const syncQueuedTransactions = async () => {
      const failedTransactions = await flushQueue();

      if (!isActive || failedTransactions.length === 0) {
        return;
      }

      console.error('Algumas transações offline ficaram na fila para nova tentativa.');
    };

    void syncQueuedTransactions();

    return () => {
      isActive = false;
    };
  }, [isOnline, user]);

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
    if (successToken === 0) {
      return;
    }

    setIsSuccessVisible(true);
    setIsSuccessFading(false);

    const fadeTimeoutId = window.setTimeout(() => {
      setIsSuccessFading(true);
    }, SUCCESS_FADE_DELAY_MS);

    const hideTimeoutId = window.setTimeout(() => {
      setIsSuccessVisible(false);
      setIsSuccessFading(false);
    }, SUCCESS_HIDE_DELAY_MS);

    return () => {
      window.clearTimeout(fadeTimeoutId);
      window.clearTimeout(hideTimeoutId);
    };
  }, [successToken]);

  const handleAmountDisplayPress = () => {
    numPadRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  };

  const handleDatePickerOpen = () => {
    const input = dateInputRef.current as (HTMLInputElement & {
      showPicker?: () => void;
    }) | null;

    if (!input) {
      return;
    }

    if (typeof input.showPicker === 'function') {
      input.showPicker();
      return;
    }

    input.focus();
    input.click();
  };

  const handleSubmit = async () => {
    if (!user || amountCents <= 0 || !selectedCategoryId || isSubmitting) {
      return;
    }

    const transaction: Transaction = {
      id: crypto.randomUUID(),
      user_id: user.id,
      amount_cents: amountCents,
      type,
      category_id: selectedCategoryId,
      source_id: type === 'income' ? selectedSourceId : null,
      goal_id: null,
      import_session_id: null,
      instalment_id: null,
      note: note.trim() ? note.trim() : null,
      date,
      is_recurring: isRecurring,
      recurrence_rule: isRecurring ? recurrenceRule : null,
      recurrence_parent_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      payment_method: paymentMethod,
      payslip_import_id: null,
    };

    setIsSubmitting(true);
    setToastMessage(null);
    addTransaction(transaction);

    try {
      if (!isOnline) {
        addToQueue(transaction);
      } else {
        const { error } = await supabase.from('transactions').insert(transaction);

        if (error) {
          throw error;
        }
      }

      if (paymentMethod && typeof window !== 'undefined') {
        window.localStorage.setItem(LAST_PAYMENT_METHOD_KEY, paymentMethod);
      }

      setAmountInput('');
      setNote('');
      setSuccessToken((value) => value + 1);
    } catch (error) {
      console.error('Erro ao guardar transação:', error);
      removeTransaction(transaction.id);
      setToastMessage('Erro ao guardar transação. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isSubmitDisabled =
    !user || amountCents <= 0 || !selectedCategoryId || isSubmitting;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-xl flex-col gap-4 bg-[var(--color-bg-secondary)] p-4 sm:p-6">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--color-text)]">
              Registar transação
            </h1>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              Adicione despesas e receitas num instante.
            </p>
          </div>

          {isSuccessVisible && (
            <div
              className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-[var(--color-success)] text-xl text-[var(--color-text-inverse)] shadow-[var(--shadow-sm)] transition-all duration-300 ${
                isSuccessFading ? 'scale-95 opacity-0' : 'scale-100 opacity-100'
              }`}
              aria-live="polite"
            >
              ✓
            </div>
          )}
        </div>

        {!isOnline && (
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text-secondary)]">
            Offline — sincroniza quando houver ligação
          </div>
        )}

        {categoryError && (
          <div className="rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-danger)]">
            {categoryError}
          </div>
        )}

        {type === 'income' && incomeSourceError && (
          <div className="rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-danger)]">
            {incomeSourceError}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={handleAmountDisplayPress}
        className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4 text-left shadow-[var(--shadow-sm)] transition-colors hover:bg-[var(--color-bg-secondary)]"
      >
        <span className="text-sm font-medium text-[var(--color-text-secondary)]">
          Montante
        </span>
        <span className="mt-2 block text-4xl font-semibold tabular-nums text-[var(--color-text)] sm:text-5xl">
          {formatCents(amountCents)}
        </span>
      </button>

      <div className="grid grid-cols-2 gap-2">
        {(['expense', 'income'] as const).map((option) => {
          const isActive = type === option;

          return (
            <button
              key={option}
              type="button"
              onClick={() => setType(option)}
              aria-pressed={isActive}
              className={`min-h-[44px] rounded-[var(--radius-md)] border px-4 py-3 text-sm font-semibold transition-colors ${
                isActive
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-text-inverse)]'
                  : 'border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]'
              }`}
            >
              {TYPE_LABELS[option]}
            </button>
          );
        })}
      </div>

      <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4 shadow-[var(--shadow-sm)]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium text-[var(--color-text)]">Categoria</h2>
            <p className="text-xs text-[var(--color-text-secondary)]">
              Escolha uma categoria de {TYPE_LABELS[type].toLowerCase()}.
            </p>
          </div>
          {filteredCategories.length > 0 && (
            <span className="text-xs text-[var(--color-text-tertiary)]">
              Deslize para ver mais
            </span>
          )}
        </div>

        {isLoadingCategories ? (
          <p className="text-sm text-[var(--color-text-secondary)]">
            A carregar categorias…
          </p>
        ) : filteredCategories.length === 0 ? (
          <p className="text-sm text-[var(--color-text-secondary)]">
            Não existem categorias disponíveis para {TYPE_LABELS[type].toLowerCase()}.
          </p>
        ) : (
          <div className="overflow-x-auto pb-1">
            <div className="grid auto-cols-[84px] grid-flow-col grid-rows-2 gap-3">
              {filteredCategories.map((category) => {
                const isActive = category.id === selectedCategoryId;

                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => {
                      setManualCategoryOverride(true);
                      setSelectedCategoryId(category.id);
                    }}
                    aria-pressed={isActive}
                    className={`relative flex min-h-[76px] w-[84px] flex-col items-center justify-center gap-1 rounded-[var(--radius-md)] border px-2 py-3 text-center transition-colors ${
                      isActive
                        ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]'
                        : 'border-[var(--color-border)] bg-[var(--color-bg)] hover:bg-[var(--color-bg-secondary)]'
                    }`}
                  >
                    {suggestion?.categoryId === category.id && (
                      <span className="absolute -top-1 -right-1 rounded-full bg-[var(--color-accent)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--color-text-inverse)]">
                        Sugerido
                      </span>
                    )}
                    <span className="text-2xl" aria-hidden="true">
                      {category.emoji}
                    </span>
                    <span
                      className={`w-full truncate text-xs font-medium ${
                        isActive
                          ? 'text-[var(--color-accent)]'
                          : 'text-[var(--color-text-secondary)]'
                      }`}
                    >
                      {category.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {type === 'income' && (
        <IncomeSourceSelector
          selectedSourceId={selectedSourceId}
          onSelect={setSelectedSourceId}
          disabled={isSubmitting}
        />
      )}

      <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4 shadow-[var(--shadow-sm)]">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium text-[var(--color-text)]">Como pagaste?</h2>
            <p className="text-xs text-[var(--color-text-secondary)]">
              Opcional — memorize o último método usado.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPaymentMethod(null)}
            className="min-h-[44px] rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-secondary)]"
          >
            Saltar
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {PAYMENT_METHOD_OPTIONS.map((option) => {
            const isActive = paymentMethod === option.value;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setPaymentMethod(option.value)}
                aria-pressed={isActive}
                className={`flex min-h-[44px] items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)]'
                    : 'border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]'
                }`}
              >
                <span aria-hidden="true">{option.emoji}</span>
                <span>{PAYMENT_METHOD_SHORT_LABELS[option.value]}</span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4 shadow-[var(--shadow-sm)]">
        <label
          htmlFor="transaction-note"
          className="mb-2 block text-sm font-medium text-[var(--color-text)]"
        >
          Nota (opcional)
        </label>
        <input
          id="transaction-note"
          type="text"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Adicionar nota"
          maxLength={120}
          className="min-h-[44px] w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-accent)]"
        />

        <div className="mt-4 space-y-3 border-t border-[var(--color-divider)] pt-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-[var(--color-text)]">Recorrente</p>
              <p className="text-xs text-[var(--color-text-secondary)]">
                Crie repetições automáticas desta transação.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isRecurring}
              onClick={() => {
                setIsRecurring((currentValue) => {
                  const nextValue = !currentValue;
                  if (nextValue) {
                    setRecurrenceRule('monthly');
                  }
                  return nextValue;
                });
              }}
              className={`relative flex min-h-[44px] min-w-[44px] items-center rounded-full p-1 transition-colors ${
                isRecurring
                  ? 'bg-[var(--color-accent)]'
                  : 'bg-[var(--color-bg-tertiary)]'
              }`}
            >
              <span
                className={`h-5 w-5 rounded-full bg-[var(--color-bg)] shadow-[var(--shadow-sm)] transition-transform ${
                  isRecurring ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
              <span className="sr-only">Ativar transação recorrente</span>
            </button>
          </div>

          {isRecurring && (
            <div className="flex flex-wrap gap-2">
              {RECURRENCE_OPTIONS.map((option) => {
                const isActive = recurrenceRule === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setRecurrenceRule(option.value)}
                    aria-pressed={isActive}
                    className={`min-h-[44px] rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)]'
                        : 'border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4 shadow-[var(--shadow-sm)]">
        <span className="mb-2 block text-sm font-medium text-[var(--color-text)]">
          Data
        </span>
        <div className="relative">
          <button
            type="button"
            onClick={handleDatePickerOpen}
            className="flex min-h-[44px] w-full items-center justify-between rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-left text-sm text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg-secondary)]"
          >
            <span>{formatEntryDate(date)}</span>
            <span className="text-lg text-[var(--color-text-secondary)]">📅</span>
          </button>
          <input
            ref={dateInputRef}
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label="Selecionar data"
          />
        </div>
      </div>

      <div className="mt-auto space-y-4 pb-4" ref={numPadRef}>
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4 shadow-[var(--shadow-sm)]">
          <NumPad
            onKeyPress={(key) => {
              setAmountInput((currentValue) => appendAmountInput(currentValue, key));
            }}
            onBackspace={() => {
              setAmountInput((currentValue) => backspaceAmountInput(currentValue));
            }}
            disableDecimal={amountInput.includes('.')}
            disabled={isSubmitting}
          />
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitDisabled}
          className="flex min-h-[48px] w-full items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-3 text-sm font-semibold text-[var(--color-text-inverse)] transition-colors hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? 'A guardar…' : 'Guardar'}
        </button>
      </div>

      {toastMessage && (
        <div className="fixed bottom-24 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-[var(--radius-md)] bg-[var(--color-danger)] px-4 py-3 text-sm font-medium text-[var(--color-text-inverse)] shadow-[var(--shadow-md)] md:bottom-6">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
export default EntryScreen;
