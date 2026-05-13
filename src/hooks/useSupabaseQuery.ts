import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { EntityStore } from '@/lib/createEntityStore';
import type { RealtimeChannel } from '@supabase/supabase-js';

const inFlightRequests = new Map<string, Promise<unknown>>();

interface UseSupabaseQueryOptions<T extends { id: string }> {
  key: string;
  store: EntityStore<T>;
  queryFn: (client: typeof supabase, userId: string) => Promise<T[]>;
  userId: string | null | undefined;
  enabled?: boolean;
  realtimeTable?: string;
  staleTime?: number; // ms, default 60_000
}

export function useSupabaseQuery<T extends { id: string }>(
  options: UseSupabaseQueryOptions<T>
) {
  const { key, store, queryFn, userId, enabled = true, realtimeTable, staleTime = 60_000 } = options;

  const items = store((s) => s.items);
  const isLoading = store((s) => s.isLoading);
  const error = store((s) => s.error);
  const lastFetchedAt = store((s) => s.lastFetchedAt);
  const setItems = store((s) => s.setItems);
  const setLoading = store((s) => s.setLoading);
  const setError = store((s) => s.setError);
  const addItem = store((s) => s.addItem);
  const updateItem = store((s) => s.updateItem);
  const removeItem = store((s) => s.removeItem);

  const mountedRef = useRef(true);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const fetchData = useCallback(
    async (force = false) => {
      if (!userId || !enabled) return;

      const now = Date.now();
      const isStale = !lastFetchedAt || now - lastFetchedAt > staleTime;

      // Show cached data immediately; only refetch if stale or forced
      if (!force && !isStale && items.length > 0) return;

      // Request deduplication
      const dedupeKey = `${key}:${userId}`;
      if (inFlightRequests.has(dedupeKey)) {
        await inFlightRequests.get(dedupeKey);
        return;
      }

      // Only show loading spinner on first load (no cached data)
      if (items.length === 0) setLoading(true);

      const promise = queryFn(supabase, userId);
      inFlightRequests.set(dedupeKey, promise);

      try {
        const data = await promise;
        if (mountedRef.current) {
          setItems(data);
          setError(null);
        }
      } catch (err) {
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : 'Erro ao carregar dados');
          setLoading(false);
        }
      } finally {
        inFlightRequests.delete(dedupeKey);
      }
    },
    [userId, enabled, key, queryFn, lastFetchedAt, staleTime, items.length, setItems, setLoading, setError]
  );

  // Initial fetch
  useEffect(() => {
    mountedRef.current = true;
    void fetchData();
    return () => { mountedRef.current = false; };
  }, [fetchData]);

  // Safety timeout: if loading for > 15s, force unblock
  useEffect(() => {
    if (!isLoading) return;
    const timer = window.setTimeout(() => {
      if (mountedRef.current) setLoading(false);
    }, 15_000);
    return () => window.clearTimeout(timer);
  }, [isLoading, setLoading]);

  // Realtime subscription
  useEffect(() => {
    if (!realtimeTable || !userId) return;

    const channel = supabase
      .channel(`${realtimeTable}_${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: realtimeTable, filter: `user_id=eq.${userId}` },
        (payload) => {
          if (!mountedRef.current) return;
          if (payload.eventType === 'INSERT') {
            addItem(payload.new as T);
          } else if (payload.eventType === 'UPDATE') {
            updateItem((payload.new as T).id, payload.new as Partial<T>);
          } else if (payload.eventType === 'DELETE') {
            removeItem((payload.old as { id: string }).id);
          }
        }
      )
      .subscribe();

    channelRef.current = channel;
    return () => {
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [realtimeTable, userId, addItem, updateItem, removeItem]);

  return { data: items, isLoading, error, refresh: () => fetchData(true) };
}
