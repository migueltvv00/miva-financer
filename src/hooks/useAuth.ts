import { useEffect, useState, useCallback } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { seedDefaultCategories } from '@/lib/seedCategories';

interface AuthState {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    isLoading: true,
  });

  useEffect(() => {
    let cancelled = false;

    async function initSession() {
      try {
        // getSession reads from local storage — may return an expired token
        const { data: { session } } = await supabase.auth.getSession();

        if (session) {
          // Validate the session is still usable by refreshing it
          const { data: { session: refreshed }, error } =
            await supabase.auth.refreshSession();

          if (!cancelled) {
            if (error || !refreshed) {
              // Refresh failed — token expired or revoked, clear state
              console.warn('Sessão expirada, será necessário autenticar novamente.');
              setState({ user: null, session: null, isLoading: false });
            } else {
              setState({ user: refreshed.user, session: refreshed, isLoading: false });
            }
          }
        } else {
          if (!cancelled) {
            setState({ user: null, session: null, isLoading: false });
          }
        }
      } catch {
        if (!cancelled) {
          setState({ user: null, session: null, isLoading: false });
        }
      }
    }

    void initSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (cancelled) return;
      setState({
        user: session?.user ?? null,
        session,
        isLoading: false,
      });

      if ((event === 'SIGNED_IN') && session?.user) {
        await seedDefaultCategories(session.user.id);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  return {
    ...state,
    signUp,
    signIn,
    signOut,
  };
}
