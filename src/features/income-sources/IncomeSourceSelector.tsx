import { useMemo } from 'react';
import {
  ARCHIVED_BADGE_CLASSNAME,
  INCOME_SOURCE_TYPE_BADGE_CLASSNAMES,
  INCOME_SOURCE_TYPE_LABELS,
} from '@/features/income-sources/constants';
import { useIncomeSourceStore } from '@/store/incomeSourceStore';
import type { IncomeSource } from '@/types';

interface IncomeSourceSelectorProps {
  selectedSourceId: string | null;
  onSelect: (sourceId: string | null) => void;
  disabled?: boolean;
}

interface SourceOptionCardProps {
  label: string;
  badgeLabel: string;
  badgeClassName: string;
  isActive: boolean;
  onClick: () => void;
  disabled: boolean;
  helperText?: string;
}

function SourceOptionCard({
  label,
  badgeLabel,
  badgeClassName,
  isActive,
  onClick,
  disabled,
  helperText,
}: SourceOptionCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={isActive}
      className={`flex min-h-[92px] w-[132px] flex-col items-start justify-between rounded-[var(--radius-md)] border px-3 py-3 text-left transition-colors disabled:opacity-50 ${
        isActive
          ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]'
          : 'border-[var(--color-border)] bg-[var(--color-bg)] hover:bg-[var(--color-bg-secondary)]'
      }`}
    >
      <span
        className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${badgeClassName}`}
      >
        {badgeLabel}
      </span>
      <span className="w-full">
        <span
          className={`block truncate text-sm font-semibold ${
            isActive
              ? 'text-[var(--color-accent)]'
              : 'text-[var(--color-text)]'
          }`}
        >
          {label}
        </span>
        {helperText && (
          <span className="mt-1 block text-xs text-[var(--color-text-secondary)]">
            {helperText}
          </span>
        )}
      </span>
    </button>
  );
}

function getSelectedArchivedSource(
  sources: IncomeSource[],
  selectedSourceId: string | null
) {
  if (!selectedSourceId) {
    return null;
  }

  return (
    sources.find(
      (source) => source.id === selectedSourceId && source.is_archived
    ) ?? null
  );
}

export function IncomeSourceSelector({
  selectedSourceId,
  onSelect,
  disabled = false,
}: IncomeSourceSelectorProps) {
  const sources = useIncomeSourceStore((state) => state.sources);
  const isLoading = useIncomeSourceStore((state) => state.isLoading);

  const activeSources = useMemo(
    () => sources.filter((source) => !source.is_archived),
    [sources]
  );
  const selectedArchivedSource = useMemo(
    () => getSelectedArchivedSource(sources, selectedSourceId),
    [selectedSourceId, sources]
  );

  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4 shadow-[var(--shadow-sm)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-[var(--color-text)]">
            Fonte de rendimento
          </h2>
          <p className="text-xs text-[var(--color-text-secondary)]">
            Associe a receita a uma origem específica ou deixe sem fonte.
          </p>
        </div>
        {activeSources.length > 0 && (
          <span className="text-xs text-[var(--color-text-tertiary)]">
            Deslize para ver mais
          </span>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-[var(--color-text-secondary)]">
          A carregar fontes de rendimento…
        </p>
      ) : (
        <div className="space-y-3">
          <div className="overflow-x-auto pb-1">
            <div className="grid auto-cols-[132px] grid-flow-col gap-3">
              <SourceOptionCard
                label="Sem fonte"
                badgeLabel="Opcional"
                badgeClassName={ARCHIVED_BADGE_CLASSNAME}
                isActive={selectedSourceId === null}
                onClick={() => onSelect(null)}
                disabled={disabled}
                helperText="Receita sem origem atribuída"
              />

              {activeSources.map((source) => (
                <SourceOptionCard
                  key={source.id}
                  label={source.name}
                  badgeLabel={INCOME_SOURCE_TYPE_LABELS[source.type]}
                  badgeClassName={INCOME_SOURCE_TYPE_BADGE_CLASSNAMES[source.type]}
                  isActive={selectedSourceId === source.id}
                  onClick={() => onSelect(source.id)}
                  disabled={disabled}
                />
              ))}

              {selectedArchivedSource && (
                <SourceOptionCard
                  label={selectedArchivedSource.name}
                  badgeLabel="Arquivada"
                  badgeClassName={ARCHIVED_BADGE_CLASSNAME}
                  isActive={selectedSourceId === selectedArchivedSource.id}
                  onClick={() => onSelect(selectedArchivedSource.id)}
                  disabled={disabled}
                  helperText={INCOME_SOURCE_TYPE_LABELS[selectedArchivedSource.type]}
                />
              )}
            </div>
          </div>

          {activeSources.length === 0 && !selectedArchivedSource && (
            <p className="text-sm text-[var(--color-text-secondary)]">
              Ainda não existem fontes de rendimento ativas. Pode continuar com “Sem fonte”.
            </p>
          )}

          {selectedArchivedSource && (
            <p className="text-xs text-[var(--color-text-secondary)]">
              A fonte selecionada está arquivada, mas continua associada a esta receita.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
