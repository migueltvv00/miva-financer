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

export type PaymentMethod =
  | 'cartao_refeicao'
  | 'multibanco'
  | 'mbway'
  | 'numerario'
  | 'credito'
  | 'debito';

export const PAYMENT_METHOD_OPTIONS: Array<{
  value: PaymentMethod;
  label: string;
  emoji: string;
}> = [
  { value: 'cartao_refeicao', label: 'Cartão Refeição', emoji: '🍽️' },
  { value: 'multibanco', label: 'Multibanco', emoji: '🏧' },
  { value: 'mbway', label: 'MBWay', emoji: '📱' },
  { value: 'numerario', label: 'Numerário', emoji: '💵' },
  { value: 'credito', label: 'Crédito', emoji: '💳' },
  { value: 'debito', label: 'Débito', emoji: '💳' },
];

export const PAYMENT_METHOD_SHORT_LABELS: Record<PaymentMethod, string> = {
  cartao_refeicao: 'Refeição',
  multibanco: 'MB',
  mbway: 'MBWay',
  numerario: 'Cash',
  credito: 'Créd',
  debito: 'Déb',
};

export interface Transaction {
  id: string;
  user_id: string;
  amount_cents: number;
  type: 'expense' | 'income';
  category_id: string;
  source_id: string | null;
  goal_id: string | null;
  import_session_id: string | null;
  instalment_id: string | null;
  note: string | null;
  date: string;
  is_recurring: boolean;
  recurrence_rule: 'weekly' | 'monthly' | 'yearly' | null;
  recurrence_parent_id: string | null;
  created_at: string;
  updated_at: string;
  payment_method: PaymentMethod | null;
  payslip_import_id: string | null;
}

export interface Budget {
  id: string;
  user_id: string;
  category_id: string;
  month: string;
  limit_cents: number;
  created_at: string;
}

export interface IncomeSource {
  id: string;
  user_id: string;
  name: string;
  type: 'salary' | 'freelance' | 'other';
  is_archived: boolean;
  created_at: string;
}

export interface MonthlyPlan {
  id: string;
  user_id: string;
  month: string;
  expected_income_cents: number;
  notes: string | null;
  created_at: string;
}

export interface SavingsGoal {
  id: string;
  user_id: string;
  name: string;
  target_cents: number;
  current_cents: number;
  monthly_contribution_cents: number;
  deadline: string | null;
  color: string;
  emoji: string;
  is_complete: boolean;
  created_at: string;
}

export interface NetWorthEntry {
  id: string;
  user_id: string;
  month: string;
  assets_json: Record<string, number>;
  liabilities_json: Record<string, number>;
  created_at: string;
}

export interface ImportSession {
  id: string;
  user_id: string;
  bank: string;
  filename: string;
  row_count: number;
  imported_count: number;
  created_at: string;
}

export interface Instalment {
  id: string;
  user_id: string;
  name: string;
  total_cents: number;
  instalment_cents: number;
  num_instalments: number;
  paid_instalments: number;
  start_month: string;
  category_id: string | null;
  note: string | null;
  created_at: string;
}

export interface InvestmentAccount {
  id: string;
  user_id: string;
  name: string;
  type: 'etf' | 'ppr' | 'stock' | 'savings' | 'other';
  color: string;
  created_at: string;
}

export interface InvestmentSnapshot {
  id: string;
  user_id: string;
  account_id: string;
  month: string;
  value_cents: number;
  cost_basis_cents: number;
  created_at: string;
}

export interface TelegramSession {
  id: string;
  user_id: string;
  telegram_chat_id: number;
  telegram_username: string | null;
  is_authorized: boolean;
  digest_enabled: boolean;
  linked_at: string | null;
  created_at: string;
}

export interface TelegramPin {
  id: string;
  user_id: string;
  pin: string;
  expires_at: string;
  used: boolean;
  created_at: string;
}
