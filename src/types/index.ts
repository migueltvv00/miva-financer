export interface Category {
  id: string;
  user_id: string;
  name: string;
  emoji: string;
  color: string;
  type: 'expense' | 'income';
  sort_order: number;
  is_default: boolean;
  created_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  amount_cents: number;
  type: 'expense' | 'income';
  category_id: string;
  note: string | null;
  date: string;
  is_recurring: boolean;
  recurrence_rule: 'weekly' | 'monthly' | 'yearly' | null;
  recurrence_parent_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Budget {
  id: string;
  user_id: string;
  category_id: string;
  month: string;
  limit_cents: number;
  created_at: string;
}
