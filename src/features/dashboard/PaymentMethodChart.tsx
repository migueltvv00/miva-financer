import { useMemo } from 'react';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCents } from '@/lib/utils';
import { PAYMENT_METHOD_OPTIONS } from '@/types';
import type { PaymentMethod, Transaction } from '@/types';

interface PaymentMethodChartProps {
  transactions: Transaction[];
}

const PAYMENT_COLORS: Record<PaymentMethod, string> = {
  cartao_refeicao: '#0F7B6C',
  multibanco: '#2563EB',
  mbway: '#7C3AED',
  numerario: '#D97706',
  credito: '#E03E3E',
  debito: '#6B7280',
};

const methodLabelMap = new Map(
  PAYMENT_METHOD_OPTIONS.map((opt) => [opt.value, { label: opt.label, emoji: opt.emoji }])
);

export function PaymentMethodChart({ transactions }: PaymentMethodChartProps) {
  const chartData = useMemo(() => {
    const totals = new Map<PaymentMethod, number>();

    for (const tx of transactions) {
      if (tx.type !== 'expense' || !tx.payment_method) continue;
      totals.set(tx.payment_method, (totals.get(tx.payment_method) ?? 0) + tx.amount_cents);
    }

    return Array.from(totals.entries())
      .map(([method, cents]) => ({
        method,
        label: methodLabelMap.get(method)?.label ?? method,
        emoji: methodLabelMap.get(method)?.emoji ?? '💳',
        cents,
        color: PAYMENT_COLORS[method],
      }))
      .sort((a, b) => b.cents - a.cents);
  }, [transactions]);

  if (chartData.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-[var(--color-text-tertiary)]">
        Sem despesas com método de pagamento atribuído.
      </p>
    );
  }

  const totalExpenseCents = chartData.reduce((sum, d) => sum + d.cents, 0);

  return (
    <div className="space-y-3">
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 8 }}>
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="label"
              width={80}
              tick={{ fontSize: 12, fill: 'var(--color-text-secondary)' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              formatter={(value: number) => formatCents(value)}
              labelFormatter={(label: string) => label}
              contentStyle={{ borderRadius: 8, border: '1px solid var(--color-border)' }}
            />
            <Bar dataKey="cents" radius={[0, 4, 4, 0]} maxBarSize={24}>
              {chartData.map((entry) => (
                <Cell key={entry.method} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <ul className="space-y-1.5">
        {chartData.map((item) => {
          const pct = totalExpenseCents > 0 ? (item.cents / totalExpenseCents) * 100 : 0;
          return (
            <li key={item.method} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-[var(--color-text)]">{item.emoji} {item.label}</span>
              </span>
              <span className="text-[var(--color-text-secondary)]">
                {formatCents(item.cents)} ({pct.toFixed(0)}%)
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
