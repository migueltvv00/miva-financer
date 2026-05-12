import { useMemo } from 'react';
import type { Transaction } from '@/types';

export interface CategorySuggestion {
  categoryId: string;
  confidence: number;
}

export function getCategorySuggestion(
  noteText: string,
  transactionType: Transaction['type'],
  transactions: Transaction[],
  minChars = 2
): CategorySuggestion | null {
  if (noteText.length < minChars) {
    return null;
  }

  const normalizedNoteText = noteText.toLowerCase();
  const categoryCounts = new Map<string, number>();
  let totalMatches = 0;

  transactions.forEach((transaction) => {
    if (transaction.type !== transactionType || !transaction.note?.trim()) {
      return;
    }

    if (!transaction.note.toLowerCase().includes(normalizedNoteText)) {
      return;
    }

    totalMatches += 1;
    categoryCounts.set(
      transaction.category_id,
      (categoryCounts.get(transaction.category_id) ?? 0) + 1
    );
  });

  if (totalMatches === 0) {
    return null;
  }

  let suggestedCategoryId: string | null = null;
  let highestMatchCount = 0;

  categoryCounts.forEach((count, categoryId) => {
    if (count > highestMatchCount) {
      highestMatchCount = count;
      suggestedCategoryId = categoryId;
    }
  });

  if (!suggestedCategoryId) {
    return null;
  }

  const confidence = highestMatchCount / totalMatches;

  return confidence > 0.6 ? { categoryId: suggestedCategoryId, confidence } : null;
}

export function useCategorySuggestion(
  noteText: string,
  transactionType: Transaction['type'],
  transactions: Transaction[],
  minChars = 2
): CategorySuggestion | null {
  return useMemo(
    () => getCategorySuggestion(noteText, transactionType, transactions, minChars),
    [minChars, noteText, transactionType, transactions]
  );
}
