import {
  ProviderError,
  type AiAbortSignal,
  type AiFetchFn,
  type AiFetchResponse,
  type ConnectionDiagnostic,
} from './types.js';

export function resolveFetch(customFetch?: AiFetchFn): AiFetchFn {
  if (customFetch) {
    // Enveloppe anonyme pour éviter toute liaison implicite de `this` à l'instance du provider
    return (url, init) => customFetch(url, init);
  }
  const globalFetch = (globalThis as { fetch?: unknown }).fetch;
  if (typeof globalFetch !== 'function') {
    throw new ProviderError(
      'NETWORK_ERROR',
      'Aucun client fetch disponible dans cet environnement.',
    );
  }
  // Liaison explicite sur globalThis pour prévenir "Failed to execute 'fetch' on 'Window': Illegal invocation"
  const boundFetch = (globalFetch as AiFetchFn).bind(globalThis);
  return (url, init) => boundFetch(url, init);
}

export function isLocalHttpEndpoint(endpoint: string): boolean {
  const normalized = endpoint.trim().toLowerCase();
  return (
    normalized.startsWith('http://localhost') ||
    normalized.startsWith('http://127.0.0.1') ||
    normalized.startsWith('http://[::1]')
  );
}

export function isAbortError(err: unknown, signal?: AiAbortSignal): boolean {
  if (signal?.aborted) return true;
  return err instanceof Error && err.name === 'AbortError';
}

export function classifyHttpDiagnostic(
  status: number,
  providerLabel: string,
  model: string,
  latencyMs: number,
  detail?: string,
): ConnectionDiagnostic {
  if (status === 401 || status === 403) {
    return {
      status: 'unauthorized',
      message: `${providerLabel} a refusé l’authentification (HTTP ${status}).`,
      hint: 'Vérifiez la validité de votre clé API et ses permissions.',
      latencyMs,
    };
  }
  if (status === 404) {
    return {
      status: 'model_not_found',
      message: `Modèle ou endpoint introuvable sur ${providerLabel} (HTTP 404 pour "${model}").`,
      hint: `Vérifiez le nom du modèle "${model}" (ex. ollama pull ${model} en local).`,
      latencyMs,
    };
  }
  return {
    status: 'invalid_response',
    message: `${providerLabel} a répondu avec une erreur HTTP ${status}${detail ? ` : ${detail}` : '.'}`,
    latencyMs,
  };
}

export function classifyNetworkDiagnostic(
  err: unknown,
  endpoint: string,
  providerLabel: string,
  latencyMs: number,
  clientOriginProtocol?: string,
): ConnectionDiagnostic {
  const rawMessage = err instanceof Error ? err.message : String(err);
  const lower = rawMessage.toLowerCase();
  const isHttpsToLocalHttp =
    clientOriginProtocol === 'https:' && isLocalHttpEndpoint(endpoint);
  const looksLikeCors =
    lower.includes('cors') ||
    lower.includes('cross-origin') ||
    lower.includes('access-control') ||
    lower.includes('mixed content');

  if (isHttpsToLocalHttp || looksLikeCors) {
    return {
      status: 'cors_or_mixed_content',
      message: `Connexion vers ${endpoint} bloquée par la sécurité navigateur (CORS ou Mixed Content HTTPS -> HTTP).`,
      hint:
        'Sous Chrome, lancez Ollama avec OLLAMA_ORIGINS="*" (ou l’origine du site). Sous Firefox/Safari depuis HTTPS, utilisez pnpm dev en local ou un proxy HTTPS local.',
      latencyMs,
    };
  }

  return {
    status: 'unreachable',
    message: `Impossible de joindre ${providerLabel} (${endpoint}) : ${rawMessage}`,
    hint: isLocalHttpEndpoint(endpoint)
      ? 'Vérifiez qu’Ollama ou LM Studio est démarré et à l’écoute, ainsi que la variable OLLAMA_ORIGINS si vous appelez depuis un navigateur.'
      : 'Vérifiez l’URL de l’endpoint et votre connexion réseau.',
    latencyMs,
  };
}

export async function readResponseErrorDetail(res: AiFetchResponse): Promise<string> {
  try {
    const raw = await res.text();
    const trimmed = raw.trim();
    if (!trimmed) return res.statusText;
    return trimmed.length > 200 ? `${trimmed.slice(0, 200)}...` : trimmed;
  } catch {
    return res.statusText;
  }
}

export interface JsonPostDiagnosticContext {
  readonly endpoint?: string | undefined;
  readonly providerLabel?: string | undefined;
  readonly clientOriginProtocol?: string | undefined;
}

export async function executeJsonPost(
  fetchFn: AiFetchFn,
  url: string,
  headers: Readonly<Record<string, string>>,
  body: unknown,
  signal?: AiAbortSignal,
  diagnosticCtx?: JsonPostDiagnosticContext,
): Promise<unknown> {
  if (signal?.aborted) {
    throw new ProviderError('ABORTED', 'Requête annulée avant exécution.');
  }

  let res: AiFetchResponse;
  try {
    res = await fetchFn(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
  } catch (err) {
    if (isAbortError(err, signal)) {
      throw new ProviderError('ABORTED', 'Requête interrompue par l’utilisateur.');
    }
    if (diagnosticCtx?.endpoint) {
      const diag = classifyNetworkDiagnostic(
        err,
        diagnosticCtx.endpoint,
        diagnosticCtx.providerLabel ?? 'Endpoint LLM',
        0,
        diagnosticCtx.clientOriginProtocol,
      );
      throw new ProviderError(
        'NETWORK_ERROR',
        diag.hint ? `${diag.message} ${diag.hint}` : diag.message,
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new ProviderError('NETWORK_ERROR', `Erreur réseau vers ${url} : ${msg}`);
  }

  if (!res.ok) {
    const detail = await readResponseErrorDetail(res);
    throw new ProviderError(
      'HTTP_ERROR',
      `Erreur HTTP ${res.status} (${detail})`,
      res.status,
    );
  }

  try {
    return await res.json();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ProviderError('INVALID_RESPONSE', `Réponse JSON invalide : ${msg}`);
  }
}
