import {
  classifyHttpDiagnostic,
  classifyNetworkDiagnostic,
  executeJsonPost,
  isAbortError,
  readResponseErrorDetail,
  resolveFetch,
} from './diagnostics.js';
import {
  ProviderError,
  type AiFetchFn,
  type ConnectionDiagnostic,
  type LlmChatRequest,
  type LlmChatResponse,
  type LlmProvider,
  type LlmToolCall,
  type TestConnectionOptions,
} from './types.js';

export const DEFAULT_GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

export interface GeminiProviderOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly baseUrl?: string | undefined;
  readonly fetch?: AiFetchFn | undefined;
}

/**
 * Adaptateur fetch natif pour l'API REST Google Gemini (clé BYOK transmise via en-tête x-goog-api-key).
 */
export class GeminiProvider implements LlmProvider {
  public readonly id = 'gemini';
  public readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchFn: AiFetchFn;

  public constructor(options: GeminiProviderOptions) {
    this.apiKey = options.apiKey.trim();
    this.model = options.model.trim();
    this.baseUrl = (options.baseUrl ?? DEFAULT_GEMINI_BASE_URL).trim().replace(/\/+$/, '');
    this.fetchFn = resolveFetch(options.fetch);
  }

  private buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-goog-api-key': this.apiKey,
    };
  }

  public async chat(request: LlmChatRequest): Promise<LlmChatResponse> {
    const systemTexts: string[] = [];
    const contents: Record<string, unknown>[] = [];

    for (const msg of request.messages) {
      if (msg.role === 'system') {
        if (msg.content.trim().length > 0) {
          systemTexts.push(msg.content);
        }
        continue;
      }

      if (msg.role === 'user') {
        contents.push({
          role: 'user',
          parts: [{ text: msg.content }],
        });
        continue;
      }

      if (msg.role === 'assistant') {
        const parts: Record<string, unknown>[] = [];
        if (msg.content.length > 0) {
          parts.push({ text: msg.content });
        }
        if (msg.toolCalls) {
          for (const tc of msg.toolCalls) {
            parts.push({
              functionCall: {
                name: tc.name,
                args: tc.arguments,
              },
            });
          }
        }
        if (parts.length > 0) {
          contents.push({ role: 'model', parts });
        }
        continue;
      }

      if (msg.role === 'tool') {
        let parsedContent: unknown;
        try {
          parsedContent = JSON.parse(msg.content);
        } catch {
          parsedContent = { output: msg.content };
        }
        contents.push({
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: msg.name,
                response: {
                  result: parsedContent,
                },
              },
            },
          ],
        });
      }
    }

    const payload: Record<string, unknown> = {
      contents,
    };

    if (systemTexts.length > 0) {
      payload.systemInstruction = {
        parts: [{ text: systemTexts.join('\n\n') }],
      };
    }

    if (request.tools && request.tools.length > 0) {
      payload.tools = [
        {
          functionDeclarations: request.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
        },
      ];
    }

    if (request.temperature !== undefined || request.maxTokens !== undefined) {
      payload.generationConfig = {
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
        ...(request.maxTokens !== undefined ? { maxOutputTokens: request.maxTokens } : {}),
      };
    }

    const url = `${this.baseUrl}/models/${encodeURIComponent(this.model)}:generateContent`;
    const raw = await executeJsonPost(
      this.fetchFn,
      url,
      this.buildHeaders(),
      payload,
      request.signal,
    );

    if (!raw || typeof raw !== 'object') {
      throw new ProviderError('INVALID_RESPONSE', 'Réponse Gemini non objet.');
    }

    const obj = raw as Record<string, unknown>;
    const candidates = Array.isArray(obj.candidates) ? obj.candidates : null;
    const firstCandidate = candidates?.[0] as Record<string, unknown> | undefined;
    const content = firstCandidate?.content as Record<string, unknown> | undefined;
    const parts = Array.isArray(content?.parts) ? content.parts : null;

    if (!parts) {
      throw new ProviderError('INVALID_RESPONSE', 'Champ candidates[0].content.parts manquant.');
    }

    const textChunks: string[] = [];
    const toolCalls: LlmToolCall[] = [];

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i] as Record<string, unknown> | undefined;
      if (!part) continue;

      if (typeof part.text === 'string' && part.text.length > 0) {
        textChunks.push(part.text);
      }

      const fnCall = part.functionCall as Record<string, unknown> | undefined;
      if (fnCall && typeof fnCall === 'object') {
        const name = typeof fnCall.name === 'string' ? fnCall.name : '';
        if (!name) {
          throw new ProviderError('INVALID_RESPONSE', 'functionCall Gemini sans nom.');
        }
        const rawArgs = fnCall.args;
        const args =
          rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs)
            ? (rawArgs as Record<string, unknown>)
            : {};
        toolCalls.push({
          id: `gemini_call_${toolCalls.length}`,
          name,
          arguments: args,
        });
      }
    }

    const usageMeta = obj.usageMetadata as Record<string, unknown> | undefined;
    const finishReason =
      typeof firstCandidate?.finishReason === 'string' ? firstCandidate.finishReason : undefined;

    return {
      text: textChunks.join('\n'),
      toolCalls,
      ...(finishReason ? { finishReason } : {}),
      ...(usageMeta
        ? {
            usage: {
              ...(typeof usageMeta.promptTokenCount === 'number'
                ? { promptTokens: usageMeta.promptTokenCount }
                : {}),
              ...(typeof usageMeta.candidatesTokenCount === 'number'
                ? { completionTokens: usageMeta.candidatesTokenCount }
                : {}),
            },
          }
        : {}),
    };
  }

  public async testConnection(options?: TestConnectionOptions): Promise<ConnectionDiagnostic> {
    const start = Date.now();
    if (options?.signal?.aborted) {
      throw new ProviderError('ABORTED', 'Test de connexion Gemini annulé.');
    }

    const url = `${this.baseUrl}/models/${encodeURIComponent(this.model)}`;
    let res;
    try {
      res = await this.fetchFn(url, {
        method: 'GET',
        headers: this.buildHeaders(),
        ...(options?.signal ? { signal: options.signal } : {}),
      });
    } catch (err) {
      if (isAbortError(err, options?.signal)) {
        throw new ProviderError('ABORTED', 'Test de connexion Gemini interrompu.');
      }
      return classifyNetworkDiagnostic(err, this.baseUrl, 'API Gemini', Date.now() - start);
    }

    const latencyMs = Date.now() - start;
    if (!res.ok) {
      const detail = await readResponseErrorDetail(res);
      return classifyHttpDiagnostic(res.status, 'API Gemini', this.model, latencyMs, detail);
    }

    try {
      await res.json();
      return {
        status: 'ok',
        message: `Connexion API Gemini validée pour le modèle "${this.model}".`,
        latencyMs,
      };
    } catch {
      return {
        status: 'invalid_response',
        message: 'Réponse JSON invalide lors de la vérification du modèle Gemini.',
        latencyMs,
      };
    }
  }
}
