import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_AI_SETTINGS } from '@/services/ai/constants';
import { OpenRouterProvider } from '@/services/ai/providers/OpenRouterProvider';
import { XRayModelExtractor } from '@/services/ai/xray/XRayModelExtractor';

const mockFetch = vi.fn();

vi.mock('@/services/ai/utils/httpFetch', () => ({
  getAIFetch: () => mockFetch,
}));

const extraction = {
  entities: [
    {
      name: 'Wu Cuiyuan',
      type: 'character',
      evidence: [{ unitId: 'u1', exactQuote: 'Wu Cuiyuan sat on the tram.' }],
    },
  ],
  relationships: [],
  events: [],
  claims: [],
};

describe('XRayModelExtractor with OpenRouterProvider', () => {
  it('sends the X-Ray schema as a json_schema response format', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'chatcmpl-1',
          object: 'chat.completion',
          created: 0,
          model: 'openai/gpt-6-luna',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: JSON.stringify(extraction) },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const provider = new OpenRouterProvider({
      ...DEFAULT_AI_SETTINGS,
      enabled: true,
      provider: 'openrouter',
      openrouterApiKey: 'test-key',
      openrouterModel: 'openai/gpt-6-luna',
    });
    const extractor = new XRayModelExtractor({
      id: 'openai/gpt-6-luna',
      contextWindow: 128000,
      reservedOutput: 1024,
      supportsTools: true,
      getLanguageModel: () => provider.getModel(),
    });

    const result = await extractor.extract({
      units: [
        {
          unitId: 'u1',
          startCfi: 'epubcfi(/6/2!/4/2,/1:0,/1:27)',
          endCfi: 'epubcfi(/6/2!/4/2,/1:27,/1:27)',
          sectionIndex: 0,
          positionIndex: 0,
          text: 'Wu Cuiyuan sat on the tram.',
        },
      ],
      genre: { genre: 'fiction', hints: [], extractionFocus: ['characters'] },
    });

    const body = JSON.parse(mockFetch.mock.calls[0]![1].body as string);
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.name).toBe('xray_extraction');
    // OpenAI rejects strict mode for a schema with optional properties.
    expect(body.response_format.json_schema.strict).toBe(false);
    expect(Object.keys(body.response_format.json_schema.schema.properties)).toEqual(
      expect.arrayContaining(['entities', 'relationships', 'events', 'claims']),
    );
    expect(result.entities[0]!.name).toBe('Wu Cuiyuan');
  });
});
