/**
 * @vitest-environment node
 */
// Node's environment, not jsdom: it has the real Web Locks API that tells a
// live index run (in any window) from a row a killed run left behind.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { migrate } from '@/services/database/migrate';
import { getMigrations } from '@/services/database/migrations';
import { NodeDatabaseService } from '@/services/database/nodeDatabaseService';
import { ReedyBackend } from '@/services/ai/adapters/ReedyBackend';
import { DEFAULT_AI_SETTINGS } from '@/services/ai/constants';
import { ReedyXRaySource } from '@/services/ai/xray/source/ReedyXRaySource';
import { ReedyDb } from '@/services/reedy/db/ReedyDb';
import type { EmbeddingModel } from '@/services/reedy/models/EmbeddingModel';
import { BookIndexer } from '@/services/reedy/retrieval/BookIndexer';
import type { BookDoc } from '@/libs/document';
import type { DatabaseService } from '@/types/database';
import type { AppService } from '@/types/system';

vi.mock('@/services/ai/providers', () => ({
  getAIProvider: () => ({ getEmbeddingModel: () => ({}) }),
}));

const BOOK_HASH = 'book-a';
const MODEL_ID = 'embedding-a';

const model: EmbeddingModel = {
  id: MODEL_ID,
  dim: 2,
  embed: async (texts) => texts.map(() => [1, 0]),
};

// One section whose document load waits on `gate`, then fails, so the run
// ends at empty_index without needing a DOM.
const blockedBook = (gate: Promise<void>): BookDoc =>
  ({
    sections: [
      {
        id: 's1',
        cfi: '',
        size: 1,
        linear: 'yes',
        createDocument: async () => {
          await gate;
          throw new Error('no document');
        },
      },
    ],
  }) as unknown as BookDoc;

describe('an indexing row with no live run', () => {
  let db: DatabaseService;
  let reedy: ReedyDb;

  beforeEach(async () => {
    db = await NodeDatabaseService.open(':memory:', { experimental: ['index_method'] });
    await migrate(db, getMigrations('reedy'));
    reedy = new ReedyDb(db);
  });

  afterEach(async () => {
    await db.close();
  });

  it('reads as not indexed in both the AI tab and X-Ray, and can be re-indexed', async () => {
    // What a killed run leaves behind.
    await reedy.upsertBookMeta({
      bookHash: BOOK_HASH,
      indexingStatus: 'indexing',
      chunkCount: 0,
      embeddingModel: MODEL_ID,
      embeddingDim: 2,
      indexedAt: null,
      error: null,
    });

    const backend = new ReedyBackend({ openDatabase: async () => db } as unknown as AppService, {
      ...DEFAULT_AI_SETTINGS,
      enabled: true,
      provider: 'openrouter',
      openrouterApiKey: 'k',
    });
    const source = new ReedyXRaySource(db, reedy, MODEL_ID);

    expect(await backend.isIndexed(BOOK_HASH)).toBe(false);
    expect(await source.getStatus(BOOK_HASH)).toEqual({ kind: 'not_indexed' });

    await new BookIndexer(reedy).indexBook(blockedBook(Promise.resolve()), BOOK_HASH, model);
    expect(await source.getStatus(BOOK_HASH)).toMatchObject({ kind: 'empty_index' });
  });

  it('still reads as indexing while a run is live, from a source that shares nothing with it', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const run = new BookIndexer(reedy).indexBook(blockedBook(gate), BOOK_HASH, model);
    const source = new ReedyXRaySource(db, reedy, MODEL_ID);

    await expect
      .poll(() => reedy.getBookMeta(BOOK_HASH))
      .toMatchObject({
        indexingStatus: 'indexing',
      });
    expect(await source.getStatus(BOOK_HASH)).toEqual({ kind: 'indexing' });

    release();
    await run;
    expect(await source.getStatus(BOOK_HASH)).toMatchObject({ kind: 'empty_index' });
  });
});
