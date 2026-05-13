/**
 * Period utilities — replaces calendar-month logic with configurable period start day.
 *
 * If month_start_day = 23:
 *   "May period" = 23 Apr → 22 May
 *   "June period" = 23 May → 22 Jun
 *
 * If month_start_day = 1 (default), behaves identically to calendar months.
 */

import { format, addDays, subDays } from 'date-fns';
import { pt } from 'date-fns/locale';

const DEFAULT_START_DAY = 1;

/**
 * Get the start date of the period that contains `referenceDate`.
 * If startDay=23 and referenceDate=May 10, period started Apr 23.
 * If startDay=23 and referenceDate=May 25, period started May 23.
 */
export function getPeriodStart(referenceDate: Date, startDay: number = DEFAULT_START_DAY): Date {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const day = referenceDate.getDate();

  if (startDay === 1) {
    return new Date(year, month, 1);
  }

  if (day >= startDay) {
    return new Date(year, month, startDay);
  }

  // Day is before startDay, so the period started in the previous calendar month
  const prev = new Date(year, month - 1, startDay);
  return prev;
}

/**
 * Get the end date (inclusive) of the period that contains `referenceDate`.
 * End = day before the next period's start.
 */
export function getPeriodEnd(referenceDate: Date, startDay: number = DEFAULT_START_DAY): Date {
  const periodStart = getPeriodStart(referenceDate, startDay);
  const nextPeriodStart = getNextPeriodStart(periodStart, startDay);
  return subDays(nextPeriodStart, 1);
}

/**
 * Get the start of the next period after the one containing `referenceDate`.
 */
function getNextPeriodStart(periodStart: Date, startDay: number): Date {
  const year = periodStart.getFullYear();
  const month = periodStart.getMonth();

  if (startDay === 1) {
    return new Date(year, month + 1, 1);
  }

  return new Date(year, month + 1, startDay);
}

/**
 * Navigate to the next period.
 */
export function getNextPeriod(referenceDate: Date, startDay: number = DEFAULT_START_DAY): Date {
  const periodStart = getPeriodStart(referenceDate, startDay);
  return getNextPeriodStart(periodStart, startDay);
}

/**
 * Navigate to the previous period.
 */
export function getPreviousPeriod(referenceDate: Date, startDay: number = DEFAULT_START_DAY): Date {
  const periodStart = getPeriodStart(referenceDate, startDay);

  if (startDay === 1) {
    return new Date(periodStart.getFullYear(), periodStart.getMonth() - 1, 1);
  }

  return new Date(periodStart.getFullYear(), periodStart.getMonth() - 1, startDay);
}

/**
 * Period key for storage (budgets.month, monthly_plans.month, etc.)
 * Returns the period start date as "yyyy-MM-dd".
 */
export function getPeriodKey(referenceDate: Date, startDay: number = DEFAULT_START_DAY): string {
  const start = getPeriodStart(referenceDate, startDay);
  return format(start, 'yyyy-MM-dd');
}

/**
 * Human-readable period label.
 * If startDay=1: "Maio 2025"
 * If startDay=23: "23 Abr – 22 Mai 2025"
 */
export function getPeriodLabel(referenceDate: Date, startDay: number = DEFAULT_START_DAY): string {
  if (startDay === 1) {
    const label = format(referenceDate, 'MMMM yyyy', { locale: pt });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  const start = getPeriodStart(referenceDate, startDay);
  const end = getPeriodEnd(referenceDate, startDay);

  const startLabel = format(start, 'd MMM', { locale: pt });
  const endLabel = format(end, 'd MMM yyyy', { locale: pt });
  return `${startLabel} – ${endLabel}`;
}

/**
 * Check if a date falls within the period that contains `periodReference`.
 */
export function isDateInPeriod(
  date: Date,
  periodReference: Date,
  startDay: number = DEFAULT_START_DAY
): boolean {
  const start = getPeriodStart(periodReference, startDay);
  const end = getPeriodEnd(periodReference, startDay);
  return date >= start && date <= end;
}

/**
 * Get the period start and end as ISO date strings (for Supabase queries).
 */
export function getPeriodRange(referenceDate: Date, startDay: number = DEFAULT_START_DAY): {
  periodStart: string;
  periodEnd: string;
} {
  const start = getPeriodStart(referenceDate, startDay);
  const end = addDays(getPeriodEnd(referenceDate, startDay), 1); // exclusive end for < queries
  return {
    periodStart: format(start, 'yyyy-MM-dd'),
    periodEnd: format(end, 'yyyy-MM-dd'),
  };
}

/**
 * Get N previous period keys for trend analysis.
 */
export function getPeriodKeys(referenceDate: Date, count: number, startDay: number = DEFAULT_START_DAY): string[] {
  const keys: string[] = [];
  let current = referenceDate;

  for (let i = 0; i < count; i++) {
    keys.unshift(getPeriodKey(current, startDay));
    current = getPreviousPeriod(current, startDay);
  }

  return keys;
}

/**
 * Days remaining until period end.
 */
export function getDaysUntilPeriodEnd(referenceDate: Date, startDay: number = DEFAULT_START_DAY): number {
  const end = getPeriodEnd(referenceDate, startDay);
  const diffMs = end.getTime() - referenceDate.getTime();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}
