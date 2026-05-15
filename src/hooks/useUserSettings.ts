import { useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useSettingsStore } from '@/store/settingsStore';

export function useUserSettings(userId: string | undefined) {
  const settings = useSettingsStore((s) => s.settings);
  const isLoading = useSettingsStore((s) => s.isLoading);
  const setSettings = useSettingsStore((s) => s.setSettings);
  const setLoading = useSettingsStore((s) => s.setLoading);
  const hasFetchedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId || hasFetchedRef.current === userId) return;

    setLoading(true);
    hasFetchedRef.current = userId;

    const load = async () => {
      try {
        const { data, error } = await supabase
          .from('user_settings')
          .select('month_start_day, reminder_days_before, auto_report_pdf')
          .eq('user_id', userId)
          .maybeSingle();

        if (error) {
          console.error('Error loading user settings:', error);
          return;
        }

        if (data) {
          setSettings({
            monthStartDay: data.month_start_day,
            reminderDaysBefore: data.reminder_days_before,
            autoReportPdf: data.auto_report_pdf,
          });
        }
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [userId, setLoading, setSettings]);

  const updateSettings = useCallback(
    async (updates: Partial<{ monthStartDay: number; reminderDaysBefore: number; autoReportPdf: boolean }>) => {
      if (!userId) return;

      const newSettings = { ...settings, ...updates };
      setSettings(newSettings);

      const { error } = await supabase
        .from('user_settings')
        .upsert({
          user_id: userId,
          month_start_day: newSettings.monthStartDay,
          reminder_days_before: newSettings.reminderDaysBefore,
          auto_report_pdf: newSettings.autoReportPdf,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      if (error) {
        console.error('Error saving user settings:', error);
        // Rollback
        setSettings(settings);
        throw error;
      }
    },
    [userId, settings, setSettings]
  );

  return { settings, isLoading, updateSettings };
}
