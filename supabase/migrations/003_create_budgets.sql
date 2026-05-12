-- Budgets table
CREATE TABLE budgets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES auth.users NOT NULL,
  category_id   uuid REFERENCES categories NOT NULL,
  month         date NOT NULL,
  limit_cents   integer NOT NULL CHECK (limit_cents > 0),
  created_at    timestamptz DEFAULT now(),
  UNIQUE (user_id, category_id, month)
);

ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own budgets"
  ON budgets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own budgets"
  ON budgets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own budgets"
  ON budgets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own budgets"
  ON budgets FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_budgets_user_id ON budgets (user_id);
CREATE INDEX idx_budgets_month ON budgets (user_id, month);
