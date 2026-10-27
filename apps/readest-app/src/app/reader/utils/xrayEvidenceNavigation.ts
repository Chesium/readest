import * as CFI from 'foliate-js/epubcfi.js';
import type { XRayEvidenceLocator } from '@/services/ai/xray/types';
import type { FoliateView } from '@/types/view';
import { showTransientHighlight } from './transientHighlight';

/**
 * Go to an evidence quote. Evidence carries only its chunk's CFIs, so the quote
 * is found in the section's text, between the chunk's start and end; when it
 * can't be found (the book changed), the chunk start is the fallback.
 */
export const navigateToXRayEvidence = async (
  view: FoliateView | null,
  evidence: XRayEvidenceLocator,
): Promise<void> => {
  if (!view || evidence.inferred || !evidence.startCfi) return;
  let target: string | null = null;
  const section = view.book?.sections[evidence.sectionIndex];
  if (section?.createDocument) {
    const doc = await section.createDocument();
    const { searchMatcher } = await import('foliate-js/search.js');
    const { textWalker } = await import('foliate-js/text-walker.js');
    const matches = searchMatcher(textWalker, {
      mode: 'contains',
      matchCase: true,
      matchDiacritics: true,
    })(doc, evidence.exactQuote);
    for (const { range } of matches) {
      const cfi = view.getCFI(evidence.sectionIndex, range);
      if (CFI.compare(CFI.collapse(cfi), evidence.startCfi) < 0) continue;
      if (evidence.endCfi && CFI.compare(CFI.collapse(cfi, true), evidence.endCfi) > 0) break;
      target = cfi;
      break;
    }
  }
  view.goTo(target ?? evidence.startCfi);
  if (target) void showTransientHighlight(view, target);
};
