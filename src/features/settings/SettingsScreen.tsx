import { useState } from 'react';
import { useNavigate } from 'react-router';
import { BudgetScreen } from '@/features/budgets/BudgetScreen';
import { CategoryList } from '@/features/categories/CategoryList';
import { useCategoryData } from '@/features/categories/useCategoryData';
import {
  useImportData,
  type ImportSessionSummary,
} from '@/features/import/useImportData';
import { IncomeSourceList } from '@/features/income-sources/IncomeSourceList';
import { InstalmentList } from '@/features/instalments/InstalmentList';
import { PlanningScreen } from '@/features/planning/PlanningScreen';
import { PayslipImport } from '@/features/settings/PayslipImport';
import { TelegramSettings } from '@/features/settings/TelegramSettings';
import { useAuth } from '@/hooks/useAuth';

function formatImportSessionDate(dateValue: string) {
  return new Intl.DateTimeFormat('pt-PT', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(dateValue));
}

export function SettingsScreen() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { error: categoryError } = useCategoryData(user?.id);
  const {
    sessions,
    isLoading: isLoadingImports,
    undoingSessionId,
    error: importError,
    undoImport,
  } = useImportData(user?.id);
  const [importFeedback, setImportFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };

  const handleUndoImport = async (session: ImportSessionSummary) => {
    if (!session.canUndo) {
      return;
    }

    const confirmed = window.confirm(
      `Tem a certeza de que quer anular a importação de ${session.filename}?`
    );

    if (!confirmed) {
      return;
    }

    setImportFeedback(null);

    try {
      await undoImport(session.id);
      setImportFeedback({
        type: 'success',
        message: 'Importação anulada com sucesso.',
      });
    } catch {
      setImportFeedback({
        type: 'error',
        message: 'Não foi possível anular a importação.',
      });
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

        <CategoryList userId={user?.id} loadError={categoryError} />
        <IncomeSourceList userId={user?.id} />
        <InstalmentList userId={user?.id} />
        <PlanningScreen userId={user?.id} />
        <BudgetScreen userId={user?.id} categoryError={categoryError} />

        <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
          <div className="flex flex-col gap-3 border-b border-[var(--color-divider)] pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-[var(--color-text)]">
                Importações
              </h3>
              <p className="text-sm text-[var(--color-text-secondary)]">
                Importe extratos em CSV e acompanhe o histórico.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/importar')}
              className="flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-[var(--color-text-inverse)] transition-colors hover:bg-[var(--color-accent-hover)]"
            >
              Importar extrato bancário
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {importError && (
              <div className="rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-danger)]">
                {importError}
              </div>
            )}

            {importFeedback && (
              <div
                className={`rounded-[var(--radius-md)] border px-3 py-2 text-sm ${
                  importFeedback.type === 'success'
                    ? 'border-[var(--color-success)] bg-[var(--color-bg-secondary)] text-[var(--color-success)]'
                    : 'border-[var(--color-danger)] bg-[var(--color-bg-secondary)] text-[var(--color-danger)]'
                }`}
              >
                {importFeedback.message}
              </div>
            )}

            {isLoadingImports ? (
              <p className="text-sm text-[var(--color-text-secondary)]">
                A carregar importações…
              </p>
            ) : sessions.length === 0 ? (
              <p className="text-sm text-[var(--color-text-secondary)]">
                Ainda não existem importações registadas.
              </p>
            ) : (
              <div className="flex flex-col divide-y divide-[var(--color-divider)]">
                {sessions.map((session) => {
                  const isUndoing = undoingSessionId === session.id;
                  const isDisabled = !session.canUndo || isUndoing;

                  return (
                    <div
                      key={session.id}
                      className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="text-sm font-medium text-[var(--color-text)]">
                          {session.bank}
                        </p>
                        <p className="text-sm text-[var(--color-text-secondary)]">
                          {session.filename}
                        </p>
                        <p className="text-xs text-[var(--color-text-tertiary)]">
                          {session.imported_count} transações · {formatImportSessionDate(session.created_at)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleUndoImport(session)}
                        disabled={isDisabled}
                        title={
                          session.canUndo
                            ? 'Anular importação'
                            : 'Algumas transações foram editadas'
                        }
                        className="min-h-[44px] rounded-[var(--radius-md)] border border-[var(--color-danger)] px-4 py-2 text-sm font-medium text-[var(--color-danger)] transition-colors hover:bg-[var(--color-bg-hover)] disabled:cursor-not-allowed disabled:border-[var(--color-border)] disabled:text-[var(--color-text-tertiary)]"
                      >
                        {isUndoing ? 'A anular…' : 'Anular importação'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <div className="border-t border-[var(--color-divider)] pt-2">
          <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-[var(--color-text-secondary)]">
            Recibos de vencimento
          </h3>
        </div>

        <PayslipImport userId={user?.id} />

        <div className="border-t border-[var(--color-divider)] pt-2">
          <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-[var(--color-text-secondary)]">
            Integrações
          </h3>
        </div>

        <TelegramSettings userId={user?.id} />

        <button
          onClick={handleSignOut}
          className="flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-danger)] px-4 py-2.5 text-sm font-medium text-[var(--color-danger)] transition-colors hover:bg-[var(--color-bg)]"
        >
          Terminar sessão
        </button>
      </div>
    </div>
  );
}
