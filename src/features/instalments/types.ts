export interface InstalmentFormData {
  name: string;
  total_cents: number;
  num_instalments: number;
  start_month: string;
  category_id: string;
  note: string | null;
}
