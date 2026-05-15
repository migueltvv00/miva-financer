import { useEffect, useRef } from 'react';
import { getPeriodKey } from '@/lib/periodUtils';
import { useSettingsStore } from '@/store/settingsStore';

const AUTO_REPORT_KEY = 'fluxo-auto-report-month';

export function useAutoReportPdf(
  userId: string | undefined,
  selectedMonth: Date,
  onGenerateReport: () => void
) {
  const autoReportPdf = useSettingsStore((state) => state.settings.autoReportPdf);
  const monthStartDay = useSettingsStore((state) => state.settings.monthStartDay);
  const hasTriggeredRef = useRef(false);

  useEffect(() => {
    if (!userId || !autoReportPdf || hasTriggeredRef.current) return;

    const currentKey = getPeriodKey(selectedMonth, monthStartDay);
    const lastKey = localStorage.getItem(AUTO_REPORT_KEY);

    if (lastKey === currentKey) return;

    hasTriggeredRef.current = true;
    localStorage.setItem(AUTO_REPORT_KEY, currentKey);

    const timer = window.setTimeout(() => {
      onGenerateReport();
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [userId, autoReportPdf, selectedMonth, monthStartDay, onGenerateReport]);
}
