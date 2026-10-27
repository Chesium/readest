import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';

const h = vi.hoisted(() => ({
  locations: {} as Record<string, string>,
  schedule: vi.fn(),
  dispose: vi.fn(),
  aiSettings: { enabled: true, reedy: { enabled: true } },
  appService: { appPlatform: 'tauri' },
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ appService: h.appService }),
}));

vi.mock('@/services/ai/xray/utils', () => ({
  hasXRayCredentials: () => true,
}));

vi.mock('@/services/ai/xray/XRayScheduler', () => ({
  XRayScheduler: class {
    schedule = h.schedule;
    dispose = h.dispose;
  },
}));

vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: (selector: (state: unknown) => unknown) =>
    selector({
      booksData: {
        bookA: { bookDoc: { metadata: { title: 'Book A' } } },
        bookB: { bookDoc: { metadata: { title: 'Book B' } } },
      },
    }),
}));

vi.mock('@/store/readerProgressStore', () => ({
  useBookProgress: (key: string) => (h.locations[key] ? { location: h.locations[key] } : null),
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: (selector: (state: unknown) => unknown) =>
    selector({ settings: { aiSettings: h.aiSettings } }),
}));

import { useXRayAutoUpdate } from '@/app/reader/hooks/useXRayAutoUpdate';
import { useNotebookStore } from '@/store/notebookStore';
import { useSidebarStore } from '@/store/sidebarStore';

const scheduledCfis = () =>
  h.schedule.mock.calls.map(([update]) => `${update.bookHash}:${update.currentCfi}`);

const openXRayPanel = (bookKey: string) =>
  act(() => {
    useSidebarStore.getState().setSideBarBookKey(bookKey);
    useNotebookStore.getState().setNotebookActiveTab('xray');
    useNotebookStore.getState().setNotebookVisible(true);
  });

describe('useXRayAutoUpdate', () => {
  beforeEach(() => {
    h.schedule.mockClear();
    h.dispose.mockClear();
    h.locations = { 'bookA-1': 'cfi-1', 'bookB-1': 'cfi-b1' };
    useNotebookStore.setState({ isNotebookVisible: false, notebookActiveTab: 'notes' });
    useSidebarStore.setState({ sideBarBookKey: 'bookA-1' });
  });

  afterEach(() => cleanup());

  test('schedules nothing on location changes while the X-Ray panel is closed', () => {
    const { rerender } = renderHook(() => useXRayAutoUpdate('bookA-1'));
    h.locations['bookA-1'] = 'cfi-2';
    rerender();
    h.locations['bookA-1'] = 'cfi-3';
    rerender();

    expect(scheduledCfis()).toEqual([]);
  });

  test('schedules nothing while the notebook is open on another tab', () => {
    const { rerender } = renderHook(() => useXRayAutoUpdate('bookA-1'));
    act(() => {
      useNotebookStore.getState().setNotebookActiveTab('notes');
      useNotebookStore.getState().setNotebookVisible(true);
    });
    h.locations['bookA-1'] = 'cfi-2';
    rerender();

    expect(scheduledCfis()).toEqual([]);
  });

  test('opening the X-Ray panel schedules one update for the current location', () => {
    const { rerender } = renderHook(() => useXRayAutoUpdate('bookA-1'));
    h.locations['bookA-1'] = 'cfi-2';
    rerender();

    openXRayPanel('bookA-1');

    expect(scheduledCfis()).toEqual(['bookA:cfi-2']);
  });

  test('location changes schedule updates while the X-Ray panel is open', () => {
    const { rerender } = renderHook(() => useXRayAutoUpdate('bookA-1'));
    openXRayPanel('bookA-1');
    h.locations['bookA-1'] = 'cfi-2';
    rerender();
    h.locations['bookA-1'] = 'cfi-3';
    rerender();

    expect(scheduledCfis()).toEqual(['bookA:cfi-1', 'bookA:cfi-2', 'bookA:cfi-3']);
  });

  test('closing the panel disposes its pending background update', () => {
    renderHook(() => useXRayAutoUpdate('bookA-1'));
    openXRayPanel('bookA-1');
    h.dispose.mockClear();

    act(() => useNotebookStore.getState().setNotebookVisible(false));

    expect(h.dispose).toHaveBeenCalledOnce();
  });

  test('in split view only the book shown in the X-Ray panel is updated', () => {
    const a = renderHook(() => useXRayAutoUpdate('bookA-1'));
    const b = renderHook(() => useXRayAutoUpdate('bookB-1'));
    openXRayPanel('bookB-1');
    h.locations['bookA-1'] = 'cfi-2';
    h.locations['bookB-1'] = 'cfi-b2';
    a.rerender();
    b.rerender();

    expect(scheduledCfis()).toEqual(['bookB:cfi-b1', 'bookB:cfi-b2']);
  });
});
