import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale/pt';
import { getPeriodStart, getPeriodKey, getPeriodLabel } from '@/lib/periodUtils';
import { useSettingsStore } from '@/store/settingsStore';

export function getMonthStart(date: Date) {
  const monthStartDay = useSettingsStore.getState().settings.monthStartDay;
  return getPeriodStart(date, monthStartDay);
}

export function getMonthKey(date: Date) {
  const monthStartDay = useSettingsStore.getState().settings.monthStartDay;
  return getPeriodKey(date, monthStartDay);
}

export function getMonthLabel(date: Date) {
  const monthStartDay = useSettingsStore.getState().settings.monthStartDay;
  return getPeriodLabel(date, monthStartDay);
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
