'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import type { XRayEvidenceLocator } from '@/services/ai/xray/types';
import { useReaderStore } from '@/store/readerStore';

// Resolve pages from the open reader: chunk indexes are only spoiler bounds,
// and page numbers can depend on the book's layout rather than its chunks.
export default function XRayEvidenceLabel({
  bookKey,
  evidence,
}: {
  bookKey: string;
  evidence: XRayEvidenceLocator;
}) {
  const _ = useTranslation();
  const view = useReaderStore((state) => state.getView(bookKey));
  const [page, setPage] = useState<number>();

  useEffect(() => {
    let cancelled = false;
    setPage(undefined);
    if (evidence.displayPage === undefined && evidence.startCfi && view) {
      void view
        .getCFIProgress(evidence.startCfi)
        .then((progress) => {
          if (cancelled || !progress) return;
          const location = view.isFixedLayout ? progress.section : progress.location;
          if (location.total > 0 && location.current >= 0) {
            setPage(Math.min(location.current + 1, location.total));
          }
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [evidence.displayPage, evidence.startCfi, view]);

  const displayPage = evidence.displayPage ?? page;
  return displayPage === undefined
    ? _('Position {{position}}', { position: evidence.positionIndex + 1 })
    : _('Page {{page}}', { page: displayPage });
}
