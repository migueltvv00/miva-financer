export interface SavingsGoalFormValues {
  name: string;
  target_cents: number;
  monthly_contribution_cents: number;
  deadline: string | null;
  color: string;
  emoji: string;
}
