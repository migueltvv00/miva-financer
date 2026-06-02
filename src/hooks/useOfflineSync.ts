import { useEffect, useRef } from 'react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { flushQueue, getQueue } from '@/lib/offlineQueue';

interface UseOfflineSyncOptions {
  onSyncSuccess?: (syncedCount: number) => void;
  onSyncError?: (failedCount: number) => void;
}

/**
 * Detects reconnection and flushes the offline transaction queue.
 * Calls `onSyncSuccess` with the number of synced items, or
 * `onSyncError` with the number of items that failed to sync.
 */
export function useOfflineSync({
  onSyncSuccess,
  onSyncError,
}: UseOfflineSyncOptions = {}) {
  const isOnline = useOnlineStatus();
  const wasOfflineRef = useRef(!isOnline);
  const isSyncingRef = useRef(false);

  useEffect(() => {
    const cameBackOnline = isOnline && wasOfflineRef.current;
    wasOfflineRef.current = !isOnline;

    if (!cameBackOnline || isSyncingRef.current) return;

    const pendingQueue = getQueue();
    if (pendingQueue.length === 0) return;

    const totalCount = pendingQueue.length;
    isSyncingRef.current = true;

    void flushQueue()
      .then((failed) => {
        const successCount = totalCount - failed.length;
        if (successCount > 0) onSyncSuccess?.(successCount);
        if (failed.length > 0) onSyncError?.(failed.length);
      })
      .catch((err: unknown) => {
        console.error('[useOfflineSync] Erro durante sincronização:', err);
        onSyncError?.(totalCount);
      })
      .finally(() => {
        isSyncingRef.current = false;
      });
  }, [isOnline, onSyncSuccess, onSyncError]);

  return { isOnline };
}
