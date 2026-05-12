import type { InvestmentAccount } from '@/types';

export const ACCOUNT_TYPE_LABELS: Record<InvestmentAccount['type'], string> = {
  etf: 'ETF',
  ppr: 'PPR',
  stock: 'Ações',
  savings: 'Poupança',
  other: 'Outro',
};

export const ACCOUNT_COLORS = [
  '#337EA9',
  '#9065B0',
  '#D9730D',
  '#448361',
  '#E03E3E',
  '#0B6E99',
  '#CB912F',
  '#0F7B6C',
] as const;
