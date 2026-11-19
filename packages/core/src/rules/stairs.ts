import type { Stair, StairType, BimState } from '../types.js';
import type { RuleViolation } from './types.js';
import { assertNoViolations } from './utils.js';
import { computeStairGeometry } from '../stairs.js';

/**
 * Vérifie les contraintes métier sur un StairType (ADR-048).
 */
export function checkStairTypeViolations(stairType: StairType): RuleViolation[] {
  const violations: RuleViolation[] = [];

  if (!stairType.name || stairType.name.trim() === '') {
    violations.push({
      code: 'INVALID_STAIR_NAME',
      message: 'StairType name cannot be empty.',
      offendingIds: [stairType.id],
    });
  }

  if (!Number.isFinite(stairType.width) || stairType.width < 500 || stairType.width > 2000) {
    violations.push({
      code: 'INVALID_STAIR_WIDTH',
      message: `StairType width must be between 500 and 2000 mm (got ${stairType.width} mm).`,
      offendingIds: [stairType.id],
    });
  }

  return violations;
}

export function validateStairType(stairType: StairType): void {
  assertNoViolations(checkStairTypeViolations(stairType));
}

/**
 * Vérifie les contraintes métier sur un escalier droit (ADR-048).
 */
export function checkStairViolations(stair: Stair, state: BimState): RuleViolation[] {
  const violations: RuleViolation[] = [];

  // 1. Type d'escalier existant
  const stairType = state.stairTypes?.[stair.stairTypeId];
  if (!stairType) {
    violations.push({
      code: 'UNKNOWN_STAIR_TYPE',
      message: `Stair references unknown StairType "${stair.stairTypeId}".`,
      offendingIds: [stair.id, stair.stairTypeId],
    });
  }

  // 2. Niveau bas
  const bottomLevel = state.levels[stair.bottomLevelId];
  if (!bottomLevel) {
    violations.push({
      code: 'UNKNOWN_BOTTOM_LEVEL',
      message: `Stair references unknown bottom level "${stair.bottomLevelId}".`,
      offendingIds: [stair.id, stair.bottomLevelId],
    });
  }

  // 3. Niveau haut
  const topLevel = state.levels[stair.topLevelId];
  if (!topLevel) {
    violations.push({
      code: 'UNKNOWN_TOP_LEVEL',
      message: `Stair references unknown top level "${stair.topLevelId}".`,
      offendingIds: [stair.id, stair.topLevelId],
    });
  }

  // 4. Adjacence stricte des niveaux (ADR-048)
  if (bottomLevel && topLevel) {
    if (topLevel.elevation <= bottomLevel.elevation) {
      violations.push({
        code: 'STAIR_LEVELS_NOT_ADJACENT',
        message: `Stair topLevel elevation (${topLevel.elevation} mm) must be strictly greater than bottomLevel elevation (${bottomLevel.elevation} mm).`,
        offendingIds: [stair.id, stair.bottomLevelId, stair.topLevelId],
      });
    } else {
      // Vérifier qu'aucun niveau intermédiaire n'existe
      const hasIntermediate = Object.values(state.levels).some(
        (lvl) =>
          lvl.id !== stair.bottomLevelId &&
          lvl.id !== stair.topLevelId &&
          lvl.elevation > bottomLevel.elevation &&
          lvl.elevation < topLevel.elevation,
      );
      if (hasIntermediate) {
        violations.push({
          code: 'STAIR_LEVELS_NOT_ADJACENT',
          message: `Stair must connect two adjacent levels; intermediate level detected between "${bottomLevel.name}" and "${topLevel.name}".`,
          offendingIds: [stair.id, stair.bottomLevelId, stair.topLevelId],
        });
      }
    }
  }

  // 5. Géométrie de l'emprise (run)
  const dx = stair.end.x - stair.start.x;
  const dy = stair.end.y - stair.start.y;
  const totalRun = Math.hypot(dx, dy);
  const effectiveWidth = stair.widthOverride ?? stairType?.width ?? 900;

  if (totalRun < effectiveWidth) {
    violations.push({
      code: 'INVALID_STAIR_GEOMETRY',
      message: `Stair total run length (${totalRun.toFixed(1)} mm) is shorter than its width (${effectiveWidth} mm).`,
      offendingIds: [stair.id],
    });
  } else if (totalRun > 20000) {
    violations.push({
      code: 'INVALID_STAIR_GEOMETRY',
      message: `Stair total run length (${totalRun.toFixed(1)} mm) exceeds maximum allowable length of 20000 mm.`,
      offendingIds: [stair.id],
    });
  }

  return violations;
}

export function validateStair(stair: Stair, state: BimState): void {
  assertNoViolations(checkStairViolations(stair, state));
}

/**
 * Valide la conformité ergonomique de Blondel d'un escalier (non-bloquant).
 * Conforme à ADR-048 (D3).
 */
export function validateStairBlondel(
  stair: Stair,
  state: BimState,
): { readonly isCompliant: boolean; readonly warnings: readonly string[] } {
  const geom = computeStairGeometry(stair, state);
  return {
    isCompliant: geom.isCompliant,
    warnings: geom.warnings,
  };
}
