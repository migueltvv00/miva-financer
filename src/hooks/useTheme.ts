import { useEffect } from 'react';
import { useSettingsStore } from '@/store/settingsStore';

export function useTheme() {
  const theme = useSettingsStore((state) => state.settings.theme);

  useEffect(() => {
    const applyTheme = (resolved: 'light' | 'dark') => {
      document.documentElement.dataset.theme = resolved;
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) {
        meta.setAttribute('content', resolved === 'dark' ? '#191919' : '#0F7B6C');
      }
    };

    if (theme === 'light' || theme === 'dark') {
      applyTheme(theme);
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    applyTheme(mediaQuery.matches ? 'dark' : 'light');

    const handler = (event: MediaQueryListEvent) =>
      applyTheme(event.matches ? 'dark' : 'light');

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [theme]);
}
