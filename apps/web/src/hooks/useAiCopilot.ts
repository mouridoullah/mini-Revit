import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type BimDocument, type ElementId } from '@tabax/core';
import {
  applyPlan,
  createFullCopilotRegistry,
  DEFAULT_GEMINI_BASE_URL,
  GeminiProvider,
  OpenAiCompatibleProvider,
  ProviderError,
  revalidatePlan,
  runCopilotTurn,
  type ActionPlan,
  type ConnectionDiagnostic,
  type LlmMessage,
  type LlmProvider,
} from '@tabax/ai';

export type AiProviderKind = 'ollama' | 'openai' | 'gemini';

export interface AiCopilotConfig {
  readonly providerKind: AiProviderKind;
  readonly endpoint: string;
  readonly model: string;
  readonly apiKey: string;
  readonly rememberKeyOnDevice: boolean;
}

export interface AiChatMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant' | 'error';
  readonly content: string;
}

export interface UseAiCopilotOptions {
  readonly doc: BimDocument;
  readonly activeLevelId: string;
  readonly selectedIds: readonly ElementId[];
  readonly onInfoMessage?: ((msg: string) => void) | undefined;
  readonly providerOverride?: LlmProvider | undefined;
}

export interface UseAiCopilotResult {
  readonly config: AiCopilotConfig;
  readonly updateConfig: (patch: Partial<AiCopilotConfig>) => void;
  readonly messages: readonly AiChatMessage[];
  readonly isRunning: boolean;
  readonly isTestingConnection: boolean;
  readonly connectionDiagnostic: ConnectionDiagnostic | null;
  readonly pendingPlan: ActionPlan | null;
  readonly isStale: boolean;
  readonly revalidationError: string | null;
  readonly testConnection: () => Promise<ConnectionDiagnostic>;
  readonly sendPrompt: (prompt: string) => Promise<void>;
  readonly stop: () => void;
  readonly applyPendingPlan: () => void;
  readonly revalidatePendingPlan: () => void;
  readonly discardPendingPlan: () => void;
  readonly clearConversation: () => void;
}

export const AI_CONFIG_STORAGE_KEY = 'tabax_ai_config_v1';
export const AI_KEY_SESSION_STORAGE_KEY = 'tabax_ai_api_key_session';
export const AI_KEY_LOCAL_STORAGE_KEY = 'tabax_ai_api_key_local';

const PROVIDER_DEFAULTS: Readonly<
  Record<AiProviderKind, { readonly endpoint: string; readonly model: string }>
> = {
  ollama: { endpoint: 'http://localhost:11434/v1', model: 'qwen2.5-coder:14b' },
  openai: { endpoint: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  gemini: { endpoint: DEFAULT_GEMINI_BASE_URL, model: 'gemini-2.0-flash' },
};

function safeStorageGet(storage: Storage | undefined, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function safeStorageSet(storage: Storage | undefined, key: string, value: string): void {
  try {
    storage?.setItem(key, value);
  } catch {
    // Stockage indisponible (mode privé ou quota) : dégradation gracieuse sans bloquer l'UI
  }
}

function safeStorageRemove(storage: Storage | undefined, key: string): void {
  try {
    storage?.removeItem(key);
  } catch {
    // Ignore
  }
}

function loadInitialConfig(): AiCopilotConfig {
  const win = typeof window !== 'undefined' ? window : undefined;
  const rawMeta = safeStorageGet(win?.localStorage, AI_CONFIG_STORAGE_KEY);
  let providerKind: AiProviderKind = 'ollama';
  let endpoint = PROVIDER_DEFAULTS.ollama.endpoint;
  let model = PROVIDER_DEFAULTS.ollama.model;
  let rememberKeyOnDevice = false;

  if (rawMeta) {
    try {
      const parsed = JSON.parse(rawMeta) as Partial<AiCopilotConfig>;
      if (
        parsed.providerKind === 'ollama' ||
        parsed.providerKind === 'openai' ||
        parsed.providerKind === 'gemini'
      ) {
        providerKind = parsed.providerKind;
      }
      if (typeof parsed.endpoint === 'string' && parsed.endpoint.trim()) {
        endpoint = parsed.endpoint;
      } else {
        endpoint = PROVIDER_DEFAULTS[providerKind].endpoint;
      }
      if (typeof parsed.model === 'string' && parsed.model.trim()) {
        model = parsed.model;
      } else {
        model = PROVIDER_DEFAULTS[providerKind].model;
      }
      rememberKeyOnDevice = parsed.rememberKeyOnDevice === true;
    } catch {
      // Ignorer JSON corrompu
    }
  }

  const sessionKey = safeStorageGet(win?.sessionStorage, AI_KEY_SESSION_STORAGE_KEY);
  const localKey = rememberKeyOnDevice
    ? safeStorageGet(win?.localStorage, AI_KEY_LOCAL_STORAGE_KEY)
    : null;

  return {
    providerKind,
    endpoint,
    model,
    apiKey: sessionKey ?? localKey ?? '',
    rememberKeyOnDevice,
  };
}

function persistConfig(next: AiCopilotConfig): void {
  const win = typeof window !== 'undefined' ? window : undefined;
  safeStorageSet(
    win?.localStorage,
    AI_CONFIG_STORAGE_KEY,
    JSON.stringify({
      providerKind: next.providerKind,
      endpoint: next.endpoint,
      model: next.model,
      rememberKeyOnDevice: next.rememberKeyOnDevice,
    }),
  );

  // Hygiène stricte BYOK : sessionStorage par défaut ; localStorage uniquement si opt-in explicite
  if (next.apiKey.length > 0) {
    safeStorageSet(win?.sessionStorage, AI_KEY_SESSION_STORAGE_KEY, next.apiKey);
  } else {
    safeStorageRemove(win?.sessionStorage, AI_KEY_SESSION_STORAGE_KEY);
  }

  if (next.rememberKeyOnDevice && next.apiKey.length > 0) {
    safeStorageSet(win?.localStorage, AI_KEY_LOCAL_STORAGE_KEY, next.apiKey);
  } else {
    safeStorageRemove(win?.localStorage, AI_KEY_LOCAL_STORAGE_KEY);
  }
}

function createProviderFromConfig(
  config: AiCopilotConfig,
  override?: LlmProvider,
): LlmProvider {
  if (override) return override;
  const protocol = typeof window !== 'undefined' ? window.location.protocol : undefined;
  if (config.providerKind === 'gemini') {
    return new GeminiProvider({
      apiKey: config.apiKey,
      model: config.model,
    });
  }
  return new OpenAiCompatibleProvider({
    endpoint: config.endpoint,
    model: config.model,
    apiKey: config.apiKey || undefined,
    clientOriginProtocol: protocol,
  });
}

function isLocalHttpUrl(url: string): boolean {
  const lower = url.trim().toLowerCase();
  return (
    lower.startsWith('http://localhost') ||
    lower.startsWith('http://127.0.0.1') ||
    lower.startsWith('http://[::1]')
  );
}

/**
 * Hook React orchestrant le copilote BIM IA en isolation complète de App.tsx (ADR-073).
 */
export function useAiCopilot({
  doc,
  activeLevelId,
  selectedIds,
  onInfoMessage,
  providerOverride,
}: UseAiCopilotOptions): UseAiCopilotResult {
  const [config, setConfig] = useState<AiCopilotConfig>(() => loadInitialConfig());
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionDiagnostic, setConnectionDiagnostic] = useState<ConnectionDiagnostic | null>(
    null,
  );
  const [pendingPlan, setPendingPlan] = useState<ActionPlan | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [revalidationError, setRevalidationError] = useState<string | null>(null);

  const registry = useMemo(() => createFullCopilotRegistry(), []);
  const abortControllerRef = useRef<AbortController | null>(null);
  const testAbortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const pendingPlanRef = useRef<ActionPlan | null>(null);
  pendingPlanRef.current = pendingPlan;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortControllerRef.current?.abort();
      testAbortControllerRef.current?.abort();
    };
  }, []);

  // Cycle de vie document (ADR-027 / ADR-070) : changement d'instance doc -> abort & purge immédiate
  useEffect(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsRunning(false);
    setPendingPlan(null);
    setIsStale(false);
    setRevalidationError(null);

    const unsubscribe = doc.subscribe(() => {
      const currentPlan = pendingPlanRef.current;
      if (!currentPlan || !mountedRef.current) return;
      if (doc.getState() !== currentPlan.baseState) {
        setIsStale(true);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [doc]);

  const updateConfig = useCallback((patch: Partial<AiCopilotConfig>) => {
    setConfig((prev) => {
      let nextEndpoint = patch.endpoint !== undefined ? patch.endpoint : prev.endpoint;
      let nextModel = patch.model !== undefined ? patch.model : prev.model;
      const nextKind = patch.providerKind ?? prev.providerKind;

      if (patch.providerKind && patch.providerKind !== prev.providerKind) {
        const prevDefaults = PROVIDER_DEFAULTS[prev.providerKind];
        const nextDefaults = PROVIDER_DEFAULTS[patch.providerKind];
        if (patch.endpoint === undefined && prev.endpoint === prevDefaults.endpoint) {
          nextEndpoint = nextDefaults.endpoint;
        }
        if (patch.model === undefined && prev.model === prevDefaults.model) {
          nextModel = nextDefaults.model;
        }
      }

      const next: AiCopilotConfig = {
        providerKind: nextKind,
        endpoint: nextEndpoint,
        model: nextModel,
        apiKey: patch.apiKey !== undefined ? patch.apiKey : prev.apiKey,
        rememberKeyOnDevice:
          patch.rememberKeyOnDevice !== undefined
            ? patch.rememberKeyOnDevice
            : prev.rememberKeyOnDevice,
      };
      persistConfig(next);
      return next;
    });
    setConnectionDiagnostic(null);
  }, []);

  const testConnection = useCallback(async (): Promise<ConnectionDiagnostic> => {
    testAbortControllerRef.current?.abort();
    const controller = new AbortController();
    testAbortControllerRef.current = controller;
    setIsTestingConnection(true);

    try {
      const provider = createProviderFromConfig(config, providerOverride);
      let diag = await provider.testConnection({ signal: controller.signal });

      const protocol = typeof window !== 'undefined' ? window.location.protocol : '';
      if (
        diag.status !== 'ok' &&
        config.providerKind === 'ollama' &&
        protocol === 'https:' &&
        isLocalHttpUrl(config.endpoint) &&
        !diag.hint?.includes('HTTPS')
      ) {
        diag = {
          ...diag,
          hint: `Page servie en HTTPS vers ${config.endpoint} : autorisez OLLAMA_ORIGINS="*" (Chrome) ou utilisez pnpm dev en local pour éviter le blocage Mixed Content.`,
        };
      }

      if (mountedRef.current) {
        setConnectionDiagnostic(diag);
      }
      return diag;
    } catch (err) {
      const diag: ConnectionDiagnostic = {
        status: 'invalid_response',
        message: err instanceof Error ? err.message : 'Erreur lors du test de connexion.',
        latencyMs: 0,
      };
      if (mountedRef.current) {
        setConnectionDiagnostic(diag);
      }
      return diag;
    } finally {
      if (mountedRef.current) {
        setIsTestingConnection(false);
      }
    }
  }, [config, providerOverride]);

  const stop = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const sendPrompt = useCallback(
    async (rawPrompt: string): Promise<void> => {
      const prompt = rawPrompt.trim();
      if (!prompt || isRunning) return;

      if (
        !providerOverride &&
        (config.providerKind === 'openai' || config.providerKind === 'gemini') &&
        config.apiKey.trim().length === 0
      ) {
        setMessages((prev) => [
          ...prev,
          {
            id: `err_${Date.now()}`,
            role: 'error',
            content: 'Veuillez saisir une clé API dans les réglages avant d’interroger ce fournisseur.',
          },
        ]);
        return;
      }

      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const userMsg: AiChatMessage = {
        id: `usr_${Date.now()}`,
        role: 'user',
        content: prompt,
      };
      const llmHistory: LlmMessage[] = messages
        .filter((m): m is AiChatMessage & { role: 'user' | 'assistant' } => m.role !== 'error')
        .slice(-8)
        .map((m) => ({ role: m.role, content: m.content }));

      setMessages((prev) => [...prev, userMsg]);
      setIsRunning(true);
      setRevalidationError(null);

      try {
        const provider = createProviderFromConfig(config, providerOverride);
        const turn = await runCopilotTurn({
          doc,
          provider,
          registry,
          prompt,
          history: llmHistory,
          activeLevelId,
          selectedIds,
          signal: controller.signal,
        });

        if (!mountedRef.current) return;

        const text =
          turn.assistantText.trim() ||
          (turn.plan
            ? `Plan prêt (${turn.plan.summary.totalSteps} étape(s)). Vérifiez puis cliquez sur Appliquer.`
            : 'Analyse terminée.');

        setMessages((prev) => [
          ...prev,
          {
            id: `ast_${Date.now()}`,
            role: turn.status === 'completed' ? 'assistant' : 'error',
            content: text,
          },
        ]);

        if (turn.plan) {
          setPendingPlan(turn.plan);
          setIsStale(doc.getState() !== turn.plan.baseState);
        } else {
          setPendingPlan(null);
          setIsStale(false);
        }
      } catch (err) {
        if (!mountedRef.current) return;
        const isAborted =
          controller.signal.aborted ||
          (err instanceof ProviderError && err.code === 'ABORTED');
        setMessages((prev) => [
          ...prev,
          {
            id: `err_${Date.now()}`,
            role: isAborted ? 'assistant' : 'error',
            content: isAborted
              ? 'Requête interrompue.'
              : err instanceof Error
                ? err.message
                : 'Erreur inattendue lors de l’appel IA.',
          },
        ]);
      } finally {
        if (mountedRef.current) {
          setIsRunning(false);
          if (abortControllerRef.current === controller) {
            abortControllerRef.current = null;
          }
        }
      }
    },
    [activeLevelId, config, doc, isRunning, messages, providerOverride, registry, selectedIds],
  );

  const applyPendingPlan = useCallback(() => {
    if (!pendingPlan) return;
    const res = applyPlan(doc, pendingPlan);
    if (res.status === 'stale') {
      setIsStale(true);
      setRevalidationError(
        'La maquette a été modifiée depuis la génération de ce plan. Cliquez sur Revalider.',
      );
      return;
    }
    if (res.status === 'error') {
      setRevalidationError(`${res.code} : ${res.message}`);
      return;
    }

    const appliedSteps = pendingPlan.summary.totalSteps;
    setPendingPlan(null);
    setIsStale(false);
    setRevalidationError(null);
    onInfoMessage?.(
      `Plan IA appliqué (${appliedSteps} opération${appliedSteps > 1 ? 's' : ''}, annulable via Ctrl+Z).`,
    );
  }, [doc, onInfoMessage, pendingPlan]);

  const revalidatePendingPlan = useCallback(() => {
    if (!pendingPlan) return;
    const res = revalidatePlan(doc, pendingPlan);
    if (res.status === 'valid') {
      setPendingPlan(res.plan);
      setIsStale(false);
      setRevalidationError(null);
    } else {
      setIsStale(true);
      setRevalidationError(
        `Étape #${res.failedStepIndex + 1} (${res.step.toolName}) invalide sur l’état actuel : ${res.error.message}`,
      );
    }
  }, [doc, pendingPlan]);

  const discardPendingPlan = useCallback(() => {
    setPendingPlan(null);
    setIsStale(false);
    setRevalidationError(null);
  }, []);

  const clearConversation = useCallback(() => {
    setMessages([]);
    setPendingPlan(null);
    setIsStale(false);
    setRevalidationError(null);
  }, []);

  return {
    config,
    updateConfig,
    messages,
    isRunning,
    isTestingConnection,
    connectionDiagnostic,
    pendingPlan,
    isStale,
    revalidationError,
    testConnection,
    sendPrompt,
    stop,
    applyPendingPlan,
    revalidatePendingPlan,
    discardPendingPlan,
    clearConversation,
  };
}
