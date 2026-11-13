import { type Wall, type WallType, type Level, type BimState, type ElementId } from './types.js';

/**
 * Erreur de validation métier levée lors de la violation d'une règle d'intégrité BIM.
 */
export class BimValidationError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'BimValidationError';
  }
}

/**
 * Valide l'intégrité géométrique et référentielle d'un mur.
 */
export function validateWall(wall: Wall, state: BimState): void {
  // 1. Longueur strictement positive
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const length = Math.hypot(dx, dy);

  if (!Number.isFinite(length) || length <= 1e-4) {
    throw new BimValidationError(
      'INVALID_WALL_LENGTH',
      `Wall length must be strictly positive (got ${length} mm).`,
    );
  }

  // 2. Vérification du WallType référencé
  if (!state.wallTypes[wall.typeId]) {
    throw new BimValidationError(
      'UNKNOWN_WALL_TYPE',
      `Wall refers to non-existent WallType ID: "${wall.typeId}".`,
    );
  }

  // 3. Vérification du Level référencé
  if (!state.levels[wall.levelId]) {
    throw new BimValidationError(
      'UNKNOWN_LEVEL',
      `Wall refers to non-existent Level ID: "${wall.levelId}".`,
    );
  }
}

/**
 * Valide les paramètres d'un type de mur.
 */
export function validateWallType(wallType: WallType): void {
  if (!wallType.name || wallType.name.trim() === '') {
    throw new BimValidationError('INVALID_WALL_TYPE_NAME', 'WallType name cannot be empty.');
  }

  if (!Number.isFinite(wallType.thickness) || wallType.thickness <= 0) {
    throw new BimValidationError(
      'INVALID_WALL_TYPE_THICKNESS',
      `WallType thickness must be strictly positive (got ${wallType.thickness} mm).`,
    );
  }

  if (!Number.isFinite(wallType.height) || wallType.height <= 0) {
    throw new BimValidationError(
      'INVALID_WALL_TYPE_HEIGHT',
      `WallType height must be strictly positive (got ${wallType.height} mm).`,
    );
  }
}

/**
 * Valide les paramètres d'un niveau architectural.
 */
export function validateLevel(level: Level): void {
  if (!level.name || level.name.trim() === '') {
    throw new BimValidationError('INVALID_LEVEL_NAME', 'Level name cannot be empty.');
  }

  if (!Number.isFinite(level.elevation)) {
    throw new BimValidationError(
      'INVALID_LEVEL_ELEVATION',
      `Level elevation must be a finite number (got ${level.elevation}).`,
    );
  }
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
