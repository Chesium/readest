// A Web Lock held for the whole of a book's index run. Every window of the
// app shares the lock manager, and a lock is released when the window that
// holds it closes or the app dies, so a held lock means a live run somewhere.
const lockName = (bookHash: string): string => `readest-reedy-index:${bookHash}`;

export const withIndexRunLock = <T>(bookHash: string, task: () => Promise<T>): Promise<T> => {
  const locks = globalThis.navigator?.locks;
  if (!locks) return task();
  return locks.request(lockName(bookHash), task);
};

/** Whether any window is running an index of this book. True when it can't be told. */
export const isIndexRunLive = async (bookHash: string): Promise<boolean> => {
  const locks = globalThis.navigator?.locks;
  if (!locks) return true;
  const { held = [] } = await locks.query();
  return held.some((lock) => lock.name === lockName(bookHash));
};
