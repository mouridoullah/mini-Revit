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

    const text = typeof message.content === 'string' ? message.content : '';
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
      if (list && list.length > 0 && this.model) {
        const availableIds = list
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
        if (availableIds.length > 0 && !availableIds.includes(this.model)) {
          return {
            status: 'model_not_found',
            message: `Connexion active mais modèle "${this.model}" absent de la liste retournée.`,
            hint: `Modèles disponibles : ${availableIds.slice(0, 6).join(', ')}`,
            latencyMs,
          };
        }
      }
      return {
        status: 'ok',
        message: `Connexion établie avec ${this.endpoint} (modèle "${this.model}").`,
        latencyMs,
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
