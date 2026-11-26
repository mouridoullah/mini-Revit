import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { BimDocument, AddWallCommand } from '@tabax/core';
import { ProviderError, type LlmChatRequest, type LlmChatResponse, type LlmProvider } from '@tabax/ai';
import {
  AI_CONFIG_STORAGE_KEY,
  AI_KEY_LOCAL_STORAGE_KEY,
  AI_KEY_SESSION_STORAGE_KEY,
  useAiCopilot,
} from './useAiCopilot.js';

function makeMockProvider(
  chatImpl: (req: LlmChatRequest, idx: number) => Promise<LlmChatResponse> | LlmChatResponse,
  testStatus: 'ok' | 'cors_or_mixed_content' = 'ok',
): LlmProvider {
  let idx = 0;
  return {
    id: 'mock',
    model: 'mock-model',
    async chat(req) {
      return chatImpl(req, idx++);
    },
    async testConnection() {
      return testStatus === 'ok'
        ? { status: 'ok', message: 'Connexion OK', latencyMs: 5 }
        : {
            status: 'cors_or_mixed_content',
            message: 'CORS bloqué',
            hint: 'OLLAMA_ORIGINS="*"',
            latencyMs: 5,
          };
    },
  };
}

describe('Hook useAiCopilot (ADR-073 Lot 3)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('gère le basculement de fournisseur et l’hygiène BYOK sessionStorage vs localStorage', () => {
    const doc = BimDocument.createDefaultProject();
    const levelId = Object.keys(doc.getState().levels)[0]!;

    const { result } = renderHook(() =>
      useAiCopilot({ doc, activeLevelId: levelId, selectedIds: [] }),
    );

    expect(result.current.config.providerKind).toBe('ollama');
    expect(result.current.config.rememberKeyOnDevice).toBe(false);

    // Changement vers Gemini + saisie clé API -> sessionStorage uniquement par défaut
    act(() => {
      result.current.updateConfig({ providerKind: 'gemini', apiKey: 'AIza-secret' });
    });

    expect(result.current.config.model).toBe('gemini-2.0-flash');
    expect(window.sessionStorage.getItem(AI_KEY_SESSION_STORAGE_KEY)).toBe('AIza-secret');
    expect(window.localStorage.getItem(AI_KEY_LOCAL_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(AI_CONFIG_STORAGE_KEY)).not.toContain('AIza-secret');

    // Opt-in localStorage -> clé écrite en localStorage
    act(() => {
      result.current.updateConfig({ rememberKeyOnDevice: true });
    });
    expect(window.localStorage.getItem(AI_KEY_LOCAL_STORAGE_KEY)).toBe('AIza-secret');

    // Décochage -> clé immédiatement purgée de localStorage
    act(() => {
      result.current.updateConfig({ rememberKeyOnDevice: false });
    });
    expect(window.localStorage.getItem(AI_KEY_LOCAL_STORAGE_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(AI_KEY_SESSION_STORAGE_KEY)).toBe('AIza-secret');
  });

  it('exécute testConnection() et le flux prompt -> carte d’actions -> Appliquer -> Ctrl+Z', async () => {
    const doc = BimDocument.createDefaultProject();
    const levelId = Object.keys(doc.getState().levels)[0]!;
    const onInfoMessage = vi.fn();

    const provider = makeMockProvider((_req, idx) => {
      if (idx === 0) {
        return {
          text: '',
          toolCalls: [
            {
              id: 'w1',
              name: 'add_wall',
              arguments: { levelId, startXMm: 0, startYMm: 0, endXMm: 4000, endYMm: 0 },
            },
          ],
        };
      }
      return { text: 'Mur de 4 m prêt.', toolCalls: [] };
    });

    const { result } = renderHook(() =>
      useAiCopilot({
        doc,
        activeLevelId: levelId,
        selectedIds: [],
        onInfoMessage,
        providerOverride: provider,
      }),
    );

    const diag = await act(async () => result.current.testConnection());
    expect(diag.status).toBe('ok');
    expect(result.current.connectionDiagnostic?.status).toBe('ok');

    await act(async () => {
      await result.current.sendPrompt('Crée un mur de 4 m');
    });

    expect(result.current.pendingPlan).not.toBeNull();
    expect(result.current.isStale).toBe(false);
    expect(Object.keys(doc.getState().walls)).toHaveLength(0);

    act(() => {
      result.current.applyPendingPlan();
    });

    expect(result.current.pendingPlan).toBeNull();
    expect(Object.keys(doc.getState().walls)).toHaveLength(1);
    expect(onInfoMessage).toHaveBeenCalledTimes(1);

    // Annulation Ctrl+Z en 1 entrée
    expect(doc.undo()).toBe(true);
    expect(Object.keys(doc.getState().walls)).toHaveLength(0);
  });

  it('détecte immédiatement isStale sur mutation concurrente et gère Revalider valide & invalide', async () => {
    const doc = BimDocument.createDefaultProject();
    const levelId = Object.keys(doc.getState().levels)[0]!;
    const wallTypeId = Object.keys(doc.getState().wallTypes)[0]!;

    doc.execute(
      new AddWallCommand({
        id: 'w_host',
        category: 'wall',
        typeId: wallTypeId,
        levelId,
        start: { x: 0, y: 0 },
        end: { x: 4000, y: 0 },
      }),
    );

    const provider = makeMockProvider((_req, idx) => {
      if (idx === 0) {
        return {
          text: '',
          toolCalls: [
            { id: 'd1', name: 'add_door', arguments: { hostWallId: 'w_host', offsetAlongMm: 800 } },
          ],
        };
      }
      return { text: 'Porte préparée.', toolCalls: [] };
    });

    const { result } = renderHook(() =>
      useAiCopilot({ doc, activeLevelId: levelId, selectedIds: [], providerOverride: provider }),
    );

    await act(async () => {
      await result.current.sendPrompt('Pose une porte sur w_host');
    });
    expect(result.current.isStale).toBe(false);

    // Mutation compatible concurrente -> doc.subscribe bascule isStale immédiatement
    act(() => {
      doc.execute(
        new AddWallCommand({
          id: 'w_other',
          category: 'wall',
          typeId: wallTypeId,
          levelId,
          start: { x: 0, y: 5000 },
          end: { x: 3000, y: 5000 },
        }),
      );
    });

    expect(result.current.isStale).toBe(true);

    // Revalider réussit
    act(() => {
      result.current.revalidatePendingPlan();
    });
    expect(result.current.isStale).toBe(false);
    expect(result.current.revalidationError).toBeNull();

    // Mutation incompatible : suppression de w_host (via undo de sa création impossible ici, utilisons DeleteWallCommand)
    const { Commands } = await import('@tabax/core');
    act(() => {
      doc.execute(new Commands.DeleteWallCommand('w_host'));
    });
    expect(result.current.isStale).toBe(true);

    act(() => {
      result.current.revalidatePendingPlan();
    });
    expect(result.current.isStale).toBe(true);
    expect(result.current.revalidationError).toBeTruthy();
  });

  it('annule via stop() et purge le plan lors d’un changement d’instance doc', async () => {
    const doc1 = BimDocument.createDefaultProject();
    const doc2 = BimDocument.createDefaultProject();
    const levelId = Object.keys(doc1.getState().levels)[0]!;

    let rejectInFlight: ((err: unknown) => void) | null = null;
    const hangingProvider: LlmProvider = {
      id: 'hang',
      model: 'hang',
      chat(req) {
        return new Promise((_resolve, reject) => {
          rejectInFlight = reject;
          req.signal?.addEventListener?.('abort', () => {
            reject(new ProviderError('ABORTED', 'Aborted'));
          });
        });
      },
      async testConnection() {
        return { status: 'ok', message: 'ok', latencyMs: 1 };
      },
    };

    const { result, rerender } = renderHook(
      ({ currentDoc }) =>
        useAiCopilot({
          doc: currentDoc,
          activeLevelId: levelId,
          selectedIds: [],
          providerOverride: hangingProvider,
        }),
      { initialProps: { currentDoc: doc1 } },
    );

    let sendPromise: Promise<void>;
    act(() => {
      sendPromise = result.current.sendPrompt('Requête longue');
    });
    expect(result.current.isRunning).toBe(true);

    // Bouton Arrêter
    act(() => {
      result.current.stop();
    });
    await act(async () => {
      await sendPromise!;
    });
    expect(result.current.isRunning).toBe(false);
    expect(result.current.messages.at(-1)?.content).toContain('interrompue');

    // Changement d'instance doc annule et purge immédiatement
    act(() => {
      sendPromise = result.current.sendPrompt('Autre requête');
    });
    expect(result.current.isRunning).toBe(true);

    rerender({ currentDoc: doc2 });
    await act(async () => {
      rejectInFlight?.(new ProviderError('ABORTED', 'Aborted'));
      await sendPromise!;
    });
    expect(result.current.isRunning).toBe(false);
    expect(result.current.pendingPlan).toBeNull();
  });
});
