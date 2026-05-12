import { CategoryList } from '@/features/categories/CategoryList';
import { useAuth } from '@/hooks/useAuth';

export function SettingsScreen() {
  const { user, signOut } = useAuth();

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };

  return (
    <div className="flex h-full flex-col p-6">
      <h2 className="mb-6 text-xl font-semibold text-[var(--color-text)]">
        Definições
      </h2>

      <div className="flex flex-col gap-4">
        <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
          <p className="text-sm text-[var(--color-text-secondary)]">
            Sessão iniciada como
          </p>
          <p className="text-sm font-medium text-[var(--color-text)]">
            {user?.email}
          </p>
        </div>

        <CategoryList userId={user?.id} />

        <button
          onClick={handleSignOut}
          className="flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-danger)] px-4 py-2.5 text-sm font-medium text-[var(--color-danger)] transition-colors hover:bg-red-50"
        >
          Terminar sessão
        </button>
      </div>
    </div>
  );
}
