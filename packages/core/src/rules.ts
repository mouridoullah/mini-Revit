import {
  type Wall,
  type WallType,
  type Level,
  type Door,
  type Window,
  type Slab,
  type SlabType,
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
  computeEffectiveSlabPolygon,
  SlabGeometryError,
  signedArea,
} from '@mini-bim/geometry';
import { detectRooms } from './rooms/detect.js';

/**
 * Représente une violation de règle métier BIM identifiée sur une entité.
 */
export interface RuleViolation {
  readonly code: string;
  readonly message: string;
  readonly offendingIds: readonly ElementId[];
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

// ---------------------------------------------------------------------------
// Fonctions de vérification élémentaires (collecteurs de violations)
// ---------------------------------------------------------------------------

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

  return violations;
}

/**
 * Vérifie les ouvertures sur un mur donné, avec une éventuelle ouverture candidate
 * (utilisé lors de l'ajout/validation d'une ouverture qui n'est pas encore dans state).
 */
export function checkOpeningsWithCandidate(
  wall: Wall,
  state: BimState,
  candidate?: OpeningInput,
): RuleViolation[] {
  const allOpeningsOnHost: OpeningInput[] = [];
  const candidateId = candidate?.id;

  if (state.doors) {
    for (const d of Object.values(state.doors)) {
      if (d.hostWallId === wall.id && d.id !== candidateId) {
        const dType = d.doorTypeId ? state.doorTypes?.[d.doorTypeId] : undefined;
        const width = dType?.width ?? (d as unknown as { width?: number }).width ?? 900;
        const height = dType?.height ?? (d as unknown as { height?: number }).height ?? 2100;
        allOpeningsOnHost.push({
          id: d.id,
          hostWallId: d.hostWallId,
          u: d.offsetAlong + width / 2,
          width,
          height,
          sillZ: 0,
          kind: 'door',
          swing: d.swing,
        });
      }
    }
  }

  if (state.windows) {
    for (const w of Object.values(state.windows)) {
      if (w.hostWallId === wall.id && w.id !== candidateId) {
        const winType = w.windowTypeId ? state.windowTypes?.[w.windowTypeId] : undefined;
        const width = winType?.width ?? (w as unknown as { width?: number }).width ?? 1200;
        const height = winType?.height ?? (w as unknown as { height?: number }).height ?? 1400;
        allOpeningsOnHost.push({
          id: w.id,
          hostWallId: w.hostWallId,
          u: w.offsetAlong + width / 2,
          width,
          height,
          sillZ: w.sillHeight,
          kind: 'window',
        });
      }
    }
  }

  if (candidate) {
    allOpeningsOnHost.push(candidate);
  }

  if (allOpeningsOnHost.length === 0) {
    return [];
  }

  const wallType = state.wallTypes[wall.typeId];
  const wallHeight = wall.heightOverride ?? wallType?.height ?? 2800;
  const wallLength = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);

  const issues = validateOpenings(allOpeningsOnHost, wallLength, wallHeight, MIN_OPENING_CLEARANCE);
  const violations: RuleViolation[] = [];

  for (const issue of issues) {
    const offending: readonly ElementId[] =
      issue.openingIds && issue.openingIds.length > 0
        ? issue.openingIds
        : issue.openingId
          ? [issue.openingId, wall.id]
          : [wall.id];

    if (issue.code === 'OPENING_OVERLAP') {
      violations.push({
        code: 'OPENING_OVERLAP',
        message: issue.message,
        offendingIds: offending,
      });
    } else if (issue.code === 'OPENING_CLEARANCE_BETWEEN') {
      violations.push({
        code: 'INVALID_OPENING_CLEARANCE',
        message: issue.message,
        offendingIds: offending,
      });
    } else if (issue.code === 'OUT_OF_WALL_BOUNDS' || issue.code === 'SEVERS_WALL') {
      violations.push({
        code: 'INVALID_OPENING_POSITION',
        message: issue.message,
        offendingIds: offending,
      });
    } else if (issue.code === 'HEIGHT_EXCEEDS_WALL') {
      violations.push({
        code: 'INVALID_OPENING_HEIGHT',
        message: issue.message,
        offendingIds: offending,
      });
    }
  }

  return violations;
}

/**
 * Vérifie les ouvertures (portes et fenêtres) hébergées sur un mur donné.
 */
export function checkOpeningsOnWall(wall: Wall, state: BimState): RuleViolation[] {
  return checkOpeningsWithCandidate(wall, state);
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
 * Vérifie les règles métier d'une porte hébergée.
 */
export function checkDoorViolations(door: Door, state: BimState): RuleViolation[] {
  const violations: RuleViolation[] = [];

  // 1. Mur hôte existant
  const hostWall = state.walls[door.hostWallId];
  if (!hostWall) {
    violations.push({
      code: 'UNKNOWN_HOST_WALL',
      message: `Door "${door.id}" refers to non-existent host wall ID: "${door.hostWallId}".`,
      offendingIds: [door.id],
    });
    return violations;
  }

  // 2. Type de mur hôte
  const wallType = state.wallTypes[hostWall.typeId];
  if (!wallType) {
    violations.push({
      code: 'UNKNOWN_WALL_TYPE',
      message: `Host wall "${door.hostWallId}" refers to non-existent WallType ID: "${hostWall.typeId}".`,
      offendingIds: [door.id, hostWall.id],
    });
    return violations;
  }

  const wallHeight = hostWall.heightOverride ?? wallType.height;
  const wallLength = Math.hypot(
    hostWall.end.x - hostWall.start.x,
    hostWall.end.y - hostWall.start.y,
  );

  // 2. Intégrité du type de porte (Schéma v2 / ADR-042)
  if (door.doorTypeId && (!state.doorTypes || !state.doorTypes[door.doorTypeId])) {
    violations.push({
      code: 'UNKNOWN_DOOR_TYPE',
      message: `Door "${door.id}" references non-existent DoorType ID: "${door.doorTypeId}".`,
      offendingIds: [door.id],
    });
  }

  const doorType = door.doorTypeId ? state.doorTypes?.[door.doorTypeId] : undefined;
  const doorWidth = doorType?.width ?? (door as unknown as { width?: number }).width ?? NaN;
  const doorHeight = doorType?.height ?? (door as unknown as { height?: number }).height ?? NaN;

  // 3. Validation dimensionnelle
  if (
    !Number.isFinite(doorWidth) ||
    doorWidth <= 0 ||
    !Number.isFinite(doorHeight) ||
    doorHeight <= 0
  ) {
    violations.push({
      code: 'INVALID_OPENING_DIMENSIONS',
      message: `Door dimensions must be strictly positive (width: ${doorWidth}, height: ${doorHeight}).`,
      offendingIds: [door.id],
    });
  }

  if (!Number.isFinite(door.offsetAlong) || door.offsetAlong < 0) {
    violations.push({
      code: 'INVALID_OPENING_POSITION',
      message: `Door offsetAlong must be non-negative (got ${door.offsetAlong} mm).`,
      offendingIds: [door.id],
    });
  }

  // 4. Débordement en longueur
  if (door.offsetAlong + doorWidth > wallLength) {
    violations.push({
      code: 'INVALID_OPENING_POSITION',
      message: `Door position exceeds wall bounds: offset (${door.offsetAlong} mm) + width (${doorWidth} mm) > wall length (${wallLength.toFixed(2)} mm).`,
      offendingIds: [door.id, hostWall.id],
    });
  }

  // 5. Débordement en hauteur
  if (doorHeight > wallHeight) {
    violations.push({
      code: 'INVALID_OPENING_HEIGHT',
      message: `Door height (${doorHeight} mm) exceeds host wall height (${wallHeight} mm).`,
      offendingIds: [door.id, hostWall.id],
    });
  }

  // 6. Validation du battement
  if (
    !door.swing ||
    !['left', 'right'].includes(door.swing.side) ||
    !['in', 'out'].includes(door.swing.direction)
  ) {
    violations.push({
      code: 'INVALID_DOOR_SWING',
      message: 'Invalid door swing specification.',
      offendingIds: [door.id],
    });
  }

  // 7. Interactions avec les autres ouvertures sur le même mur hôte
  const doorCandidate: OpeningInput = {
    id: door.id,
    hostWallId: door.hostWallId,
    u: door.offsetAlong + doorWidth / 2,
    width: doorWidth,
    height: doorHeight,
    sillZ: 0,
    kind: 'door',
    swing: door.swing,
  };
  const openingViolations = checkOpeningsWithCandidate(hostWall, state, doorCandidate);
  for (const v of openingViolations) {
    if (v.offendingIds.includes(door.id)) {
      violations.push(v);
    }
  }

  return violations;
}

/**
 * Vérifie les règles métier d'une fenêtre hébergée.
 */
export function checkWindowViolations(window: Window, state: BimState): RuleViolation[] {
  const violations: RuleViolation[] = [];

  // 1. Mur hôte existant
  const hostWall = state.walls[window.hostWallId];
  if (!hostWall) {
    violations.push({
      code: 'UNKNOWN_HOST_WALL',
      message: `Window "${window.id}" refers to non-existent host wall ID: "${window.hostWallId}".`,
      offendingIds: [window.id],
    });
    return violations;
  }

  // 2. Type de mur hôte
  const wallType = state.wallTypes[hostWall.typeId];
  if (!wallType) {
    violations.push({
      code: 'UNKNOWN_WALL_TYPE',
      message: `Host wall "${window.hostWallId}" refers to non-existent WallType ID: "${hostWall.typeId}".`,
      offendingIds: [window.id, hostWall.id],
    });
    return violations;
  }

  const wallHeight = hostWall.heightOverride ?? wallType.height;
  const wallLength = Math.hypot(
    hostWall.end.x - hostWall.start.x,
    hostWall.end.y - hostWall.start.y,
  );

  // 2. Intégrité du type de fenêtre (Schéma v2 / ADR-042)
  if (window.windowTypeId && (!state.windowTypes || !state.windowTypes[window.windowTypeId])) {
    violations.push({
      code: 'UNKNOWN_WINDOW_TYPE',
      message: `Window "${window.id}" references non-existent WindowType ID: "${window.windowTypeId}".`,
      offendingIds: [window.id],
    });
  }

  const winType = window.windowTypeId ? state.windowTypes?.[window.windowTypeId] : undefined;
  const winWidth = winType?.width ?? (window as unknown as { width?: number }).width ?? NaN;
  const winHeight = winType?.height ?? (window as unknown as { height?: number }).height ?? NaN;

  // 3. Validation dimensionnelle
  if (
    !Number.isFinite(winWidth) ||
    winWidth <= 0 ||
    !Number.isFinite(winHeight) ||
    winHeight <= 0
  ) {
    violations.push({
      code: 'INVALID_OPENING_DIMENSIONS',
      message: `Window dimensions must be strictly positive (width: ${winWidth}, height: ${winHeight}).`,
      offendingIds: [window.id],
    });
  }

  if (!Number.isFinite(window.sillHeight) || window.sillHeight < 0) {
    violations.push({
      code: 'INVALID_OPENING_DIMENSIONS',
      message: `Window sillHeight must be non-negative (got ${window.sillHeight} mm).`,
      offendingIds: [window.id],
    });
  }

  if (!Number.isFinite(window.offsetAlong) || window.offsetAlong < 0) {
    violations.push({
      code: 'INVALID_OPENING_POSITION',
      message: `Window offsetAlong must be non-negative (got ${window.offsetAlong} mm).`,
      offendingIds: [window.id],
    });
  }

  // 4. Débordement en longueur
  if (window.offsetAlong + winWidth > wallLength) {
    violations.push({
      code: 'INVALID_OPENING_POSITION',
      message: `Window position exceeds wall bounds: offset (${window.offsetAlong} mm) + width (${winWidth} mm) > wall length (${wallLength.toFixed(2)} mm).`,
      offendingIds: [window.id, hostWall.id],
    });
  }

  // 5. Débordement en hauteur
  if (window.sillHeight + winHeight > wallHeight) {
    violations.push({
      code: 'INVALID_OPENING_HEIGHT',
      message: `Window top (${window.sillHeight + winHeight} mm) exceeds host wall height (${wallHeight} mm).`,
      offendingIds: [window.id, hostWall.id],
    });
  }

  // 6. Interactions avec les autres ouvertures sur le même mur hôte
  const winCandidate: OpeningInput = {
    id: window.id,
    hostWallId: window.hostWallId,
    u: window.offsetAlong + winWidth / 2,
    width: winWidth,
    height: winHeight,
    sillZ: window.sillHeight,
    kind: 'window',
  };
  const openingViolations = checkOpeningsWithCandidate(hostWall, state, winCandidate);
  for (const v of openingViolations) {
    if (v.offendingIds.includes(window.id)) {
      violations.push(v);
    }
  }

  return violations;
}

/**
 * Vérifie l'intégrité métier et spatiale d'une pièce architecturale (Room).
 */
export function checkRoomViolations(room: Room, state: BimState): RuleViolation[] {
  const violations: RuleViolation[] = [];

  // 1. Nom non vide
  if (!room.name || room.name.trim() === '') {
    violations.push({
      code: 'INVALID_ROOM_NAME',
      message: 'Room name cannot be empty.',
      offendingIds: [room.id],
    });
  }

  // 2. Niveau existant
  if (!state.levels[room.levelId]) {
    violations.push({
      code: 'UNKNOWN_LEVEL',
      message: `Room refers to non-existent Level ID: "${room.levelId}".`,
      offendingIds: [room.id],
    });
  }

  // 3. Coordonnées numériques finies
  if (!Number.isFinite(room.seed.x) || !Number.isFinite(room.seed.y)) {
    violations.push({
      code: 'INVALID_ROOM_SEED',
      message: `Room seed coordinates must be finite numbers (got x=${room.seed.x}, y=${room.seed.y}).`,
      offendingIds: [room.id],
    });
  }

  // 4. Vérification que le seed est dans une pièce fermée
  const detected = detectRooms(state, room.levelId);
  const isInsideClosedRoom = detected.some((d) => {
    const inOuter = isPointInPolygon(room.seed, d.polygon);
    if (!inOuter) return false;
    if (d.holes && d.holes.some((h) => isPointInPolygon(room.seed, h))) {
      return false;
    }
    return true;
  });

  if (!isInsideClosedRoom && room.status !== 'unenclosed') {
    violations.push({
      code: 'ROOM_SEED_NOT_IN_CLOSED_AREA',
      message: `Room seed (${room.seed.x}, ${room.seed.y}) is not located inside any closed area on level "${room.levelId}".`,
      offendingIds: [room.id],
    });
  }

  return violations;
}

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

// ---------------------------------------------------------------------------
// Fonctions impératives publiques de validation (rétrocompatibilité stricte)
// ---------------------------------------------------------------------------

/**
 * Valide l'intégrité géométrique et référentielle d'un mur.
 */
export function validateWall(wall: Wall, state: BimState): void {
  const violations = checkWallViolations(wall, state);
  if (violations.length > 0) {
    const v = violations[0]!;
    throw new BimValidationError(v.code, v.message, { offendingIds: v.offendingIds });
  }
}

/**
 * Valide les paramètres d'un type de mur.
 */
export function validateWallType(wallType: WallType): void {
  const violations = checkWallTypeViolations(wallType);
  if (violations.length > 0) {
    const v = violations[0]!;
    throw new BimValidationError(v.code, v.message, { offendingIds: v.offendingIds });
  }
}

/**
 * Valide les paramètres d'un niveau architectural.
 */
export function validateLevel(level: Level, state?: BimState): void {
  const violations = checkLevelViolations(level, state);
  if (violations.length > 0) {
    const v = violations[0]!;
    throw new BimValidationError(v.code, v.message, { offendingIds: v.offendingIds });
  }
}

/**
 * Valide une porte hébergée par un mur linéaire.
 */
export function validateDoor(door: Door, state: BimState): void {
  const violations = checkDoorViolations(door, state);
  if (violations.length > 0) {
    const v = violations[0]!;
    throw new BimValidationError(v.code, v.message, { offendingIds: v.offendingIds });
  }
}

/**
 * Valide une fenêtre hébergée par un mur linéaire.
 */
export function validateWindow(window: Window, state: BimState): void {
  const violations = checkWindowViolations(window, state);
  if (violations.length > 0) {
    const v = violations[0]!;
    throw new BimValidationError(v.code, v.message, { offendingIds: v.offendingIds });
  }
}

/**
 * Valide l'intégrité métier et spatiale d'une pièce architecturale (Room).
 */
export function validateRoom(room: Room, state: BimState): void {
  const violations = checkRoomViolations(room, state);
  if (violations.length > 0) {
    const v = violations[0]!;
    throw new BimValidationError(v.code, v.message, { offendingIds: v.offendingIds });
  }
}

/**
 * Valide l'intégrité métier et référentielle d'une cotation 2D (Dimension).
 */
export function validateDimension(dim: Dimension, state: BimState): void {
  const violations = checkDimensionViolations(dim, state);
  if (violations.length > 0) {
    const v = violations[0]!;
    throw new BimValidationError(v.code, v.message, { offendingIds: v.offendingIds });
  }
}

/**
 * Valide les paramètres d'un type de dalle (SlabType).
 */
export function checkSlabTypeViolations(slabType: SlabType): RuleViolation[] {
  const violations: RuleViolation[] = [];
  if (!slabType || typeof slabType !== 'object') {
    violations.push({
      code: 'MALFORMED_SLAB_TYPE',
      message: 'SlabType entry is null or not an object.',
      offendingIds: [],
    });
    return violations;
  }
  if (typeof slabType.name !== 'string' || !slabType.name.trim()) {
    violations.push({
      code: 'MALFORMED_SLAB_TYPE',
      message: `SlabType "${slabType.id}" has an invalid or empty name.`,
      offendingIds: [slabType.id],
    });
  }
  if (!Number.isFinite(slabType.thickness) || slabType.thickness <= 0) {
    violations.push({
      code: 'INVALID_SLAB_THICKNESS',
      message: `SlabType "${slabType.id}" has a non-positive or non-finite thickness (${slabType.thickness}).`,
      offendingIds: [slabType.id],
    });
  } else if (slabType.thickness < 50) {
    violations.push({
      code: 'INVALID_SLAB_THICKNESS',
      message: `SlabType "${slabType.id}" thickness must be at least 50 mm (got ${slabType.thickness} mm).`,
      offendingIds: [slabType.id],
    });
  }
  return violations;
}

export function validateSlabType(slabType: SlabType): void {
  const violations = checkSlabTypeViolations(slabType);
  if (violations.length > 0) {
    const v = violations[0]!;
    throw new BimValidationError(v.code, v.message, { offendingIds: v.offendingIds });
  }
}

/**
 * Valide l'intégrité structurelle, référentielle et géométrique d'une dalle (Slab).
 */
export function checkSlabViolations(slab: Slab, state: BimState): RuleViolation[] {
  const violations: RuleViolation[] = [];
  if (!slab || typeof slab !== 'object') {
    violations.push({
      code: 'MALFORMED_SLAB',
      message: 'Slab entry is null or not an object.',
      offendingIds: [],
    });
    return violations;
  }
  if (!state.levels[slab.levelId]) {
    violations.push({
      code: 'UNKNOWN_LEVEL',
      message: `Slab "${slab.id}" references non-existent Level ID: "${slab.levelId}".`,
      offendingIds: [slab.id],
    });
  }
  if (!state.slabTypes[slab.slabTypeId]) {
    violations.push({
      code: 'UNKNOWN_SLAB_TYPE',
      message: `Slab "${slab.id}" references non-existent SlabType ID: "${slab.slabTypeId}".`,
      offendingIds: [slab.id],
    });
  }
  if (!slab.boundary || slab.boundary.length < 3) {
    violations.push({
      code: 'INVALID_SLAB_BOUNDARY',
      message: `Slab "${slab.id}" boundary must contain at least 3 vertices (got ${slab.boundary?.length ?? 0}).`,
      offendingIds: [slab.id],
    });
    return violations;
  }

  const baseArea = signedArea(slab.boundary);
  if (Math.abs(baseArea) < 1e-4) {
    violations.push({
      code: 'INVALID_SLAB_BOUNDARY',
      message: `Slab "${slab.id}" has non-positive area.`,
      offendingIds: [slab.id],
    });
    return violations;
  }

  try {
    computeEffectiveSlabPolygon({
      boundary: slab.boundary,
      holes: slab.holes,
      openings: slab.openings,
    });
  } catch (err) {
    if (err instanceof SlabGeometryError) {
      violations.push({
        code: err.code,
        message: err.message,
        offendingIds: [slab.id],
      });
    } else {
      violations.push({
        code: 'INVALID_SLAB_BOUNDARY',
        message: err instanceof Error ? err.message : String(err),
        offendingIds: [slab.id],
      });
    }
  }

  return violations;
}

export function validateSlab(slab: Slab, state: BimState): void {
  const violations = checkSlabViolations(slab, state);
  if (violations.length > 0) {
    const v = violations[0]!;
    throw new BimValidationError(v.code, v.message, { offendingIds: v.offendingIds });
  }
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

// ---------------------------------------------------------------------------
// Validation Différentielle Post-Condition (Phase 6.0b / ADR-041 §6)
// ---------------------------------------------------------------------------

/**
 * Collecte exhaustivement toutes les violations de règles métier pour les entités du dirty set.
 */
export function collectViolationsForDirty(
  state: BimState,
  dirtyIds: readonly ElementId[],
): RuleViolation[] {
  const violations: RuleViolation[] = [];
  const seenKeys = new Set<string>();

  const pushViolation = (v: RuleViolation) => {
    const sortedIds = [...v.offendingIds].sort().join(',');
    const key = `${v.code}:${sortedIds}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      violations.push(v);
    }
  };

  const uniqueDirty = Array.from(new Set(dirtyIds));
  for (const id of uniqueDirty) {
    // 1. Murs
    const wall = state.walls[id];
    if (wall) {
      for (const v of checkWallViolations(wall, state)) {
        pushViolation(v);
      }
      for (const v of checkOpeningsOnWall(wall, state)) {
        pushViolation(v);
      }
    }

    // 2. Portes
    const door = state.doors?.[id];
    if (door) {
      for (const v of checkDoorViolations(door, state)) {
        pushViolation(v);
      }
    }

    // 3. Fenêtres
    const window = state.windows?.[id];
    if (window) {
      for (const v of checkWindowViolations(window, state)) {
        pushViolation(v);
      }
    }

    // 4. Niveaux
    const level = state.levels[id];
    if (level) {
      for (const v of checkLevelViolations(level, state)) {
        pushViolation(v);
      }
    }

    // 5. Types de murs
    const wallType = state.wallTypes[id];
    if (wallType) {
      for (const v of checkWallTypeViolations(wallType)) {
        pushViolation(v);
      }
    }

    // 6. Pièces (Rooms)
    const room = state.rooms?.[id];
    if (room) {
      for (const v of checkRoomViolations(room, state)) {
        pushViolation(v);
      }
    }

    // 7. Cotations (Dimensions)
    const dimension = state.dimensions?.[id];
    if (dimension) {
      for (const v of checkDimensionViolations(dimension, state)) {
        pushViolation(v);
      }
    }

    // 8. Dalles (Slabs)
    const slab = state.slabs?.[id];
    if (slab) {
      for (const v of checkSlabViolations(slab, state)) {
        pushViolation(v);
      }
    }

    // 9. Types de dalles (SlabTypes)
    const slabType = state.slabTypes?.[id];
    if (slabType) {
      for (const v of checkSlabTypeViolations(slabType)) {
        pushViolation(v);
      }
    }
  }

  return violations;
}

/**
 * Valide le dirty set de manière différentielle.
 * Ne rejette la transaction que si elle introduit au moins une NOUVELLE violation
 * de règle sur le dirty set ou aggrave une violation existante par rapport à previousState.
 */
export function validateDirty(
  draftState: BimState,
  dirtyIds: readonly ElementId[],
  previousState?: BimState,
): void {
  const draftViolations = collectViolationsForDirty(draftState, dirtyIds);
  if (draftViolations.length === 0) {
    return;
  }

  // Sans état précédent, toute violation sur le dirty set est fatale
  if (!previousState) {
    const first = draftViolations[0]!;
    throw new BimValidationError(first.code, first.message, { offendingIds: first.offendingIds });
  }

  const prevViolations = collectViolationsForDirty(previousState, dirtyIds);
  const prevKeys = new Set<string>();
  for (const v of prevViolations) {
    const sortedIds = [...v.offendingIds].sort().join(',');
    prevKeys.add(`${v.code}:${sortedIds}:${v.message}`);
  }

  // Trouver la première violation introduite ou aggravée (non strictement identique à previousState)
  for (const v of draftViolations) {
    const sortedIds = [...v.offendingIds].sort().join(',');
    const key = `${v.code}:${sortedIds}:${v.message}`;
    if (!prevKeys.has(key)) {
      throw new BimValidationError(v.code, v.message, { offendingIds: v.offendingIds });
    }
  }
}
