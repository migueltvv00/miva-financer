import { supabase } from './supabase';

interface DefaultCategory {
  name: string;
  emoji: string;
  color: string;
  type: 'expense' | 'income';
  sort_order: number;
}

const DEFAULT_CATEGORIES: DefaultCategory[] = [
  // Expense categories
  { name: 'Alimentação', emoji: '🛒', color: '#E03E3E', type: 'expense', sort_order: 0 },
  { name: 'Transporte', emoji: '🚗', color: '#D9730D', type: 'expense', sort_order: 1 },
  { name: 'Renda', emoji: '🏠', color: '#CB912F', type: 'expense', sort_order: 2 },
  { name: 'Serviços', emoji: '⚡', color: '#448361', type: 'expense', sort_order: 3 },
  { name: 'Saúde', emoji: '💊', color: '#337EA9', type: 'expense', sort_order: 4 },
  { name: 'Lazer', emoji: '🍻', color: '#9065B0', type: 'expense', sort_order: 5 },
  { name: 'Subscrições', emoji: '📺', color: '#D44C47', type: 'expense', sort_order: 6 },
  { name: 'Compras', emoji: '🛍', color: '#FF7369', type: 'expense', sort_order: 7 },
  { name: 'Poupança', emoji: '💰', color: '#0F7B6C', type: 'expense', sort_order: 8 },
  { name: 'Investimento', emoji: '📈', color: '#0B6E99', type: 'expense', sort_order: 9 },
  // Income categories
  { name: 'Salário', emoji: '💼', color: '#0F7B6C', type: 'income', sort_order: 0 },
  { name: 'Freelance', emoji: '🧑‍💻', color: '#337EA9', type: 'income', sort_order: 1 },
  { name: 'Outros Rendimentos', emoji: '📥', color: '#9065B0', type: 'income', sort_order: 2 },
];

export async function seedDefaultCategories(userId: string): Promise<void> {
  try {
    const { count } = await supabase
      .from('categories')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (count && count > 0) return;

    const rows = DEFAULT_CATEGORIES.map((cat) => ({
      ...cat,
      user_id: userId,
      is_default: true,
    }));

    const { error } = await supabase.from('categories').insert(rows);
    if (error) {
      console.error('Failed to seed categories:', error);
    }
  } catch (err) {
    console.error('Error seeding default categories:', err);
  }
}
