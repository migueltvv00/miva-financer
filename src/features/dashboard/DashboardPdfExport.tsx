import { pdf } from '@react-pdf/renderer';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MonthlyReport,
  type MonthlyReportProps,
} from '@/features/reports/MonthlyReport';

interface DashboardPdfExportProps {
  report: MonthlyReportProps;
  fileName: string;
  triggerDownloadKey?: number;
}

export function DashboardPdfExport({
  report,
  fileName,
  triggerDownloadKey = 0,
}: DashboardPdfExportProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasError, setHasError] = useState(false);
  const isGeneratingRef = useRef(false);
  const lastTriggeredKeyRef = useRef(0);

  const downloadReport = useCallback(async () => {
    if (isGeneratingRef.current) {
      return;
    }

    isGeneratingRef.current = true;
    setHasError(false);
    setIsGenerating(true);

    try {
      const blob = await pdf(<MonthlyReport {...report} />).toBlob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');

      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      window.setTimeout(() => {
        window.URL.revokeObjectURL(url);
      }, 1000);
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      setHasError(true);
    } finally {
      isGeneratingRef.current = false;
      setIsGenerating(false);
    }
  }, [fileName, report]);

  useEffect(() => {
    if (triggerDownloadKey <= 0 || lastTriggeredKeyRef.current === triggerDownloadKey) {
      return;
    }

    lastTriggeredKeyRef.current = triggerDownloadKey;
    void downloadReport();
  }, [downloadReport, triggerDownloadKey]);

  return (
    <button
      type="button"
      onClick={() => {
        void downloadReport();
      }}
      className="inline-flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-accent)] bg-[var(--color-bg)] px-4 py-2 text-sm font-medium text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-light)]"
      disabled={isGenerating}
    >
      {hasError ? 'Erro ao gerar PDF' : isGenerating ? 'A gerar PDF…' : 'Exportar relatório PDF'}
    </button>
  );
}
