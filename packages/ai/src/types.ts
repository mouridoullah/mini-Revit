import type { BimDocument, ElementId } from '@tabax/core';
import type { PlannedStep } from './planner/types.js';

/**
 * Type scalaire autorisé dans un schéma JSON plat compatible Gemini REST et Ollama.
 * Aucune union ["number", "null"] ni anyOf n'est autorisée (ADR-073 D3).
 */
export type FlatJsonSchemaType = 'string' | 'number' | 'integer' | 'boolean' | 'array';

export interface FlatJsonSchemaProperty {
  readonly type: FlatJsonSchemaType;
  readonly description: string;
  readonly enum?: readonly string[] | undefined;
  readonly items?: {
    readonly type: 'string' | 'number' | 'integer' | 'boolean';
    readonly enum?: readonly string[] | undefined;
  } | undefined;
  readonly minimum?: number | undefined;
  readonly maximum?: number | undefined;
}

export interface FlatJsonSchema {
  readonly type: 'object';
  readonly properties: Readonly<Record<string, FlatJsonSchemaProperty>>;
  readonly required?: readonly string[] | undefined;
}

export type ToolMode = 'read' | 'mutate';

export interface ToolSuccessResult<T = unknown> {
  readonly ok: true;
  readonly data: T;
}

export interface ToolErrorResult {
  readonly ok: false;
  readonly code: string;
  readonly message: string;
  readonly validIds?: readonly string[] | undefined;
  readonly offendingIds?: readonly string[] | undefined;
}

export type ToolResult<T = unknown> = ToolSuccessResult<T> | ToolErrorResult;

export interface ToolExecutionContext {
  readonly doc: BimDocument;
  readonly activeLevelId?: string | undefined;
  readonly selectedIds?: readonly ElementId[] | undefined;
  readonly onPlanStep?: ((step: PlannedStep) => void) | undefined;
}

export interface ToolDefinition<TArgs = Record<string, unknown>, TResult = unknown> {
  readonly name: string;
  readonly mode: ToolMode;
  readonly description: string;
  readonly parameters: FlatJsonSchema;
  validateArgs(raw: unknown): TArgs;
  execute(args: TArgs, ctx: ToolExecutionContext): ToolResult<TResult>;
}

export interface ExposedToolSchema {
  readonly name: string;
  readonly mode: ToolMode;
  readonly description: string;
  readonly parameters: FlatJsonSchema;
}
