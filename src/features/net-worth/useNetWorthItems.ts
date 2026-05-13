import { useCallback, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useNetWorthItemStore } from '@/store/netWorthItemStore';
import type { NetWorthItem } from '@/types';

export function useNetWorthItems(userId: string | null | undefined) {
  const items = useNetWorthItemStore((s) => s.items);
  const isLoading = useNetWorthItemStore((s) => s.isLoading);
  const setItems = useNetWorthItemStore((s) => s.setItems);
  const addItemToStore = useNetWorthItemStore((s) => s.addItem);
  const updateItemInStore = useNetWorthItemStore((s) => s.updateItem);
  const removeItemFromStore = useNetWorthItemStore((s) => s.removeItem);
  const setLoading = useNetWorthItemStore((s) => s.setLoading);

  useEffect(() => {
    if (!userId) {
      setItems([]);
      setLoading(false);
      return;
    }

    let active = true;

    const load = async () => {
      if (useNetWorthItemStore.getState().items.length === 0) setLoading(true);
      try {
        const { data, error } = await supabase
          .from('net_worth_items')
          .select('*')
          .eq('user_id', userId)
          .order('sort_order', { ascending: true });

        if (error) throw error;
        if (!active) return;

        const items = (data ?? []) as NetWorthItem[];
        setItems(items);

        // Backfill: if no savings_goal items exist, sync from existing goals
        const hasSavingsGoalItems = items.some((i) => i.source === 'savings_goal');
        if (!hasSavingsGoalItems) {
          try {
            const { data: goals } = await supabase
              .from('savings_goals')
              .select('id, name, current_cents, emoji')
              .eq('user_id', userId)
              .gt('current_cents', 0);

            if (goals && goals.length > 0 && active) {
              const newItems = goals.map((g) => ({
                user_id: userId,
                name: g.name,
                type: 'asset' as const,
                value_cents: g.current_cents,
                source: 'savings_goal' as const,
                source_id: g.id,
                emoji: g.emoji,
              }));
              const { data: inserted } = await supabase
                .from('net_worth_items')
                .insert(newItems)
                .select();
              if (inserted && active) {
                setItems([...items, ...(inserted as NetWorthItem[])]);
              }
            }
          } catch { /* backfill is non-critical */ }
        }
      } catch (err) {
        console.error('Erro ao carregar itens de patrimônio:', err);
        if (active) setItems([]);
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => { active = false; };
  }, [userId, setItems, setLoading]);

  const assets = useMemo(() => items.filter((i) => i.type === 'asset'), [items]);
  const liabilities = useMemo(() => items.filter((i) => i.type === 'liability'), [items]);

  const totalAssets = useMemo(() => assets.reduce((s, i) => s + i.value_cents, 0), [assets]);
  const totalLiabilities = useMemo(() => liabilities.reduce((s, i) => s + i.value_cents, 0), [liabilities]);
  const netWorth = useMemo(() => totalAssets - totalLiabilities, [totalAssets, totalLiabilities]);

  const addItem = useCallback(
    async (item: Omit<NetWorthItem, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
      if (!userId) throw new Error('Sessão indisponível.');

      const { data, error } = await supabase
        .from('net_worth_items')
        .insert({ ...item, user_id: userId })
        .select()
        .single();

      if (error) throw error;
      addItemToStore(data as NetWorthItem);
      return data as NetWorthItem;
    },
    [userId, addItemToStore]
  );

  const updateItem = useCallback(
    async (id: string, updates: Partial<Pick<NetWorthItem, 'name' | 'value_cents' | 'emoji' | 'sort_order'>>) => {
      const { error } = await supabase
        .from('net_worth_items')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
      updateItemInStore(id, updates);
    },
    [updateItemInStore]
  );

  const removeItem = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from('net_worth_items')
        .delete()
        .eq('id', id);

      if (error) throw error;
      removeItemFromStore(id);
    },
    [removeItemFromStore]
  );

  const takeSnapshot = useCallback(
    async () => {
      if (!userId) throw new Error('Sessão indisponível.');

      const now = new Date();
      const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

      const assetsJson: Record<string, number> = {};
      for (const a of assets) {
        assetsJson[a.name] = a.value_cents;
      }

      const liabilitiesJson: Record<string, number> = {};
      for (const l of liabilities) {
        liabilitiesJson[l.name] = l.value_cents;
      }

      const { error } = await supabase
        .from('net_worth_entries')
        .upsert(
          { user_id: userId, month: monthKey, assets_json: assetsJson, liabilities_json: liabilitiesJson },
          { onConflict: 'user_id,month' }
        );

      if (error) throw error;
    },
    [userId, assets, liabilities]
  );

  return {
    items,
    assets,
    liabilities,
    totalAssets,
    totalLiabilities,
    netWorth,
    isLoading,
    addItem,
    updateItem,
    removeItem,
    takeSnapshot,
  };
}
