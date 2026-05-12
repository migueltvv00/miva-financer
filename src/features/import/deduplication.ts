import type { ParsedTransaction } from '@/features/import/csvParsers';
import type { Transaction } from '@/types';

export interface DeduplicationResult {
  parsed: ParsedTransaction;
  isDuplicate: boolean;
  matchedTransactionId: string | null;
}

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const DUPLICATE_WINDOW_DAYS = 3;

function toUtcTimestamp(dateValue: string): number {
  const [year, month, day] = dateValue.split('-').map((value) => Number(value));
  return Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1);
}

export function checkDuplicates(
  parsed: ParsedTransaction[],
  existingTransactions: Transaction[]
): DeduplicationResult[] {
  return parsed.map((transaction) => {
    const transactionTimestamp = toUtcTimestamp(transaction.date);
    const matchedTransaction = existingTransactions.find((existingTransaction) => {
      if (
        existingTransaction.amount_cents !== transaction.amount_cents ||
        existingTransaction.type !== transaction.type
      ) {
        return false;
      }

      const existingTimestamp = toUtcTimestamp(existingTransaction.date);
      const differenceInDays = Math.abs(existingTimestamp - transactionTimestamp) / DAY_IN_MS;

      return differenceInDays <= DUPLICATE_WINDOW_DAYS;
    });

    return {
      parsed: transaction,
      isDuplicate: Boolean(matchedTransaction),
      matchedTransactionId: matchedTransaction?.id ?? null,
    };
  });
}
