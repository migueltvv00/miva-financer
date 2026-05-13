import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useUserSettings } from '@/hooks/useUserSettings';

export function PeriodSettings() {
  const { user } = useAuth();
  const { settings, updateSettings, isLoading } = useUserSettings(user?.id);
  const [localDay, setLocalDay] = useState<string>(String(settings.monthStartDay));
  const [localReminder, setLocalReminder] = useState<string>(String(settings.reminderDaysBefore));
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const currentDay = settings.monthStartDay;
  const currentReminder = settings.reminderDaysBefore;
  const parsedDay = Math.max(1, Math.min(28, Number(localDay) || 1));
  const parsedReminder = Math.max(0, Math.min(7, Number(localReminder) || 0));
  const hasChanges = parsedDay !== currentDay || parsedReminder !== currentReminder;

  const handleSave = async () => {
    if (!hasChanges) return;
    setSaving(true);
    setFeedback(null);

    try {
      await updateSettings({ monthStartDay: parsedDay, reminderDaysBefore: parsedReminder });
      setFeedback('Guardado com sucesso');
      setTimeout(() => setFeedback(null), 2000);
    } catch {
      setFeedback('Erro ao guardar');
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
        <p className="text-sm text-[var(--color-text-secondary)]">A carregar definições de período…</p>
      </section>
    );
  }

  return (
    <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
      <div className="mb-3">
        <h3 className="text-base font-semibold text-[var(--color-text)]">Período mensal</h3>
        <p className="text-xs text-[var(--color-text-secondary)]">
          Define o dia em que o seu mês financeiro começa e os lembretes de fim de período.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <label className="text-sm text-[var(--color-text)]" htmlFor="month-start-day">
            Dia de início:
          </label>
          <input
            id="month-start-day"
            type="number"
            min={1}
            max={28}
            value={localDay}
            onChange={(e) => setLocalDay(e.target.value)}
            className="w-16 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-2 py-1.5 text-center text-sm text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-3">
          <label className="text-sm text-[var(--color-text)]" htmlFor="reminder-days">
            Lembretes (dias antes do fim):
          </label>
          <input
            id="reminder-days"
            type="number"
            min={0}
            max={7}
            value={localReminder}
            onChange={(e) => setLocalReminder(e.target.value)}
            className="w-16 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-2 py-1.5 text-center text-sm text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
          />
        </div>

        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!hasChanges || saving}
          className="w-fit rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-text-inverse)] transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
        >
          {saving ? 'A guardar…' : 'Guardar'}
        </button>
      </div>

      {feedback && (
        <p className="mt-2 text-xs text-[var(--color-success)]">{feedback}</p>
      )}

      <p className="mt-3 text-xs text-[var(--color-text-tertiary)]">
        Dia de início: 1–28 (1 = mês do calendário). Lembretes: 0 = desativado, até 7 dias.
      </p>
    </section>
  );
}
