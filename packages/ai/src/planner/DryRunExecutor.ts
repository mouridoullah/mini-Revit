import {
  BimDocument,
  BimValidationError,
  generateId,
  type BimState,
  type ElementId,
} from '@tabax/core';
import { buildBimContext, formatBimContextPrompt } from '../context/BimContextBuilder.js';
import {
  ProviderError,
  type AiAbortSignal,
  type LlmMessage,
  type LlmProvider,
} from '../providers/types.js';
import type { ToolRegistry } from '../tools/ToolRegistry.js';
import { collectPreexistingIdsInState } from '../tools/mutateTools.js';
import type { ToolErrorResult } from '../types.js';
import type {
  ActionPlan,
  ActionPlanSummary,
  ApplyPlanResult,
  PlannedStep,
  RevalidatePlanResult,
} from './types.js';

export const MAX_TOOL_STEPS = 8;
export const MAX_TOTAL_TOOL_CALLS = 24;
export const MAX_SELF_CORRECTION_RETRIES = 3;

export interface RunCopilotTurnOptions {
  readonly doc: BimDocument;
  readonly provider: LlmProvider;
  readonly registry: ToolRegistry;
  readonly prompt: string;
  readonly history?: readonly LlmMessage[] | undefined;
  readonly activeLevelId?: string | undefined;
  readonly selectedIds?: readonly ElementId[] | undefined;
  readonly signal?: AiAbortSignal | undefined;
  readonly planLabel?: string | undefined;
}

export type CopilotTurnStatus = 'completed' | 'validation_failed' | 'limit_exceeded';

export interface CopilotTurnResult {
  readonly status: CopilotTurnStatus;
  readonly assistantText: string;
  readonly plan: ActionPlan | null;
  readonly roundTrips: number;
  readonly toolCallCount: number;
  readonly selfCorrectionCount: number;
  readonly lastValidationError?: ToolErrorResult | undefined;
  readonly limitReason?: 'MAX_TOOL_STEPS' | 'MAX_TOTAL_TOOL_CALLS' | undefined;
}

function summarizePlanSteps(steps: readonly PlannedStep[]): ActionPlanSummary {
  const byTool: Record<string, number> = {};
  let createdCount = 0;
  let modifiedCount = 0;
  let deletedCount = 0;

  for (const step of steps) {
    byTool[step.toolName] = (byTool[step.toolName] ?? 0) + 1;
    if (step.operation === 'create') createdCount++;
    else if (step.operation === 'update') modifiedCount++;
    else deletedCount++;
  }

  return {
    totalSteps: steps.length,
    byTool,
    createdCount,
    modifiedCount,
    deletedCount,
  };
}

export function buildActionPlan(
  baseState: Readonly<BimState>,
  steps: readonly PlannedStep[],
  label: string,
  planId = generateId(),
): ActionPlan {
  const allTargetCandidates: ElementId[] = [];
  const createdSet = new Set<ElementId>();
  const createdElementIds: ElementId[] = [];

  for (const step of steps) {
    for (const tid of step.targetIds) {
      allTargetCandidates.push(tid);
    }
    for (const cid of step.createdIds) {
      if (!createdSet.has(cid)) {
        createdSet.add(cid);
        createdElementIds.push(cid);
      }
    }
  }

  return {
    id: planId,
    label,
    baseState,
    steps: [...steps],
    targetElementIds: collectPreexistingIdsInState(baseState, allTargetCandidates),
    createdElementIds,
    summary: summarizePlanSteps(steps),
  };
}

function buildDefaultPlanLabel(prompt: string, steps: readonly PlannedStep[]): string {
  const trimmed = prompt.trim();
  if (trimmed.length > 0 && trimmed.length <= 64) {
    return `IA : ${trimmed}`;
  }
  return `IA : ${steps.length} action${steps.length > 1 ? 's' : ''}`;
}

function buildSystemPrompt(
  state: Readonly<BimState>,
  activeLevelId?: string,
  selectedIds?: readonly ElementId[],
): string {
  const ctx = buildBimContext(state, { activeLevelId, selectedIds });
  return [
    'Tu es l’assistant BIM Tabax.',
    'Règles strictes :',
    '- Toutes les dimensions et coordonnées sont en millimètres (mm) ; les rotations de composants en degrés (rotationDeg).',
    '- Consulte get_level_details avant de placer une ouverture ou modifier un mur afin d’exploiter lengthMm, orientation et occupiedIntervalsMm.',
    '- Utilise uniquement les IDs exacts fournis dans le contexte ou retournés par les outils (jamais d’ID inventé).',
    '- En cas d’erreur de validation d’outil, corrige tes paramètres à l’aide du code d’erreur, des offendingIds ou des validIds retournés.',
    '- Exécute toutes les actions demandées par de véritables appels d’outils (n’écris jamais de faux résultat ni de balise <tool_response>), puis résume en français.',
    '',
    `Contexte BIM courant (JSON compact) : ${formatBimContextPrompt(ctx)}`,
  ].join('\n');
}

function throwIfAborted(signal?: AiAbortSignal): void {
  if (signal?.aborted) {
    throw new ProviderError('ABORTED', 'Opération IA interrompue par l’utilisateur.');
  }
}

/**
 * Exécute un tour agentique complet dans un bac à sable cloné (ADR-073 D4) :
 * - Ne mute jamais le document actif.
 * - Enchaîne les outils sur sandbox avec ULIDs figés et boucle d’auto-correction bornée.
 * - Retourne plan: null en lecture seule ou un ActionPlan prêt pour validation utilisateur.
 */
export async function runCopilotTurn(options: RunCopilotTurnOptions): Promise<CopilotTurnResult> {
  throwIfAborted(options.signal);

  const baseState = options.doc.getState();
  const sandbox = options.doc.cloneForSandbox();
  const systemPrompt = buildSystemPrompt(baseState, options.activeLevelId, options.selectedIds);

  const messages: LlmMessage[] = [
    { role: 'system', content: systemPrompt },
    ...(options.history ?? []).filter((m) => m.role !== 'system'),
    { role: 'user', content: options.prompt },
  ];

  const exposedTools = options.registry.list();
  const plannedSteps: PlannedStep[] = [];
  let roundTrips = 0;
  let toolCallCount = 0;
  let selfCorrectionCount = 0;
  let lastValidationError: ToolErrorResult | undefined;

  while (roundTrips < MAX_TOOL_STEPS) {
    throwIfAborted(options.signal);
    roundTrips++;

    const response = await options.provider.chat({
      messages,
      tools: exposedTools,
      ...(options.signal ? { signal: options.signal } : {}),
    });

    if (response.toolCalls.length === 0) {
      const plan =
        plannedSteps.length > 0
          ? buildActionPlan(
              baseState,
              plannedSteps,
              options.planLabel ?? buildDefaultPlanLabel(options.prompt, plannedSteps),
            )
          : null;

      const cleanAssistantText =
        plannedSteps.length > 0
          ? response.text.replace(/<tool_response>[\s\S]*?<\/tool_response>/gi, '').trim()
          : response.text;

      return {
        status: 'completed',
        assistantText: cleanAssistantText,
        plan,
        roundTrips,
        toolCallCount,
        selfCorrectionCount,
      };
    }

    messages.push({
      role: 'assistant',
      content: response.text,
      toolCalls: response.toolCalls,
    });

    for (const tc of response.toolCalls) {
      throwIfAborted(options.signal);

      if (toolCallCount >= MAX_TOTAL_TOOL_CALLS) {
        return {
          status: 'limit_exceeded',
          assistantText:
            response.text ||
            `Plafond de sécurité atteint (${MAX_TOTAL_TOOL_CALLS} appels d’outils maximum).`,
          plan: null,
          roundTrips,
          toolCallCount,
          selfCorrectionCount,
          limitReason: 'MAX_TOTAL_TOOL_CALLS',
        };
      }

      toolCallCount++;
      const toolDef = options.registry.get(tc.name);
      const toolResult = options.registry.execute(tc.name, tc.arguments, {
        doc: sandbox,
        activeLevelId: options.activeLevelId,
        selectedIds: options.selectedIds,
        onPlanStep: (step) => {
          plannedSteps.push(step);
        },
      });

      messages.push({
        role: 'tool',
        toolCallId: tc.id,
        name: tc.name,
        content: JSON.stringify(toolResult),
      });

      if (!toolResult.ok && toolDef?.mode === 'mutate') {
        selfCorrectionCount++;
        lastValidationError = toolResult;
        if (selfCorrectionCount > MAX_SELF_CORRECTION_RETRIES) {
          return {
            status: 'validation_failed',
            assistantText: `Impossible de valider les modifications après ${MAX_SELF_CORRECTION_RETRIES} tentatives d’auto-correction (${toolResult.code} : ${toolResult.message}).`,
            plan: null,
            roundTrips,
            toolCallCount,
            selfCorrectionCount,
            lastValidationError,
          };
        }
      }
    }
  }

  return {
    status: 'limit_exceeded',
    assistantText: `Plafond de sécurité atteint (${MAX_TOOL_STEPS} itérations LLM maximum).`,
    plan: null,
    roundTrips,
    toolCallCount,
    selfCorrectionCount,
    ...(lastValidationError ? { lastValidationError } : {}),
    limitReason: 'MAX_TOOL_STEPS',
  };
}

/**
 * Applique un ActionPlan sur le document réel en 1 seule transaction atomique (ADR-073 D4).
 * Bloque toute application si le document a divergé depuis plan.baseState (Stale Plan Guard).
 */
export function applyPlan(doc: BimDocument, plan: ActionPlan): ApplyPlanResult {
  if (doc.getState() !== plan.baseState) {
    return { status: 'stale' };
  }
  if (plan.steps.length === 0) {
    return {
      status: 'applied',
      result: { changed: [], patches: [], inversePatches: [] },
    };
  }

  try {
    const result = doc.runTransaction(plan.label, () => {
      for (const step of plan.steps) {
        doc.execute(step.createCommand());
      }
    });
    return { status: 'applied', result };
  } catch (err) {
    if (err instanceof BimValidationError) {
      return {
        status: 'error',
        code: err.code,
        message: err.message,
        ...(err.offendingIds ? { offendingIds: err.offendingIds } : {}),
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: 'error',
      code: 'PLAN_APPLY_ERROR',
      message,
    };
  }
}

/**
 * Rejoue de façon déterministe (< 10 ms, zéro appel LLM) les descripteurs d’un plan
 * sur un clone frais de l’état courant afin de le réancrer après modification concurrente.
 */
export function revalidatePlan(doc: BimDocument, plan: ActionPlan): RevalidatePlanResult {
  const currentState = doc.getState();
  const sandbox = doc.cloneForSandbox();

  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];
    if (!step) continue;
    try {
      sandbox.execute(step.createCommand());
    } catch (err) {
      if (err instanceof BimValidationError) {
        return {
          status: 'invalid',
          failedStepIndex: i,
          step,
          error: {
            code: err.code,
            message: err.message,
            ...(err.offendingIds ? { offendingIds: err.offendingIds } : {}),
          },
        };
      }
      const message = err instanceof Error ? err.message : String(err);
      return {
        status: 'invalid',
        failedStepIndex: i,
        step,
        error: {
          code: 'REVALIDATION_ERROR',
          message,
        },
      };
    }
  }

  return {
    status: 'valid',
    plan: buildActionPlan(currentState, plan.steps, plan.label, plan.id),
  };
}
