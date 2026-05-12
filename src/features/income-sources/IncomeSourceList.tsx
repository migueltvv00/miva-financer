import { useEffect, useMemo, useState } from 'react';
import {
  ARCHIVED_BADGE_CLASSNAME,
  INCOME_SOURCE_TYPE_BADGE_CLASSNAMES,
  INCOME_SOURCE_TYPE_LABELS,
} from '@/features/income-sources/constants';
import {
  useIncomeSourceData,
  type IncomeSourceFormValues,
} from '@/features/income-sources/useIncomeSourceData';
import type { IncomeSource } from '@/types';

interface IncomeSourceListProps {
  userId: string | null | undefined;
}

interface TypeToggleGroupProps {
  value: IncomeSource['type'];
  onChange: (type: IncomeSource['type']) => void;
  disabled: boolean;
}

type FormState =
  | { mode: 'create' }
  | { mode: 'edit'; source: IncomeSource };

const TOAST_HIDE_DELAY_MS = 2_500;

function TypeToggleGroup({ value, onChange, disabled }: TypeToggleGroupProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {(Object.entries(INCOME_SOURCE_TYPE_LABELS) as Array<
        [IncomeSource['type'], string]
      >).map(([type, label]) => {
        const isActive = value === type;

        return (
          <button
            key={type}
            type="button"
            onClick={() => onChange(type)}
            disabled={disabled}
            aria-pressed={isActive}
            className={`min-h-[44px] rounded-full border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
              isActive
                ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)]'
                : 'border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function SourceTypeBadge({ type }: { type: IncomeSource['type'] }) {
  return (
    <span
      className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${INCOME_SOURCE_TYPE_BADGE_CLASSNAMES[type]}`}
    >
      {INCOME_SOURCE_TYPE_LABELS[type]}
    </span>
  );
}

export function IncomeSourceList({ userId }: IncomeSourceListProps) {
  const {
    sources,
    isLoading,
    error,
    createSource,
    updateSource,
    archiveSource,
  } = useIncomeSourceData(userId, { includeArchived: true });

  const [formState, setFormState] = useState<FormState | null>(null);
  const [draftValues, setDraftValues] = useState<IncomeSourceFormValues>({
    name: '',
    type: 'salary',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingSourceId, setPendingSourceId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const activeSources = useMemo(
    () => sources.filter((source) => !source.is_archived),
    [sources]
  );
  const archivedSources = useMemo(
    () => sources.filter((source) => source.is_archived),
    [sources]
  );

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

  const handleOpenCreate = () => {
    setFormError(null);
    setDraftValues({ name: '', type: 'salary' });
    setFormState({ mode: 'create' });
  };

  const handleOpenEdit = (source: IncomeSource) => {
    setFormError(null);
    setDraftValues({ name: source.name, type: source.type });
    setFormState({ mode: 'edit', source });
  };

  const handleCloseForm = () => {
    if (isSaving) {
      return;
    }

    setFormError(null);
    setFormState(null);
  };

  const handleSubmit = async () => {
    const trimmedName = draftValues.name.trim();

    if (!trimmedName) {
      setFormError('Introduza um nome para a fonte de rendimento.');
      return;
    }

    setIsSaving(true);
    setFormError(null);

    try {
      if (formState?.mode === 'edit') {
        await updateSource(formState.source.id, {
          name: trimmedName,
          type: draftValues.type,
        });
        setToastMessage('Fonte de rendimento atualizada.');
      } else {
        await createSource({
          name: trimmedName,
          type: draftValues.type,
        });
        setToastMessage('Fonte de rendimento criada.');
      }

      setFormState(null);
      setDraftValues({ name: '', type: 'salary' });
    } catch (err) {
      console.error('Erro ao guardar fonte de rendimento:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchiveToggle = async (
    source: IncomeSource,
    shouldArchive: boolean
  ) => {
    setPendingSourceId(source.id);
    setFormError(null);

    try {
      await archiveSource(source.id, shouldArchive);
      setToastMessage(
        shouldArchive
          ? 'Fonte de rendimento arquivada.'
          : 'Fonte de rendimento reativada.'
      );

      if (formState?.mode === 'edit' && formState.source.id === source.id) {
        setFormState(null);
      }
    } catch (err) {
      console.error('Erro ao atualizar fonte de rendimento:', err);
    } finally {
      setPendingSourceId(null);
    }
  };

  const messages = [error, formError].filter(
    (message): message is string => Boolean(message)
  );

  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4 shadow-[var(--shadow-sm)]">
      <div className="flex flex-col gap-4 border-b border-[var(--color-divider)] pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-[var(--color-text)]">
              Fontes de rendimento
            </h3>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              Organize salários, trabalhos freelance e outras origens das suas receitas.
            </p>
          </div>

          <button
            type="button"
            onClick={handleOpenCreate}
            disabled={!userId || isLoading || isSaving}
            className="flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-light)] disabled:opacity-40"
          >
            Adicionar nova
          </button>
        </div>

        {formState && (
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-[var(--color-text)]">
                  {formState.mode === 'edit'
                    ? 'Editar fonte de rendimento'
                    : 'Nova fonte de rendimento'}
                </h4>
                <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                  Escolha um nome claro e o tipo correspondente.
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label
                  htmlFor="income-source-name"
                  className="mb-2 block text-sm font-medium text-[var(--color-text)]"
                >
                  Nome
                </label>
                <input
                  id="income-source-name"
                  type="text"
                  value={draftValues.name}
                  onChange={(event) => {
                    setDraftValues((currentValues) => ({
                      ...currentValues,
                      name: event.target.value,
                    }));
                    setFormError(null);
                  }}
                  maxLength={80}
                  placeholder="Ex.: Empresa, Cliente A, Subsídio"
                  className="min-h-[44px] w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-accent)]"
                />
              </div>

              <div>
                <span className="mb-2 block text-sm font-medium text-[var(--color-text)]">
                  Tipo
                </span>
                <TypeToggleGroup
                  value={draftValues.type}
                  onChange={(type) => {
                    setDraftValues((currentValues) => ({
                      ...currentValues,
                      type,
                    }));
                    setFormError(null);
                  }}
                  disabled={isSaving}
                />
              </div>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={handleCloseForm}
                  disabled={isSaving}
                  className="min-h-[44px] rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-2.5 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg)] disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleSubmit();
                  }}
                  disabled={isSaving}
                  className="min-h-[44px] rounded-[var(--radius-md)] border border-[var(--color-accent)] bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-[var(--color-text-inverse)] transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
                >
                  {isSaving ? 'A guardar…' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {messages.length > 0 && (
        <div className="mt-4 flex flex-col gap-3">
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

      {isLoading ? (
        <div className="mt-4 flex min-h-[160px] items-center justify-center text-sm text-[var(--color-text-secondary)]">
          A carregar fontes de rendimento…
        </div>
      ) : activeSources.length === 0 ? (
        <div className="mt-4 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-6 text-sm text-[var(--color-text-secondary)]">
          Ainda não tem fontes de rendimento ativas.
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {activeSources.map((source) => {
            const isPending = pendingSourceId === source.id;

            return (
              <li
                key={source.id}
                className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium text-[var(--color-text)]">
                        {source.name}
                      </p>
                      <SourceTypeBadge type={source.type} />
                    </div>
                    <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                      {isPending ? 'A atualizar…' : 'Fonte ativa para associar a receitas.'}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(source)}
                      disabled={isPending || isSaving}
                      className="min-h-[44px] rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg)] disabled:opacity-40"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void handleArchiveToggle(source, true);
                      }}
                      disabled={isPending || isSaving}
                      className="min-h-[44px] rounded-[var(--radius-md)] border border-[var(--color-danger)] px-3 py-2 text-sm font-medium text-[var(--color-danger)] transition-colors hover:bg-[var(--color-bg)] disabled:opacity-40"
                    >
                      Arquivar
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {archivedSources.length > 0 && (
        <div className="mt-4 border-t border-[var(--color-divider)] pt-4">
          <button
            type="button"
            onClick={() => setShowArchived((currentValue) => !currentValue)}
            aria-expanded={showArchived}
            className="flex min-h-[44px] w-full items-center justify-between rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-left text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg)]"
          >
            <span>Arquivadas ({archivedSources.length})</span>
            <span className="text-lg text-[var(--color-text-secondary)]">
              {showArchived ? '−' : '+'}
            </span>
          </button>

          {showArchived && (
            <ul className="mt-3 flex flex-col gap-3">
              {archivedSources.map((source) => {
                const isPending = pendingSourceId === source.id;

                return (
                  <li
                    key={source.id}
                    className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-medium text-[var(--color-text)]">
                            {source.name}
                          </p>
                          <SourceTypeBadge type={source.type} />
                          <span
                            className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${ARCHIVED_BADGE_CLASSNAME}`}
                          >
                            Arquivada
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                          {isPending
                            ? 'A atualizar…'
                            : 'Mantém o histórico, mas deixa de surgir nas novas receitas.'}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(source)}
                          disabled={isPending || isSaving}
                          className="min-h-[44px] rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg)] disabled:opacity-40"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void handleArchiveToggle(source, false);
                          }}
                          disabled={isPending || isSaving}
                          className="min-h-[44px] rounded-[var(--radius-md)] border border-[var(--color-accent)] px-3 py-2 text-sm font-medium text-[var(--color-accent)] transition-colors hover:bg-[var(--color-bg)] disabled:opacity-40"
                        >
                          Reativar
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {toastMessage && (
        <p className="mt-4 rounded-[var(--radius-md)] border border-[var(--color-accent)] bg-[var(--color-accent-light)] px-3 py-2 text-sm text-[var(--color-accent)]">
          {toastMessage}
        </p>
      )}
    </section>
  );
}
