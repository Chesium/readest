import { useEffect, useRef } from 'react';

import { useEnv } from '@/context/EnvContext';
import { hasXRayCredentials as hasCredentials } from '@/services/ai/xray/utils';
import type { XRayUpdateProgress } from '@/services/ai/xray/XRayService';
import { XRayScheduler } from '@/services/ai/xray/XRayScheduler';
import { useBookDataStore } from '@/store/bookDataStore';
import { useNotebookStore } from '@/store/notebookStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useSidebarStore } from '@/store/sidebarStore';
import { formatTitle, getContributorNames } from '@/utils/book';
import { eventDispatcher } from '@/utils/event';
import { useXRayReadThroughCfi } from './useXRayReadThroughCfi';

export const useXRayAutoUpdate = (bookKey: string): void => {
  const { appService } = useEnv();
  const bookHash = bookKey.split('-')[0] ?? '';
  const bookDoc = useBookDataStore((state) => state.booksData[bookHash]?.bookDoc ?? null);
  const readThroughCfi = useXRayReadThroughCfi(bookKey);
  const aiSettings = useSettingsStore((state) => state.settings.aiSettings);
  // Background updates run only while the X-Ray panel shows this book; opening it
  // re-runs the schedule effect, which catches up on what was read while closed.
  const isPanelOpen = useNotebookStore(
    (state) => state.isNotebookVisible && state.notebookActiveTab === 'xray',
  );
  const isPanelBook = useSidebarStore((state) => state.sideBarBookKey === bookKey);
  const isPanelOpenForBook = isPanelOpen && isPanelBook;
  const scheduler = useRef<XRayScheduler | null>(null);

  useEffect(() => {
    if (
      !isPanelOpenForBook ||
      !appService ||
      appService.appPlatform !== 'tauri' ||
      !aiSettings?.enabled ||
      !aiSettings.reedy?.enabled ||
      !hasCredentials(aiSettings)
    ) {
      scheduler.current = null;
      return;
    }

    const nextScheduler = new XRayScheduler(
      async (update, signal) => {
        const { getXRayService } = await import('@/services/ai/xray/XRayService');
        const service = await getXRayService(appService, aiSettings);
        const reportProgress = (progress: XRayUpdateProgress | null) =>
          void eventDispatcher.dispatch('xray-progress', { bookHash: update.bookHash, progress });
        try {
          const result = await service.updateForProgress({
            ...update,
            signal,
            onProgress: (completedUnits, totalUnits) =>
              reportProgress({ completedUnits, totalUnits }),
          });
          if (result.kind === 'updated') {
            void eventDispatcher.dispatch('xray-updated', {
              bookHash: update.bookHash,
              maxPositionIndex: result.maxPositionIndex,
            });
          }
        } finally {
          reportProgress(null);
        }
      },
      {
        onError: (error) => console.warn('[X-Ray] background update failed', error),
      },
    );
    scheduler.current = nextScheduler;
    return () => {
      if (scheduler.current === nextScheduler) scheduler.current = null;
      nextScheduler.dispose();
    };
  }, [aiSettings, appService, isPanelOpenForBook]);

  useEffect(() => {
    if (!isPanelOpenForBook || !bookHash || !bookDoc || !readThroughCfi) return;
    scheduler.current?.schedule({
      bookHash,
      currentCfi: readThroughCfi,
      metadata: {
        title: formatTitle(bookDoc.metadata.title),
        description: bookDoc.metadata.description,
        subject: getContributorNames(bookDoc.metadata.subject),
        language: bookDoc.metadata.language,
      },
    });
  }, [aiSettings, appService, bookDoc, bookHash, isPanelOpenForBook, readThroughCfi]);
};
