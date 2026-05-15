import { create } from 'zustand';

interface UserSettings {
  monthStartDay: number;
  reminderDaysBefore: number;
  autoReportPdf: boolean;
  theme: 'system' | 'light' | 'dark';
}

interface SettingsStore {
  settings: UserSettings;
  isLoading: boolean;
  lastFetchedAt: number | null;
  setSettings: (settings: UserSettings) => void;
  setLoading: (loading: boolean) => void;
}

const DEFAULT_SETTINGS: UserSettings = {
  monthStartDay: 1,
  reminderDaysBefore: 3,
  autoReportPdf: true,
  theme: 'system',
};

export const useSettingsStore = create<SettingsStore>((set) => ({
  settings: DEFAULT_SETTINGS,
  isLoading: false,
  lastFetchedAt: null,
  setSettings: (settings) => set({ settings, lastFetchedAt: Date.now() }),
  setLoading: (isLoading) => set({ isLoading }),
}));
