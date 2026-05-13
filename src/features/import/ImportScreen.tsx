import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useCategoryData } from '@/features/categories/useCategoryData';
import {
  BANK_LABELS,
  parseCSV,
  type BankId,
  type ParsedTransaction,
} from '@/features/import/csvParsers';
import { checkDuplicates } from '@/features/import/deduplication';
import {
  useImportData,
  type ImportTransactionInput,
} from '@/features/import/useImportData';
import { useAuth } from '@/contexts/AuthContext';
import { getCategorySuggestion } from '@/hooks/useCategorySuggestion';
import { supabase } from '@/lib/supabase';
import { formatCents } from '@/lib/utils';
import { useCategoryStore } from '@/store/categoryStore';
import type { Category, Transaction } from '@/types';

type ImportStep = 'upload' | 'review' | 'confirm';

interface ReviewItem {
  id: string;
  parsed: ParsedTransaction;
  isDuplicate: boolean;
  matchedTransactionId: string | null;
  include: boolean;
  categoryId: string | null;
}

function formatImportDate(dateValue: string) {
  const [year, month, day] = dateValue.split('-');
  return `${day}/${month}/${year}`;
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }

      reject(new Error('Não foi possível ler o ficheiro CSV.'));
    };

    reader.onerror = () => {
      reject(reader.error ?? new Error('Não foi possível ler o ficheiro CSV.'));
    };

    reader.readAsText(file, 'utf-8');
  });
}

function buildReviewItems(
  parsedTransactions: ParsedTransaction[],
  existingTransactions: Transaction[],
  categories: Category[]
): ReviewItem[] {
  const categoryIds = new Set(categories.map((category) => category.id));

  return checkDuplicates(parsedTransactions, existingTransactions).map((result, index) => {
    const suggestion = getCategorySuggestion(
      result.parsed.description,
      result.parsed.type,
      existingTransactions
    );
    const categoryId =
      suggestion && categoryIds.has(suggestion.categoryId) ? suggestion.categoryId : null;

    return {
      id: `${result.parsed.date}-${result.parsed.amount_cents}-${index}`,
      parsed: result.parsed,
      isDuplicate: result.isDuplicate,
      matchedTransactionId: result.matchedTransactionId,
      include: !result.isDuplicate,
      categoryId,
    };
  });
}

export function ImportScreen() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const categories = useCategoryStore((state) => state.categories);
  const isLoadingCategories = useCategoryStore((state) => state.isLoading);
  const { error: categoryError } = useCategoryData(user?.id);
  const { importTransactions, isImporting, error: importError } = useImportData(user?.id);

  const [step, setStep] = useState<ImportStep>('upload');
  const [bank, setBank] = useState<BankId>('cgd');
  const [file, setFile] = useState<File | null>(null);
  const [filename, setFilename] = useState('');
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [existingTransactions, setExistingTransactions] = useState<Transaction[]>([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    if (!user?.id) {
      setExistingTransactions([]);
      setReferenceError(null);
      setIsLoadingTransactions(false);
      return;
    }

    const loadTransactions = async () => {
      setIsLoadingTransactions(true);
      setReferenceError(null);

      try {
        const { data, error } = await supabase
          .from('transactions')
          .select('*')
          .eq('user_id', user.id)
          .order('date', { ascending: false });

        if (error) {
          throw error;
        }

        if (!isActive) {
          return;
        }

        setExistingTransactions((data ?? []) as Transaction[]);
      } catch (loadError) {
        console.error('Erro ao carregar transações para importação:', loadError);

        if (!isActive) {
          return;
        }

        setReferenceError('Não foi possível preparar a revisão do extrato.');
      } finally {
        if (isActive) {
          setIsLoadingTransactions(false);
        }
      }
    };

    void loadTransactions();

    return () => {
      isActive = false;
    };
  }, [user?.id]);

  const selectedCount = useMemo(
    () => reviewItems.filter((item) => item.include).length,
    [reviewItems]
  );
  const selectedMissingCategoryCount = useMemo(
    () => reviewItems.filter((item) => item.include && !item.categoryId).length,
    [reviewItems]
  );
  const allSelected = reviewItems.length > 0 && reviewItems.every((item) => item.include);
  const readyToAnalyze =
    Boolean(file) && Boolean(user) && !isLoadingCategories && !isLoadingTransactions;

  const handleAnalyzeFile = async () => {
    if (!file) {
      setAnalyzeError('Selecione um ficheiro CSV para continuar.');
      return;
    }

    setAnalyzeError(null);
    setSuccessMessage(null);

    try {
      const csvText = await readFileAsText(file);
      const parsedTransactions = parseCSV(bank, csvText);

      if (parsedTransactions.length === 0) {
        throw new Error('O ficheiro não contém transações importáveis.');
      }

      setReviewItems(buildReviewItems(parsedTransactions, existingTransactions, categories));
      setFilename(file.name);
      setStep('review');
    } catch (error) {
      console.error('Erro ao analisar extrato:', error);
      setAnalyzeError(
        error instanceof Error ? error.message : 'Não foi possível analisar o ficheiro.'
      );
    }
  };

  const handleToggleAll = () => {
    setReviewItems((currentItems) =>
      currentItems.map((item) => ({
        ...item,
        include: !allSelected,
      }))
    );
  };

  const handleCategoryChange = (itemId: string, categoryId: string) => {
    setReviewItems((currentItems) =>
      currentItems.map((item) =>
        item.id === itemId
          ? {
              ...item,
              categoryId: categoryId || null,
            }
          : item
      )
    );
  };

  const handleIncludeChange = (itemId: string, include: boolean) => {
    setReviewItems((currentItems) =>
      currentItems.map((item) => (item.id === itemId ? { ...item, include } : item))
    );
  };

  const handleConfirmImport = async () => {
    if (!user) {
      return;
    }

    const transactionsToImport: ImportTransactionInput[] = reviewItems
      .filter((item): item is ReviewItem & { categoryId: string } => item.include && Boolean(item.categoryId))
      .map((item) => ({
        ...item.parsed,
        category_id: item.categoryId,
      }));

    if (transactionsToImport.length === 0) {
      setAnalyzeError('Selecione pelo menos uma transação com categoria atribuída.');
      setStep('review');
      return;
    }

    try {
      await importTransactions(bank, filename, transactionsToImport, reviewItems.length);
      setSuccessMessage(`Importadas ${transactionsToImport.length} transações com sucesso!`);
      window.setTimeout(() => {
        navigate('/transacoes');
      }, 900);
    } catch {
      // The hook already exposes a user-friendly message.
    }
  };

  return (
    <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-4 bg-[var(--color-bg-secondary)] p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text)]">
            Importar extrato bancário
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Analise o CSV, reveja duplicados e importe só o que pretende.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/definicoes')}
          className="min-h-[44px] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg-hover)]"
        >
          Voltar
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          { id: 'upload', label: '1. Carregar' },
          { id: 'review', label: '2. Rever' },
          { id: 'confirm', label: '3. Confirmar' },
        ].map((item, index) => {
          const isActive = step === item.id;
          const isCompleted = ['upload', 'review', 'confirm'].indexOf(step) > index;

          return (
            <div
              key={item.id}
              className={`min-h-[44px] rounded-full px-4 py-2 text-sm font-medium ${
                isActive
                  ? 'bg-[var(--color-accent)] text-[var(--color-text-inverse)]'
                  : isCompleted
                    ? 'bg-[var(--color-accent-light)] text-[var(--color-accent)]'
                    : 'bg-[var(--color-bg)] text-[var(--color-text-secondary)]'
              }`}
            >
              {item.label}
            </div>
          );
        })}
      </div>

      {(categoryError || referenceError || analyzeError || importError || successMessage) && (
        <div className="space-y-2">
          {categoryError && (
            <div className="rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-danger)]">
              {categoryError}
            </div>
          )}
          {referenceError && (
            <div className="rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-danger)]">
              {referenceError}
            </div>
          )}
          {analyzeError && (
            <div className="rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-danger)]">
              {analyzeError}
            </div>
          )}
          {importError && (
            <div className="rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-danger)]">
              {importError}
            </div>
          )}
          {successMessage && (
            <div className="rounded-[var(--radius-md)] border border-[var(--color-success)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-success)]">
              {successMessage}
            </div>
          )}
        </div>
      )}

      {step === 'upload' && (
        <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4 shadow-[var(--shadow-sm)]">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm text-[var(--color-text)]">
              <span className="font-medium">Banco</span>
              <select
                value={bank}
                onChange={(event) => setBank(event.target.value as BankId)}
                className="min-h-[44px] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 outline-none transition-colors focus:border-[var(--color-accent)]"
              >
                {(Object.keys(BANK_LABELS) as BankId[]).map((bankId) => (
                  <option key={bankId} value={bankId}>
                    {BANK_LABELS[bankId]}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2 text-sm text-[var(--color-text)]">
              <span className="font-medium">Ficheiro CSV</span>
              <input
                type="file"
                accept=".csv"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                className="min-h-[44px] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] file:mr-3 file:min-h-[36px] file:rounded-[var(--radius-sm)] file:border-0 file:bg-[var(--color-accent-light)] file:px-3 file:text-sm file:font-medium file:text-[var(--color-accent)]"
              />
            </label>
          </div>

          <div className="mt-4 flex flex-col gap-3 border-t border-[var(--color-divider)] pt-4 text-sm text-[var(--color-text-secondary)]">
            <p>
              O ficheiro será revisto antes da importação e os duplicados ficam por
              confirmar.
            </p>
            {(isLoadingCategories || isLoadingTransactions) && (
              <p>A preparar categorias e histórico de transações…</p>
            )}
            <button
              type="button"
              onClick={() => void handleAnalyzeFile()}
              disabled={!readyToAnalyze}
              className="flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-[var(--color-text-inverse)] transition-colors hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Analisar ficheiro
            </button>
          </div>
        </section>
      )}

      {step === 'review' && (
        <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4 shadow-[var(--shadow-sm)]">
          <div className="flex flex-col gap-3 border-b border-[var(--color-divider)] pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[var(--color-text)]">
                Revisão de {filename} — {reviewItems.length} transações
              </h2>
              <p className="text-sm text-[var(--color-text-secondary)]">
                {selectedCount} de {reviewItems.length} transações selecionadas
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleToggleAll}
                className="min-h-[44px] rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg-hover)]"
              >
                {allSelected ? 'Desselecionar todos' : 'Selecionar todos'}
              </button>
              <button
                type="button"
                onClick={() => setStep('confirm')}
                disabled={selectedCount === 0 || selectedMissingCategoryCount > 0}
                className="min-h-[44px] rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-text-inverse)] transition-colors hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Continuar
              </button>
            </div>
          </div>

          {selectedMissingCategoryCount > 0 && (
            <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--color-warning)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-warning)]">
              Atribua uma categoria às {selectedMissingCategoryCount} transações selecionadas sem sugestão.
            </div>
          )}

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[860px] table-auto border-separate border-spacing-0 text-left text-sm">
              <thead>
                <tr className="text-[var(--color-text-secondary)]">
                  <th className="border-b border-[var(--color-divider)] px-3 py-2 font-medium">Data</th>
                  <th className="border-b border-[var(--color-divider)] px-3 py-2 font-medium">Descrição</th>
                  <th className="border-b border-[var(--color-divider)] px-3 py-2 font-medium">Montante</th>
                  <th className="border-b border-[var(--color-divider)] px-3 py-2 font-medium">Tipo</th>
                  <th className="border-b border-[var(--color-divider)] px-3 py-2 font-medium">Categoria</th>
                  <th className="border-b border-[var(--color-divider)] px-3 py-2 font-medium">Duplicado</th>
                  <th className="border-b border-[var(--color-divider)] px-3 py-2 font-medium">Incluir</th>
                </tr>
              </thead>
              <tbody>
                {reviewItems.map((item) => {
                  const categoryOptions = categories.filter(
                    (category) => category.type === item.parsed.type
                  );

                  return (
                    <tr key={item.id} className="align-top text-[var(--color-text)]">
                      <td className="border-b border-[var(--color-divider)] px-3 py-3">
                        {formatImportDate(item.parsed.date)}
                      </td>
                      <td className="max-w-[280px] border-b border-[var(--color-divider)] px-3 py-3">
                        <span className="block whitespace-normal break-words">
                          {item.parsed.description}
                        </span>
                      </td>
                      <td
                        className={`border-b border-[var(--color-divider)] px-3 py-3 font-medium ${
                          item.parsed.type === 'expense'
                            ? 'text-[var(--color-danger)]'
                            : 'text-[var(--color-success)]'
                        }`}
                      >
                        {formatCents(item.parsed.amount_cents)}
                      </td>
                      <td className="border-b border-[var(--color-divider)] px-3 py-3">
                        {item.parsed.type === 'expense' ? 'Despesa' : 'Receita'}
                      </td>
                      <td className="border-b border-[var(--color-divider)] px-3 py-3">
                        <select
                          value={item.categoryId ?? ''}
                          onChange={(event) => handleCategoryChange(item.id, event.target.value)}
                          className="min-h-[44px] w-full min-w-[180px] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 outline-none transition-colors focus:border-[var(--color-accent)]"
                        >
                          <option value="">—</option>
                          {categoryOptions.map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.emoji} {category.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="border-b border-[var(--color-divider)] px-3 py-3">
                        {item.isDuplicate ? (
                          <span className="inline-flex rounded-full bg-[var(--color-bg-secondary)] px-2.5 py-1 text-xs font-medium text-[var(--color-warning)]">
                            ⚠️ Possível duplicado
                          </span>
                        ) : (
                          <span className="text-[var(--color-text-tertiary)]">—</span>
                        )}
                      </td>
                      <td className="border-b border-[var(--color-divider)] px-3 py-3">
                        <label className="flex min-h-[44px] items-center justify-center">
                          <input
                            type="checkbox"
                            checked={item.include}
                            onChange={(event) =>
                              handleIncludeChange(item.id, event.target.checked)
                            }
                            className="h-5 w-5 rounded border-[var(--color-border)] text-[var(--color-accent)]"
                          />
                        </label>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {step === 'confirm' && (
        <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4 shadow-[var(--shadow-sm)]">
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-[var(--color-text)]">
              Confirmar importação
            </h2>
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 text-sm text-[var(--color-text)]">
              <p>
                <span className="font-medium">Banco:</span> {BANK_LABELS[bank]}
              </p>
              <p>
                <span className="font-medium">Ficheiro:</span> {filename}
              </p>
              <p>
                <span className="font-medium">Importar:</span> {selectedCount} transações
              </p>
              <p>
                <span className="font-medium">Ignoradas:</span> {reviewItems.length - selectedCount}
              </p>
            </div>
            <p className="text-sm text-[var(--color-text-secondary)]">
              As transações selecionadas serão ligadas a uma sessão de importação para
              poder anular mais tarde, desde que não sejam editadas manualmente.
            </p>
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setStep('review')}
              className="min-h-[44px] rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg-hover)]"
            >
              Voltar à revisão
            </button>
            <button
              type="button"
              onClick={() => void handleConfirmImport()}
              disabled={isImporting || selectedCount === 0 || selectedMissingCategoryCount > 0}
              className="min-h-[44px] rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-text-inverse)] transition-colors hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isImporting ? 'A importar…' : `Importar ${selectedCount} transações`}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
export default ImportScreen;
