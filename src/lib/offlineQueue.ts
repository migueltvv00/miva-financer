import { OFFLINE_QUEUE_KEY } from '@/lib/constants';
import { supabase } from '@/lib/supabase';
import { PAYMENT_METHOD_OPTIONS, type Transaction } from '@/types';

function isTransaction(value: unknown): value is Transaction {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const transaction = value as Partial<Transaction>;
  const hasValidPaymentMethod =
    transaction.payment_method === undefined ||
    transaction.payment_method === null ||
    PAYMENT_METHOD_OPTIONS.some((option) => option.value === transaction.payment_method);

  return (
    typeof transaction.id === 'string' &&
    typeof transaction.user_id === 'string' &&
    typeof transaction.amount_cents === 'number' &&
    (transaction.type === 'expense' || transaction.type === 'income') &&
    typeof transaction.category_id === 'string' &&
    typeof transaction.date === 'string' &&
    hasValidPaymentMethod
  );
}

function readQueue() {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const rawQueue = window.localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!rawQueue) {
      return [];
    }

    const parsedQueue = JSON.parse(rawQueue);
    if (!Array.isArray(parsedQueue)) {
      return [];
    }

    return parsedQueue.filter(isTransaction).map((transaction) => ({
      ...transaction,
      payment_method: transaction.payment_method ?? null,
    }));
  } catch (error) {
    console.error('Erro ao ler a fila offline:', error);
    return [];
  }
}

function writeQueue(queue: Transaction[]) {
  if (typeof window === 'undefined') {
    return;
  }

  if (queue.length === 0) {
    window.localStorage.removeItem(OFFLINE_QUEUE_KEY);
    return;
  }

  window.localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

export function getQueue() {
  return readQueue();
}

export function addToQueue(transaction: Transaction) {
  const queue = readQueue();
  writeQueue([...queue, transaction]);
}

export function clearQueue() {
  writeQueue([]);
}

export async function flushQueue() {
  const queue = readQueue();
  if (queue.length === 0) {
    return [];
  }

  const failedTransactions: Transaction[] = [];

  for (const transaction of queue) {
    const { error } = await supabase.from('transactions').insert(transaction);

    if (!error) {
      continue;
    }

    if (error.code === '23505') {
      continue;
    }

    console.error('Erro ao sincronizar transação offline:', error);
    failedTransactions.push(transaction);
  }

  writeQueue(failedTransactions);
  return failedTransactions;
}
