import type { ExposedToolSchema } from '../types.js';

/**
 * Signal d'annulation structurel compatible AbortSignal (navigateur & Node) sans dépendance DOM.
 */
export interface AiAbortSignal {
  readonly aborted: boolean;
  addEventListener?: ((type: string, listener: () => void) => void) | undefined;
  removeEventListener?: ((type: string, listener: () => void) => void) | undefined;
}

export interface AiFetchRequestInit {
  readonly method?: string | undefined;
  readonly headers?: Readonly<Record<string, string>> | undefined;
  readonly body?: string | undefined;
  readonly signal?: AiAbortSignal | undefined;
}

export interface AiFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export type AiFetchFn = (url: string, init?: AiFetchRequestInit) => Promise<AiFetchResponse>;

export interface LlmToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: Record<string, unknown>;
}

export type LlmMessage =
  | {
      readonly role: 'system' | 'user';
      readonly content: string;
    }
  | {
      readonly role: 'assistant';
      readonly content: string;
      readonly toolCalls?: readonly LlmToolCall[] | undefined;
    }
  | {
      readonly role: 'tool';
      readonly toolCallId: string;
      readonly name: string;
      readonly content: string;
    };

export interface LlmChatRequest {
  readonly messages: readonly LlmMessage[];
  readonly tools?: readonly ExposedToolSchema[] | undefined;
  readonly temperature?: number | undefined;
  readonly maxTokens?: number | undefined;
  readonly signal?: AiAbortSignal | undefined;
}

export interface LlmChatResponse {
  readonly text: string;
  readonly toolCalls: readonly LlmToolCall[];
  readonly finishReason?: string | undefined;
  readonly usage?: {
    readonly promptTokens?: number | undefined;
    readonly completionTokens?: number | undefined;
  } | undefined;
}

export type ConnectionStatus =
  | 'ok'
  | 'unreachable'
  | 'cors_or_mixed_content'
  | 'unauthorized'
  | 'model_not_found'
  | 'invalid_response';

export interface ConnectionDiagnostic {
  readonly status: ConnectionStatus;
  readonly message: string;
  readonly hint?: string | undefined;
  readonly latencyMs: number;
}

export interface TestConnectionOptions {
  readonly signal?: AiAbortSignal | undefined;
}

export interface LlmProvider {
  readonly id: string;
  readonly model: string;
  chat(request: LlmChatRequest): Promise<LlmChatResponse>;
  testConnection(options?: TestConnectionOptions): Promise<ConnectionDiagnostic>;
}

export type ProviderErrorCode =
  | 'ABORTED'
  | 'NETWORK_ERROR'
  | 'HTTP_ERROR'
  | 'INVALID_RESPONSE'
  | 'INVALID_TOOL_ARGUMENTS';

export class ProviderError extends Error {
  public readonly code: ProviderErrorCode;
  public readonly status?: number | undefined;

  public constructor(code: ProviderErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
    this.status = status;
  }
}
