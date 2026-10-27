import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_AI_SETTINGS } from '@/services/ai/constants';
import type { ReedyXRaySource } from '@/services/ai/xray/source/ReedyXRaySource';
import type { XRayStore } from '@/services/ai/xray/storage/XRayStore';
import type { XRayModelExtractor } from '@/services/ai/xray/XRayModelExtractor';
import { XRayPipeline } from '@/services/ai/xray/XRayPipeline';
import { XRayService } from '@/services/ai/xray/XRayService';
import type { AppService } from '@/types/system';

const enabledSettings = {
  ...DEFAULT_AI_SETTINGS,
  enabled: true,
  reedy: { enabled: true },
};

describe('XRayService', () => {
  it('rejects non-Tauri callers before opening a database', async () => {
    const openDatabase = vi.fn();
    const appService = {
      appPlatform: 'web',
      openDatabase,
    } as unknown as AppService;

    await expect(XRayService.open(appService, enabledSettings)).rejects.toThrow(
      'X-Ray is only available in the Tauri app',
    );
    expect(openDatabase).not.toHaveBeenCalled();
  });

  it.each([
    ['AI', { ...enabledSettings, enabled: false }],
    ['Reedy', { ...enabledSettings, reedy: { enabled: false } }],
  ])('rejects when %s is disabled before opening a database', async (_feature, settings) => {
    const openDatabase = vi.fn().mockRejectedValue(new Error('database opened'));
    const appService = {
      appPlatform: 'tauri',
      databaseExists: vi.fn().mockResolvedValue(false),
      openDatabase,
    } as unknown as AppService;

    await expect(XRayService.open(appService, settings)).rejects.toThrow(
      'X-Ray requires AI and Reedy to be enabled',
    );
    expect(openDatabase).not.toHaveBeenCalled();
  });

  it('forwards update progress to the caller', async () => {
    const update = vi
      .spyOn(XRayPipeline.prototype, 'update')
      .mockImplementation(async (_bookHash, _cfi, options = {}) => {
        options.onProgress?.(0, 4);
        options.onProgress?.(2, 4);
        return { kind: 'updated', batchCount: 1, unitCount: 2, maxPositionIndex: 1 };
      });
    const source = {
      getStatus: vi.fn().mockResolvedValue({ kind: 'ready' }),
    } as unknown as ReedyXRaySource;
    const service = Reflect.construct(
      XRayService as unknown as new (
        ...args: unknown[]
      ) => XRayService,
      [source, {} as XRayStore, {} as XRayModelExtractor, 'model'],
    );
    const onProgress = vi.fn();

    await service.updateForProgress({ bookHash: 'book-a', currentCfi: 'cfi', onProgress });

    expect(onProgress.mock.calls).toEqual([
      [0, 4],
      [2, 4],
    ]);
    update.mockRestore();
  });
});
