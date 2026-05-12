import { useEffect, useMemo, useState } from 'react';
import type { Category } from '@/types';

export interface CategoryFormValues {
  name: string;
  emoji: string;
  color: string;
  type: Category['type'];
}

interface CategoryModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  category?: Category | null;
  defaultType?: Category['type'];
  isSubmitting: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSave: (values: CategoryFormValues) => void | Promise<void>;
}

const EMOJI_OPTIONS = [
  '🛒',
  '🚗',
  '🏠',
  '⚡',
  '💊',
  '🍽️',
  '☕',
  '🛍️',
  '🎉',
  '🎬',
  '🐾',
  '👕',
  '📚',
  '🎓',
  '✈️',
  '🧾',
  '💰',
  '📈',
  '💼',
  '🧑‍💻',
  '📥',
  '🎁',
  '🏋️',
  '🍔',
  '🚇',
  '🚲',
  '🛠️',
  '🧒',
  '🧹',
  '❤️',
] as const;

const COLOR_OPTIONS = [
  '#E03E3E',
  '#D9730D',
  '#CB912F',
  '#448361',
  '#0F7B6C',
  '#337EA9',
  '#0B6E99',
  '#9065B0',
  '#D44C47',
  '#FF7369',
] as const;

const TYPE_LABELS: Record<Category['type'], string> = {
  expense: 'Despesa',
  income: 'Receita',
};

export function CategoryModal({
  isOpen,
  mode,
  category,
  defaultType = 'expense',
  isSubmitting,
  errorMessage,
  onClose,
  onSave,
}: CategoryModalProps) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState<string>(EMOJI_OPTIONS[0]);
  const [color, setColor] = useState<string>(COLOR_OPTIONS[0]);
  const [type, setType] = useState<Category['type']>(defaultType);
  const [validationError, setValidationError] = useState<string | null>(null);

  const currentType = useMemo(
    () => (mode === 'edit' && category ? category.type : type),
    [category, mode, type]
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setValidationError(null);
    setName(category?.name ?? '');
    setEmoji(category?.emoji ?? EMOJI_OPTIONS[0]);
    setColor(category?.color ?? COLOR_OPTIONS[0]);
    setType(category?.type ?? defaultType);
  }, [category, defaultType, isOpen]);

  if (!isOpen) {
    return null;
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedName = name.trim();
    if (!trimmedName) {
      setValidationError('Indique um nome para a categoria.');
      return;
    }

    setValidationError(null);
    void onSave({
      name: trimmedName,
      emoji,
      color,
      type: currentType,
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
        className="w-full max-w-lg rounded-[var(--radius-lg)] bg-[var(--color-bg)] p-5 shadow-[var(--shadow-md)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-[var(--color-text)]">
              {mode === 'create' ? 'Nova categoria' : 'Editar categoria'}
            </h3>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              {mode === 'create'
                ? 'Escolha um nome, emoji e cor para organizar os seus movimentos.'
                : 'Atualize os detalhes da categoria.'}
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
              htmlFor="category-name"
              className="mb-1 block text-sm font-medium text-[var(--color-text)]"
            >
              Nome
            </label>
            <input
              id="category-name"
              type="text"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setValidationError(null);
              }}
              placeholder="Ex.: Supermercado"
              autoFocus
              maxLength={40}
              className="min-h-[44px] w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-accent)]"
            />
          </div>

          {mode === 'create' ? (
            <div>
              <span className="mb-1 block text-sm font-medium text-[var(--color-text)]">
                Tipo
              </span>
              <div className="grid grid-cols-2 gap-2">
                {(['expense', 'income'] as const).map((option) => {
                  const isSelected = type === option;

                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setType(option)}
                      aria-pressed={isSelected}
                      className={`min-h-[44px] rounded-[var(--radius-md)] border px-3 py-2 text-sm font-medium transition-colors ${
                        isSelected
                          ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)]'
                          : 'border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]'
                      }`}
                    >
                      {TYPE_LABELS[option]}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-secondary)]">
              Tipo: <span className="font-medium text-[var(--color-text)]">{TYPE_LABELS[currentType]}</span>
            </div>
          )}

          <div>
            <span className="mb-2 block text-sm font-medium text-[var(--color-text)]">
              Emoji
            </span>
            <div className="grid grid-cols-5 gap-2 sm:grid-cols-6">
              {EMOJI_OPTIONS.map((option) => {
                const isSelected = emoji === option;

                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setEmoji(option)}
                    aria-pressed={isSelected}
                    className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[var(--radius-md)] border text-xl transition-colors ${
                      isSelected
                        ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]'
                        : 'border-[var(--color-border)] bg-[var(--color-bg)] hover:bg-[var(--color-bg-secondary)]'
                    }`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <span className="mb-2 block text-sm font-medium text-[var(--color-text)]">
              Cor
            </span>
            <div className="grid grid-cols-5 gap-2">
              {COLOR_OPTIONS.map((option) => {
                const isSelected = color === option;

                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setColor(option)}
                    aria-pressed={isSelected}
                    className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[var(--radius-md)] border transition-transform ${
                      isSelected
                        ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]'
                        : 'border-[var(--color-border)] bg-[var(--color-bg)] hover:bg-[var(--color-bg-secondary)]'
                    }`}
                  >
                    <span
                      className="h-6 w-6 rounded-full border border-[var(--color-border)]"
                      style={{ backgroundColor: option }}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          {visibleError && (
            <p className="rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-red-50 px-3 py-2 text-sm text-[var(--color-danger)]">
              {visibleError}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="min-h-[44px] rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-2.5 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg-secondary)] disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="min-h-[44px] rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-[var(--color-text-inverse)] transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
            >
              {isSubmitting ? 'A guardar…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
