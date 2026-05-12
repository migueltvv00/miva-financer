import { addMonths, addWeeks, addYears, format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import type { Transaction } from '@/types';

type RecurrenceRule = NonNullable<Transaction['recurrence_rule']>;

type RecurringParent = Transaction & {
  is_recurring: true;
  recurrence_rule: RecurrenceRule;
  recurrence_parent_id: null;
};

function toLocalDate(dateValue: string) {
  return new Date(`${dateValue}T12:00:00`);
}

function formatDateValue(date: Date) {
  return format(date, 'yyyy-MM-dd');
}

export function getRecurringOccurrenceDate(
  parentDate: string,
  recurrenceRule: RecurrenceRule,
  occurrenceIndex = 1
) {
  const baseDate = toLocalDate(parentDate);

  switch (recurrenceRule) {
    case 'weekly':
      return formatDateValue(addWeeks(baseDate, occurrenceIndex));
    case 'monthly':
      return formatDateValue(addMonths(baseDate, occurrenceIndex));
    case 'yearly':
      return formatDateValue(addYears(baseDate, occurrenceIndex));
  }
}

function buildRecurringChild(parent: RecurringParent, date: string): Transaction {
  const timestamp = new Date().toISOString();

  return {
    ...parent,
    id: crypto.randomUUID(),
    date,
    is_recurring: false,
    recurrence_rule: null,
    recurrence_parent_id: parent.id,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

export async function processRecurringTransactions(userId: string) {
  if (!userId) {
    return 0;
  }

  const { data: parentData, error: parentError } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .eq('is_recurring', true)
    .is('recurrence_parent_id', null);

  if (parentError) {
    throw parentError;
  }

  const recurringParents = ((parentData ?? []) as Transaction[]).filter(
    (transaction): transaction is RecurringParent =>
      transaction.recurrence_parent_id === null &&
      transaction.is_recurring &&
      transaction.recurrence_rule !== null
  );

  if (recurringParents.length === 0) {
    return 0;
  }

  const parentIds = recurringParents.map((transaction) => transaction.id);
  const { data: childData, error: childError } = await supabase
    .from('transactions')
    .select('recurrence_parent_id, date')
    .eq('user_id', userId)
    .in('recurrence_parent_id', parentIds);

  if (childError) {
    throw childError;
  }

  const existingDatesByParent = new Map<string, Set<string>>();

  ((childData ?? []) as Pick<Transaction, 'recurrence_parent_id' | 'date'>[]).forEach(
    (child) => {
      if (!child.recurrence_parent_id) {
        return;
      }

      const dates = existingDatesByParent.get(child.recurrence_parent_id) ?? new Set<string>();
      dates.add(child.date);
      existingDatesByParent.set(child.recurrence_parent_id, dates);
    }
  );

  const today = formatDateValue(new Date());
  const transactionsToInsert: Transaction[] = [];

  recurringParents.forEach((parent) => {
    const existingDates = existingDatesByParent.get(parent.id) ?? new Set<string>();
    let occurrenceIndex = 1;

    while (true) {
      const nextDate = getRecurringOccurrenceDate(
        parent.date,
        parent.recurrence_rule,
        occurrenceIndex
      );

      if (nextDate > today) {
        break;
      }

      if (!existingDates.has(nextDate)) {
        transactionsToInsert.push(buildRecurringChild(parent, nextDate));
        existingDates.add(nextDate);
      }

      occurrenceIndex += 1;
    }
  });

  if (transactionsToInsert.length === 0) {
    return 0;
  }

  const { error: insertError } = await supabase
    .from('transactions')
    .insert(transactionsToInsert);

  if (insertError) {
    throw insertError;
  }

  return transactionsToInsert.length;
}
