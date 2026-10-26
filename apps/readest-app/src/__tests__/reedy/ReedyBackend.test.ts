import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BookDoc } from '@/libs/document';
import type { EmbeddingModel } from '@/services/reedy/models/EmbeddingModel';
import type { AppService } from '@/types/system';
import { DEFAULT_AI_SETTINGS } from '@/services/ai/constants';
import type { AISettings } from '@/services/ai/types';

const { embedMock, embedManyMock, dimsSeenByIndexer } = vi.hoisted(() => ({
  embedMock: vi.fn(),
  embedManyMock: vi.fn(),
  dimsSeenByIndexer: [] as number[],
}));

vi.mock('ai', () => ({ embed: embedMock, embedMany: embedManyMock }));

vi.mock('@/services/ai/providers', () => ({
  getAIProvider: () => ({ getEmbeddingModel: () => ({}) }),
}));

vi.mock('@/services/reedy/db/ReedyDb', () => ({
  ReedyDb: class {
    async getBookMeta() {
      return { chunkCount: 1 };
    }
  },
}));

// Like the real BookIndexer.runIndex, read `model.dim` (for the meta row)
// before any text has been embedded.
vi.mock('@/services/reedy/retrieval/BookIndexer', () => ({
  BookIndexer: class {
    async indexBook(_doc: BookDoc, _hash: string, model: EmbeddingModel) {
      dimsSeenByIndexer.push(model.dim);
      await model.embed(['chunk one', 'chunk two']);
    }
  },
}));

vi.mock('@/services/reedy/retrieval/BookRetriever', () => ({ BookRetriever: class {} }));

vi.mock('@/services/reedy/instrumentation', () => {
  class Metrics {
    log() {}
  }
  return { NoopReedyMetrics: Metrics, ReedyMetrics: Metrics };
});

import { ReedyBackend } from '@/services/ai/adapters/ReedyBackend';

const settings: AISettings = {
  ...DEFAULT_AI_SETTINGS,
  enabled: true,
  provider: 'openrouter',
  openrouterApiKey: 'test-key',
  reedy: { enabled: true },
};

const appService = { openDatabase: vi.fn(async () => ({})) } as unknown as AppService;

describe('ReedyBackend.indexBook', () => {
  beforeEach(() => {
    dimsSeenByIndexer.length = 0;
    embedMock.mockReset().mockResolvedValue({ embedding: [0.1, 0.2, 0.3] });
    embedManyMock.mockReset().mockResolvedValue({
      embeddings: [
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6],
      ],
    });
  });

  it('knows the embedding dim before the indexer reads it on a fresh backend', async () => {
    const backend = new ReedyBackend(appService, settings);

    await backend.indexBook({} as BookDoc, 'hash-1');

    expect(dimsSeenByIndexer).toEqual([3]);
  });

  it('probes the dim only once across indexing runs', async () => {
    const backend = new ReedyBackend(appService, settings);

    await backend.indexBook({} as BookDoc, 'hash-1');
    await backend.indexBook({} as BookDoc, 'hash-2');

    expect(embedMock).toHaveBeenCalledTimes(1);
    expect(dimsSeenByIndexer).toEqual([3, 3]);
  });
});
