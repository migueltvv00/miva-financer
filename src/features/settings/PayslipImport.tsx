import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { supabase } from '@/lib/supabase';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const FEEDBACK_HIDE_DELAY_MS = 4_000;
const HISTORY_ERROR_MESSAGE = 'Não foi possível carregar o histórico de recibos.';
const MONTH_NAMES_PT = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
] as const;

interface PayslipImportProps {
  userId: string | null | undefined;
}

type PayslipPhase = 'upload' | 'loading' | 'review' | 'confirming' | 'success';

interface FeedbackState {
  type: 'success' | 'error';
  message: string;
}

interface ExtractedPayslipData {
  payslip_import_id: string;
  month: string;
  gross_salary_cents: number;
  irs_withheld_cents: number;
  ss_withheld_cents: number;
  other_deductions_cents: number;
  net_salary_cents: number;
  meal_card_cents: number | null;
  total_gross_cents: number | null;
  employer_name: string | null;
  needsReview: boolean;
  deltaCents: number;
}

interface PayslipImportHistoryItem {
  id: string;
  month: string;
  employer_name: string | null;
  net_salary_cents: number;
  irs_withheld_cents: number;
  ss_withheld_cents: number;
  status: string;
  created_at: string;
}

interface DuplicateState {
  month: string;
}

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('pt-PT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  });
}

function formatMonthLabel(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);

  if (!match) {
    return month;
  }

  const [, year, monthNumber] = match;
  const monthIndex = Number(monthNumber) - 1;
  const monthName = MONTH_NAMES_PT[monthIndex];

  if (!monthName) {
    return month;
  }

  return `${monthName} ${year}`;
}

function formatImportedAt(dateValue: string): string {
  return new Intl.DateTimeFormat('pt-PT', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(dateValue));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getStringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getNumberField(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function getBooleanField(record: Record<string, unknown>, key: string): boolean | null {
  const value = record[key];

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    if (value === 'true') {
      return true;
    }

    if (value === 'false') {
      return false;
    }
  }

  return null;
}

function getRecordCandidates(payload: unknown): Record<string, unknown>[] {
  if (!isRecord(payload)) {
    return [];
  }

  const candidates = [
    payload,
    payload.data,
    payload.result,
    payload.import,
    payload.payslip_import,
  ];

  return candidates.filter(isRecord);
}

function getErrorMessage(value: unknown, fallback: string): string {
  if (isRecord(value)) {
    if (typeof value.error === 'string' && value.error.trim()) {
      const detail = typeof value.detail === 'string' ? value.detail.trim() : '';
      const status = typeof value.geminiStatus === 'number' ? value.geminiStatus : null;

      if (detail && status) {
        return `${value.error} (${status}): ${detail}`;
      }

      if (detail) {
        return `${value.error}: ${detail}`;
      }

      return value.error;
    }
  }

  if (typeof value === 'string' && value.trim()) {
    return value;
  }

  return fallback;
}

async function parseResponse(response: Response): Promise<unknown> {
  const rawBody = await response.text();

  if (!rawBody) {
    return null;
  }

  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    return rawBody;
  }
}

function normalizeExtractedData(payload: unknown): ExtractedPayslipData | null {
  const candidates = getRecordCandidates(payload);

  for (const candidate of candidates) {
    const payslipImportId =
      getStringField(candidate, 'payslip_import_id') ?? getStringField(candidate, 'id');
    const month = getStringField(candidate, 'month');
    const grossSalaryCents = getNumberField(candidate, 'gross_salary_cents');
    const irsWithheldCents = getNumberField(candidate, 'irs_withheld_cents');
    const ssWithheldCents = getNumberField(candidate, 'ss_withheld_cents');
    const otherDeductionsCents = getNumberField(candidate, 'other_deductions_cents') ?? 0;
    const netSalaryCents = getNumberField(candidate, 'net_salary_cents');
    const mealCardCents = getNumberField(candidate, 'meal_card_cents');
    const totalGrossCents = getNumberField(candidate, 'total_gross_cents');

    if (
      !payslipImportId ||
      !month ||
      grossSalaryCents === null ||
      irsWithheldCents === null ||
      ssWithheldCents === null ||
      netSalaryCents === null
    ) {
      continue;
    }

    const deltaCents =
      getNumberField(candidate, 'delta_cents') ??
      getNumberField(candidate, 'delta_cents_abs') ??
      grossSalaryCents -
        irsWithheldCents -
        ssWithheldCents -
        otherDeductionsCents -
        netSalaryCents;

    return {
      payslip_import_id: payslipImportId,
      month,
      gross_salary_cents: grossSalaryCents,
      irs_withheld_cents: irsWithheldCents,
      ss_withheld_cents: ssWithheldCents,
      other_deductions_cents: otherDeductionsCents,
      net_salary_cents: netSalaryCents,
      meal_card_cents: mealCardCents,
      total_gross_cents: totalGrossCents,
      employer_name: getStringField(candidate, 'employer_name'),
      needsReview:
        getBooleanField(candidate, 'needsReview') ??
        getBooleanField(candidate, 'needs_review') ??
        deltaCents !== 0,
      deltaCents,
    };
  }

  return null;
}

function normalizeHistoryItem(value: unknown): PayslipImportHistoryItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = getStringField(value, 'id');
  const month = getStringField(value, 'month');
  const netSalaryCents = getNumberField(value, 'net_salary_cents');
  const irsWithheldCents = getNumberField(value, 'irs_withheld_cents');
  const ssWithheldCents = getNumberField(value, 'ss_withheld_cents');
  const status = getStringField(value, 'status');
  const createdAt = getStringField(value, 'created_at');

  if (
    !id ||
    !month ||
    netSalaryCents === null ||
    irsWithheldCents === null ||
    ssWithheldCents === null ||
    !status ||
    !createdAt
  ) {
    return null;
  }

  return {
    id,
    month,
    employer_name: getStringField(value, 'employer_name'),
    net_salary_cents: netSalaryCents,
    irs_withheld_cents: irsWithheldCents,
    ss_withheld_cents: ssWithheldCents,
    status,
    created_at: createdAt,
  };
}

function getDuplicateMonth(payload: unknown): string | null {
  for (const candidate of getRecordCandidates(payload)) {
    const rawMonth =
      getStringField(candidate, 'month_label') ??
      getStringField(candidate, 'duplicate_month') ??
      getStringField(candidate, 'month');

    if (rawMonth) {
      return /^\d{4}-\d{2}$/.test(rawMonth) ? formatMonthLabel(rawMonth) : rawMonth;
    }
  }

  return null;
}

function getCreatedTransactionCount(payload: unknown): number | null {
  if (!isRecord(payload)) {
    return null;
  }

  if (Array.isArray(payload.transactions)) {
    return payload.transactions.length;
  }

  const candidates = getRecordCandidates(payload);
  for (const candidate of candidates) {
    const count =
      getNumberField(candidate, 'transaction_count') ??
      getNumberField(candidate, 'created_count') ??
      getNumberField(candidate, 'count');

    if (count !== null) {
      return count;
    }
  }

  return null;
}

function getDefaultCreatedTransactions(data: ExtractedPayslipData): number {
  return data.other_deductions_cents > 0 ? 4 : 3;
}

export function PayslipImport({ userId }: PayslipImportProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [phase, setPhase] = useState<PayslipPhase>('upload');
  const [extractedData, setExtractedData] = useState<ExtractedPayslipData | null>(null);
  const [imports, setImports] = useState<PayslipImportHistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [duplicateState, setDuplicateState] = useState<DuplicateState | null>(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [deletingImportId, setDeletingImportId] = useState<string | null>(null);
  const [showRawPreview, setShowRawPreview] = useState(false);
  const [expandedDeductions, setExpandedDeductions] = useState<Set<string>>(new Set());

  const getAccessToken = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error('Sessão indisponível. Tente novamente.');
    }

    return session.access_token;
  }, []);

  const clearSelectedFile = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const fetchImports = useCallback(async () => {
    if (!userId) {
      setImports([]);
      return;
    }

    setIsHistoryLoading(true);

    try {
      const { data, error: fetchError } = await supabase
        .from('payslip_imports')
        .select(
          'id, month, employer_name, net_salary_cents, irs_withheld_cents, ss_withheld_cents, status, created_at'
        )
        .eq('user_id', userId)
        .order('month', { ascending: false })
        .limit(24);

      if (fetchError) {
        throw fetchError;
      }

      const normalizedImports = Array.isArray(data)
        ? data
            .map((item) => normalizeHistoryItem(item))
            .filter((item): item is PayslipImportHistoryItem => item !== null)
        : [];

      setImports(normalizedImports);
      setError((currentError) =>
        currentError === HISTORY_ERROR_MESSAGE ? null : currentError
      );
    } catch (fetchError) {
      console.error('Erro ao carregar o histórico de recibos:', fetchError);
      setError(HISTORY_ERROR_MESSAGE);
    } finally {
      setIsHistoryLoading(false);
    }
  }, [userId]);

  const uploadPayslip = useCallback(
    async (file: File, options?: { force?: boolean }) => {
      if (!userId) {
        setError('Sessão indisponível. Tente novamente.');
        return;
      }

      setError(null);
      setFeedback(null);
      setDuplicateState(null);
      setPendingFile(file);
      setPhase('loading');

      try {
        console.log('[Fluxo:Payslip] upload start', {
          file_name: file.name,
          force: options?.force ?? false,
        });

        const accessToken = await getAccessToken();
        const formData = new FormData();
        formData.append('file', file);

        if (options?.force) {
          formData.append('force', 'true');
        }

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-payslip`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
            body: formData,
          }
        );

        const payload = await parseResponse(response);

        if (response.status === 409) {
          console.log('[Fluxo:Payslip] upload error', {
            status: response.status,
            reason: 'duplicate',
          });
          setDuplicateState({
            month: getDuplicateMonth(payload) ?? 'este mês',
          });
          clearSelectedFile();
          setPhase('upload');
          return;
        }

        if (!response.ok) {
          throw new Error(getErrorMessage(payload, 'Não foi possível ler o recibo.'));
        }

        console.log('[Fluxo:Payslip] upload response', { payload });
        

        const normalizedData = normalizeExtractedData(payload);

        if (!normalizedData) {
          throw new Error('A resposta do servidor é inválida.');
        }

        console.log('[Fluxo:Payslip] upload success', {
          payslip_import_id: normalizedData.payslip_import_id,
        });
        setExtractedData(normalizedData);
        setPhase('review');

        try {
          if ('Notification' in window) {
            const storedPermission = localStorage.getItem('fluxo-push-permission');
            if (storedPermission === null) {
              const result = await Notification.requestPermission();
              localStorage.setItem('fluxo-push-permission', result);
            }
            if (Notification.permission === 'granted') {
              new Notification('Recibo processado ✅', {
                body: `Líquido: ${formatCents(normalizedData.net_salary_cents)} — revê os valores antes de confirmar.`,
                icon: '/pwa-192x192.png',
              });
            }
          }
        } catch {
          // Non-critical
        }
      } catch (uploadError) {
        console.error('Erro ao importar recibo:', uploadError);
        console.log('[Fluxo:Payslip] upload error', { uploadError });
        setError(
          uploadError instanceof Error
            ? uploadError.message
            : 'Não foi possível ler o recibo. Tente novamente.'
        );
        setPhase('upload');
      }
    },
    [clearSelectedFile, getAccessToken, userId]
  );

  useEffect(() => {
    if (!userId) {
      setPhase('upload');
      setExtractedData(null);
      setImports([]);
      setError(null);
      setFeedback(null);
      setPendingFile(null);
      setDuplicateState(null);
      clearSelectedFile();
      return;
    }

    void fetchImports();
  }, [clearSelectedFile, fetchImports, userId]);

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
    if (phase !== 'success') {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setPhase('upload');
    }, FEEDBACK_HIDE_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [phase]);

  const ytdTotals = useMemo(() => {
    const currentYear = String(new Date().getFullYear());

    return imports.reduce(
      (totals, item) => {
        if (item.status !== 'done' || !item.month.startsWith(currentYear)) {
          return totals;
        }

        return {
          irs: totals.irs + item.irs_withheld_cents,
          ss: totals.ss + item.ss_withheld_cents,
        };
      },
      { irs: 0, ss: 0 }
    );
  }, [imports]);

  const validateAndUploadFile = useCallback(
    async (file: File | null, options?: { force?: boolean }) => {
      if (!file) {
        return;
      }

      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

      if (!isPdf) {
        setError('Selecione um ficheiro PDF válido.');
        clearSelectedFile();
        return;
      }

      if (file.size > MAX_FILE_SIZE_BYTES) {
        setError('O recibo tem de ter no máximo 10MB.');
        clearSelectedFile();
        return;
      }

      await uploadPayslip(file, options);
    },
    [clearSelectedFile, uploadPayslip]
  );

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    await validateAndUploadFile(nextFile);
  };

  const handleDrop = async (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragActive(false);
    const nextFile = event.dataTransfer.files?.[0] ?? null;
    await validateAndUploadFile(nextFile);
  };

  const handleConfirmImport = async () => {
    if (!extractedData) {
      return;
    }

    setError(null);
    setFeedback(null);
    setPhase('confirming');

    try {
      const accessToken = await getAccessToken();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/confirm-payslip`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            payslip_import_id: extractedData.payslip_import_id,
          }),
        }
      );

      const payload = await parseResponse(response);

      if (!response.ok) {
        throw new Error(
          getErrorMessage(payload, 'Não foi possível confirmar a importação do recibo.')
        );
      }

      const createdTransactions =
        getCreatedTransactionCount(payload) ?? getDefaultCreatedTransactions(extractedData);
      const importedMonth = formatMonthLabel(extractedData.month);
      const netFormatted = formatCents(extractedData.net_salary_cents);

      await fetchImports();
      setFeedback({
        type: 'success',
        message: `✅ ${createdTransactions} transações criadas para ${importedMonth}\n💰 Rendimento de ${netFormatted} registado`,
      });

      try {
        const payslipMonth = extractedData.month;
        const monthDate = `${payslipMonth}-01`;

        if (userId) {
          const { data: incomeCats, error: incomeCatsError } = await supabase
            .from('categories')
            .select('id')
            .eq('user_id', userId)
            .eq('type', 'income')
            .ilike('name', '%sal%rio%')
            .limit(1);

          if (incomeCatsError) {
            throw incomeCatsError;
          }

          const salaryCatId = incomeCats?.[0]?.id;
          if (salaryCatId) {
            const { data: existingBudget, error: existingBudgetError } = await supabase
              .from('budgets')
              .select('id, limit_cents')
              .eq('user_id', userId)
              .eq('category_id', salaryCatId)
              .eq('month', monthDate)
              .maybeSingle();

            if (existingBudgetError) {
              throw existingBudgetError;
            }

            if (!existingBudget) {
              const { error: insertBudgetError } = await supabase.from('budgets').insert({
                user_id: userId,
                category_id: salaryCatId,
                month: monthDate,
                limit_cents: extractedData.net_salary_cents,
              });

              if (insertBudgetError) {
                throw insertBudgetError;
              }
            }
          }
        }
      } catch (budgetError) {
        console.error('Budget auto-fill error:', budgetError);
      }

      setExtractedData(null);
      setPendingFile(null);
      setDuplicateState(null);
      clearSelectedFile();
      setPhase('success');
    } catch (confirmError) {
      console.error('Erro ao confirmar recibo:', confirmError);
      setError(
        confirmError instanceof Error
          ? confirmError.message
          : 'Não foi possível confirmar a importação do recibo.'
      );
      setPhase('review');
    }
  };

  const handleCancelReview = () => {
    setExtractedData(null);
    setPendingFile(null);
    setDuplicateState(null);
    setError(null);
    clearSelectedFile();
    setPhase('upload');
  };

  const handleForceImport = async () => {
    if (!pendingFile) {
      setDuplicateState(null);
      return;
    }

    await uploadPayslip(pendingFile, { force: true });
  };

  const handleDeleteImport = async (importItem: PayslipImportHistoryItem) => {
    if (!userId) {
      setError('Sessão indisponível. Tente novamente.');
      return;
    }

    const confirmed = window.confirm(
      `Tem a certeza de que quer apagar o recibo importado de ${formatMonthLabel(importItem.month)}?`
    );

    if (!confirmed) {
      return;
    }

    setDeletingImportId(importItem.id);
    setError(null);

    try {
      const { error: deleteError } = await supabase
        .from('payslip_imports')
        .delete()
        .eq('id', importItem.id)
        .eq('user_id', userId);

      if (deleteError) {
        throw deleteError;
      }

      setImports((currentImports) =>
        currentImports.filter((currentImport) => currentImport.id !== importItem.id)
      );
      setExpandedDeductions((currentExpanded) => {
        const nextExpanded = new Set(currentExpanded);
        nextExpanded.delete(importItem.id);
        return nextExpanded;
      });
      setFeedback({
        type: 'success',
        message: `Recibo de ${formatMonthLabel(importItem.month)} apagado com sucesso.`,
      });
    } catch (deleteError) {
      console.error('Erro ao apagar recibo importado:', deleteError);
      setError('Não foi possível apagar o recibo importado.');
    } finally {
      setDeletingImportId(null);
    }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4 shadow-[var(--shadow-sm)] sm:p-5">
        <div className="flex flex-col gap-2 border-b border-[var(--color-divider)] pb-4">
          <h3 className="text-base font-semibold text-[var(--color-text)]">
            Importar recibo de vencimento
          </h3>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Envie um PDF para extrair os valores do salário e criar as transações automaticamente.
          </p>
        </div>

        <div className="mt-4 space-y-4">
          {!userId && (
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-3 text-sm text-[var(--color-text-secondary)]">
              Inicie sessão para importar recibos de vencimento.
            </div>
          )}

          {error && (
            <div className="rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-[var(--color-bg-secondary)] px-4 py-3 text-sm text-[var(--color-danger)]">
              {error}
            </div>
          )}

          {feedback && (
            <div
              className={`whitespace-pre-line rounded-[var(--radius-md)] border px-4 py-3 text-sm font-medium ${
                feedback.type === 'success'
                  ? 'border-[var(--color-success)] bg-[var(--color-accent-light)] text-[var(--color-success)]'
                  : 'border-[var(--color-danger)] bg-[var(--color-bg-secondary)] text-[var(--color-danger)]'
              }`}
            >
              {feedback.message}
            </div>
          )}

          {(phase === 'upload' || phase === 'loading' || phase === 'success') && (
            <div className="space-y-3">
              <input
                ref={fileInputRef}
                id="payslip-file-input"
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={(event) => {
                  void handleFileChange(event);
                }}
                disabled={!userId || phase === 'loading'}
              />

              <label
                htmlFor="payslip-file-input"
                onDragOver={(event) => {
                  event.preventDefault();
                  if (userId && phase !== 'loading') {
                    setIsDragActive(true);
                  }
                }}
                onDragLeave={() => setIsDragActive(false)}
                onDrop={(event) => {
                  void handleDrop(event);
                }}
                className={`flex min-h-[180px] w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-[var(--radius-lg)] border-2 border-dashed px-5 py-6 text-center transition-colors ${
                  !userId || phase === 'loading'
                    ? 'cursor-not-allowed border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-tertiary)]'
                    : isDragActive
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-text)]'
                      : 'border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:bg-[var(--color-bg-hover)]'
                }`}
              >
                {phase === 'loading' ? (
                  <>
                    <span className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--color-border)] border-t-[var(--color-accent)]" />
                    <span className="text-sm font-medium text-[var(--color-text)]">
                      A ler o recibo…
                    </span>
                  </>
                ) : (
                  <>
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-bg)] text-xl shadow-[var(--shadow-sm)]">
                      📄
                    </span>
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-[var(--color-text)]">
                        Arrasta ou clica para enviar o recibo (PDF, máx. 10MB)
                      </p>
                      <p className="text-xs text-[var(--color-text-secondary)]">
                        Os dados serão validados antes da importação.
                      </p>
                    </div>
                  </>
                )}
              </label>
            </div>
          )}

          {(phase === 'review' || phase === 'confirming') && extractedData && (
            <div className="space-y-4">
              {extractedData.needsReview && (
                <div className="rounded-[var(--radius-md)] border border-[var(--color-warning)] bg-[var(--color-bg-secondary)] px-4 py-3 text-sm text-[var(--color-warning)]">
                  ⚠️ Os valores extraídos não são consistentes (bruto - descontos ≠ líquido, Δ ={' '}
                  {formatCents(Math.abs(extractedData.deltaCents))}). Verifica antes de confirmar.
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowRawPreview(!showRawPreview)}
                className="flex items-center gap-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text)]"
              >
                <span>{showRawPreview ? '▼' : '▶'}</span>
                <span>Ver extracção original</span>
              </button>

              {showRawPreview && (
                <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[var(--color-text-secondary)]">Entidade</span>
                    <span className="font-medium">{extractedData.employer_name || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--color-text-secondary)]">Mês</span>
                    <span className="font-medium">{formatMonthLabel(extractedData.month)}</span>
                  </div>
                  <div className="border-t border-[var(--color-divider)] pt-2">
                    <div className="flex justify-between">
                      <span className="text-[var(--color-text-secondary)]">Vencimento base</span>
                      <span className="font-medium">{formatCents(extractedData.gross_salary_cents)}</span>
                    </div>
                  </div>
                  {extractedData.meal_card_cents != null && extractedData.meal_card_cents > 0 && (
                    <div className="flex justify-between">
                      <span className="text-[var(--color-text-secondary)]">Subsídio de refeição</span>
                      <span className="font-medium">{formatCents(extractedData.meal_card_cents)}</span>
                    </div>
                  )}
                  {extractedData.total_gross_cents != null && extractedData.total_gross_cents > 0 && (
                    <div className="flex justify-between">
                      <span className="text-[var(--color-text-secondary)]">Total ilíquido</span>
                      <span className="font-medium">{formatCents(extractedData.total_gross_cents)}</span>
                    </div>
                  )}
                  <div className="border-t border-[var(--color-divider)] pt-2">
                    <div className="flex justify-between">
                      <span className="text-[var(--color-text-secondary)]">IRS retido</span>
                      <span className="font-medium">{formatCents(extractedData.irs_withheld_cents)}</span>
                    </div>
                    <div className="mt-1 flex justify-between">
                      <span className="text-[var(--color-text-secondary)]">Segurança Social</span>
                      <span className="font-medium">{formatCents(extractedData.ss_withheld_cents)}</span>
                    </div>
                    {extractedData.other_deductions_cents > 0 && (
                      <div className="mt-1 flex justify-between">
                        <span className="text-[var(--color-text-secondary)]">Outras deduções</span>
                        <span className="font-medium">{formatCents(extractedData.other_deductions_cents)}</span>
                      </div>
                    )}
                  </div>
                  <div className="border-t border-[var(--color-divider)] pt-2">
                    <div className="flex justify-between">
                      <span className="text-[var(--color-text-secondary)]">💰 Líquido recebido</span>
                      <span className="font-semibold text-[var(--color-text)]">
                        {formatCents(extractedData.net_salary_cents)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 shadow-[var(--shadow-sm)]">
                <dl className="space-y-3 text-sm text-[var(--color-text)]">
                  <div className="flex items-start justify-between gap-4">
                    <dt className="text-[var(--color-text-secondary)]">Salário bruto</dt>
                    <dd className="text-right font-medium">{formatCents(extractedData.gross_salary_cents)}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <dt className="text-[var(--color-text-secondary)]">Retenção IRS</dt>
                    <dd className="text-right font-medium">{formatCents(extractedData.irs_withheld_cents)}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <dt className="text-[var(--color-text-secondary)]">Segurança Social</dt>
                    <dd className="text-right font-medium">{formatCents(extractedData.ss_withheld_cents)}</dd>
                  </div>
                  {extractedData.other_deductions_cents > 0 && (
                    <div className="flex items-start justify-between gap-4">
                      <dt className="text-[var(--color-text-secondary)]">Outros descontos</dt>
                      <dd className="text-right font-medium">
                        {formatCents(extractedData.other_deductions_cents)}
                      </dd>
                    </div>
                  )}
                  <div className="border-t border-[var(--color-divider)] pt-3">
                    <div className="flex items-start justify-between gap-4">
                      <dt className="text-[var(--color-text-secondary)]">Salário líquido</dt>
                      <dd className="text-right text-base font-semibold text-[var(--color-text)]">
                        {formatCents(extractedData.net_salary_cents)}
                      </dd>
                    </div>
                  </div>
                  <div className="border-t border-[var(--color-divider)] pt-3">
                    <div className="flex items-start justify-between gap-4">
                      <dt className="text-[var(--color-text-secondary)]">Mês</dt>
                      <dd className="text-right font-medium">{formatMonthLabel(extractedData.month)}</dd>
                    </div>
                    {extractedData.employer_name && (
                      <div className="mt-3 flex items-start justify-between gap-4">
                        <dt className="text-[var(--color-text-secondary)]">Empregador</dt>
                        <dd className="text-right font-medium">{extractedData.employer_name}</dd>
                      </div>
                    )}
                  </div>
                </dl>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={handleCancelReview}
                  disabled={phase === 'confirming'}
                  className="flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2.5 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg-hover)] disabled:cursor-not-allowed disabled:text-[var(--color-text-tertiary)]"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleConfirmImport();
                  }}
                  disabled={phase === 'confirming'}
                  className="flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-[var(--color-text-inverse)] transition-colors hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:bg-[var(--color-bg-tertiary)] disabled:text-[var(--color-text-tertiary)]"
                >
                  {phase === 'confirming' ? 'A importar…' : 'Confirmar e importar'}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4 shadow-[var(--shadow-sm)] sm:p-5">
        <div className="flex flex-col gap-2 border-b border-[var(--color-divider)] pb-4">
          <h3 className="text-base font-semibold text-[var(--color-text)]">
            Histórico de importações
          </h3>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Consulte os últimos 24 recibos importados e apague importações se necessário.
          </p>
        </div>

        <div className="mt-4 space-y-3">
          {imports.filter((item) => item.status === 'done').length >= 2 && (
            <div className="mb-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">
                Evolução salarial
              </p>
              <ResponsiveContainer width="100%" height={80}>
                <BarChart
                  data={imports
                    .filter((item) => item.status === 'done')
                    .slice(0, 6)
                    .reverse()
                    .map((item) => ({
                      month: formatMonthLabel(item.month).split(' ')[0]?.slice(0, 3) ?? item.month,
                      net: item.net_salary_cents,
                    }))}
                >
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 10, fill: 'var(--color-text-tertiary)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(value: number) => [formatCents(value), 'Líquido']}
                    contentStyle={{
                      fontSize: 12,
                      borderRadius: 8,
                      border: '1px solid var(--color-border)',
                    }}
                  />
                  <Bar dataKey="net" fill="var(--color-accent)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {isHistoryLoading ? (
            <p className="text-sm text-[var(--color-text-secondary)]">A carregar recibos importados…</p>
          ) : imports.length === 0 ? (
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-5 text-sm text-[var(--color-text-secondary)]">
              Ainda não existem recibos importados.
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-[var(--color-divider)]">
              {imports.map((importItem) => {
                const isDeleting = deletingImportId === importItem.id;

                return (
                  <div
                    key={importItem.id}
                    className="flex flex-col gap-4 py-4 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="flex-1">
                      <div className="grid gap-3 sm:grid-cols-4 sm:gap-4">
                        <div>
                          <p className="text-xs uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">
                            Mês
                          </p>
                          <p className="text-sm font-medium text-[var(--color-text)]">
                            {formatMonthLabel(importItem.month)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">
                            Empregador
                          </p>
                          <p className="text-sm text-[var(--color-text)]">
                            {importItem.employer_name ?? '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">
                            Salário líquido
                          </p>
                          <p className="text-sm font-medium text-[var(--color-text)]">
                            {formatCents(importItem.net_salary_cents)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">
                            Importado em
                          </p>
                          <p className="text-sm text-[var(--color-text)]">
                            {formatImportedAt(importItem.created_at)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-2">
                        <button
                          type="button"
                          onClick={() => {
                            setExpandedDeductions((prev) => {
                              const next = new Set(prev);
                              if (next.has(importItem.id)) {
                                next.delete(importItem.id);
                              } else {
                                next.add(importItem.id);
                              }
                              return next;
                            });
                          }}
                          className="text-xs text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-text-secondary)]"
                        >
                          {expandedDeductions.has(importItem.id) ? '▼ Deduções' : '▸ Deduções'}
                        </button>
                        {expandedDeductions.has(importItem.id) && (() => {
                          const gross =
                            importItem.net_salary_cents +
                            importItem.irs_withheld_cents +
                            importItem.ss_withheld_cents;
                          const irsPct =
                            gross > 0 ? Math.round((importItem.irs_withheld_cents / gross) * 100) : 0;
                          const ssPct =
                            gross > 0 ? Math.round((importItem.ss_withheld_cents / gross) * 100) : 0;
                          return (
                            <div className="mt-2 space-y-2">
                              <div>
                                <div className="flex justify-between text-xs text-[var(--color-text-secondary)]">
                                  <span>IRS</span>
                                  <span>{irsPct}% ({formatCents(importItem.irs_withheld_cents)})</span>
                                </div>
                                <div className="mt-1 h-2 rounded-full bg-[var(--color-bg-tertiary)]">
                                  <div
                                    className="h-2 rounded-full bg-[var(--color-danger)]"
                                    style={{ width: `${Math.min(irsPct, 100)}%` }}
                                  />
                                </div>
                              </div>
                              <div>
                                <div className="flex justify-between text-xs text-[var(--color-text-secondary)]">
                                  <span>SS</span>
                                  <span>{ssPct}% ({formatCents(importItem.ss_withheld_cents)})</span>
                                </div>
                                <div className="mt-1 h-2 rounded-full bg-[var(--color-bg-tertiary)]">
                                  <div
                                    className="h-2 rounded-full bg-[var(--color-accent)]"
                                    style={{ width: `${Math.min(ssPct, 100)}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        void handleDeleteImport(importItem);
                      }}
                      disabled={isDeleting}
                      className="flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-danger)] px-4 py-2.5 text-sm font-medium text-[var(--color-danger)] transition-colors hover:bg-[var(--color-bg-hover)] disabled:cursor-not-allowed disabled:border-[var(--color-border)] disabled:text-[var(--color-text-tertiary)]"
                    >
                      {isDeleting ? 'A apagar…' : 'Apagar'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4 shadow-[var(--shadow-sm)] sm:p-5">
        <div className="space-y-2">
          <h3 className="text-base font-semibold text-[var(--color-text)]">
            Descontos acumulados no ano (recibos importados)
          </h3>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Útil para a declaração anual de IRS.
          </p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
            <p className="text-sm text-[var(--color-text-secondary)]">IRS retido YTD</p>
            <p className="mt-2 text-lg font-semibold text-[var(--color-text)]">
              {formatCents(ytdTotals.irs)}
            </p>
          </div>
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
            <p className="text-sm text-[var(--color-text-secondary)]">Segurança Social YTD</p>
            <p className="mt-2 text-lg font-semibold text-[var(--color-text)]">
              {formatCents(ytdTotals.ss)}
            </p>
          </div>
        </div>
      </section>

      {duplicateState && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
          style={{ backgroundColor: 'color-mix(in srgb, var(--color-text) 32%, transparent)' }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="payslip-duplicate-title"
            className="w-full max-w-md rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-5 shadow-[var(--shadow-md)]"
          >
            <div className="space-y-2">
              <h3
                id="payslip-duplicate-title"
                className="text-lg font-semibold text-[var(--color-text)]"
              >
                Recibo duplicado
              </h3>
              <p className="text-sm text-[var(--color-text-secondary)]">
                Já foi importado um recibo para {duplicateState.month}.
              </p>
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setDuplicateState(null)}
                className="flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-2.5 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg-hover)]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleForceImport();
                }}
                className="flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-[var(--color-text-inverse)] transition-colors hover:bg-[var(--color-accent-hover)]"
              >
                Importar na mesma?
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
