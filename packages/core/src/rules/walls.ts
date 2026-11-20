import type { Wall, WallType, BimState, ElementId } from '../types.js';
import type { RuleViolation } from './types.js';
import { assertNoViolations } from './utils.js';
import { getComponentObbVertices, doConvexPolygonsIntersect } from './components.js';
import { computeWallFootprint2d, type WallFootprint2D } from '@mini-bim/geometry';

/**
 * Vérifie les règles métier propres à un mur (longueur, type, niveau).
 */
export function checkWallViolations(wall: Wall, state: BimState): RuleViolation[] {
  const violations: RuleViolation[] = [];

  // 1. Longueur strictement positive
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const length = Math.hypot(dx, dy);

  if (!Number.isFinite(length) || length <= 1e-4) {
    violations.push({
      code: 'INVALID_WALL_LENGTH',
      message: `Wall length must be strictly positive (got ${length} mm).`,
      offendingIds: [wall.id],
    });
  }

  // 2. Vérification du WallType référencé
  if (!state.wallTypes[wall.typeId]) {
    violations.push({
      code: 'UNKNOWN_WALL_TYPE',
      message: `Wall refers to non-existent WallType ID: "${wall.typeId}".`,
      offendingIds: [wall.id],
    });
  }

  // 3. Vérification du Level référencé
  if (!state.levels[wall.levelId]) {
    violations.push({
      code: 'UNKNOWN_LEVEL',
      message: `Wall refers to non-existent Level ID: "${wall.levelId}".`,
      offendingIds: [wall.id],
    });
  }

  // 4. Détection non-bloquante des interférences avec les composants libres du même niveau (ADR-054 / Warning)
  // Optimisation Broad-phase AABB (Phase 9.4) : élimine la boucle quadratique O(C * (C + W))
  if (state.components) {
    const wallType = state.wallTypes[wall.typeId];
    const halfThick = ((wallType?.thickness ?? 200) * 0.5) + 5;
    const wallMinX = Math.min(wall.start.x, wall.end.x) - halfThick;
    const wallMaxX = Math.max(wall.start.x, wall.end.x) + halfThick;
    const wallMinY = Math.min(wall.start.y, wall.end.y) - halfThick;
    const wallMaxY = Math.max(wall.start.y, wall.end.y) + halfThick;

    let wallFp: WallFootprint2D | null = null;

    for (const comp of Object.values(state.components)) {
      if (comp.levelId !== wall.levelId) continue;
      if (comp.placement.hostWallId === wall.id) continue;

      // Broad-phase AABB 2D
      const ct = state.componentTypes ? state.componentTypes[comp.typeId] : undefined;
      const maxDim = Math.max(ct?.width ?? 600, ct?.depth ?? 600) * 0.75;
      if (
        comp.placement.x + maxDim < wallMinX ||
        comp.placement.x - maxDim > wallMaxX ||
        comp.placement.y + maxDim < wallMinY ||
        comp.placement.y - maxDim > wallMaxY
      ) {
        continue;
      }

      // Narrow-phase : polygones convexes SAT uniquement si AABB se chevauchent
      if (!wallFp) {
        wallFp = computeWallFootprint2d({
          start: wall.start,
          end: wall.end,
          thickness: wallType?.thickness ?? 200,
          locationLine: 'center',
        });
      }

      const compPoly = getComponentObbVertices(comp, state);
      if (wallFp && doConvexPolygonsIntersect(compPoly, wallFp.vertices, 1)) {
        violations.push({
          code: 'COMPONENT_COLLISION',
          message: `Component "${comp.id}" collides with wall "${wall.id}".`,
          offendingIds: [comp.id, wall.id],
          severity: 'warning',
        });
      }
    }
  }

  return violations;
}

/**
 * Vérifie les paramètres d'un type de mur.
 */
export function checkWallTypeViolations(wallType: WallType): RuleViolation[] {
  const violations: RuleViolation[] = [];

  if (!wallType.name || wallType.name.trim() === '') {
    violations.push({
      code: 'INVALID_WALL_TYPE_NAME',
      message: 'WallType name cannot be empty.',
      offendingIds: [wallType.id],
    });
  }

  if (!Number.isFinite(wallType.thickness) || wallType.thickness <= 0) {
    violations.push({
      code: 'INVALID_WALL_TYPE_THICKNESS',
      message: `WallType thickness must be strictly positive (got ${wallType.thickness} mm).`,
      offendingIds: [wallType.id],
    });
  }

  if (!Number.isFinite(wallType.height) || wallType.height <= 0) {
    violations.push({
      code: 'INVALID_WALL_TYPE_HEIGHT',
      message: `WallType height must be strictly positive (got ${wallType.height} mm).`,
      offendingIds: [wallType.id],
    });
  }

  return violations;
}

/**
 * Valide l'intégrité géométrique et référentielle d'un mur.
 */
export function validateWall(wall: Wall, state: BimState): void {
  assertNoViolations(checkWallViolations(wall, state));
}

/**
 * Valide les paramètres d'un type de mur.
 */
export function validateWallType(wallType: WallType): void {
  assertNoViolations(checkWallTypeViolations(wallType));
}

/**
 * Vérifie si un mur peut être supprimé.
 */
export function canDeleteWall(
  wallId: ElementId,
  state: BimState,
): { readonly allowed: boolean; readonly reason?: string } {
  if (!state.walls[wallId]) {
    return { allowed: false, reason: `Wall "${wallId}" does not exist.` };
  }
  return { allowed: true };
}

/**
 * Vérifie si un type de mur peut être supprimé sans orpheliner des instances de murs.
 */
export function canDeleteWallType(
  typeId: ElementId,
  state: BimState,
): { readonly allowed: boolean; readonly reason?: string } {
  if (!state.wallTypes[typeId]) {
    return { allowed: false, reason: `WallType "${typeId}" does not exist.` };
  }

  const usingWalls = Object.values(state.walls).filter((w) => w.typeId === typeId);
  if (usingWalls.length > 0) {
    return {
      allowed: false,
      reason: `Cannot delete WallType "${typeId}": ${usingWalls.length} wall(s) are using it.`,
    };
  }

  return { allowed: true };
}
