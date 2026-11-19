import type { Level, BimState, ElementId } from '../types.js';
import type { RuleViolation } from './types.js';
import { assertNoViolations } from './utils.js';

/**
 * Vérifie les paramètres d'un niveau architectural et l'unicité de son élévation.
 */
export function checkLevelViolations(level: Level, state?: BimState): RuleViolation[] {
  const violations: RuleViolation[] = [];

  if (!level.name || level.name.trim() === '') {
    violations.push({
      code: 'INVALID_LEVEL_NAME',
      message: 'Level name cannot be empty.',
      offendingIds: [level.id],
    });
  }

  if (!Number.isFinite(level.elevation)) {
    violations.push({
      code: 'INVALID_LEVEL_ELEVATION',
      message: `Level elevation must be a finite number (got ${level.elevation}).`,
      offendingIds: [level.id],
    });
  }

  // Règle d'intégrité altimétrique : unicité stricte des élévations (ADR-036 / MULTI_LEVEL_SPEC)
  if (state?.levels) {
    for (const other of Object.values(state.levels)) {
      if (other.id !== level.id && Math.abs(other.elevation - level.elevation) < 1e-4) {
        violations.push({
          code: 'DUPLICATE_LEVEL_ELEVATION',
          message: `Two levels cannot share the exact same elevation: "${level.name}" and "${other.name}" both have elevation ${level.elevation} mm.`,
          offendingIds: [level.id, other.id],
        });
      }
    }
  }

  return violations;
}

/**
 * Valide les paramètres d'un niveau architectural.
 */
export function validateLevel(level: Level, state?: BimState): void {
  assertNoViolations(checkLevelViolations(level, state));
}

/**
 * Vérifie si un niveau peut être supprimé sans briser l'intégrité référentielle.
 */
export function canDeleteLevel(
  levelId: ElementId,
  state: BimState,
): { readonly allowed: boolean; readonly reason?: string } {
  if (!state.levels[levelId]) {
    return { allowed: false, reason: `Level "${levelId}" does not exist.` };
  }

  const attachedWalls = Object.values(state.walls).filter((w) => w.levelId === levelId);
  if (attachedWalls.length > 0) {
    return {
      allowed: false,
      reason: `Cannot delete Level "${levelId}": ${attachedWalls.length} wall(s) are attached to it.`,
    };
  }

  const attachedRooms = Object.values(state.rooms ?? {}).filter((r) => r.levelId === levelId);
  if (attachedRooms.length > 0) {
    return {
      allowed: false,
      reason: `Cannot delete Level "${levelId}": ${attachedRooms.length} room(s) are attached to it.`,
    };
  }

  const attachedComponents = Object.values(state.components ?? {}).filter((c) => c.levelId === levelId);
  if (attachedComponents.length > 0) {
    return {
      allowed: false,
      reason: `Cannot delete Level "${levelId}": ${attachedComponents.length} component(s) are attached to it.`,
    };
  }

  return { allowed: true };
}
