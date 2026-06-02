import { create, type StoreApi, type UseBoundStore } from 'zustand';

export interface EntityStoreState<T extends { id: string }> {
  items: T[];
  isLoading: boolean;
  error: string | null;
  lastFetchedAt: number | null;
  setItems: (items: T[]) => void;
  addItem: (item: T) => void;
  updateItem: (id: string, updates: Partial<T>) => void;
  removeItem: (id: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setLastFetched: (ts: number) => void;
  /**
   * Optimistically adds `item` to the store.
   * Returns a rollback function that undoes the addition.
   */
  optimisticAdd: (item: T) => () => void;
  /**
   * Optimistically removes the item with `id` from the store.
   * Returns a rollback function that re-inserts the item at its original position.
   */
  optimisticRemove: (id: string) => () => void;
}

export interface EntityStoreOptions<T> {
  sortFn?: (items: T[]) => T[];
}

export function createEntityStore<T extends { id: string }>(
  options?: EntityStoreOptions<T>
) {
  const sort = options?.sortFn ?? ((items: T[]) => items);

  const useStore = create<EntityStoreState<T>>((set, get) => ({
    items: [],
    isLoading: false,
    error: null,
    lastFetchedAt: null,
    setItems: (items) => set({ items: sort(items), isLoading: false, lastFetchedAt: Date.now() }),
    addItem: (item) =>
      set((state) => ({ items: sort([...state.items, item]) })),
    updateItem: (id, updates) =>
      set((state) => ({
        items: sort(
          state.items.map((i) => (i.id === id ? { ...i, ...updates } : i))
        ),
      })),
    removeItem: (id) =>
      set((state) => ({ items: state.items.filter((i) => i.id !== id) })),
    setLoading: (isLoading) => set({ isLoading }),
    setError: (error) => set({ error }),
    setLastFetched: (ts) => set({ lastFetchedAt: ts }),
    optimisticAdd: (item) => {
      set((state) => ({ items: sort([...state.items, item]) }));
      return () =>
        set((state) => ({ items: state.items.filter((i) => i.id !== item.id) }));
    },
    optimisticRemove: (id) => {
      const snapshot = get().items;
      set((state) => ({ items: state.items.filter((i) => i.id !== id) }));
      return () => set({ items: snapshot });
    },
  }));

  return useStore;
}

export type EntityStore<T extends { id: string }> = UseBoundStore<StoreApi<EntityStoreState<T>>>;
