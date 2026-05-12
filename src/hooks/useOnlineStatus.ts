import { useSyncExternalStore } from 'react';

function subscribe(onStoreChange: () => void) {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  window.addEventListener('online', onStoreChange);
  window.addEventListener('offline', onStoreChange);

  return () => {
    window.removeEventListener('online', onStoreChange);
    window.removeEventListener('offline', onStoreChange);
  };
}

function getSnapshot() {
  if (typeof navigator === 'undefined') {
    return true;
  }

  return navigator.onLine;
}

export function useOnlineStatus() {
  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}
