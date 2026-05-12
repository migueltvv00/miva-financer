import {
  addMonths,
  differenceInCalendarMonths,
  format,
  startOfMonth,
} from 'date-fns';
import type { Instalment } from '@/types';

export function parseAmountInputToCents(value: string): number | null {
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

export function getCurrentMonthValue(date = new Date()) {
  return format(startOfMonth(date), 'yyyy-MM');
}

export function normalizeMonthDateValue(value: string) {
  return value.length === 7 ? `${value}-01` : value;
}

export function toMonthDate(value: string) {
  return startOfMonth(new Date(`${normalizeMonthDateValue(value)}T12:00:00`));
}

export function getInstalmentStartMonth(value: string) {
  return normalizeMonthDateValue(value);
}

export function getInstalmentTransactionDate(startMonth: string, index: number) {
  return format(addMonths(toMonthDate(startMonth), index), 'yyyy-MM-dd');
}

export function getInstalmentAmountForIndex(
  totalCents: number,
  instalmentCents: number,
  numInstalments: number,
  index: number
) {
  if (index === numInstalments - 1) {
    return totalCents - instalmentCents * (numInstalments - 1);
  }

  return instalmentCents;
}

export function getClampedPaidInstalments(instalment: Instalment) {
  return Math.min(Math.max(instalment.paid_instalments, 0), instalment.num_instalments);
}

export function getPaidInstalmentAmountCents(instalment: Instalment) {
  const paidInstalments = getClampedPaidInstalments(instalment);

  if (paidInstalments === 0) {
    return 0;
  }

  if (paidInstalments >= instalment.num_instalments) {
    return instalment.total_cents;
  }

  return paidInstalments * instalment.instalment_cents;
}

export function getRemainingInstalmentCents(instalment: Instalment) {
  return Math.max(instalment.total_cents - getPaidInstalmentAmountCents(instalment), 0);
}

export function getInstalmentProgress(instalment: Instalment) {
  if (instalment.num_instalments <= 0) {
    return 0;
  }

  return getClampedPaidInstalments(instalment) / instalment.num_instalments;
}

export function getInstalmentTransactionPosition(
  instalment: Instalment,
  transactionDate: string
) {
  const position =
    differenceInCalendarMonths(
      toMonthDate(transactionDate),
      toMonthDate(instalment.start_month)
    ) + 1;

  return Math.min(Math.max(position, 1), instalment.num_instalments);
}
