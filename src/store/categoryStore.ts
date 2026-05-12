import { create } from 'zustand';
import type { Category } from '@/types';

interface CategoryState {
  categories: Category[];
  isLoading: boolean;
  setCategories: (categories: Category[]) => void;
  addCategory: (category: Category) => void;
  updateCategory: (id: string, updates: Partial<Category>) => void;
  removeCategory: (id: string) => void;
  swapCategoryOrder: (firstId: string, secondId: string) => void;
  setLoading: (loading: boolean) => void;
}

const CATEGORY_TYPE_ORDER: Record<Category['type'], number> = {
  expense: 0,
  income: 1,
};

function sortCategories(categories: Category[]) {
  return [...categories].sort((left, right) => {
    if (left.type !== right.type) {
      return CATEGORY_TYPE_ORDER[left.type] - CATEGORY_TYPE_ORDER[right.type];
    }

    if (left.sort_order !== right.sort_order) {
      return left.sort_order - right.sort_order;
    }

    return left.name.localeCompare(right.name, 'pt-PT');
  });
}

export const useCategoryStore = create<CategoryState>((set) => ({
  categories: [],
  isLoading: false,
  setCategories: (categories) => set({ categories: sortCategories(categories) }),
  addCategory: (category) =>
    set((state) => ({
      categories: sortCategories([...state.categories, category]),
    })),
  updateCategory: (id, updates) =>
    set((state) => ({
      categories: sortCategories(
        state.categories.map((category) =>
          category.id === id ? { ...category, ...updates } : category
        )
      ),
    })),
  removeCategory: (id) =>
    set((state) => ({
      categories: state.categories.filter((category) => category.id !== id),
    })),
  swapCategoryOrder: (firstId, secondId) =>
    set((state) => {
      const firstCategory = state.categories.find(
        (category) => category.id === firstId
      );
      const secondCategory = state.categories.find(
        (category) => category.id === secondId
      );

      if (!firstCategory || !secondCategory) {
        return state;
      }

      return {
        categories: sortCategories(
          state.categories.map((category) => {
            if (category.id === firstId) {
              return { ...category, sort_order: secondCategory.sort_order };
            }

            if (category.id === secondId) {
              return { ...category, sort_order: firstCategory.sort_order };
            }

            return category;
          })
        ),
      };
    }),
  setLoading: (isLoading) => set({ isLoading }),
}));
