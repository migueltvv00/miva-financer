import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

type AuthMode = 'login' | 'signup';

export function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (mode === 'signup') {
        await signUp(email, password);
        setSignupSuccess(true);
      } else {
        await signIn(email, password);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Ocorreu um erro inesperado.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (signupSuccess) {
    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-[var(--radius-lg)] bg-[var(--color-bg)] p-8 shadow-[var(--shadow-md)]">
          <div className="text-center">
            <span className="text-5xl">✉️</span>
            <h2 className="mt-4 text-lg font-semibold text-[var(--color-text)]">
              Verifique o seu e-mail
            </h2>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              Enviámos um link de confirmação para <strong>{email}</strong>.
              Clique no link para ativar a sua conta.
            </p>
            <button
              onClick={() => {
                setSignupSuccess(false);
                setMode('login');
              }}
              className="mt-6 text-sm font-medium text-[var(--color-accent)] hover:text-[var(--color-accent-hover)]"
            >
              Voltar ao login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-[var(--color-bg-secondary)] p-6">
      <div className="w-full max-w-sm rounded-[var(--radius-lg)] bg-[var(--color-bg)] p-8 shadow-[var(--shadow-md)]">
        <div className="mb-6 text-center">
          <span className="text-4xl">💶</span>
          <h1 className="mt-2 text-2xl font-bold text-[var(--color-text)]">
            Fluxo
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            {mode === 'login'
              ? 'Entre na sua conta'
              : 'Crie uma nova conta'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-sm font-medium text-[var(--color-text)]"
            >
              E-mail
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-accent)] min-h-[44px]"
              placeholder="email@exemplo.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-sm font-medium text-[var(--color-text)]"
            >
              Palavra-passe
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-accent)] min-h-[44px]"
              placeholder="Mínimo 6 caracteres"
            />
          </div>

          {error && (
            <p className="rounded-[var(--radius-sm)] bg-red-50 p-2 text-sm text-[var(--color-danger)]">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-[var(--color-text-inverse)] transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
          >
            {isSubmitting
              ? 'A processar…'
              : mode === 'login'
                ? 'Entrar'
                : 'Criar conta'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button
            onClick={() => {
              setMode(mode === 'login' ? 'signup' : 'login');
              setError(null);
            }}
            className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-accent)]"
          >
            {mode === 'login'
              ? 'Não tem conta? Criar conta'
              : 'Já tem conta? Entrar'}
          </button>
        </div>
      </div>
    </div>
  );
}
