import { PDFDownloadLink } from '@react-pdf/renderer';
import {
  MonthlyReport,
  type MonthlyReportProps,
} from '@/features/reports/MonthlyReport';

interface DashboardPdfExportProps {
  report: MonthlyReportProps;
  fileName: string;
}

export function DashboardPdfExport({ report, fileName }: DashboardPdfExportProps) {
  return (
    <PDFDownloadLink
      document={<MonthlyReport {...report} />}
      fileName={fileName}
      className="inline-flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-accent)] bg-[var(--color-bg)] px-4 py-2 text-sm font-medium text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-light)]"
    >
      {({ loading, error }) => {
        if (error) {
          return 'Erro ao gerar PDF';
        }

        return loading ? 'A gerar PDF…' : 'Exportar relatório PDF';
      }}
    </PDFDownloadLink>
  );
}
