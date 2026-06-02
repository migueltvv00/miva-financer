import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AuthContext, type AuthContextValue, type AuthState } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { seedDefaultCategories } from '@/lib/seedCategories';
import { resetAllStores } from '@/store/resetAllStores';

// #1: Only proactively refresh if the token expires within this window
const REFRESH_THRESHOLD_SECONDS = 300; // 5 minutes

const AUTH_LOADING_TIMEOUT_MS = 8_000;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    isLoading: true,
  });
  const seededRef = useRef<string | null>(null);
  const resolvedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const setAuthState = (session: Session | null) => {
      if (cancelled) return;
      resolvedRef.current = true;
      setState({
        user: session?.user ?? null,
        session,
        isLoading: false,
      });
    };

    const timeout = window.setTimeout(() => {
      if (!resolvedRef.current && !cancelled) {
        console.warn('[AuthProvider] Auth resolution timed out — forcing isLoading=false');
        setState((prev) => (prev.isLoading ? { ...prev, isLoading: false } : prev));
      }
    }, AUTH_LOADING_TIMEOUT_MS);

    async function initSession() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (cancelled || resolvedRef.current) return;

        if (session) {
          const expiresAt = session.expires_at ?? 0;
          const nowSeconds = Date.now() / 1000;

          if (expiresAt - nowSeconds < REFRESH_THRESHOLD_SECONDS) {
            // Token is near expiry — proactively refresh
            const {
              data: { session: refreshed },
              error,
            } = await supabase.auth.refreshSession();
            if (cancelled || resolvedRef.current) return;

            if (error || !refreshed) {
              console.warn('Sessão expirada, será necessário autenticar novamente.');
              setAuthState(null);
            } else {
              setAuthState(refreshed);
            }
          } else {
            // Token is still valid — use it as-is
            setAuthState(session);
          }
        } else {
          setAuthState(null);
        }
      } catch (err) {
        console.error('[AuthProvider] Erro ao inicializar sessão:', err);
        if (!cancelled && !resolvedRef.current) setAuthState(null);
      }
    }

    void initSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (cancelled) return;

      if (event === 'TOKEN_REFRESHED' && !session) {
        console.warn('Token refresh resulted in null session — treating as signed out.');
        setAuthState(null);
        return;
      }
      if (event === 'SIGNED_OUT') {
        setAuthState(null);
        return;
      }

      setAuthState(session);

      if (event === 'SIGNED_IN' && session?.user && seededRef.current !== session.user.id) {
        seededRef.current = session.user.id;
        await seedDefaultCategories(session.user.id);
      }
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.hidden) return;
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        // #2: Update React state with fresh session; only replace if user ID changed
        setState((prev) => {
          const newUserId = session?.user?.id ?? null;
          const prevUserId = prev.user?.id ?? null;
          if (newUserId === prevUserId) return prev;
          return { user: session?.user ?? null, session, isLoading: false };
        });
      } catch (err) {
        console.error('[AuthProvider] Erro ao verificar sessão após retomar:', err);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    // #3: Clear all domain store data before signing out
    resetAllStores();
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, signUp, signIn, signOut }),
    [state, signIn, signOut, signUp]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
