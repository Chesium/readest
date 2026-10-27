import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as CFI from 'foliate-js/epubcfi.js';
import { navigateToXRayEvidence } from '@/app/reader/utils/xrayEvidenceNavigation';
import type { XRayDirectEvidenceLocator } from '@/services/ai/xray/types';
import type { FoliateView } from '@/types/view';

const mocks = vi.hoisted(() => ({ showTransientHighlight: vi.fn() }));
vi.mock('@/app/reader/utils/transientHighlight', () => ({
  showTransientHighlight: mocks.showTransientHighlight,
}));

const evidence: XRayDirectEvidenceLocator = {
  unitId: 'unit-1',
  exactQuote: 'Alice found the brass key',
  startCfi: 'epubcfi(/6/2!/4/2/1:0)',
  endCfi: 'epubcfi(/6/2!/4/2/3:18)',
  sectionIndex: 0,
  positionIndex: 0,
  inferred: false,
  confidence: 1,
};

const viewOf = (html: string) => {
  const doc = document.implementation.createHTMLDocument();
  doc.body.innerHTML = html;
  const ranges = new Map<string, string>();
  const getCFI = (_index: number, range: Range) => {
    const cfi = CFI.joinIndir('epubcfi(/6/2)', CFI.fromRange(range));
    ranges.set(cfi, range.toString());
    return cfi;
  };
  const goTo = vi.fn();
  const view = {
    book: { sections: [{ createDocument: async () => doc }] },
    goTo,
    getCFI,
  } as unknown as FoliateView;
  return { view, goTo, ranges };
};

describe('X-Ray evidence navigation', () => {
  beforeEach(() => mocks.showTransientHighlight.mockClear());

  it('goes to the quote inside the chunk instead of the chunk start, and highlights it', async () => {
    const { view, goTo, ranges } = viewOf(
      '<p>Before the quote. Alice found the <em>brass key</em>. After the quote.</p>',
    );

    await navigateToXRayEvidence(view, evidence);

    expect(goTo).toHaveBeenCalledOnce();
    const target = goTo.mock.calls[0]![0] as string;
    expect(target).not.toBe(evidence.startCfi);
    expect(ranges.get(target)).toBe(evidence.exactQuote);
    expect(mocks.showTransientHighlight).toHaveBeenCalledWith(view, target);
  });

  it('skips the same words earlier in the section, before the chunk', async () => {
    const { view, goTo, ranges } = viewOf(
      '<p>Alice found the brass key early.</p><p>Later, Alice found the brass key again.</p>',
    );

    await navigateToXRayEvidence(view, {
      ...evidence,
      startCfi: 'epubcfi(/6/2!/4/4/1:0)',
      endCfi: 'epubcfi(/6/2!/4/4/1:39)',
    });

    const target = goTo.mock.calls[0]![0] as string;
    expect(ranges.get(target)).toBe(evidence.exactQuote);
    expect(target.startsWith('epubcfi(/6/2!/4/4')).toBe(true);
  });

  it('keeps the chunk start when the quote cannot be found', async () => {
    const { view, goTo } = viewOf('<p>The source changed.</p>');
    await navigateToXRayEvidence(view, evidence);
    expect(goTo).toHaveBeenCalledWith(evidence.startCfi);
    expect(mocks.showTransientHighlight).not.toHaveBeenCalled();
  });

  it('does not navigate inferred evidence', async () => {
    const goTo = vi.fn();
    await navigateToXRayEvidence({ goTo } as unknown as FoliateView, {
      ...evidence,
      startCfi: null,
      endCfi: null,
      inferred: true,
    });
    expect(goTo).not.toHaveBeenCalled();
  });
});
