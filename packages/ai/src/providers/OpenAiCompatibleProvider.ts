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

export interface OpenAiCompatibleProviderOptions {
  readonly endpoint: string;
  readonly model: string;
  readonly apiKey?: string | undefined;
  readonly fetch?: AiFetchFn | undefined;
  readonly clientOriginProtocol?: string | undefined;
}

function normalizeEndpoint(endpoint: string): string {
  return endpoint.trim().replace(/\/+$/, '');
}

function parseToolArguments(rawArgs: unknown, toolName: string): Record<string, unknown> {
  if (rawArgs === undefined || rawArgs === null || rawArgs === '') {
    return {};
  }
  if (typeof rawArgs === 'object') {
    if (Array.isArray(rawArgs)) {
      throw new ProviderError(
        'INVALID_TOOL_ARGUMENTS',
        `Arguments invalides pour l’outil "${toolName}" : objet JSON attendu, tableau reçu.`,
      );
    }
    return rawArgs as Record<string, unknown>;
  }
  if (typeof rawArgs === 'string') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawArgs);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new ProviderError(
        'INVALID_TOOL_ARGUMENTS',
        `JSON d’arguments malformé pour l’outil "${toolName}" : ${msg}`,
      );
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new ProviderError(
        'INVALID_TOOL_ARGUMENTS',
        `Arguments invalides pour l’outil "${toolName}" : objet JSON attendu.`,
      );
    }
    return parsed as Record<string, unknown>;
  }

  throw new ProviderError(
    'INVALID_TOOL_ARGUMENTS',
    `Type d’arguments inattendu (${typeof rawArgs}) pour l’outil "${toolName}".`,
  );
}

function extractBalancedJsonObjects(text: string): Array<{ start: number; end: number; raw: string }> {
  const results: Array<{ start: number; end: number; raw: string }> = [];
  let depth = 0;
  let startIdx = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i);
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') {
      if (depth === 0) {
        startIdx = i;
      }
      depth++;
    } else if (ch === '}' && depth > 0) {
      depth--;
      if (depth === 0 && startIdx !== -1) {
        results.push({
          start: startIdx,
          end: i + 1,
          raw: text.slice(startIdx, i + 1),
        });
        startIdx = -1;
      }
    }
  }

  return results;
}

/**
 * Certains modèles locaux via Ollama (ex. qwen2.5-coder:7b) émettent parfois les appels d'outils
 * en JSON brut ligne par ligne dans `message.content` au lieu de peupler `message.tool_calls`.
 * N'accepte que les objets dont le nom correspond exactement à un outil déclaré dans la requête.
 */
function extractFallbackToolCallsFromText(
  text: string,
  allowedToolNames: ReadonlySet<string>,
): { toolCalls: LlmToolCall[]; cleanedText: string } {
  if (!text.trim() || allowedToolNames.size === 0) {
    return { toolCalls: [], cleanedText: text };
  }

  const normalized = text
    .replace(/<\/?tool_call>/gi, '\n')
    .replace(/```(?:json)?/gi, '\n');

  const candidates = extractBalancedJsonObjects(normalized);
  if (candidates.length === 0) {
    return { toolCalls: [], cleanedText: text };
  }

  const toolCalls: LlmToolCall[] = [];
  const consumedRanges: Array<{ start: number; end: number }> = [];

  for (const cand of candidates) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(cand.raw);
    } catch {
      continue;
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      continue;
    }

    const rec = parsed as Record<string, unknown>;
    const fnObj =
      rec.function && typeof rec.function === 'object' && !Array.isArray(rec.function)
        ? (rec.function as Record<string, unknown>)
        : rec;

    const name = typeof fnObj.name === 'string' ? fnObj.name.trim() : '';
    if (!name || !allowedToolNames.has(name)) {
      continue;
    }

    const rawArgs =
      'arguments' in fnObj
        ? fnObj.arguments
        : 'parameters' in fnObj
          ? fnObj.parameters
          : {};
    const args = parseToolArguments(rawArgs, name);
    const id =
      typeof rec.id === 'string' && rec.id.trim().length > 0
        ? rec.id
        : `fallback_call_${toolCalls.length}`;

    toolCalls.push({ id, name, arguments: args });
    consumedRanges.push({ start: cand.start, end: cand.end });
  }

  if (toolCalls.length === 0) {
    return { toolCalls: [], cleanedText: text };
  }

  let cursor = 0;
  let remaining = '';
  for (const range of consumedRanges) {
    remaining += normalized.slice(cursor, range.start);
    cursor = range.end;
  }
  remaining += normalized.slice(cursor);

  return {
    toolCalls,
    cleanedText: remaining.replace(/\n{3,}/g, '\n\n').trim(),
  };
}

/**
 * Adaptateur fetch natif compatible OpenAI / Ollama / LM Studio / vLLM (ADR-073 D5).
 */
export class OpenAiCompatibleProvider implements LlmProvider {
  public readonly id = 'openai-compatible';
  public readonly endpoint: string;
  public readonly model: string;
  private readonly apiKey?: string | undefined;
  private readonly fetchFn: AiFetchFn;
  private readonly clientOriginProtocol?: string | undefined;

  public constructor(options: OpenAiCompatibleProviderOptions) {
    this.endpoint = normalizeEndpoint(options.endpoint);
    this.model = options.model.trim();
    this.apiKey = options.apiKey?.trim() || undefined;
    this.fetchFn = resolveFetch(options.fetch);
    this.clientOriginProtocol = options.clientOriginProtocol;
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  public async chat(request: LlmChatRequest): Promise<LlmChatResponse> {
    const messages = request.messages.map((msg) => {
      if (msg.role === 'tool') {
        return {
          role: 'tool',
          tool_call_id: msg.toolCallId,
          name: msg.name,
          content: msg.content,
        };
      }
      if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        return {
          role: 'assistant',
          content: msg.content || null,
          tool_calls: msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments),
            },
          })),
        };
      }
      return {
        role: msg.role,
        content: msg.content,
      };
    });

    const payload: Record<string, unknown> = {
      model: this.model,
      messages,
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(request.maxTokens !== undefined ? { max_tokens: request.maxTokens } : {}),
    };

    if (request.tools && request.tools.length > 0) {
      payload.tools = request.tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }

    const raw = await executeJsonPost(
      this.fetchFn,
      `${this.endpoint}/chat/completions`,
      this.buildHeaders(),
      payload,
      request.signal,
      {
        endpoint: this.endpoint,
        providerLabel: 'Endpoint OpenAI/Ollama',
        clientOriginProtocol: this.clientOriginProtocol,
      },
    );

    if (!raw || typeof raw !== 'object') {
      throw new ProviderError('INVALID_RESPONSE', 'Réponse OpenAI/Ollama non objet.');
    }
    const obj = raw as Record<string, unknown>;
    const choices = Array.isArray(obj.choices) ? obj.choices : null;
    const first = choices?.[0] as Record<string, unknown> | undefined;
    const message = first?.message as Record<string, unknown> | undefined;

    if (!message || typeof message !== 'object') {
      throw new ProviderError('INVALID_RESPONSE', 'Champ choices[0].message manquant dans la réponse.');
    }

    let text = typeof message.content === 'string' ? message.content : '';
    const rawToolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    const toolCalls: LlmToolCall[] = [];

    for (let i = 0; i < rawToolCalls.length; i++) {
      const tc = rawToolCalls[i] as Record<string, unknown> | undefined;
      const fn = tc?.function as Record<string, unknown> | undefined;
      const name = typeof fn?.name === 'string' ? fn.name : '';
      if (!name) {
        throw new ProviderError('INVALID_RESPONSE', 'Tool call sans nom de fonction.');
      }
      const id = typeof tc?.id === 'string' && tc.id ? tc.id : `call_${i}`;
      const args = parseToolArguments(fn?.arguments, name);
      toolCalls.push({ id, name, arguments: args });
    }

    if (toolCalls.length === 0 && text.trim().length > 0 && request.tools && request.tools.length > 0) {
      const allowedNames = new Set(request.tools.map((t) => t.name));
      const extracted = extractFallbackToolCallsFromText(text, allowedNames);
      if (extracted.toolCalls.length > 0) {
        toolCalls.push(...extracted.toolCalls);
        text = extracted.cleanedText;
      }
    }

    const usageRaw = obj.usage as Record<string, unknown> | undefined;
    const finishReason = typeof first?.finish_reason === 'string' ? first.finish_reason : undefined;

    return {
      text,
      toolCalls,
      ...(finishReason ? { finishReason } : {}),
      ...(usageRaw
        ? {
            usage: {
              ...(typeof usageRaw.prompt_tokens === 'number'
                ? { promptTokens: usageRaw.prompt_tokens }
                : {}),
              ...(typeof usageRaw.completion_tokens === 'number'
                ? { completionTokens: usageRaw.completion_tokens }
                : {}),
            },
          }
        : {}),
    };
  }

  public async testConnection(options?: TestConnectionOptions): Promise<ConnectionDiagnostic> {
    const start = Date.now();
    if (options?.signal?.aborted) {
      throw new ProviderError('ABORTED', 'Test de connexion annulé.');
    }

    let res;
    try {
      res = await this.fetchFn(`${this.endpoint}/models`, {
        method: 'GET',
        headers: this.buildHeaders(),
        ...(options?.signal ? { signal: options.signal } : {}),
      });
    } catch (err) {
      if (isAbortError(err, options?.signal)) {
        throw new ProviderError('ABORTED', 'Test de connexion interrompu.');
      }
      return classifyNetworkDiagnostic(
        err,
        this.endpoint,
        'Endpoint OpenAI/Ollama',
        Date.now() - start,
        this.clientOriginProtocol,
      );
    }

    const latencyMs = Date.now() - start;
    if (!res.ok) {
      const detail = await readResponseErrorDetail(res);
      return classifyHttpDiagnostic(res.status, 'Endpoint OpenAI/Ollama', this.model, latencyMs, detail);
    }

    try {
      const json = (await res.json()) as Record<string, unknown>;
      const list = Array.isArray(json.data)
        ? json.data
        : Array.isArray(json.models)
          ? json.models
          : null;
      let availableIds: string[] = [];
      if (list && list.length > 0) {
        availableIds = list
          .map((item) => {
            if (!item || typeof item !== 'object') return '';
            const rec = item as Record<string, unknown>;
            return typeof rec.id === 'string'
              ? rec.id
              : typeof rec.name === 'string'
                ? rec.name
                : '';
          })
          .filter(Boolean);
        if (this.model && availableIds.length > 0 && !availableIds.includes(this.model)) {
          return {
            status: 'model_not_found',
            message: `Connexion active mais modèle "${this.model}" absent de la liste retournée.`,
            hint: `Modèles disponibles : ${availableIds.slice(0, 6).join(', ')}`,
            latencyMs,
            availableModels: availableIds.slice(0, 12),
          };
        }
      }
      return {
        status: 'ok',
        message: `Connexion établie avec ${this.endpoint} (modèle "${this.model}").`,
        latencyMs,
        ...(availableIds.length > 0 ? { availableModels: availableIds.slice(0, 12) } : {}),
      };
    } catch {
      return {
        status: 'invalid_response',
        message: `Réponse JSON invalide reçue depuis ${this.endpoint}/models.`,
        latencyMs,
      };
    }
  }
}
