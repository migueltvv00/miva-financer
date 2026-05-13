import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { TelegramSession } from '@/types';

interface TelegramSettingsProps {
  userId: string | null | undefined;
}

type TelegramConnectionStatus = 'idle' | 'generating' | 'waiting' | 'connected';

type FeedbackState =
  | {
      type: 'success' | 'error';
      message: string;
    }
  | null;

const FEEDBACK_HIDE_DELAY_MS = 4_000;
const PIN_EXPIRATION_MS = 10 * 60 * 1_000;
const POLL_INTERVAL_MS = 5_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseTelegramSession(value: unknown): TelegramSession | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.id !== 'string' ||
    typeof value.user_id !== 'string' ||
    typeof value.telegram_chat_id !== 'number' ||
    (value.telegram_username !== null && typeof value.telegram_username !== 'string') ||
    typeof value.is_authorized !== 'boolean' ||
    typeof value.digest_enabled !== 'boolean' ||
    (value.linked_at !== null && typeof value.linked_at !== 'string') ||
    typeof value.created_at !== 'string'
  ) {
    return null;
  }

  return {
    id: value.id,
    user_id: value.user_id,
    telegram_chat_id: value.telegram_chat_id,
    telegram_username: value.telegram_username,
    is_authorized: value.is_authorized,
    digest_enabled: value.digest_enabled,
    linked_at: value.linked_at,
    created_at: value.created_at,
  };
}

function normalizeTelegramStatusResponse(value: unknown): {
  authorized: boolean;
  session: TelegramSession | null;
} {
  if (!isRecord(value)) {
    return { authorized: false, session: null };
  }

  const session = parseTelegramSession(value.session);
  const authorized =
    typeof value.authorized === 'boolean'
      ? value.authorized
      : typeof value.is_authorized === 'boolean'
        ? value.is_authorized
        : session?.is_authorized ?? false;

  return { authorized, session };
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

function formatLinkedDate(dateValue: string | null) {
  if (!dateValue) {
    return null;
  }

  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(dateValue));
}

function formatPinExpiry(dateValue: Date | null) {
  if (!dateValue) {
    return null;
  }

  return new Intl.DateTimeFormat('pt-PT', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(dateValue);
}

export function TelegramSettings({ userId }: TelegramSettingsProps) {
  const [status, setStatus] = useState<TelegramConnectionStatus>('idle');
  const [pin, setPin] = useState<string | null>(null);
  const [pinExpiresAt, setPinExpiresAt] = useState<Date | null>(null);
  const [session, setSession] = useState<TelegramSession | null>(null);
  const [digestEnabled, setDigestEnabled] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isUpdatingDigest, setIsUpdatingDigest] = useState(false);
  const pollIntervalRef = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current !== null) {
      window.clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const getAccessToken = useCallback(async () => {
    const {
      data: { session: authSession },
    } = await supabase.auth.getSession();

    if (!authSession?.access_token) {
      throw new Error('Sessão indisponível. Tente novamente.');
    }

    return authSession.access_token;
  }, []);

  const fetchTelegramStatus = useCallback(async () => {
    const accessToken = await getAccessToken();
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/telegram-status`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
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
      throw new Error(
        getErrorMessage(payload, 'Não foi possível verificar o estado do Telegram.')
      );
    }

    return normalizeTelegramStatusResponse(payload);
  }, [getAccessToken]);

  const syncTelegramStatus = useCallback(
    async (options?: { preserveWaiting?: boolean; silent?: boolean }) => {
      try {
        const result = await fetchTelegramStatus();

        if (result.authorized && result.session) {
          stopPolling();
          setSession(result.session);
          setDigestEnabled(result.session.digest_enabled);
          setStatus('connected');
          setPin(null);
          setPinExpiresAt(null);
          return true;
        }

        setSession(result.session);
        setDigestEnabled(result.session?.digest_enabled ?? false);

        if (!options?.preserveWaiting) {
          setStatus('idle');
          setPin(null);
          setPinExpiresAt(null);
        }

        return false;
      } catch (error) {
        console.error('Erro ao verificar estado do Telegram:', error);

        if (!options?.silent) {
          setFeedback({
            type: 'error',
            message: 'Não foi possível verificar o estado do Telegram.',
          });
        }

        return false;
      }
    },
    [fetchTelegramStatus, stopPolling]
  );

  const startPolling = useCallback(() => {
    stopPolling();
    pollIntervalRef.current = window.setInterval(() => {
      void syncTelegramStatus({ preserveWaiting: true, silent: true });
    }, POLL_INTERVAL_MS);
  }, [stopPolling, syncTelegramStatus]);

  useEffect(() => {
    if (!feedback) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setFeedback(null);
    }, FEEDBACK_HIDE_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [feedback]);

  useEffect(() => {
    if (!userId) {
      stopPolling();
      setStatus('idle');
      setPin(null);
      setPinExpiresAt(null);
      setSession(null);
      setDigestEnabled(false);
      return;
    }

    void syncTelegramStatus();

    return () => {
      stopPolling();
    };
  }, [stopPolling, syncTelegramStatus, userId]);

  useEffect(() => {
    if (status !== 'waiting' || !pinExpiresAt) {
      return;
    }

    const remainingMs = pinExpiresAt.getTime() - Date.now();

    if (remainingMs <= 0) {
      stopPolling();
      setStatus('idle');
      setPin(null);
      setPinExpiresAt(null);
      setFeedback({
        type: 'error',
        message: 'O PIN expirou. Gere um novo código para continuar.',
      });
      return;
    }

    const timeoutId = window.setTimeout(() => {
      stopPolling();
      setStatus('idle');
      setPin(null);
      setPinExpiresAt(null);
      setFeedback({
        type: 'error',
        message: 'O PIN expirou. Gere um novo código para continuar.',
      });
    }, remainingMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [pinExpiresAt, status, stopPolling]);

  const handleGeneratePin = async () => {
    if (!userId) {
      setFeedback({
        type: 'error',
        message: 'Sessão indisponível. Tente novamente.',
      });
      return;
    }

    setFeedback(null);
    setStatus('generating');

    try {
      console.log('[Fluxo:Telegram] generatePin start');
      // Delete any existing unused pins for this user
      await supabase.from('telegram_pins').delete().eq('user_id', userId).is('used_at', null);

      const generatedPin = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + PIN_EXPIRATION_MS);
      const { error } = await supabase.from('telegram_pins').insert({
        user_id: userId,
        pin: generatedPin,
        expires_at: expiresAt.toISOString(),
      });

      if (error) {
        console.error('[Fluxo:Telegram] generatePin error', { error });
        throw error;
      }

      console.log('[Fluxo:Telegram] generatePin success', { pin_expires_at: expiresAt.toISOString() });
      setPin(generatedPin);
      setPinExpiresAt(expiresAt);
      setStatus('waiting');

      const isConnected = await syncTelegramStatus({
        preserveWaiting: true,
        silent: true,
      });

      if (!isConnected) {
        startPolling();
      }
    } catch (error) {
      console.error('Erro ao gerar PIN do Telegram:', error);
      setStatus('idle');
      setPin(null);
      setPinExpiresAt(null);
      setFeedback({
        type: 'error',
        message: 'Não foi possível gerar o PIN. Tente novamente.',
      });
    }
  };

  const handleCancel = () => {
    stopPolling();
    setStatus('idle');
    setPin(null);
    setPinExpiresAt(null);
    setFeedback(null);
  };

  const handleDigestToggle = async () => {
    if (!userId || !session) {
      setFeedback({
        type: 'error',
        message: 'Sessão indisponível. Tente novamente.',
      });
      return;
    }

    const nextValue = !digestEnabled;
    const previousSession = session;

    setIsUpdatingDigest(true);
    setDigestEnabled(nextValue);
    setSession({
      ...session,
      digest_enabled: nextValue,
    });

    try {
      const { error } = await supabase
        .from('telegram_sessions')
        .update({ digest_enabled: nextValue })
        .eq('user_id', userId);

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error('Erro ao atualizar resumo diário:', error);
      setDigestEnabled(previousSession.digest_enabled);
      setSession(previousSession);
      setFeedback({
        type: 'error',
        message: 'Não foi possível atualizar o resumo diário.',
      });
    } finally {
      setIsUpdatingDigest(false);
    }
  };

  const handleTestBot = async () => {
    setIsTesting(true);
    setFeedback(null);

    try {
      const accessToken = await getAccessToken();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/telegram-test`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
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
        throw new Error(
          getErrorMessage(payload, 'Não foi possível enviar a mensagem de teste.')
        );
      }

      setFeedback({
        type: 'success',
        message: 'Mensagem de teste enviada. Verifica o Telegram.',
      });
    } catch (error) {
      console.error('Erro ao testar bot do Telegram:', error);
      setFeedback({
        type: 'error',
        message: 'Não foi possível enviar a mensagem de teste.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!userId) {
      setFeedback({
        type: 'error',
        message: 'Sessão indisponível. Tente novamente.',
      });
      return;
    }

    setIsDisconnecting(true);
    setFeedback(null);

    try {
      const { error } = await supabase
        .from('telegram_sessions')
        .delete()
        .eq('user_id', userId);

      if (error) {
        throw error;
      }

      stopPolling();
      setSession(null);
      setDigestEnabled(false);
      setPin(null);
      setPinExpiresAt(null);
      setStatus('idle');
      setFeedback({
        type: 'success',
        message: 'Ligação ao Telegram removida.',
      });
    } catch (error) {
      console.error('Erro ao desconectar Telegram:', error);
      setFeedback({
        type: 'error',
        message: 'Não foi possível desconectar o Telegram.',
      });
    } finally {
      setIsDisconnecting(false);
    }
  };

  const linkedDate = formatLinkedDate(session?.linked_at ?? null);
  const pinExpiryLabel = formatPinExpiry(pinExpiresAt);
  const usernameLabel = session?.telegram_username
    ? `@${session.telegram_username}`
    : 'conta sem username';

  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4 shadow-[var(--shadow-sm)]">
      <div className="flex flex-col gap-4">
        <div>
          <h3 className="text-base font-semibold text-[var(--color-text)]">
            📱 Telegram Bot
          </h3>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Envia despesas por mensagem no Telegram sem abrir a app.
          </p>
        </div>

        {feedback && (
          <div
            className={`rounded-[var(--radius-md)] border px-3 py-2 text-sm ${
              feedback.type === 'success'
                ? 'border-[var(--color-success)] bg-[var(--color-bg-secondary)] text-[var(--color-success)]'
                : 'border-[var(--color-danger)] bg-[var(--color-bg-secondary)] text-[var(--color-danger)]'
            }`}
          >
            {feedback.message}
          </div>
        )}

        {(status === 'idle' || status === 'generating') && (
          <button
            type="button"
            onClick={() => void handleGeneratePin()}
            disabled={!userId || status === 'generating'}
            className="flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-[var(--color-text-inverse)] transition-colors hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === 'generating' ? 'A gerar PIN…' : 'Conectar Telegram'}
          </button>
        )}

        {status === 'waiting' && pin && (
          <div className="rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)] p-4">
            <ol className="space-y-2 text-sm text-[var(--color-text)]">
              <li>1. Abre o Telegram e procura @fluxo_finance_bot</li>
              <li>2. Envia a mensagem: /start {pin}</li>
              <li>
                3. O PIN expira em 10 minutos
                {pinExpiryLabel ? ` (até às ${pinExpiryLabel})` : ''}.
              </li>
            </ol>

            <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-5 text-center shadow-[var(--shadow-sm)]">
              <p className="text-xs font-medium uppercase tracking-[0.24em] text-[var(--color-text-secondary)]">
                PIN
              </p>
              <p className="mt-2 font-mono text-3xl font-semibold tracking-[0.3em] text-[var(--color-text)]">
                {pin}
              </p>
            </div>

            <div className="mt-4 flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
              <span
                className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-accent)]"
                aria-hidden="true"
              />
              <span>A aguardar autorização…</span>
            </div>

            <button
              type="button"
              onClick={handleCancel}
              className="mt-4 flex min-h-[44px] w-full items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-2.5 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg)]"
            >
              Cancelar
            </button>
          </div>
        )}

        {status === 'connected' && session && (
          <div className="space-y-4 rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)] p-4">
            <div>
              <p className="text-sm font-medium text-[var(--color-text)]">
                ✅ Conectado como {usernameLabel}
              </p>
              {linkedDate && (
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                  Ligado em {linkedDate}
                </p>
              )}
            </div>

            <div className="flex min-h-[44px] items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5">
              <div>
                <p className="text-sm font-medium text-[var(--color-text)]">
                  Resumo diário às 20:00
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={digestEnabled}
                aria-label="Ativar resumo diário no Telegram"
                onClick={() => void handleDigestToggle()}
                disabled={isUpdatingDigest}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                  digestEnabled
                    ? 'bg-[var(--color-accent)]'
                    : 'bg-[var(--color-text-tertiary)]'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 rounded-full bg-white transition-transform ${
                    digestEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => void handleTestBot()}
                disabled={isTesting || isDisconnecting}
                className="flex min-h-[44px] flex-1 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-light)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isTesting ? 'A enviar…' : 'Testar bot'}
              </button>
              <button
                type="button"
                onClick={() => void handleDisconnect()}
                disabled={isDisconnecting || isTesting}
                className="flex min-h-[44px] flex-1 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-danger)] px-4 py-2.5 text-sm font-medium text-[var(--color-danger)] transition-colors hover:bg-[var(--color-bg)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isDisconnecting ? 'A desligar…' : 'Desconectar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
