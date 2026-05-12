import type { IncomeSource } from '@/types';

export const INCOME_SOURCE_TYPE_LABELS: Record<IncomeSource['type'], string> = {
  salary: 'Salário',
  freelance: 'Freelance',
  other: 'Outro',
};

export const INCOME_SOURCE_TYPE_BADGE_CLASSNAMES: Record<
  IncomeSource['type'],
  string
> = {
  salary:
    'border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)]',
  freelance:
    'border-[var(--color-warning)] bg-[var(--color-bg-secondary)] text-[var(--color-warning)]',
  other:
    'border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]',
};

export const ARCHIVED_BADGE_CLASSNAME =
  'border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]';
