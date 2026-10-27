import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useXRayAutoUpdate } from '@/app/reader/hooks/useXRayAutoUpdate';
import { useNotebookStore } from '@/store/notebookStore';
import { useSidebarStore } from '@/store/sidebarStore';
import type { XRayProgressUpdate, XRayProgressUpdateResult } from '@/services/ai/xray/XRayService';

const mocks = vi.hoisted(() => ({
  appService: { appPlatform: 'tauri' },
  aiSettings: { enabled: true, provider: 'ollama', reedy: { enabled: true } },
  updateForProgress: vi.fn<(update: XRayProgressUpdate) => Promise<XRayProgressUpdateResult>>(),
  dispatch: vi.fn(),
  readThroughCfi: undefined as string | undefined,
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ appService: mocks.appService }),
}));

vi.mock('@/services/ai/xray/XRayService', () => ({
  getXRayService: () => Promise.resolve({ updateForProgress: mocks.updateForProgress }),
}));

vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: (selector: (state: unknown) => unknown) =>
    selector({
      booksData: {
        booka: {
          bookDoc: { metadata: { title: 'Book A' } },
          config: { xrayReadThroughCfi: mocks.readThroughCfi },
        },
      },
    }),
}));

vi.mock('@/store/readerProgressStore', () => ({
  useBookProgress: () => ({ location: 'epubcfi(/6/2!/4/2/1:20)' }),
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: (selector: (state: unknown) => unknown) =>
    selector({ settings: { aiSettings: mocks.aiSettings } }),
}));

vi.mock('@/utils/book', () => ({
  formatTitle: (value: string) => value,
  getContributorNames: () => [],
}));

vi.mock('@/utils/event', () => ({
  eventDispatcher: { dispatch: mocks.dispatch },
}));

describe('useXRayAutoUpdate', () => {
  beforeEach(() => {
    mocks.dispatch.mockClear();
    useSidebarStore.getState().setSideBarBookKey('booka-view');
    useNotebookStore.getState().setNotebookActiveTab('xray');
    useNotebookStore.getState().setNotebookVisible(true);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    mocks.readThroughCfi = undefined;
  });

  it('schedules the furthest position read, not the page shown', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mocks.readThroughCfi = 'epubcfi(/6/4!/4/2/1:0)';
    mocks.updateForProgress.mockResolvedValue({
      kind: 'current',
      batchCount: 0,
      unitCount: 0,
      maxPositionIndex: 3,
    });
    renderHook(() => useXRayAutoUpdate('booka-view'));

    await vi.advanceTimersByTimeAsync(3_000);
    await waitFor(() => expect(mocks.updateForProgress).toHaveBeenCalled());
    expect(mocks.updateForProgress.mock.calls[0]![0].currentCfi).toBe('epubcfi(/6/4!/4/2/1:0)');
    await waitFor(() =>
      expect(mocks.dispatch).toHaveBeenCalledWith('xray-progress', {
        bookHash: 'booka',
        progress: null,
      }),
    );
  });

  it.each([
    ['finishes', true],
    ['fails', false],
  ])('reports background progress per batch and clears it when the update %s', async (_case, ok) => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mocks.updateForProgress.mockImplementation(async ({ onProgress }) => {
      onProgress?.(0, 4);
      onProgress?.(2, 4);
      if (!ok) throw new Error('model unavailable');
      return { kind: 'updated', batchCount: 1, unitCount: 2, maxPositionIndex: 1 };
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderHook(() => useXRayAutoUpdate('booka-view'));

    await vi.advanceTimersByTimeAsync(3_000);
    await waitFor(() =>
      expect(mocks.dispatch).toHaveBeenCalledWith('xray-progress', {
        bookHash: 'booka',
        progress: null,
      }),
    );

    const progress = mocks.dispatch.mock.calls
      .filter(([name]) => name === 'xray-progress')
      .map(([, detail]) => detail.progress);
    expect(progress).toEqual([
      { completedUnits: 0, totalUnits: 4 },
      { completedUnits: 2, totalUnits: 4 },
      null,
    ]);
    mocks.dispatch.mockClear();
  });
});
