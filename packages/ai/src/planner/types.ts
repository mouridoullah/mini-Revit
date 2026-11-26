import type { BimState, Command, CommandResult, ElementId } from '@tabax/core';

export type PlanOperationKind = 'create' | 'update' | 'delete';

/**
 * Descripteur immuable d'une étape validée en bac à sable (ADR-073 Lot 2).
 * Ne conserve jamais d'instance Command déjà exécutée : expose une fabrique pure createCommand().
 */
export interface PlannedStep<TArgs = Record<string, unknown>> {
  readonly toolName: string;
  readonly operation: PlanOperationKind;
  readonly summary: string;
  readonly normalizedArgs: TArgs;
  readonly createdIds: readonly ElementId[];
  readonly targetIds: readonly ElementId[];
  createCommand(): Command;
}

export interface ActionPlanSummary {
  readonly totalSteps: number;
  readonly byTool: Readonly<Record<string, number>>;
  readonly createdCount: number;
  readonly modifiedCount: number;
  readonly deletedCount: number;
}

export interface ActionPlan {
  readonly id: string;
  readonly label: string;
  readonly baseState: Readonly<BimState>;
  readonly steps: readonly PlannedStep[];
  /**
   * Identifiants préexistants dans baseState ciblés par le plan (pour surlignage UI 2D/3D).
   */
  readonly targetElementIds: readonly ElementId[];
  readonly createdElementIds: readonly ElementId[];
  readonly summary: ActionPlanSummary;
}

export type ApplyPlanResult =
  | { readonly status: 'applied'; readonly result: CommandResult }
  | { readonly status: 'stale' }
  | {
      readonly status: 'error';
      readonly code: string;
      readonly message: string;
      readonly offendingIds?: readonly ElementId[] | undefined;
    };

export type RevalidatePlanResult =
  | { readonly status: 'valid'; readonly plan: ActionPlan }
  | {
      readonly status: 'invalid';
      readonly failedStepIndex: number;
      readonly step: PlannedStep;
      readonly error: {
        readonly code: string;
        readonly message: string;
        readonly offendingIds?: readonly ElementId[] | undefined;
      };
    };
