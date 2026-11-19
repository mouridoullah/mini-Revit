import type { ElementId } from '../types.js';

/**
 * Représente une violation de règle métier BIM identifiée sur une entité.
 */
export interface RuleViolation {
  readonly code: string;
  readonly message: string;
  readonly offendingIds: readonly ElementId[];
  readonly severity?: 'warning' | 'error';
  readonly measurement?: number;
  readonly threshold?: number;
}

/**
 * Erreur de validation métier levée lors de la violation d'une règle d'intégrité BIM.
 */
export class BimValidationError extends Error {
  public readonly blockingIds?: readonly ElementId[];
  public readonly offendingIds?: readonly ElementId[];

  public constructor(
    public readonly code: string,
    message: string,
    details?: {
      blockingIds?: readonly ElementId[];
      offendingIds?: readonly ElementId[];
      [key: string]: unknown;
    },
  ) {
    super(`[${code}] ${message}`);
    this.name = 'BimValidationError';
    if (details) {
      if (details.blockingIds) {
        this.blockingIds = details.blockingIds;
      }
      if (details.offendingIds) {
        this.offendingIds = details.offendingIds;
      }
      Object.assign(this, details);
    }
  }
}
