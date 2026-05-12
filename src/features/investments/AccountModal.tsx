import { useEffect, useState } from 'react';
import { ACCOUNT_COLORS, ACCOUNT_TYPE_LABELS } from '@/features/investments/constants';
import type { InvestmentAccount } from '@/types';

export interface InvestmentAccountFormValues {
  name: string;
  type: InvestmentAccount['type'];
  color: string;
}

interface AccountModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  account?: InvestmentAccount | null;
  isSubmitting: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSave: (values: InvestmentAccountFormValues) => void | Promise<void>;
}

export function AccountModal({
  isOpen,
  mode,
  account,
  isSubmitting,
  errorMessage,
  onClose,
  onSave,
}: AccountModalProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState<InvestmentAccount['type']>('etf');
  const [color, setColor] = useState<string>(ACCOUNT_COLORS[0]);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setValidationError(null);
    setName(account?.name ?? '');
    setType(account?.type ?? 'etf');
    setColor(account?.color ?? ACCOUNT_COLORS[0]);
  }, [account, isOpen]);

  if (!isOpen) {
    return null;
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedName = name.trim();

    if (!trimmedName) {
      setValidationError('Indique um nome para a conta.');
      return;
    }

    setValidationError(null);
    void onSave({
      name: trimmedName,
      type,
      color,
    });
  };

  const visibleError = validationError ?? errorMessage;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      onClick={() => {
        if (!isSubmitting) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="investment-account-modal-title"
        className="w-full max-w-lg rounded-[var(--radius-lg)] bg-[var(--color-bg)] p-5 shadow-[var(--shadow-md)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3
              id="investment-account-modal-title"
              className="text-lg font-semibold text-[var(--color-text)]"
            >
              {mode === 'create' ? 'Nova conta de investimento' : 'Editar conta'}
            </h3>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              {mode === 'create'
                ? 'Adicione uma conta para acompanhar o valor mensal do seu portfólio.'
                : 'Atualize os detalhes da conta de investimento.'}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[var(--radius-md)] text-lg text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-secondary)] disabled:opacity-50"
            aria-label="Fechar modal"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label
              htmlFor="investment-account-name"
              className="mb-1 block text-sm font-medium text-[var(--color-text)]"
            >
              Nome
            </label>
            <input
              id="investment-account-name"
              type="text"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setValidationError(null);
              }}
              placeholder="Ex.: Degiro"
              autoFocus
              maxLength={60}
              className="min-h-[44px] w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-accent)]"
            />
          </div>

          <div>
            <label
              htmlFor="investment-account-type"
              className="mb-1 block text-sm font-medium text-[var(--color-text)]"
            >
              Tipo
            </label>
            <select
              id="investment-account-type"
              value={type}
              onChange={(event) => {
                setType(event.target.value as InvestmentAccount['type']);
                setValidationError(null);
              }}
              className="min-h-[44px] w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-accent)]"
            >
              {Object.entries(ACCOUNT_TYPE_LABELS).map(([option, label]) => (
                <option key={option} value={option}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <span className="mb-2 block text-sm font-medium text-[var(--color-text)]">Cor</span>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
              {ACCOUNT_COLORS.map((option) => {
                const isSelected = color === option;

                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      setColor(option);
                      setValidationError(null);
                    }}
                    aria-label={`Selecionar cor ${option}`}
                    aria-pressed={isSelected}
                    className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[var(--radius-md)] border transition-colors ${
                      isSelected
                        ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]'
                        : 'border-[var(--color-border)] bg-[var(--color-bg)] hover:bg-[var(--color-bg-secondary)]'
                    }`}
                  >
                    <span
                      className="h-6 w-6 rounded-full border border-white/50"
                      style={{ backgroundColor: option }}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          {visibleError && (
            <p className="rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-danger)]">
              {visibleError}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg-secondary)] disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-text-inverse)] transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
            >
              {isSubmitting ? 'A guardar…' : mode === 'create' ? 'Criar conta' : 'Guardar alterações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
