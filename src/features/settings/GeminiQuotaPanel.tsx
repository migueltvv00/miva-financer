import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { supabase } from '@/lib/supabase';

interface QuotaData {
  today: { date: string; requests: number; tokens_in: number; tokens_out: number };
  last7days: Array<{ date: string; requests: number; tokens: number }>;
  limits: { model: { name: string; rpm: number; rpd: number; tpm: number } };
}

interface GeminiQuotaPanelProps {
  userId: string | null | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getErrorMessage(value: unknown, fallback: string) {
  if (isRecord(value) && typeof value.error === 'string') {
    return value.error;
  }

  if (typeof value === 'string' && value) {
    return value;
  }

  return fallback;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('pt-PT').format(value);
}

function formatWeekdayLabel(dateValue: string) {
  const weekday = new Date(`${dateValue}T12:00:00`).toLocaleDateString('pt-PT', {
    weekday: 'short',
  });

  const normalizedWeekday = weekday.replace('.', '').slice(0, 3);
  return normalizedWeekday.charAt(0).toUpperCase() + normalizedWeekday.slice(1);
}

function formatChartDate(dateValue: string) {
  return new Date(`${dateValue}T12:00:00`).toLocaleDateString('pt-PT', {
    day: '2-digit',
    month: '2-digit',
  });
}

export function GeminiQuotaPanel({ userId }: GeminiQuotaPanelProps) {
  const [quotaData, setQuotaData] = useState<QuotaData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadQuota = useCallback(async () => {
    if (!userId) {
      setQuotaData(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error('Sessão indisponível. Tente novamente.');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gemini-quota`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      const rawBody = await response.text();
      let payload: unknown = null;

      if (rawBody) {
        try {
          payload = JSON.parse(rawBody) as unknown;
        } catch {
          payload = rawBody;
        }
      }

      if (!response.ok) {
        throw new Error(getErrorMessage(payload, 'Não foi possível carregar o uso do Gemini.'));
      }

      setQuotaData(payload as QuotaData);
    } catch (fetchError) {
      console.error('Erro ao carregar quota do Gemini:', fetchError);
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : 'Não foi possível carregar o uso do Gemini.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadQuota();
  }, [loadQuota]);

  const todayTokens = quotaData
    ? quotaData.today.tokens_in + quotaData.today.tokens_out
    : 0;
  const dailyLimit = quotaData?.limits.model.rpd ?? 500;
  const requestProgress = quotaData
    ? Math.min((quotaData.today.requests / dailyLimit) * 100, 100)
    : 0;

  const warningState = useMemo(() => {
    if (!quotaData) {
      return null;
    }

    if (quotaData.today.requests >= dailyLimit) {
      return {
        message: '🚫 Limite diário atingido',
        color: 'var(--color-danger)',
      };
    }

    if (quotaData.today.requests >= 450) {
      return {
        message: '⚠️ Próximo do limite diário',
        color: 'var(--color-warning)',
      };
    }

    return null;
  }, [dailyLimit, quotaData]);

  const chartData = useMemo(
    () =>
      quotaData
        ? [...quotaData.last7days].reverse().map((item) => ({
            ...item,
            weekday: formatWeekdayLabel(item.date),
            fullDate: formatChartDate(item.date),
          }))
        : [],
    [quotaData]
  );

  if (!userId) {
    return null;
  }

  return (
    <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-[var(--color-text)]">Uso Gemini</h3>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Acompanhe o consumo diário e a última semana.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            void loadQuota();
          }}
          disabled={isLoading}
          className="flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-2.5 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg-secondary)] disabled:cursor-not-allowed disabled:text-[var(--color-text-tertiary)]"
        >
          {isLoading ? 'A actualizar…' : 'Actualizar'}
        </button>
      </div>

      {isLoading && !quotaData ? (
        <div className="mt-4 space-y-3">
          <div className="h-4 w-2/3 animate-pulse rounded bg-[var(--color-bg-tertiary)]" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-[var(--color-bg-tertiary)]" />
          <div className="h-[120px] animate-pulse rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)]" />
        </div>
      ) : error ? (
        <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-danger)]">
          {error}
        </div>
      ) : quotaData ? (
        <div className="mt-4 space-y-4">
          <div className="space-y-1 text-sm">
            <p className="text-[var(--color-text)]">
              <span className="font-medium">Hoje:</span> {formatNumber(quotaData.today.requests)} pedidos /{' '}
              {formatNumber(todayTokens)} tokens
            </p>
            <p className="text-[var(--color-text-secondary)]">
              Limite diário: {formatNumber(dailyLimit)} pedidos ({quotaData.limits.model.name})
            </p>
          </div>

          {warningState && (
            <div
              className="rounded-[var(--radius-md)] border bg-[var(--color-bg-secondary)] p-3"
              style={{ borderColor: warningState.color }}
            >
              <div className="flex items-center justify-between gap-3 text-sm">
                <span style={{ color: warningState.color }}>{warningState.message}</span>
                <span className="text-[var(--color-text-secondary)]">
                  {formatNumber(quotaData.today.requests)}/{formatNumber(dailyLimit)}
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--color-bg-tertiary)]">
                <div
                  className="h-full rounded-full transition-[width] duration-300"
                  style={{
                    width: `${requestProgress}%`,
                    backgroundColor: warningState.color,
                  }}
                />
              </div>
            </div>
          )}

          {chartData.length === 0 ? (
            <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-6 text-sm text-[var(--color-text-secondary)]">
              Sem pedidos registados nos últimos 7 dias.
            </div>
          ) : (
            <div>
              <div className="h-[120px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
                  >
                    <XAxis
                      dataKey="weekday"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: 'var(--color-text-secondary)' }}
                    />
                    <YAxis
                      allowDecimals={false}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: 'var(--color-text-secondary)' }}
                      width={28}
                    />
                    <Tooltip
                      formatter={(value: number | string) => [
                        `${formatNumber(Number(value))} pedidos`,
                        'Pedidos',
                      ]}
                      labelFormatter={(_label, payload) =>
                        String(
                          (payload?.[0]?.payload as { fullDate?: string } | undefined)?.fullDate ??
                            ''
                        )
                      }
                      contentStyle={{
                        borderColor: 'var(--color-border)',
                        borderRadius: '8px',
                        backgroundColor: 'var(--color-bg)',
                        color: 'var(--color-text)',
                      }}
                    />
                    <Bar
                      dataKey="requests"
                      fill="var(--color-accent)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 text-xs text-[var(--color-text-secondary)]">Últimos 7 dias</p>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
