import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { seedDefaultCategories } from '@/lib/seedCategories';

interface AuthState {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

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

    // Safety timeout — if auth doesn't resolve, unblock the app
    const timeout = window.setTimeout(() => {
      if (!resolvedRef.current && !cancelled) {
        console.warn('[AuthProvider] Auth resolution timed out — forcing isLoading=false');
        setState((prev) => (prev.isLoading ? { ...prev, isLoading: false } : prev));
      }
    }, AUTH_LOADING_TIMEOUT_MS);

    async function initSession() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled || resolvedRef.current) return;

        if (session) {
          const { data: { session: refreshed }, error } =
            await supabase.auth.refreshSession();
          if (cancelled || resolvedRef.current) return;

          if (error || !refreshed) {
            console.warn('Sessão expirada, será necessário autenticar novamente.');
            setAuthState(null);
          } else {
            setAuthState(refreshed);
          }
        } else {
          setAuthState(null);
        }
      } catch {
        if (!resolvedRef.current) setAuthState(null);
      }
    }

    void initSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
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

        if (event === 'SIGNED_IN' && session?.user) {
          if (seededRef.current !== session.user.id) {
            seededRef.current = session.user.id;
            await seedDefaultCategories(session.user.id);
          }
        }
      }
    );

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  // Refresh session when tab becomes visible again
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        void supabase.auth.getSession();
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
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  // Memoize context value to prevent unnecessary consumer re-renders
  const value = useMemo<AuthContextValue>(
    () => ({ ...state, signUp, signIn, signOut }),
    [state, signUp, signIn, signOut]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
