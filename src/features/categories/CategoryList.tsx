import { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useCategoryStore } from '@/store/categoryStore';
import type { Category } from '@/types';
import {
  CategoryModal,
  type CategoryFormValues,
} from '@/features/categories/CategoryModal';

interface CategoryListProps {
  userId: string | null | undefined;
  loadError?: string | null;
}

type CategoryModalState =
  | {
      mode: 'create';
      type: Category['type'];
    }
  | {
      mode: 'edit';
      category: Category;
    };

const SECTION_COPY: Record<
  Category['type'],
  { title: string; emptyState: string }
> = {
  expense: {
    title: 'Despesas',
    emptyState: 'Ainda não tem categorias de despesa.',
  },
  income: {
    title: 'Receitas',
    emptyState: 'Ainda não tem categorias de receita.',
  },
};

export function CategoryList({
  userId,
  loadError = null,
}: CategoryListProps) {
  const categories = useCategoryStore((state) => state.categories);
  const isLoading = useCategoryStore((state) => state.isLoading);
  const setCategories = useCategoryStore((state) => state.setCategories);
  const addCategory = useCategoryStore((state) => state.addCategory);
  const updateCategory = useCategoryStore((state) => state.updateCategory);
  const removeCategory = useCategoryStore((state) => state.removeCategory);
  const swapCategoryOrder = useCategoryStore((state) => state.swapCategoryOrder);

  const [modalState, setModalState] = useState<CategoryModalState | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Category | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [movingCategoryId, setMovingCategoryId] = useState<string | null>(null);

  const sections = useMemo(
    () =>
      (['expense', 'income'] as const).map((type) => ({
        ...SECTION_COPY[type],
        type,
        categories: categories.filter((category) => category.type === type),
      })),
    [categories]
  );

  const handleOpenCreate = (type: Category['type']) => {
    setModalError(null);
    setActionError(null);
    setModalState({ mode: 'create', type });
  };

  const handleOpenEdit = (category: Category) => {
    setModalError(null);
    setActionError(null);
    setModalState({ mode: 'edit', category });
  };

  const handleCloseModal = () => {
    if (isSaving) {
      return;
    }

    setModalError(null);
    setModalState(null);
  };

  const getNextSortOrder = (type: Category['type']) => {
    const values = categories
      .filter((category) => category.type === type)
      .map((category) => category.sort_order);

    return values.length > 0 ? Math.max(...values) + 1 : 0;
  };

  const handleSaveCategory = async (values: CategoryFormValues) => {
    if (!userId || !modalState) {
      setModalError('Sessão indisponível. Tente novamente.');
      return;
    }

    setIsSaving(true);
    setModalError(null);
    setActionError(null);

    const previousCategories = categories;

    try {
      if (modalState.mode === 'create') {
        const optimisticCategory: Category = {
          id: crypto.randomUUID(),
          user_id: userId,
          name: values.name,
          emoji: values.emoji,
          color: values.color,
          type: values.type,
          sort_order: getNextSortOrder(values.type),
          is_default: false,
          created_at: new Date().toISOString(),
        };

        addCategory(optimisticCategory);

        const { data, error } = await supabase
          .from('categories')
          .insert(optimisticCategory)
          .select()
          .single();

        if (error) {
          throw error;
        }

        updateCategory(optimisticCategory.id, data as Category);
      } else {
        const updates = {
          name: values.name,
          emoji: values.emoji,
          color: values.color,
        };

        updateCategory(modalState.category.id, updates);

        const { error } = await supabase
          .from('categories')
          .update(updates)
          .eq('id', modalState.category.id)
          .eq('user_id', userId);

        if (error) {
          throw error;
        }
      }

      setModalState(null);
    } catch (err) {
      console.error('Erro ao guardar categoria:', err);
      setCategories(previousCategories);
      setModalError('Não foi possível guardar a categoria. Tente novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleMoveCategory = async (
    category: Category,
    direction: 'up' | 'down'
  ) => {
    if (!userId) {
      setActionError('Sessão indisponível. Tente novamente.');
      return;
    }

    const categorySection = categories.filter(
      (item) => item.type === category.type
    );
    const currentIndex = categorySection.findIndex(
      (item) => item.id === category.id
    );
    const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= categorySection.length) {
      return;
    }

    const targetCategory = categorySection[nextIndex];
    if (!targetCategory) {
      return;
    }

    const previousCategories = categories;
    const currentOrder = category.sort_order;
    const targetOrder = targetCategory.sort_order;

    setActionError(null);
    setMovingCategoryId(category.id);
    swapCategoryOrder(category.id, targetCategory.id);

    try {
      const [firstUpdate, secondUpdate] = await Promise.all([
        supabase
          .from('categories')
          .update({ sort_order: targetOrder })
          .eq('id', category.id)
          .eq('user_id', userId),
        supabase
          .from('categories')
          .update({ sort_order: currentOrder })
          .eq('id', targetCategory.id)
          .eq('user_id', userId),
      ]);

      if (firstUpdate.error) {
        throw firstUpdate.error;
      }

      if (secondUpdate.error) {
        throw secondUpdate.error;
      }
    } catch (err) {
      console.error('Erro ao reordenar categorias:', err);
      setCategories(previousCategories);
      setActionError('Não foi possível reordenar as categorias.');
    } finally {
      setMovingCategoryId(null);
    }
  };

  const handleDeleteRequest = (category: Category) => {
    setActionError(null);
    setDeleteError(null);
    setPendingDelete(category);
  };

  const handleDeleteConfirm = async () => {
    if (!userId || !pendingDelete) {
      setDeleteError('Sessão indisponível. Tente novamente.');
      return;
    }

    setDeleteError(null);
    setActionError(null);
    setIsDeleting(true);

    const previousCategories = categories;
    removeCategory(pendingDelete.id);

    try {
      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', pendingDelete.id)
        .eq('user_id', userId);

      if (error) {
        throw error;
      }

      setPendingDelete(null);
    } catch (err) {
      console.error('Erro ao eliminar categoria:', err);
      setCategories(previousCategories);
      setDeleteError(
        'Não foi possível eliminar a categoria. Verifique se não está a ser utilizada.'
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4 shadow-[var(--shadow-sm)]">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-[var(--color-text)]">
          Categorias
        </h3>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Gere as categorias usadas para despesas e receitas.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {[loadError, actionError].filter(Boolean).map((message) => (
          <p
            key={message}
            className="rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-red-50 px-3 py-2 text-sm text-[var(--color-danger)]"
          >
            {message}
          </p>
        ))}
      </div>

      {isLoading ? (
        <div className="flex min-h-[160px] items-center justify-center text-sm text-[var(--color-text-secondary)]">
          A carregar categorias…
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          {sections.map((section) => (
            <section
              key={section.type}
              className="rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)] p-4"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-[var(--color-text)]">
                    {section.title}
                  </h4>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    {section.categories.length} categoria
                    {section.categories.length === 1 ? '' : 's'}
                  </p>
                </div>
              </div>

              {section.categories.length === 0 ? (
                <p className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-4 text-sm text-[var(--color-text-secondary)]">
                  {section.emptyState}
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {section.categories.map((category, index) => (
                    <li
                      key={category.id}
                      className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] p-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)] text-xl">
                          {category.emoji}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-medium text-[var(--color-text)]">
                              {category.name}
                            </p>
                            <span
                              className="h-3 w-3 shrink-0 rounded-full border border-[var(--color-border)]"
                              style={{ backgroundColor: category.color }}
                            />
                          </div>
                          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                            {category.is_default
                              ? 'Categoria predefinida'
                              : 'Categoria personalizada'}
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleMoveCategory(category, 'up')}
                            disabled={
                              index === 0 ||
                              isSaving ||
                              isDeleting ||
                              movingCategoryId !== null
                            }
                            aria-label={`Mover ${category.name} para cima`}
                            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg-secondary)] disabled:opacity-40"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveCategory(category, 'down')}
                            disabled={
                              index === section.categories.length - 1 ||
                              isSaving ||
                              isDeleting ||
                              movingCategoryId !== null
                            }
                            aria-label={`Mover ${category.name} para baixo`}
                            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg-secondary)] disabled:opacity-40"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(category)}
                            disabled={isSaving || isDeleting || movingCategoryId !== null}
                            aria-label={`Editar ${category.name}`}
                            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] text-base text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg-secondary)] disabled:opacity-40"
                          >
                            ✏️
                          </button>
                          {category.is_default ? (
                            <div
                              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] text-base text-[var(--color-text-secondary)]"
                              aria-label={`${category.name} é uma categoria protegida`}
                              title="Categoria protegida"
                            >
                              🔒
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleDeleteRequest(category)}
                              disabled={isSaving || isDeleting || movingCategoryId !== null}
                              aria-label={`Eliminar ${category.name}`}
                              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-danger)] text-base text-[var(--color-danger)] transition-colors hover:bg-red-50 disabled:opacity-40"
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <button
                type="button"
                onClick={() => handleOpenCreate(section.type)}
                disabled={isSaving || isDeleting || movingCategoryId !== null || !userId}
                className="mt-3 flex min-h-[44px] w-full items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[var(--color-accent)] bg-[var(--color-bg)] px-4 py-2.5 text-sm font-medium text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-light)] disabled:opacity-40"
              >
                Adicionar categoria
              </button>
            </section>
          ))}
        </div>
      )}

      <CategoryModal
        isOpen={modalState !== null}
        mode={modalState?.mode ?? 'create'}
        category={modalState?.mode === 'edit' ? modalState.category : null}
        defaultType={modalState?.mode === 'create' ? modalState.type : undefined}
        isSubmitting={isSaving}
        errorMessage={modalError}
        onClose={handleCloseModal}
        onSave={handleSaveCategory}
      />

      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-[var(--radius-lg)] bg-[var(--color-bg)] p-5 shadow-[var(--shadow-md)]">
            <h3 className="text-lg font-semibold text-[var(--color-text)]">
              Eliminar categoria
            </h3>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              Tem a certeza que pretende eliminar esta categoria?
            </p>
            <p className="mt-1 text-sm font-medium text-[var(--color-text)]">
              {pendingDelete.emoji} {pendingDelete.name}
            </p>

            {deleteError && (
              <p className="mt-4 rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-red-50 px-3 py-2 text-sm text-[var(--color-danger)]">
                {deleteError}
              </p>
            )}

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  if (!isDeleting) {
                    setDeleteError(null);
                    setPendingDelete(null);
                  }
                }}
                disabled={isDeleting}
                className="min-h-[44px] rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-2.5 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg-secondary)] disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteConfirm()}
                disabled={isDeleting}
                className="min-h-[44px] rounded-[var(--radius-md)] bg-[var(--color-danger)] px-4 py-2.5 text-sm font-semibold text-[var(--color-text-inverse)] transition-colors hover:opacity-90 disabled:opacity-50"
              >
                {isDeleting ? 'A eliminar…' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
