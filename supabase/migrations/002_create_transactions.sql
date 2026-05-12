-- Transactions table
CREATE TABLE transactions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid REFERENCES auth.users NOT NULL,
  amount_cents          integer NOT NULL CHECK (amount_cents > 0),
  type                  text NOT NULL CHECK (type IN ('expense', 'income')),
  category_id           uuid REFERENCES categories NOT NULL,
  note                  text,
  date                  date NOT NULL,
  is_recurring          boolean NOT NULL DEFAULT false,
  recurrence_rule       text CHECK (recurrence_rule IS NULL OR recurrence_rule IN ('weekly', 'monthly', 'yearly')),
  recurrence_parent_id  uuid REFERENCES transactions,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions"
  ON transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own transactions"
  ON transactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own transactions"
  ON transactions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own transactions"
  ON transactions FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_transactions_user_id ON transactions (user_id);
CREATE INDEX idx_transactions_date ON transactions (user_id, date);
CREATE INDEX idx_transactions_category ON transactions (category_id);
