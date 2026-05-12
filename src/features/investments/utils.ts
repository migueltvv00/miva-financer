import { format, parseISO, startOfMonth } from 'date-fns';
import { pt } from 'date-fns/locale/pt';

export function getMonthStart(date: Date) {
  return startOfMonth(date);
}

export function getMonthKey(date: Date) {
  return format(getMonthStart(date), 'yyyy-MM-dd');
}

export function getMonthLabel(date: Date) {
  const label = format(getMonthStart(date), 'LLLL yyyy', { locale: pt });
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}

export function formatMonthLabel(month: string, pattern: 'LLL yy' | 'LLLL yyyy') {
  const label = format(parseISO(month), pattern, { locale: pt });
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}

export function formatEditableEuro(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) {
    return '';
  }

  return new Intl.NumberFormat('pt-PT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: false,
  }).format(cents / 100);
}

export function parseEuroInput(value: string): number | null {
  const cleaned = value.replace(/\s|€/g, '').replace(',', '.');

  if (!cleaned) {
    return null;
  }

  const numericValue = Number.parseFloat(cleaned);

  if (Number.isNaN(numericValue)) {
    return null;
  }

  return Math.round(numericValue * 100);
}

export function sanitizeEuroInput(value: string) {
  return value.replace(/[^\d,.\s€]/g, '');
}

export function getFriendlyErrorMessage(error: unknown, fallbackMessage: string) {
  return error instanceof Error && error.message ? error.message : fallbackMessage;
}
