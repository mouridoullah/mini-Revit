import type { Dimension, BimState } from '../types.js';
import type { RuleViolation } from './types.js';
import { assertNoViolations } from './utils.js';

/**
 * Vérifie l'intégrité métier et référentielle d'une cotation 2D (Dimension).
 */
export function checkDimensionViolations(dim: Dimension, state: BimState): RuleViolation[] {
  const violations: RuleViolation[] = [];

  // 1. Niveau existant
  if (!state.levels[dim.levelId]) {
    violations.push({
      code: 'UNKNOWN_LEVEL',
      message: `Dimension refers to non-existent Level ID: "${dim.levelId}".`,
      offendingIds: [dim.id],
    });
  }

  // 2. Au moins une référence valide
  if (!dim.references || dim.references.length === 0) {
    violations.push({
      code: 'INVALID_DIMENSION_REFERENCES',
      message: 'Dimension must reference at least one architectural element.',
      offendingIds: [dim.id],
    });
  }

  // 3. Toutes les références doivent être des murs existants
  for (const refId of dim.references ?? []) {
    if (!state.walls[refId]) {
      violations.push({
        code: 'UNKNOWN_DIMENSION_REFERENCE',
        message: `Dimension references non-existent wall ID: "${refId}".`,
        offendingIds: [dim.id],
      });
    }
  }

  // 4. Décalage numérique fini
  if (!Number.isFinite(dim.offset)) {
    violations.push({
      code: 'INVALID_DIMENSION_OFFSET',
      message: 'Dimension offset must be a finite number.',
      offendingIds: [dim.id],
    });
  }

  return violations;
}

/**
 * Valide l'intégrité métier et référentielle d'une cotation 2D (Dimension).
 */
export function validateDimension(dim: Dimension, state: BimState): void {
  assertNoViolations(checkDimensionViolations(dim, state));
}
