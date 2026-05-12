import { useEffect, useMemo, useState } from 'react';
import { InstalmentModal } from '@/features/instalments/InstalmentModal';
import { useInstalmentData } from '@/features/instalments/useInstalmentData';
import { formatCents } from '@/lib/utils';
import { useCategoryStore } from '@/store/categoryStore';
import type { Instalment } from '@/types';
import type { InstalmentFormData } from './types';
import {
  getClampedPaidInstalments,
  getInstalmentProgress,
  getRemainingInstalmentCents,
} from './utils';

interface InstalmentListProps {
  userId: string | null | undefined;
}

const TOAST_HIDE_DELAY_MS = 2_500;

function InstalmentCard({
  instalment,
  categoryName,
  isDeleting,
  onDelete,
}: {
  instalment: Instalment;
  categoryName: string | null;
  isDeleting: boolean;
  onDelete: (instalment: Instalment) => void;
}) {
  const paidInstalments = getClampedPaidInstalments(instalment);
  const remainingCents = getRemainingInstalmentCents(instalment);
  const progress = getInstalmentProgress(instalment);

  return (
    <li className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="truncate text-sm font-semibold text-[var(--color-text)]">
              {instalment.name}
            </h4>
            <span className="rounded-full bg-[var(--color-accent-light)] px-2 py-1 text-[11px] font-semibold text-[var(--color-accent)]">
              {paidInstalments}/{instalment.num_instalments} pagas
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--color-text-secondary)]">
            <span>Falta pagar {formatCents(remainingCents)}</span>
            <span>Prestação {formatCents(instalment.instalment_cents)}</span>
            {categoryName && <span>Categoria: {categoryName}</span>}
          </div>

          {instalment.note && (
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              {instalment.note}
            </p>
          )}

          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between gap-3 text-xs text-[var(--color-text-secondary)]">
              <span>Progresso</span>
              <span>{Math.round(progress * 100)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--color-bg-tertiary)]">
              <div
                className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-300"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onDelete(instalment)}
          disabled={isDeleting}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-base transition-colors hover:bg-[var(--color-bg-hover)] disabled:opacity-50"
          aria-label={`Eliminar plano ${instalment.name}`}
        >
          🗑️
        </button>
      </div>
    </li>
  );
}

export function InstalmentList({ userId }: InstalmentListProps) {
  const categories = useCategoryStore((state) => state.categories);
  const {
    instalments,
    isLoading,
    error,
    createInstalment,
    deleteInstalment,
  } = useInstalmentData(userId);

  const categoryMap = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories]
  );

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

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

  const handleCreate = async (values: InstalmentFormData) => {
    setIsSaving(true);
    setActionError(null);

    try {
      await createInstalment(values);
      setIsModalOpen(false);
      setToastMessage('Plano de prestações criado.');
    } catch (createError) {
      console.error('Erro ao criar plano de prestações:', createError);
      setActionError('Não foi possível criar o plano de prestações.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (instalment: Instalment) => {
    const confirmed = window.confirm(
      `Tem a certeza que quer eliminar o plano “${instalment.name}”?`
    );

    if (!confirmed) {
      return;
    }

    setPendingDeleteId(instalment.id);
    setActionError(null);

    try {
      await deleteInstalment(instalment.id);
      setToastMessage('Plano de prestações eliminado.');
    } catch (deleteError) {
      console.error('Erro ao eliminar plano de prestações:', deleteError);
      setActionError('Não foi possível eliminar o plano de prestações.');
    } finally {
      setPendingDeleteId(null);
    }
  };

  const messages = [error, actionError].filter(
    (message): message is string => Boolean(message)
  );

  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4 shadow-[var(--shadow-sm)]">
      <div className="flex flex-col gap-4 border-b border-[var(--color-divider)] pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-[var(--color-text)]">
              Prestações
            </h3>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              Registe compras parceladas e acompanhe o progresso de cada plano.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setActionError(null);
              setIsModalOpen(true);
            }}
            disabled={!userId || isLoading || isSaving}
            className="flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-light)] disabled:opacity-40"
          >
            Nova prestação
          </button>
        </div>
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
        <div className="flex min-h-[160px] items-center justify-center text-sm text-[var(--color-text-secondary)]">
          A carregar prestações…
        </div>
      ) : instalments.length === 0 ? (
        <div className="mt-4 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-6 text-sm text-[var(--color-text-secondary)]">
          Ainda não tem planos de prestações registados.
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {instalments.map((instalment) => (
            <InstalmentCard
              key={instalment.id}
              instalment={instalment}
              categoryName={
                instalment.category_id ? categoryMap.get(instalment.category_id) ?? null : null
              }
              isDeleting={pendingDeleteId === instalment.id}
              onDelete={handleDelete}
            />
          ))}
        </ul>
      )}

      <InstalmentModal
        isOpen={isModalOpen}
        isSubmitting={isSaving}
        errorMessage={actionError}
        onClose={() => {
          if (!isSaving) {
            setActionError(null);
            setIsModalOpen(false);
          }
        }}
        onSave={handleCreate}
      />

      {toastMessage && (
        <div className="fixed bottom-24 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-3 text-sm font-medium text-[var(--color-text-inverse)] shadow-[var(--shadow-md)] md:bottom-6">
          {toastMessage}
        </div>
      )}
    </section>
  );
}
