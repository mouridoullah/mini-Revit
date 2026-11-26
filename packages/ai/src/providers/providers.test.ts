import { describe, it, expect, vi } from 'vitest';
import {
  OpenAiCompatibleProvider,
  GeminiProvider,
  ProviderError,
  createFullCopilotRegistry,
  type AiFetchFn,
  type AiFetchResponse,
} from '../index.js';
import { createPhase1ReadRegistry } from '../tools/readTools.js';

function makeJsonResponse(status: number, body: unknown): AiFetchResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    async json() {
      return body;
    },
    async text() {
      return typeof body === 'string' ? body : JSON.stringify(body);
    },
  };
}

describe('Providers LLM natifs sans backend (ADR-073 Lot 1)', () => {
  describe('OpenAiCompatibleProvider', () => {
    it('normalise tool_call.function.arguments reçu en string JSON ou en object déjà parsé', async () => {
      const fetchMock = vi.fn<AiFetchFn>().mockResolvedValue(
        makeJsonResponse(200, {
          choices: [
            {
              finish_reason: 'tool_calls',
              message: {
                content: '',
                tool_calls: [
                  {
                    id: 'tc_str',
                    type: 'function',
                    function: {
                      name: 'get_level_details',
                      arguments: '{"levelId":"level_r0","categories":["walls"]}',
                    },
                  },
                  {
                    id: 'tc_obj',
                    type: 'function',
                    function: {
                      name: 'get_clashes_summary',
                      arguments: { severity: 'hard', limit: 10 },
                    },
                  },
                ],
              },
            },
          ],
          usage: { prompt_tokens: 120, completion_tokens: 35 },
        }),
      );

      const provider = new OpenAiCompatibleProvider({
        endpoint: 'http://localhost:11434/v1/',
        model: 'qwen2.5-coder:14b',
        fetch: fetchMock,
      });

      const tools = createPhase1ReadRegistry().list('read');
      const res = await provider.chat({
        messages: [
          { role: 'system', content: 'Tu es un copilote BIM.' },
          { role: 'user', content: 'Analyse le RDC.' },
        ],
        tools,
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe('http://localhost:11434/v1/chat/completions');
      expect(init?.headers?.Authorization).toBeUndefined();

      expect(res.toolCalls).toEqual([
        {
          id: 'tc_str',
          name: 'get_level_details',
          arguments: { levelId: 'level_r0', categories: ['walls'] },
        },
        {
          id: 'tc_obj',
          name: 'get_clashes_summary',
          arguments: { severity: 'hard', limit: 10 },
        },
      ]);
      expect(res.usage).toEqual({ promptTokens: 120, completionTokens: 35 });
    });

    it('rejette proprement un JSON d’arguments malformé', async () => {
      const fetchMock = vi.fn<AiFetchFn>().mockResolvedValue(
        makeJsonResponse(200, {
          choices: [
            {
              message: {
                content: '',
                tool_calls: [
                  {
                    id: 'tc_bad',
                    function: { name: 'get_level_details', arguments: '{bad_json' },
                  },
                ],
              },
            },
          ],
        }),
      );

      const provider = new OpenAiCompatibleProvider({
        endpoint: 'http://localhost:11434/v1',
        model: 'llama3.1:8b',
        fetch: fetchMock,
      });

      await expect(
        provider.chat({ messages: [{ role: 'user', content: 'Test' }] }),
      ).rejects.toMatchObject({ code: 'INVALID_TOOL_ARGUMENTS' });
    });

    it('propage AbortSignal avant et pendant l’appel fetch', async () => {
      const controller = new AbortController();
      controller.abort();

      const fetchMock = vi.fn<AiFetchFn>();
      const provider = new OpenAiCompatibleProvider({
        endpoint: 'http://localhost:11434/v1',
        model: 'qwen2.5-coder:14b',
        fetch: fetchMock,
      });

      await expect(
        provider.chat({
          messages: [{ role: 'user', content: 'Test' }],
          signal: controller.signal,
        }),
      ).rejects.toMatchObject({ code: 'ABORTED' });
      expect(fetchMock).not.toHaveBeenCalled();

      // Annulation déclenchée pendant fetch
      const abortErr = new Error('The operation was aborted');
      abortErr.name = 'AbortError';
      const fetchAbort = vi.fn<AiFetchFn>().mockRejectedValue(abortErr);
      const provider2 = new OpenAiCompatibleProvider({
        endpoint: 'http://localhost:11434/v1',
        model: 'qwen2.5-coder:14b',
        fetch: fetchAbort,
      });
      await expect(
        provider2.chat({ messages: [{ role: 'user', content: 'Test' }] }),
      ).rejects.toBeInstanceOf(ProviderError);
    });

    it('diagnostique ok, model_not_found, unauthorized, cors_or_mixed_content et unreachable via testConnection()', async () => {
      const okProvider = new OpenAiCompatibleProvider({
        endpoint: 'http://localhost:11434/v1',
        model: 'qwen2.5-coder:14b',
        fetch: vi.fn<AiFetchFn>().mockResolvedValue(
          makeJsonResponse(200, { data: [{ id: 'qwen2.5-coder:14b' }] }),
        ),
      });
      expect((await okProvider.testConnection()).status).toBe('ok');

      const missingModelProvider = new OpenAiCompatibleProvider({
        endpoint: 'http://localhost:11434/v1',
        model: 'modele-absent',
        fetch: vi.fn<AiFetchFn>().mockResolvedValue(
          makeJsonResponse(200, { data: [{ id: 'qwen2.5-coder:7b' }, { id: 'llama3.1:latest' }] }),
        ),
      });
      const missingDiag = await missingModelProvider.testConnection();
      expect(missingDiag.status).toBe('model_not_found');
      expect(missingDiag.availableModels).toEqual(['qwen2.5-coder:7b', 'llama3.1:latest']);

      const unauthProvider = new OpenAiCompatibleProvider({
        endpoint: 'https://api.openai.com/v1',
        model: 'gpt-4o',
        apiKey: 'sk-bad',
        fetch: vi.fn<AiFetchFn>().mockResolvedValue(makeJsonResponse(401, { error: 'Unauthorized' })),
      });
      expect((await unauthProvider.testConnection()).status).toBe('unauthorized');

      const corsHttpsProvider = new OpenAiCompatibleProvider({
        endpoint: 'http://localhost:11434/v1',
        model: 'qwen2.5-coder:14b',
        clientOriginProtocol: 'https:',
        fetch: vi.fn<AiFetchFn>().mockRejectedValue(new TypeError('Failed to fetch')),
      });
      const corsDiag = await corsHttpsProvider.testConnection();
      expect(corsDiag.status).toBe('cors_or_mixed_content');
      expect(corsDiag.hint).toContain('OLLAMA_ORIGINS');

      // Vérifie que chat() remonte aussi le guidage CORS / Mixed Content sur NETWORK_ERROR
      await expect(
        corsHttpsProvider.chat({ messages: [{ role: 'user', content: 'Test' }] }),
      ).rejects.toMatchObject({
        code: 'NETWORK_ERROR',
        message: expect.stringContaining('OLLAMA_ORIGINS'),
      });

      const offlineProvider = new OpenAiCompatibleProvider({
        endpoint: 'http://localhost:11434/v1',
        model: 'qwen2.5-coder:14b',
        clientOriginProtocol: 'http:',
        fetch: vi.fn<AiFetchFn>().mockRejectedValue(new TypeError('ECONNREFUSED')),
      });
      expect((await offlineProvider.testConnection()).status).toBe('unreachable');
    });

    it('lie globalThis.fetch sans Illegal invocation lors de testConnection() (v1.2.1)', async () => {
      const originalFetch = globalThis.fetch;
      const strictBrowserLikeFetch = function (this: unknown): Promise<Response> {
        if (this !== globalThis) {
          throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
        }
        return Promise.resolve(
          makeJsonResponse(200, { data: [{ id: 'qwen2.5-coder:7b' }] }) as unknown as Response,
        );
      };
      globalThis.fetch = strictBrowserLikeFetch as unknown as typeof globalThis.fetch;

      try {
        const provider = new OpenAiCompatibleProvider({
          endpoint: 'http://localhost:11434/v1',
          model: 'qwen2.5-coder:7b',
        });
        const diag = await provider.testConnection();
        expect(diag.status).toBe('ok');
        expect(diag.availableModels).toEqual(['qwen2.5-coder:7b']);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('extrait en repli les appels d’outils JSON bruts émis dans message.content par Ollama (v1.2.1)', async () => {
      const fetchMock = vi.fn<AiFetchFn>().mockResolvedValue(
        makeJsonResponse(200, {
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content:
                  'Je lance ces opérations :\n' +
                  '{"name": "add_wall", "arguments": {"levelId": "lvl_0", "startXMm": 0, "startYMm": 0, "endXMm": 4000, "endYMm": 0}}\n' +
                  '<tool_call>\n{"name": "auto_dimension_level", "arguments": {"levelId": "lvl_0"}}\n</tool_call>\n' +
                  '{"name": "outil_inconnu", "arguments": {"x": 1}}',
              },
            },
          ],
        }),
      );

      const provider = new OpenAiCompatibleProvider({
        endpoint: 'http://localhost:11434/v1',
        model: 'qwen2.5-coder:7b',
        fetch: fetchMock,
      });

      const tools = createFullCopilotRegistry().list();
      const res = await provider.chat({
        messages: [{ role: 'user', content: 'Crée un mur de 4 m et cote.' }],
        tools,
      });

      expect(res.toolCalls).toHaveLength(2);
      expect(res.toolCalls[0]).toMatchObject({
        name: 'add_wall',
        arguments: { levelId: 'lvl_0', startXMm: 0, startYMm: 0, endXMm: 4000, endYMm: 0 },
      });
      expect(res.toolCalls[1]).toMatchObject({
        name: 'auto_dimension_level',
        arguments: { levelId: 'lvl_0' },
      });
      expect(res.text).toContain('Je lance ces opérations');
      expect(res.text).toContain('outil_inconnu');
    });
  });

  describe('GeminiProvider', () => {
    it('transmet la clé API via x-goog-api-key (sans ?key=) et parse texte + functionCall combinés', async () => {
      const fetchMock = vi.fn<AiFetchFn>().mockResolvedValue(
        makeJsonResponse(200, {
          candidates: [
            {
              finishReason: 'STOP',
              content: {
                role: 'model',
                parts: [
                  { text: 'Je vérifie d’abord les conflits du modèle.' },
                  {
                    functionCall: {
                      name: 'get_clashes_summary',
                      args: { severity: 'hard', limit: 5 },
                    },
                  },
                ],
              },
            },
          ],
          usageMetadata: { promptTokenCount: 200, candidatesTokenCount: 42 },
        }),
      );

      const provider = new GeminiProvider({
        apiKey: 'AIza-secret-test-key',
        model: 'gemini-2.0-flash',
        fetch: fetchMock,
      });

      const tools = createPhase1ReadRegistry().list('read');
      const res = await provider.chat({
        messages: [
          { role: 'system', content: 'Système BIM.' },
          { role: 'user', content: 'Liste les conflits.' },
          {
            role: 'assistant',
            content: '',
            toolCalls: [{ id: 'c0', name: 'get_project_summary', arguments: {} }],
          },
          {
            role: 'tool',
            toolCallId: 'c0',
            name: 'get_project_summary',
            content: '{"ok":true}',
          },
        ],
        tools,
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
      );
      expect(url).not.toContain('key=');
      expect(init?.headers?.['x-goog-api-key']).toBe('AIza-secret-test-key');

      expect(res.text).toBe('Je vérifie d’abord les conflits du modèle.');
      expect(res.toolCalls).toEqual([
        {
          id: 'gemini_call_0',
          name: 'get_clashes_summary',
          arguments: { severity: 'hard', limit: 5 },
        },
      ]);
      expect(res.usage).toEqual({ promptTokens: 200, completionTokens: 42 });
    });

    it('diagnostique testConnection() via en-tête x-goog-api-key et gère AbortSignal', async () => {
      const okFetch = vi.fn<AiFetchFn>().mockResolvedValue(makeJsonResponse(200, { name: 'models/gemini-2.0-flash' }));
      const provider = new GeminiProvider({
        apiKey: 'secret-key',
        model: 'gemini-2.0-flash',
        fetch: okFetch,
      });

      const diag = await provider.testConnection();
      expect(diag.status).toBe('ok');
      const [url, init] = okFetch.mock.calls[0]!;
      expect(url).not.toContain('secret-key');
      expect(init?.headers?.['x-goog-api-key']).toBe('secret-key');

      const controller = new AbortController();
      controller.abort();
      await expect(provider.testConnection({ signal: controller.signal })).rejects.toMatchObject({
        code: 'ABORTED',
      });
    });
  });
});
