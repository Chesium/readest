import { useBookDataStore } from '@/store/bookDataStore';
import { useBookProgress } from '@/store/readerProgressStore';
import { laterCfi } from '@/utils/cfi';

/**
 * X-Ray's spoiler bound for a book view: the furthest location read, not the
 * page shown, so browsing back keeps what was read. Empty until a page shows.
 */
export const useXRayReadThroughCfi = (bookKey: string): string => {
  const location = useBookProgress(bookKey)?.location;
  const readThrough = useBookDataStore(
    (state) => state.booksData[bookKey.split('-')[0] ?? '']?.config?.xrayReadThroughCfi,
  );
  return location ? (laterCfi(readThrough, location) ?? location) : '';
};
