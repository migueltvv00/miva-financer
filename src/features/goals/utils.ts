import { addMonths, format } from 'date-fns';
import { pt } from 'date-fns/locale/pt';
import type { SavingsGoal } from '@/types';

export const GOAL_COLORS = [
  '#E03E3E',
  '#D9730D',
  '#CB912F',
  '#448361',
  '#337EA9',
  '#9065B0',
  '#0F7B6C',
  '#0B6E99',
  '#D44C47',
  '#FF7369',
] as const;

export const GOAL_EMOJIS = [
  '🏠',
  '🚗',
  '✈️',
  '🎓',
  '💍',
  '🏥',
  '📱',
  '💻',
  '🎮',
  '🏋️',
  '📚',
  '🎵',
  '🎨',
  '🐕',
  '🌴',
  '🎯',
  '🏆',
  '⭐',
  '🎁',
  '🔒',
] as const;

export function parseInputToCents(value: string): number | null {
  const compactValue = value.replace(/\s|€/g, '');

  if (!compactValue) {
    return null;
  }

  const separators = [...compactValue.matchAll(/[,.]/g)];
  const lastSeparator = separators[separators.length - 1];

  let wholePart = compactValue;
  let decimalPart = '';

  if (lastSeparator?.index !== undefined) {
    const decimalLength = compactValue.length - lastSeparator.index - 1;

    if (decimalLength <= 2) {
      wholePart = compactValue.slice(0, lastSeparator.index);
      decimalPart = compactValue.slice(lastSeparator.index + 1);
    }
  }

  const normalizedWholePart = wholePart.replace(/\D/g, '');
  const normalizedDecimalPart = decimalPart.replace(/\D/g, '');

  if (!normalizedWholePart && !normalizedDecimalPart) {
    return null;
  }

  const cents =
    Number(normalizedWholePart || '0') * 100 +
    Number((normalizedDecimalPart + '00').slice(0, 2));

  return Number.isSafeInteger(cents) ? cents : null;
}

export function formatEditableCents(cents: number) {
  return new Intl.NumberFormat('pt-PT', {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
    useGrouping: false,
  }).format(cents / 100);
}

export function capitalizeLabel(value: string) {
  if (!value) {
    return value;
  }

  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

export function getTodayDateValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function toLocalDate(dateValue: string) {
  return new Date(`${dateValue}T12:00:00`);
}

export function getProjectedCompletionDate(goal: SavingsGoal): Date | null {
  if (goal.monthly_contribution_cents <= 0) {
    return null;
  }

  if (goal.current_cents >= goal.target_cents) {
    return new Date();
  }

  const remaining = goal.target_cents - goal.current_cents;
  const monthsNeeded = Math.ceil(remaining / goal.monthly_contribution_cents);

  return addMonths(new Date(), monthsNeeded);
}

export function formatProjectedCompletionLabel(date: Date) {
  return capitalizeLabel(format(date, 'MMMM yyyy', { locale: pt }));
}

export function getGoalProgress(goal: SavingsGoal) {
  if (goal.target_cents <= 0) {
    return 0;
  }

  return Math.min(goal.current_cents / goal.target_cents, 1);
}
