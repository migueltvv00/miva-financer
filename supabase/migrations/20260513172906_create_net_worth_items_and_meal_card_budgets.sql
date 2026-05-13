-- Net worth item registry (persistent assets/liabilities)
CREATE TABLE IF NOT EXISTS net_worth_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('asset', 'liability')),
  value_cents integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'savings_goal', 'investment')),
  source_id uuid,
  emoji text DEFAULT '💰',
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE net_worth_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own net worth items" ON net_worth_items;
CREATE POLICY "Users manage own net worth items"
  ON net_worth_items FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_net_worth_items_user ON net_worth_items(user_id);
CREATE INDEX IF NOT EXISTS idx_net_worth_items_source ON net_worth_items(user_id, source, source_id);

-- Meal card monthly budget
CREATE TABLE IF NOT EXISTS meal_card_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month date NOT NULL,
  allowance_cents integer NOT NULL CHECK (allowance_cents > 0),
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, month)
);

ALTER TABLE meal_card_budgets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own meal card budgets" ON meal_card_budgets;
CREATE POLICY "Users manage own meal card budgets"
  ON meal_card_budgets FOR ALL USING (auth.uid() = user_id);
