import { describe, it, expect } from 'vitest';
import { BimDocument, AddWallCommand } from '@tabax/core';
import {
  applyPlan,
  createFullCopilotRegistry,
  MAX_SELF_CORRECTION_RETRIES,
  MAX_TOOL_STEPS,
  ProviderError,
  revalidatePlan,
  runCopilotTurn,
  type LlmChatRequest,
  type LlmChatResponse,
  type LlmProvider,
} from '../index.js';

function createMockProvider(
  handler: (req: LlmChatRequest, callIndex: number) => Promise<LlmChatResponse> | LlmChatResponse,
): LlmProvider {
  let index = 0;
  return {
    id: 'mock',
    model: 'mock-model',
    async chat(req) {
      if (req.signal?.aborted) {
        throw new ProviderError('ABORTED', 'Aborted');
      }
      return handler(req, index++);
    },
    async testConnection() {
      return { status: 'ok', message: 'ok', latencyMs: 1 };
    },
  };
}

describe('DryRunExecutor, boucle d’auto-correction & Stale Plan Guard (ADR-073 Lot 2)', () => {
  it('retourne plan: null sur une requête en lecture seule sans toucher au document', async () => {
    const doc = BimDocument.createDefaultProject();
    const stateBefore = doc.getState();
    const registry = createFullCopilotRegistry();

    const provider = createMockProvider((_req, idx) => {
      if (idx === 0) {
        return {
          text: '',
          toolCalls: [{ id: 'c1', name: 'get_project_summary', arguments: {} }],
        };
      }
      return { text: 'Le projet contient 1 niveau vide.', toolCalls: [] };
    });

    const result = await runCopilotTurn({
      doc,
      provider,
      registry,
      prompt: 'Résume le projet',
    });

    expect(result.status).toBe('completed');
    expect(result.plan).toBeNull();
    expect(result.assistantText).toContain('1 niveau');
    expect(doc.getState()).toBe(stateBefore);
  });

  it('enchaîne add_wall -> ULID -> add_door -> auto_dimension_level puis applyPlan + undo/redo en 1 seule entrée', async () => {
    const doc = BimDocument.createDefaultProject();
    const levelId = Object.keys(doc.getState().levels)[0]!;
    const wallTypeId = Object.keys(doc.getState().wallTypes)[0]!;

    // Mur existant ciblé pour tester targetElementIds préexistant
    doc.execute(
      new AddWallCommand({
        id: 'w_existing',
        category: 'wall',
        typeId: wallTypeId,
        levelId,
        start: { x: 0, y: 3000 },
        end: { x: 4000, y: 3000 },
      }),
    );

    const stateBeforeRun = doc.getState();
    const registry = createFullCopilotRegistry();
    let createdWallId = '';

    const provider = createMockProvider((req, idx) => {
      if (idx === 0) {
        return {
          text: '',
          toolCalls: [
            {
              id: 't1',
              name: 'add_wall',
              arguments: { levelId, startXMm: 0, startYMm: 0, endXMm: 4000, endYMm: 0 },
            },
          ],
        };
      }
      if (idx === 1) {
        const lastToolMsg = req.messages.filter((m) => m.role === 'tool').at(-1);
        const parsed = JSON.parse(lastToolMsg?.role === 'tool' ? lastToolMsg.content : '{}');
        createdWallId = parsed.data.wallId;
        return {
          text: '',
          toolCalls: [
            {
              id: 't2',
              name: 'add_door',
              arguments: { hostWallId: createdWallId, offsetAlongMm: 1200 },
            },
            {
              id: 't3',
              name: 'move_wall',
              arguments: { wallId: 'w_existing', deltaXMm: 0, deltaYMm: 200 },
            },
            {
              id: 't4',
              name: 'auto_dimension_level',
              arguments: { levelId },
            },
          ],
        };
      }
      return { text: 'Plan prêt.', toolCalls: [] };
    });

    const turn = await runCopilotTurn({
      doc,
      provider,
      registry,
      prompt: 'Ajoute un mur avec porte et cote l’étage',
      activeLevelId: levelId,
    });

    // Document réel STRICTEMENT intouché avant applyPlan
    expect(doc.getState()).toBe(stateBeforeRun);
    expect(turn.status).toBe('completed');
    expect(turn.plan).not.toBeNull();
    const plan = turn.plan!;
    expect(plan.steps).toHaveLength(4);
    expect(plan.createdElementIds).toContain(createdWallId);
    // targetElementIds ne contient QUE les IDs préexistants dans baseState (w_existing, jamais createdWallId)
    expect(plan.targetElementIds).toEqual(['w_existing']);

    // Application atomique en 1 seule transaction (1 mur préalable + 1 transaction = 2 entrées)
    const applyRes = applyPlan(doc, plan);
    expect(applyRes.status).toBe('applied');
    expect(doc.getUndoCount()).toBe(2);
    expect(doc.getState().walls[createdWallId]).toBeDefined();
    expect(Object.keys(doc.getState().doors)).toHaveLength(1);
    expect(doc.getState().walls['w_existing']?.start.y).toBe(3200);

    // Undo unique annule les 4 opérations d'un coup
    expect(doc.undo()).toBe(true);
    expect(doc.getState()).toEqual(stateBeforeRun);
    expect(doc.getUndoCount()).toBe(1);

    // Redo unique rétablit les 4 opérations
    expect(doc.redo()).toBe(true);
    expect(doc.getState().walls[createdWallId]).toBeDefined();
    expect(doc.getUndoCount()).toBe(2);
  });

  it('supporte plus de 8 appels d’outils parallèles dans la limite MAX_TOTAL_TOOL_CALLS = 24', async () => {
    const doc = BimDocument.createDefaultProject();
    const levelId = Object.keys(doc.getState().levels)[0]!;
    const registry = createFullCopilotRegistry();

    const provider = createMockProvider((_req, idx) => {
      if (idx === 0) {
        return {
          text: '',
          toolCalls: [
            { id: 'r1', name: 'get_level_details', arguments: { levelId } },
            { id: 'w1', name: 'add_wall', arguments: { levelId, startXMm: 0, startYMm: 0, endXMm: 4000, endYMm: 0 } },
            { id: 'w2', name: 'add_wall', arguments: { levelId, startXMm: 4000, startYMm: 0, endXMm: 4000, endYMm: 3000 } },
            { id: 'w3', name: 'add_wall', arguments: { levelId, startXMm: 4000, startYMm: 3000, endXMm: 0, endYMm: 3000 } },
            { id: 'w4', name: 'add_wall', arguments: { levelId, startXMm: 0, startYMm: 3000, endXMm: 0, endYMm: 0 } },
            { id: 'rm', name: 'add_room', arguments: { levelId, name: 'Bureau', seedXMm: 2000, seedYMm: 1500 } },
            { id: 'dm', name: 'auto_dimension_level', arguments: { levelId } },
            { id: 'vw', name: 'auto_generate_views', arguments: {} },
            { id: 'au', name: 'audit_model', arguments: { levelId } },
          ],
        };
      }
      return { text: 'Pièce 4x3 m créée.', toolCalls: [] };
    });

    const turn = await runCopilotTurn({ doc, provider, registry, prompt: 'Crée une pièce 4x3' });
    expect(turn.status).toBe('completed');
    expect(turn.toolCallCount).toBe(9);
    expect(turn.plan?.steps).toHaveLength(7);
  });

  it('s’auto-corrige sur BimValidationError réinjecté au LLM et bloque si retries épuisés', async () => {
    const doc = BimDocument.createDefaultProject();
    const levelId = Object.keys(doc.getState().levels)[0]!;
    const wallTypeId = Object.keys(doc.getState().wallTypes)[0]!;
    doc.execute(
      new AddWallCommand({
        id: 'w_retry',
        category: 'wall',
        typeId: wallTypeId,
        levelId,
        start: { x: 0, y: 0 },
        end: { x: 3000, y: 0 },
      }),
    );

    const registry = createFullCopilotRegistry();
    const selfCorrectProvider = createMockProvider((req, idx) => {
      if (idx === 0) {
        // 1ère tentative invalide : porte hors du mur de 3000 mm
        return {
          text: '',
          toolCalls: [
            { id: 'd_bad', name: 'add_door', arguments: { hostWallId: 'w_retry', offsetAlongMm: 5000 } },
          ],
        };
      }
      if (idx === 1) {
        const lastTool = req.messages.filter((m) => m.role === 'tool').at(-1);
        const errPayload = JSON.parse(lastTool?.role === 'tool' ? lastTool.content : '{}');
        expect(errPayload.ok).toBe(false);
        expect(errPayload.code).toBeTruthy();
        expect(errPayload.offendingIds).toBeDefined();
        return {
          text: '',
          toolCalls: [
            { id: 'd_ok', name: 'add_door', arguments: { hostWallId: 'w_retry', offsetAlongMm: 1000 } },
          ],
        };
      }
      return { text: 'Porte replacée à 1000 mm.', toolCalls: [] };
    });

    const recovered = await runCopilotTurn({
      doc,
      provider: selfCorrectProvider,
      registry,
      prompt: 'Ajoute une porte',
    });
    expect(recovered.status).toBe('completed');
    expect(recovered.selfCorrectionCount).toBe(1);
    expect(recovered.plan?.steps).toHaveLength(1);

    // Test épuisement de MAX_SELF_CORRECTION_RETRIES (3)
    const stubbornProvider = createMockProvider((_req, idx) => ({
      text: '',
      toolCalls: [
        {
          id: `bad_${idx}`,
          name: 'add_door',
          arguments: { hostWallId: 'w_retry', offsetAlongMm: 9000 },
        },
      ],
    }));

    const exhausted = await runCopilotTurn({
      doc,
      provider: stubbornProvider,
      registry,
      prompt: 'Ajoute une porte invalide en boucle',
    });
    expect(exhausted.status).toBe('validation_failed');
    expect(exhausted.selfCorrectionCount).toBe(MAX_SELF_CORRECTION_RETRIES + 1);
    expect(exhausted.plan).toBeNull();
  });

  it('respecte MAX_TOOL_STEPS = 8 et annule proprement via AbortSignal', async () => {
    const doc = BimDocument.createDefaultProject();
    const registry = createFullCopilotRegistry();

    const infiniteReadProvider = createMockProvider((_req, idx) => ({
      text: '',
      toolCalls: [{ id: `r_${idx}`, name: 'get_project_summary', arguments: {} }],
    }));

    const capped = await runCopilotTurn({
      doc,
      provider: infiniteReadProvider,
      registry,
      prompt: 'Boucle infinie',
    });
    expect(capped.status).toBe('limit_exceeded');
    expect(capped.roundTrips).toBe(MAX_TOOL_STEPS);
    expect(capped.limitReason).toBe('MAX_TOOL_STEPS');

    const controller = new AbortController();
    const abortProvider = createMockProvider(() => {
      controller.abort();
      return {
        text: '',
        toolCalls: [{ id: 'r_abort', name: 'get_project_summary', arguments: {} }],
      };
    });

    await expect(
      runCopilotTurn({
        doc,
        provider: abortProvider,
        registry,
        prompt: 'Annule en plein vol',
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: 'ABORTED' });
  });

  it('Stale Plan Guard : détecte une dérive, revalide un plan compatible et rejette un plan devenu invalide', async () => {
    const doc = BimDocument.createDefaultProject();
    const levelId = Object.keys(doc.getState().levels)[0]!;
    const wallTypeId = Object.keys(doc.getState().wallTypes)[0]!;
    doc.execute(
      new AddWallCommand({
        id: 'w_target',
        category: 'wall',
        typeId: wallTypeId,
        levelId,
        start: { x: 0, y: 0 },
        end: { x: 4000, y: 0 },
      }),
    );

    const registry = createFullCopilotRegistry();
    const provider = createMockProvider((_req, idx) => {
      if (idx === 0) {
        return {
          text: '',
          toolCalls: [
            { id: 'd1', name: 'add_door', arguments: { hostWallId: 'w_target', offsetAlongMm: 1000 } },
          ],
        };
      }
      return { text: 'Porte préparée.', toolCalls: [] };
    });

    const turn = await runCopilotTurn({ doc, provider, registry, prompt: 'Pose une porte' });
    const plan = turn.plan!;

    // Mutation concurrente compatible (ajout d'un autre mur indépendant)
    doc.execute(
      new AddWallCommand({
        id: 'w_unrelated',
        category: 'wall',
        typeId: wallTypeId,
        levelId,
        start: { x: 0, y: 5000 },
        end: { x: 3000, y: 5000 },
      }),
    );

    // applyPlan doit bloquer avec status: 'stale' sans muter doc
    const staleRes = applyPlan(doc, plan);
    expect(staleRes.status).toBe('stale');
    expect(Object.keys(doc.getState().doors)).toHaveLength(0);

    // revalidatePlan doit réussir en < 10 ms sans LLM et réancrer baseState
    const revalOk = revalidatePlan(doc, plan);
    expect(revalOk.status).toBe('valid');
    if (revalOk.status === 'valid') {
      const applied = applyPlan(doc, revalOk.plan);
      expect(applied.status).toBe('applied');
      expect(Object.keys(doc.getState().doors)).toHaveLength(1);
    }

    // Mutation concurrente incompatible : suppression du mur cible -> revalidatePlan renvoie invalid
    const delProvider = createMockProvider((_req, idx) => {
      if (idx === 0) {
        return {
          text: '',
          toolCalls: [
            { id: 'm1', name: 'move_wall', arguments: { wallId: 'w_unrelated', deltaXMm: 200, deltaYMm: 0 } },
          ],
        };
      }
      return { text: 'Déplacement prêt.', toolCalls: [] };
    });
    const moveTurn = await runCopilotTurn({ doc, provider: delProvider, registry, prompt: 'Décale mur' });
    const movePlan = moveTurn.plan!;

    doc.execute(new AddWallCommand({
      id: 'w_dummy',
      category: 'wall',
      typeId: wallTypeId,
      levelId,
      start: { x: 0, y: 9000 },
      end: { x: 2000, y: 9000 },
    }));
    // Supprimer w_unrelated pour casser movePlan
    registry.execute('delete_wall', { wallId: 'w_unrelated' }, { doc });

    const revalInvalid = revalidatePlan(doc, movePlan);
    expect(revalInvalid.status).toBe('invalid');
    if (revalInvalid.status === 'invalid') {
      expect(revalInvalid.failedStepIndex).toBe(0);
      expect(revalInvalid.error.code).toBe('ELEMENT_NOT_FOUND');
    }
  });
});
