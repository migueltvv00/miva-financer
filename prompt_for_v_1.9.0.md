<project_overview>
This is v1.9 of Fluxo. One critical fix:

SESSION LOSS ON NAVIGATION — ROOT CAUSE & FIX

The user is "logged out" every time they navigate between screens.
The screen shows panels in an unauthenticated state (empty, showing
"Inicie sessão" messages) even though the user is logged in.

ROOT CAUSE:
`useAuth()` is a custom hook that creates its OWN independent
`useState` + `useEffect` + `onAuthStateChange` subscription every
time it is called. It is called in 13 different components:
  - App.tsx (ProtectedRoute, PublicRoute)
  - DashboardScreen, TransactionListScreen, EntryScreen
  - GoalsScreen, InvestmentScreen, NetWorthScreen
  - TrendsScreen, ImportScreen, SettingsScreen, AuthScreen

When a screen mounts (on navigation), its `useAuth()` starts with:
  `{ user: null, session: null, isLoading: true }`
It then runs `initSession()` which calls `getSession()` + `refreshSession()`.
During this async window (50–200ms), the component renders with
`user === null`. Screens pass `user?.id` to data hooks → all queries
fire with `undefined` userId → show empty/unauthenticated state.

By the time `initSession()` resolves, the user sees the "not logged in"
panels. The data hooks may or may not re-fetch because their userId
dependency went `undefined → valid_id`, but some may cache the empty
result.

The "Entrar na conta" button from v1.8 never appears because
ProtectedRoute (which wraps everything) DOES eventually get a valid
user (its own useAuth resolves), so the redirect to /login never
triggers. The inner screens just briefly show unauthenticated state.

FIX: Replace per-component auth state with a SINGLE shared AuthContext.

Stable from v1.0–v1.8 — do not touch unrelated features.
</project_overview>

<tech_stack>
Defined in copilot-instructions.md. No new libraries this version.
Pattern: React Context + Provider for shared singleton state.
</tech_stack>

<architecture_decisions>

--- THE FIX: AuthContext Provider ---

Step 1: Create `src/contexts/AuthContext.tsx`

```typescript
import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    isLoading: true,
  });
  const seededRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let authEventHandled = false;

    const setAuthState = (session: Session | null) => {
      if (cancelled) return;
      setState({
        user: session?.user ?? null,
        session,
        isLoading: false,
      });
    };

    async function initSession() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled || authEventHandled) return;

        if (session) {
          const { data: { session: refreshed }, error } =
            await supabase.auth.refreshSession();
          if (cancelled || authEventHandled) return;

          if (error || !refreshed) {
            console.warn('Sessão expirada.');
            setAuthState(null);
          } else {
            setAuthState(refreshed);
          }
        } else {
          setAuthState(null);
        }
      } catch {
        if (!authEventHandled) setAuthState(null);
      }
    }

    void initSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (cancelled) return;
        authEventHandled = true;

        if (event === 'TOKEN_REFRESHED' && !session) {
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
      subscription.unsubscribe();
    };
  }, []);

  // Visibility change: refresh session when tab becomes visible
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

  return (
    <AuthContext.Provider value={{ ...state, signUp, signIn, signOut }}>
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
```

Step 2: Wrap App in AuthProvider (`src/App.tsx`)

Move the `<AuthProvider>` to wrap `<BrowserRouter>` so that ALL
components share the same auth state:

```typescript
import { AuthProvider } from '@/contexts/AuthContext';

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>...</Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
```

Step 3: Delete the old `src/hooks/useAuth.ts` file.

Step 4: Update ALL imports of `useAuth` across the codebase.

Every file that currently imports from `@/hooks/useAuth` must change to:
```typescript
import { useAuth } from '@/contexts/AuthContext';
```

Affected files (13 total):
  - src/App.tsx
  - src/features/auth/AuthScreen.tsx
  - src/features/dashboard/DashboardScreen.tsx
  - src/features/goals/GoalsScreen.tsx
  - src/features/import/ImportScreen.tsx
  - src/features/investments/InvestmentScreen.tsx
  - src/features/net-worth/NetWorthScreen.tsx
  - src/features/settings/SettingsScreen.tsx
  - src/features/transactions/EntryScreen.tsx
  - src/features/transactions/TransactionListScreen.tsx
  - src/features/trends/TrendsScreen.tsx

Step 5: Remove the visibilitychange listener from App.tsx
(it was added in v1.8 but now lives inside AuthProvider).

Step 6: Clean up App.tsx ProtectedRoute.

The ProtectedRoute loading timeout (5s) from v1.8 can be kept as a
safety net, but with AuthProvider it should never trigger because the
state is shared — by the time a child screen renders, the auth state
is already resolved.

Simplify if desired, but at minimum keep the redirect logic:
```typescript
function ProtectedRoute({ children }) {
  const { user, isLoading } = useAuth(); // Now reads shared state

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
```

--- WHY THIS FIXES THE BUG ---

Before: Each screen creates its own auth state → starts null → async init.
After: AuthProvider initialises ONCE at app startup. All screens read the
same already-resolved state via `useContext`. When navigating, the new
screen's `useAuth()` immediately returns the current user (no null flash).

--- VERIFICATION ---

1. Log in to the app.
2. Navigate between every screen (Entry → Transações → Resumo → Definições → etc).
3. User should NEVER see unauthenticated/empty state.
4. The ProtectedRoute loading spinner should only appear on the very first
   app load (cold start).
5. Close the tab, wait 2+ hours, reopen → should either auto-refresh the
   session or redirect to login cleanly.

</architecture_decisions>

<implementation_order>
1. Create `src/contexts/AuthContext.tsx` with AuthProvider + useAuth.
2. Update `src/App.tsx`: wrap in AuthProvider, remove old visibilitychange effect, simplify ProtectedRoute.
3. Update all 11 importing files to use `@/contexts/AuthContext`.
4. Delete `src/hooks/useAuth.ts`.
5. Type-check: pnpm type-check.
6. Build: pnpm build.
7. Commit: fix: v1.9 — resolve session loss on navigation (AuthContext singleton)
8. Push to GitHub.
9. User deploys to Vercel.
</implementation_order>

<verification_gates>
- Type-check passes.
- Build passes.
- grep for `@/hooks/useAuth` returns zero results.
- grep for `useAuth()` shows only the definition in AuthContext and consumers.
- Every consumer imports from `@/contexts/AuthContext`.
</verification_gates>
