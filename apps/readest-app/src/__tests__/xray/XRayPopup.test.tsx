import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import XRayPopup from '@/app/reader/components/annotator/XRayPopup';
import { useBookDataStore, type BookData } from '@/store/bookDataStore';

const mocks = vi.hoisted(() => ({
  aiSettings: {
    enabled: true,
    provider: 'ollama',
    indexingMode: 'on-demand',
    reedy: { enabled: true },
  },
  appService: { appPlatform: 'tauri' },
  goTo: vi.fn(),
  getView: vi.fn(),
  getCFIProgress: vi.fn(),
  lookup: vi.fn(),
  translate: (value: string, options: Record<string, string | number> = {}) =>
    value.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => String(options[key] ?? key)),
}));

vi.mock('@/components/Popup', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ appService: mocks.appService }),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => mocks.translate,
}));

vi.mock('@/services/ai/xray/XRayService', () => ({
  getXRayService: () => Promise.resolve({ lookup: mocks.lookup }),
}));

vi.mock('@/store/readerStore', () => ({
  useReaderStore: (selector: (state: unknown) => unknown) => selector({ getView: mocks.getView }),
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: (selector: (state: unknown) => unknown) =>
    selector({
      settings: {
        aiSettings: mocks.aiSettings,
      },
    }),
}));

const popupPosition = { point: { x: 20, y: 20 }, dir: 'down' as const };

describe('XRayPopup', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getView.mockReturnValue({ goTo: mocks.goTo, getCFIProgress: mocks.getCFIProgress });
    mocks.getCFIProgress.mockResolvedValue({ location: { current: 7, total: 20 } });
    mocks.lookup.mockResolvedValue({
      term: 'Alice',
      summary: 'A curious girl who follows the White Rabbit.',
      source: 'entity',
      entity: {
        name: 'Alice',
        type: 'character',
        aliases: [],
        description: 'A curious girl.',
        facts: [],
        evidence: [],
      },
      evidence: [
        {
          unitId: 'unit-1',
          exactQuote: 'Alice was beginning to get very tired.',
          startCfi: 'epubcfi(/6/2!/4/2/1:0)',
          endCfi: 'epubcfi(/6/2!/4/2/1:40)',
          sectionIndex: 0,
          positionIndex: 0,
          confidence: 1,
          inferred: false,
        },
      ],
      maxPositionIndex: 3,
    });
  });

  it('loads a lookup bounded by the current CFI and opens exact evidence', async () => {
    const onDismiss = vi.fn();
    render(
      <XRayPopup
        term='Alice'
        bookKey='booka-view'
        currentCfi='epubcfi(/6/4!/4/2/1:20)'
        language='en'
        position={popupPosition}
        trianglePosition={popupPosition}
        popupWidth={360}
        popupHeight={260}
        onDismiss={onDismiss}
      />,
    );

    expect(await screen.findByText('A curious girl who follows the White Rabbit.')).toBeTruthy();
    expect(mocks.lookup).toHaveBeenCalledWith('booka', 'epubcfi(/6/4!/4/2/1:20)', 'Alice', 'en');

    expect(await screen.findByText('Page 8')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Jump to quote' }));

    expect(mocks.goTo).toHaveBeenCalledWith('epubcfi(/6/2!/4/2/1:0)');
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('bounds the lookup by the furthest position read, not the page shown', async () => {
    useBookDataStore.setState({
      booksData: {
        booka: {
          id: 'booka',
          config: { updatedAt: 0, xrayReadThroughCfi: 'epubcfi(/6/8!/4/2/1:0)' },
        } as BookData,
      },
    });
    render(
      <XRayPopup
        term='Alice'
        bookKey='booka-view'
        currentCfi='epubcfi(/6/4!/4/2/1:20)'
        language='en'
        position={popupPosition}
        trianglePosition={popupPosition}
        popupWidth={360}
        popupHeight={260}
      />,
    );

    await waitFor(() =>
      expect(mocks.lookup).toHaveBeenCalledWith('booka', 'epubcfi(/6/8!/4/2/1:0)', 'Alice', 'en'),
    );
    useBookDataStore.setState({ booksData: {} });
  });

  it.each([
    { progress: null, fixed: false, label: 'Position 1' },
    {
      progress: { location: { current: 7, total: 20 }, section: { current: 3, total: 10 } },
      fixed: true,
      label: 'Page 4',
    },
    { progress: { location: { current: 20, total: 20 } }, fixed: false, label: 'Page 20' },
  ])('shows $label from the available reader progress', async ({ progress, fixed, label }) => {
    mocks.getCFIProgress.mockResolvedValue(progress);
    mocks.getView.mockReturnValue({
      goTo: mocks.goTo,
      getCFIProgress: mocks.getCFIProgress,
      isFixedLayout: fixed,
    });
    render(
      <XRayPopup
        term='Alice'
        bookKey='booka-view'
        currentCfi='epubcfi(/6/4!/4/2/1:20)'
        language='en'
        position={popupPosition}
        trianglePosition={popupPosition}
        popupWidth={360}
        popupHeight={260}
      />,
    );
    expect(await screen.findByText(label)).toBeTruthy();
  });

  it('shows an empty bounded result without inventing details', async () => {
    mocks.lookup.mockResolvedValue({
      term: 'Dinah',
      summary: '',
      evidence: [],
      source: 'none',
      maxPositionIndex: 3,
    });

    render(
      <XRayPopup
        term='Dinah'
        bookKey='booka-view'
        currentCfi='epubcfi(/6/4!/4/2/1:20)'
        language='en'
        position={popupPosition}
        trianglePosition={popupPosition}
        popupWidth={360}
        popupHeight={260}
      />,
    );

    expect(
      await screen.findByText('No X-Ray match found up to your current location.'),
    ).toBeTruthy();
    expect(mocks.lookup).toHaveBeenCalledOnce();
  });
});
