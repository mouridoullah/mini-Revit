import {
  type Wall,
  type WallType,
  type Level,
  type Door,
  type Window,
  type Room,
  type Dimension,
  type BimState,
  type ElementId,
} from './types.js';
import {
  type OpeningInput,
  validateOpenings,
  MIN_OPENING_CLEARANCE,
  isPointInPolygon,
} from '@mini-bim/geometry';
import { detectRooms } from './rooms/detect.js';

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

  const attachedRooms = Object.values(state.rooms ?? {}).filter((r) => r.levelId === levelId);
  if (attachedRooms.length > 0) {
    return {
      allowed: false,
      reason: `Cannot delete Level "${levelId}": ${attachedRooms.length} room(s) are attached to it.`,
    };
  }

  return { allowed: true };
}

/**
 * Valide l'intégrité métier et spatiale d'une pièce architecturale (Room).
 *
 * Règles :
 * 1. Nom non vide (`INVALID_ROOM_NAME`).
 * 2. Niveau hôte existant (`UNKNOWN_LEVEL`).
 * 3. Le seed doit se situer impérativement à l'intérieur d'une pièce fermée (`ROOM_SEED_NOT_IN_CLOSED_AREA`).
 */
export function validateRoom(room: Room, state: BimState): void {
  // 1. Nom non vide
  if (!room.name || room.name.trim() === '') {
    throw new BimValidationError('INVALID_ROOM_NAME', 'Room name cannot be empty.');
  }

  // 2. Niveau existant
  if (!state.levels[room.levelId]) {
    throw new BimValidationError(
      'UNKNOWN_LEVEL',
      `Room refers to non-existent Level ID: "${room.levelId}".`,
    );
  }

  // 3. Coordonnées numériques finies
  if (!Number.isFinite(room.seed.x) || !Number.isFinite(room.seed.y)) {
    throw new BimValidationError(
      'INVALID_ROOM_SEED',
      `Room seed coordinates must be finite numbers (got x=${room.seed.x}, y=${room.seed.y}).`,
    );
  }

  // 4. Vérification que le seed est dans une pièce fermée
  const detected = detectRooms(state, room.levelId);
  const isInsideClosedRoom = detected.some((d) => {
    const inOuter = isPointInPolygon(room.seed, d.polygon);
    if (!inOuter) return false;
    if (d.holes && d.holes.some((h) => isPointInPolygon(room.seed, h))) {
      return false; // Dans un poteau/îlot intérieur
    }
    return true;
  });

  if (!isInsideClosedRoom) {
    throw new BimValidationError(
      'ROOM_SEED_NOT_IN_CLOSED_AREA',
      `Room seed (${room.seed.x}, ${room.seed.y}) is not located inside any closed area on level "${room.levelId}".`,
    );
  }
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

/**
 * Valide une porte hébergée par un mur linéaire.
 */
export function validateDoor(door: Door, state: BimState): void {
  // 1. Vérification du mur hôte
  const hostWall = state.walls[door.hostWallId];
  if (!hostWall) {
    throw new BimValidationError(
      'UNKNOWN_HOST_WALL',
      `Door "${door.id}" refers to non-existent host wall ID: "${door.hostWallId}".`,
    );
  }

  // 2. Vérification du type de mur
  const wallType = state.wallTypes[hostWall.typeId];
  if (!wallType) {
    throw new BimValidationError(
      'UNKNOWN_WALL_TYPE',
      `Host wall "${door.hostWallId}" refers to non-existent WallType ID: "${hostWall.typeId}".`,
    );
  }

  const wallHeight = hostWall.heightOverride ?? wallType.height;
  const wallLength = Math.hypot(
    hostWall.end.x - hostWall.start.x,
    hostWall.end.y - hostWall.start.y,
  );

  // 3. Validation dimensionnelle
  if (
    !Number.isFinite(door.width) ||
    door.width <= 0 ||
    !Number.isFinite(door.height) ||
    door.height <= 0
  ) {
    throw new BimValidationError(
      'INVALID_OPENING_DIMENSIONS',
      `Door dimensions must be strictly positive (width: ${door.width}, height: ${door.height}).`,
    );
  }

  if (!Number.isFinite(door.offsetAlong) || door.offsetAlong < 0) {
    throw new BimValidationError(
      'INVALID_OPENING_POSITION',
      `Door offsetAlong must be non-negative (got ${door.offsetAlong} mm).`,
    );
  }

  // 4. Débordement en longueur
  if (door.offsetAlong + door.width > wallLength) {
    throw new BimValidationError(
      'INVALID_OPENING_POSITION',
      `Door position exceeds wall bounds: offset (${door.offsetAlong} mm) + width (${door.width} mm) > wall length (${wallLength.toFixed(2)} mm).`,
    );
  }

  // 5. Débordement en hauteur
  if (door.height > wallHeight) {
    throw new BimValidationError(
      'INVALID_OPENING_HEIGHT',
      `Door height (${door.height} mm) exceeds host wall height (${wallHeight} mm).`,
    );
  }

  // 6. Validation du battement
  if (
    !door.swing ||
    !['left', 'right'].includes(door.swing.side) ||
    !['in', 'out'].includes(door.swing.direction)
  ) {
    throw new BimValidationError('INVALID_DOOR_SWING', 'Invalid door swing specification.');
  }

  // 7. Intégration géométrique : collisions et trumeaux
  const allOpeningsOnHost: OpeningInput[] = [];

  if (state.doors) {
    for (const d of Object.values(state.doors)) {
      if (d.hostWallId === door.hostWallId && d.id !== door.id) {
        allOpeningsOnHost.push({
          id: d.id,
          hostWallId: d.hostWallId,
          u: d.offsetAlong + d.width / 2,
          width: d.width,
          height: d.height,
          sillZ: 0,
          kind: 'door',
          swing: d.swing,
        });
      }
    }
  }

  if (state.windows) {
    for (const w of Object.values(state.windows)) {
      if (w.hostWallId === door.hostWallId && w.id !== door.id) {
        allOpeningsOnHost.push({
          id: w.id,
          hostWallId: w.hostWallId,
          u: w.offsetAlong + w.width / 2,
          width: w.width,
          height: w.height,
          sillZ: w.sillHeight,
          kind: 'window',
        });
      }
    }
  }

  allOpeningsOnHost.push({
    id: door.id,
    hostWallId: door.hostWallId,
    u: door.offsetAlong + door.width / 2,
    width: door.width,
    height: door.height,
    sillZ: 0,
    kind: 'door',
    swing: door.swing,
  });

  const issues = validateOpenings(allOpeningsOnHost, wallLength, wallHeight, MIN_OPENING_CLEARANCE);
  for (const issue of issues) {
    if (issue.code === 'OPENING_OVERLAP') {
      throw new BimValidationError('OPENING_OVERLAP', issue.message);
    }
    if (issue.code === 'OPENING_CLEARANCE_BETWEEN') {
      throw new BimValidationError('INVALID_OPENING_CLEARANCE', issue.message);
    }
    if (issue.code === 'OUT_OF_WALL_BOUNDS' || issue.code === 'SEVERS_WALL') {
      throw new BimValidationError('INVALID_OPENING_POSITION', issue.message);
    }
    if (issue.code === 'HEIGHT_EXCEEDS_WALL') {
      throw new BimValidationError('INVALID_OPENING_HEIGHT', issue.message);
    }
  }
}

/**
 * Valide une fenêtre hébergée par un mur linéaire.
 */
export function validateWindow(window: Window, state: BimState): void {
  // 1. Mur hôte
  const hostWall = state.walls[window.hostWallId];
  if (!hostWall) {
    throw new BimValidationError(
      'UNKNOWN_HOST_WALL',
      `Window "${window.id}" refers to non-existent host wall ID: "${window.hostWallId}".`,
    );
  }

  // 2. Type de mur
  const wallType = state.wallTypes[hostWall.typeId];
  if (!wallType) {
    throw new BimValidationError(
      'UNKNOWN_WALL_TYPE',
      `Host wall "${window.hostWallId}" refers to non-existent WallType ID: "${hostWall.typeId}".`,
    );
  }

  const wallHeight = hostWall.heightOverride ?? wallType.height;
  const wallLength = Math.hypot(
    hostWall.end.x - hostWall.start.x,
    hostWall.end.y - hostWall.start.y,
  );

  // 3. Validation dimensionnelle
  if (
    !Number.isFinite(window.width) ||
    window.width <= 0 ||
    !Number.isFinite(window.height) ||
    window.height <= 0
  ) {
    throw new BimValidationError(
      'INVALID_OPENING_DIMENSIONS',
      `Window dimensions must be strictly positive (width: ${window.width}, height: ${window.height}).`,
    );
  }

  if (!Number.isFinite(window.sillHeight) || window.sillHeight < 0) {
    throw new BimValidationError(
      'INVALID_OPENING_DIMENSIONS',
      `Window sillHeight must be non-negative (got ${window.sillHeight} mm).`,
    );
  }

  if (!Number.isFinite(window.offsetAlong) || window.offsetAlong < 0) {
    throw new BimValidationError(
      'INVALID_OPENING_POSITION',
      `Window offsetAlong must be non-negative (got ${window.offsetAlong} mm).`,
    );
  }

  // 4. Débordement en longueur
  if (window.offsetAlong + window.width > wallLength) {
    throw new BimValidationError(
      'INVALID_OPENING_POSITION',
      `Window position exceeds wall bounds: offset (${window.offsetAlong} mm) + width (${window.width} mm) > wall length (${wallLength.toFixed(2)} mm).`,
    );
  }

  // 5. Débordement en hauteur
  if (window.sillHeight + window.height > wallHeight) {
    throw new BimValidationError(
      'INVALID_OPENING_HEIGHT',
      `Window top (${window.sillHeight + window.height} mm) exceeds host wall height (${wallHeight} mm).`,
    );
  }

  // 6. Intégration géométrique : collisions et trumeaux
  const allOpeningsOnHost: OpeningInput[] = [];

  if (state.doors) {
    for (const d of Object.values(state.doors)) {
      if (d.hostWallId === window.hostWallId && d.id !== window.id) {
        allOpeningsOnHost.push({
          id: d.id,
          hostWallId: d.hostWallId,
          u: d.offsetAlong + d.width / 2,
          width: d.width,
          height: d.height,
          sillZ: 0,
          kind: 'door',
          swing: d.swing,
        });
      }
    }
  }

  if (state.windows) {
    for (const w of Object.values(state.windows)) {
      if (w.hostWallId === window.hostWallId && w.id !== window.id) {
        allOpeningsOnHost.push({
          id: w.id,
          hostWallId: w.hostWallId,
          u: w.offsetAlong + w.width / 2,
          width: w.width,
          height: w.height,
          sillZ: w.sillHeight,
          kind: 'window',
        });
      }
    }
  }

  allOpeningsOnHost.push({
    id: window.id,
    hostWallId: window.hostWallId,
    u: window.offsetAlong + window.width / 2,
    width: window.width,
    height: window.height,
    sillZ: window.sillHeight,
    kind: 'window',
  });

  const issues = validateOpenings(allOpeningsOnHost, wallLength, wallHeight, MIN_OPENING_CLEARANCE);
  for (const issue of issues) {
    if (issue.code === 'OPENING_OVERLAP') {
      throw new BimValidationError('OPENING_OVERLAP', issue.message);
    }
    if (issue.code === 'OPENING_CLEARANCE_BETWEEN') {
      throw new BimValidationError('INVALID_OPENING_CLEARANCE', issue.message);
    }
    if (issue.code === 'OUT_OF_WALL_BOUNDS' || issue.code === 'SEVERS_WALL') {
      throw new BimValidationError('INVALID_OPENING_POSITION', issue.message);
    }
    if (issue.code === 'HEIGHT_EXCEEDS_WALL') {
      throw new BimValidationError('INVALID_OPENING_HEIGHT', issue.message);
    }
  }
}

/**
 * Vérifie si un mur peut être supprimé.
 * En conformité avec la spécification BIM, la suppression en cascade des ouvertures
 * hébergées est autorisée et automatique (ON DELETE CASCADE).
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
 * Valide l'intégrité métier et référentielle d'une cotation 2D (Dimension).
 */
export function validateDimension(dim: Dimension, state: BimState): void {
  // 1. Niveau existant
  if (!state.levels[dim.levelId]) {
    throw new BimValidationError(
      'UNKNOWN_LEVEL',
      `Dimension refers to non-existent Level ID: "${dim.levelId}".`,
    );
  }

  // 2. Au moins une référence valide
  if (!dim.references || dim.references.length === 0) {
    throw new BimValidationError(
      'INVALID_DIMENSION_REFERENCES',
      'Dimension must reference at least one architectural element.',
    );
  }

  // 3. Toutes les références doivent être des murs existants
  for (const refId of dim.references) {
    if (!state.walls[refId]) {
      throw new BimValidationError(
        'UNKNOWN_DIMENSION_REFERENCE',
        `Dimension references non-existent wall ID: "${refId}".`,
      );
    }
  }

  // 4. Décalage numérique fini
  if (!Number.isFinite(dim.offset)) {
    throw new BimValidationError(
      'INVALID_DIMENSION_OFFSET',
      'Dimension offset must be a finite number.',
    );
  }
}
