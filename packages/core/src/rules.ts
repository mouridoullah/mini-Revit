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
  type StairType,
  type Stair,
  type RoofType,
  type Roof,
  type RoofOpening,
  type GableRoofType,
  type ComponentType,
  type Component,
  type ComponentFamily,
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
  computeWallFootprint2d,
  type Vec2,
  vec2,
} from '@mini-bim/geometry';
import { detectRooms } from './rooms/detect.js';
import { computeStairGeometry } from './stairs.js';
import { resolveWallGeometry, getWallLocalHeadroom } from './walls/resolve.js';
import { getComponentEffectiveDimensions } from './components/dimensions.js';

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
        const width = dType?.width ?? 900;
        const height = dType?.height ?? 2100;
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
        const width = winType?.width ?? 1200;
        const height = winType?.height ?? 1400;
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

  // 2c. Réservations d'ouvertures issues de menuiseries composants (Phase 8.5)
  if (state.components) {
    for (const comp of Object.values(state.components)) {
      if (comp.placement.hostWallId === wall.id && comp.id !== candidateId) {
        const ct = state.componentTypes?.[comp.typeId];
        const isGlazing =
          ct &&
          (ct.family === 'glazing' ||
            ct.ifcEntity === 'IfcDoor' ||
            ct.ifcEntity === 'IfcWindow' ||
            ct.subType === 'sliding_door' ||
            ct.subType === 'french_window' ||
            Boolean(comp.openingId));
        if (ct && isGlazing) {
          const dims = getComponentEffectiveDimensions(comp, ct);
          const dx = wall.end.x - wall.start.x;
          const dy = wall.end.y - wall.start.y;
          const wallLen = Math.hypot(dx, dy);
          if (wallLen > 1e-4) {
            const ux = dx / wallLen;
            const uy = dy / wallLen;
            const px = comp.placement.x - wall.start.x;
            const py = comp.placement.y - wall.start.y;
            const s = px * ux + py * uy;
            allOpeningsOnHost.push({
              id: comp.id,
              hostWallId: wall.id,
              u: s,
              width: dims.width,
              height: dims.height,
              sillZ: comp.placement.elevationOffset ?? ct.defaultElevationOffset ?? 0,
              kind: ct.ifcEntity === 'IfcWindow' || ct.subType === 'french_window' ? 'window' : 'door',
            });
          }
        }
      }
    }
  }

  if (candidate) {
    allOpeningsOnHost.push(candidate);
  }

  if (allOpeningsOnHost.length === 0) {
    return [];
  }

  const resolved = resolveWallGeometry(wall, state);
  const wallHeight = resolved.height;
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

  const resolved = resolveWallGeometry(hostWall, state);
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
  const doorWidth = doorType?.width ?? NaN;
  const doorHeight = doorType?.height ?? NaN;

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

  // 5. Débordement en hauteur (contrôle altimétrique local sous toiture / biseau)
  const localHeadroom = getWallLocalHeadroom(resolved.topProfile, door.offsetAlong, doorWidth, resolved.zBase);
  if (doorHeight > localHeadroom + 1e-3) {
    violations.push({
      code: 'INVALID_OPENING_HEIGHT',
      message: `Door height (${doorHeight} mm) exceeds host wall local headroom (${localHeadroom.toFixed(0)} mm).`,
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

  const resolved = resolveWallGeometry(hostWall, state);
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
  const winWidth = winType?.width ?? NaN;
  const winHeight = winType?.height ?? NaN;

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

  // 5. Débordement en hauteur (contrôle altimétrique local sous toiture / biseau)
  const localHeadroom = getWallLocalHeadroom(resolved.topProfile, window.offsetAlong, winWidth, resolved.zBase);
  if (window.sillHeight + winHeight > localHeadroom + 1e-3) {
    violations.push({
      code: 'INVALID_OPENING_HEIGHT',
      message: `Window top (${window.sillHeight + winHeight} mm) exceeds host wall local headroom (${localHeadroom.toFixed(0)} mm).`,
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

function assertNoViolations(violations: readonly RuleViolation[]): void {
  const first = violations[0];
  if (first) {
    throw new BimValidationError(first.code, first.message, { offendingIds: first.offendingIds });
  }
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
 * Valide les paramètres d'un niveau architectural.
 */
export function validateLevel(level: Level, state?: BimState): void {
  assertNoViolations(checkLevelViolations(level, state));
}

/**
 * Valide une porte hébergée par un mur linéaire.
 */
export function validateDoor(door: Door, state: BimState): void {
  assertNoViolations(checkDoorViolations(door, state));
}

/**
 * Valide une fenêtre hébergée par un mur linéaire.
 */
export function validateWindow(window: Window, state: BimState): void {
  assertNoViolations(checkWindowViolations(window, state));
}

/**
 * Valide l'intégrité métier et spatiale d'une pièce architecturale (Room).
 */
export function validateRoom(room: Room, state: BimState): void {
  assertNoViolations(checkRoomViolations(room, state));
}

/**
 * Valide l'intégrité métier et référentielle d'une cotation 2D (Dimension).
 */
export function validateDimension(dim: Dimension, state: BimState): void {
  assertNoViolations(checkDimensionViolations(dim, state));
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
  assertNoViolations(checkSlabTypeViolations(slabType));
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

  for (const pt of slab.boundary) {
    if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) {
      violations.push({
        code: 'INVALID_SLAB_BOUNDARY',
        message: `Slab "${slab.id}" has non-finite boundary coordinates.`,
        offendingIds: [slab.id],
      });
      return violations;
    }
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
  assertNoViolations(checkSlabViolations(slab, state));
}

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

/**
 * Vérifie les contraintes métier sur un RoofType (ADR-053 [3.1]).
 */
export function checkRoofTypeViolations(roofType: RoofType): RuleViolation[] {
  const violations: RuleViolation[] = [];

  if (!roofType.name || roofType.name.trim() === '') {
    violations.push({
      code: 'INVALID_ROOF_NAME',
      message: 'RoofType name cannot be empty.',
      offendingIds: [roofType.id],
    });
  }

  if (!Number.isFinite(roofType.thickness) || roofType.thickness < 100) {
    violations.push({
      code: 'INVALID_ROOF_THICKNESS',
      message: `RoofType thickness must be at least 100 mm (got ${roofType.thickness} mm).`,
      offendingIds: [roofType.id],
    });
  }

  if (roofType.family === 'gable') {
    const gable = roofType as GableRoofType;
    if (!Number.isFinite(gable.slopeDeg) || gable.slopeDeg < 5 || gable.slopeDeg > 60) {
      violations.push({
        code: 'INVALID_ROOF_SLOPE',
        message: `RoofType slope must be between 5° and 60° (got ${gable.slopeDeg}°).`,
        offendingIds: [roofType.id],
      });
    }

    if (!Number.isFinite(gable.overhangMm) || gable.overhangMm < 0 || gable.overhangMm > 1500) {
      violations.push({
        code: 'INVALID_ROOF_OVERHANG',
        message: `RoofType overhang must be between 0 and 1500 mm (got ${gable.overhangMm} mm).`,
        offendingIds: [roofType.id],
      });
    }
  }

  return violations;
}

export function validateRoofType(roofType: RoofType): void {
  const violations = checkRoofTypeViolations(roofType);
  if (violations.length > 0) {
    const v = violations[0];
    if (v) {
      throw new BimValidationError(v.code, v.message, { offendingIds: v.offendingIds });
    }
  }
}

/**
 * Vérifie les contraintes métier sur une toiture (Roof) (ADR-053 [3.2]).
 */
export function checkRoofViolations(roof: Roof, state: BimState): RuleViolation[] {
  const violations: RuleViolation[] = [];

  const roofType = state.roofTypes?.[roof.roofTypeId];
  if (!roofType) {
    violations.push({
      code: 'UNKNOWN_ROOF_TYPE',
      message: `Roof references unknown RoofType "${roof.roofTypeId}".`,
      offendingIds: [roof.id, roof.roofTypeId],
    });
  }

  const level = state.levels[roof.levelId];
  if (!level) {
    violations.push({
      code: 'UNKNOWN_LEVEL',
      message: `Roof references unknown level "${roof.levelId}".`,
      offendingIds: [roof.id, roof.levelId],
    });
  }

  if (!roof.footprint || roof.footprint.length < 3) {
    violations.push({
      code: 'INVALID_ROOF_FOOTPRINT',
      message: 'Roof footprint must have at least 3 vertices.',
      offendingIds: [roof.id],
    });
    return violations;
  }

  const footprintArea = Math.abs(signedArea(roof.footprint));
  if (footprintArea < 1000000) {
    violations.push({
      code: 'INVALID_ROOF_FOOTPRINT',
      message: `Roof footprint area must be at least 1 m² (1 000 000 mm²), got ${(footprintArea / 1e6).toFixed(2)} m².`,
      offendingIds: [roof.id],
    });
  }

  if (roofType && roofType.family === 'gable') {
    if (!roof.ridgeAxis || !roof.ridgeAxis.start || !roof.ridgeAxis.end) {
      violations.push({
        code: 'MISSING_RIDGE_AXIS',
        message: 'Gable roof requires a ridgeAxis (start and end).',
        offendingIds: [roof.id],
      });
    } else {
      const rStart = roof.ridgeAxis.start;
      const rEnd = roof.ridgeAxis.end;
      const ridgeLen = Math.hypot(rEnd.x - rStart.x, rEnd.y - rStart.y);
      if (ridgeLen <= 1e-4) {
        violations.push({
          code: 'MISSING_RIDGE_AXIS',
          message: 'Ridge axis length must be greater than zero.',
          offendingIds: [roof.id],
        });
      } else {
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (const p of roof.footprint) {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
        }

        const tol = 100;
        const midX = (rStart.x + rEnd.x) / 2;
        const midY = (rStart.y + rEnd.y) / 2;

        if (
          midX < minX - tol ||
          midX > maxX + tol ||
          midY < minY - tol ||
          midY > maxY + tol
        ) {
          violations.push({
            code: 'RIDGE_OUTSIDE_FOOTPRINT',
            message: 'Ridge axis must be located within the roof footprint bounds.',
            offendingIds: [roof.id],
          });
        }
      }
    }
  }

  if (roof.slopeOverrideDeg !== undefined) {
    if (!Number.isFinite(roof.slopeOverrideDeg) || roof.slopeOverrideDeg < 5 || roof.slopeOverrideDeg > 60) {
      violations.push({
        code: 'INVALID_ROOF_SLOPE',
        message: `Roof slope override must be between 5° and 60° (got ${roof.slopeOverrideDeg}°).`,
        offendingIds: [roof.id],
      });
    }
  }

  if (roof.overhangOverrideMm !== undefined) {
    if (!Number.isFinite(roof.overhangOverrideMm) || roof.overhangOverrideMm < 0 || roof.overhangOverrideMm > 1500) {
      violations.push({
        code: 'INVALID_ROOF_OVERHANG',
        message: `Roof overhang override must be between 0 and 1500 mm (got ${roof.overhangOverrideMm} mm).`,
        offendingIds: [roof.id],
      });
    }
  }

  return violations;
}

export function validateRoof(roof: Roof, state: BimState): void {
  const violations = checkRoofViolations(roof, state);
  if (violations.length > 0) {
    const v = violations[0];
    if (v) {
      throw new BimValidationError(v.code, v.message, { offendingIds: v.offendingIds });
    }
  }
}

/**
 * Vérifie les contraintes métier sur une ouverture de toiture (ADR-053 [3.3]).
 */
export function checkRoofOpeningViolations(opening: RoofOpening, state: BimState): RuleViolation[] {
  const violations: RuleViolation[] = [];

  const roof = state.roofs?.[opening.roofId];
  if (!roof) {
    violations.push({
      code: 'UNKNOWN_ROOF',
      message: `RoofOpening references unknown Roof "${opening.roofId}".`,
      offendingIds: [opening.id, opening.roofId],
    });
    return violations;
  }

  if (!Number.isFinite(opening.width) || opening.width <= 0 || !Number.isFinite(opening.height) || opening.height <= 0) {
    violations.push({
      code: 'INVALID_OPENING_DIMENSIONS',
      message: 'RoofOpening width and height must be positive numbers.',
      offendingIds: [opening.id],
    });
  }

  if (state.roofOpenings) {
    const minX = opening.offsetU;
    const maxX = opening.offsetU + opening.width;
    const minY = opening.offsetV;
    const maxY = opening.offsetV + opening.height;

    for (const other of Object.values(state.roofOpenings)) {
      if (other.id === opening.id || other.roofId !== opening.roofId) continue;
      const oMinX = other.offsetU;
      const oMaxX = other.offsetU + other.width;
      const oMinY = other.offsetV;
      const oMaxY = other.offsetV + other.height;

      const overlap = minX < oMaxX && maxX > oMinX && minY < oMaxY && maxY > oMinY;
      if (overlap) {
        violations.push({
          code: 'ROOF_OPENING_OVERLAP',
          message: `RoofOpening "${opening.id}" overlaps with existing RoofOpening "${other.id}".`,
          offendingIds: [opening.id, other.id],
        });
        break;
      }
    }
  }

  return violations;
}

export function validateRoofOpening(opening: RoofOpening, state: BimState): void {
  const violations = checkRoofOpeningViolations(opening, state);
  if (violations.length > 0) {
    const v = violations[0];
    if (v) {
      throw new BimValidationError(v.code, v.message, { offendingIds: v.offendingIds });
    }
  }
}

/**
 * Vérifie les contraintes métier sur un ComponentType (Phase 8).
 */
export function checkComponentTypeViolations(componentType: ComponentType): RuleViolation[] {
  const violations: RuleViolation[] = [];
  if (!componentType.name || componentType.name.trim() === '') {
    violations.push({
      code: 'INVALID_COMPONENT_NAME',
      message: `ComponentType "${componentType.id}" has an empty name.`,
      offendingIds: [componentType.id],
    });
  }
  if (
    !Number.isFinite(componentType.width) ||
    componentType.width <= 0 ||
    !Number.isFinite(componentType.depth) ||
    componentType.depth <= 0 ||
    !Number.isFinite(componentType.height) ||
    componentType.height <= 0
  ) {
    violations.push({
      code: 'INVALID_COMPONENT_DIMENSIONS',
      message: `ComponentType "${componentType.id}" dimensions must be strictly positive finite numbers.`,
      offendingIds: [componentType.id],
    });
  }
  const validFamilies: ComponentFamily[] = ['sanitary', 'kitchen', 'furniture', 'glazing'];
  if (!validFamilies.includes(componentType.family)) {
    violations.push({
      code: 'INVALID_COMPONENT_FAMILY',
      message: `ComponentType "${componentType.id}" has invalid family "${componentType.family}".`,
      offendingIds: [componentType.id],
    });
  }
  if (componentType.minWidth !== undefined && (!Number.isFinite(componentType.minWidth) || componentType.minWidth <= 0)) {
    violations.push({
      code: 'INVALID_COMPONENT_DIMENSIONS',
      message: `ComponentType "${componentType.id}" minWidth must be a strictly positive finite number.`,
      offendingIds: [componentType.id],
    });
  }
  if (componentType.maxWidth !== undefined && (!Number.isFinite(componentType.maxWidth) || componentType.maxWidth <= 0)) {
    violations.push({
      code: 'INVALID_COMPONENT_DIMENSIONS',
      message: `ComponentType "${componentType.id}" maxWidth must be a strictly positive finite number.`,
      offendingIds: [componentType.id],
    });
  }
  if (
    componentType.minWidth !== undefined &&
    componentType.maxWidth !== undefined &&
    componentType.minWidth > componentType.maxWidth
  ) {
    violations.push({
      code: 'INVALID_COMPONENT_DIMENSIONS',
      message: `ComponentType "${componentType.id}" minWidth (${componentType.minWidth}) cannot exceed maxWidth (${componentType.maxWidth}).`,
      offendingIds: [componentType.id],
    });
  }
  if (componentType.minDepth !== undefined && (!Number.isFinite(componentType.minDepth) || componentType.minDepth <= 0)) {
    violations.push({
      code: 'INVALID_COMPONENT_DIMENSIONS',
      message: `ComponentType "${componentType.id}" minDepth must be a strictly positive finite number.`,
      offendingIds: [componentType.id],
    });
  }
  if (componentType.maxDepth !== undefined && (!Number.isFinite(componentType.maxDepth) || componentType.maxDepth <= 0)) {
    violations.push({
      code: 'INVALID_COMPONENT_DIMENSIONS',
      message: `ComponentType "${componentType.id}" maxDepth must be a strictly positive finite number.`,
      offendingIds: [componentType.id],
    });
  }
  if (
    componentType.minDepth !== undefined &&
    componentType.maxDepth !== undefined &&
    componentType.minDepth > componentType.maxDepth
  ) {
    violations.push({
      code: 'INVALID_COMPONENT_DIMENSIONS',
      message: `ComponentType "${componentType.id}" minDepth (${componentType.minDepth}) cannot exceed maxDepth (${componentType.maxDepth}).`,
      offendingIds: [componentType.id],
    });
  }
  return violations;
}

export function validateComponentType(componentType: ComponentType): void {
  const violations = checkComponentTypeViolations(componentType);
  if (violations.length > 0) {
    const v = violations[0];
    if (v) {
      throw new BimValidationError(v.code, v.message, { offendingIds: v.offendingIds });
    }
  }
}

/**
 * Vérifie les contraintes métier sur une instance de composant (Phase 8).
 */
export function checkComponentViolations(component: Component, state: BimState): RuleViolation[] {
  const violations: RuleViolation[] = [];

  // 1. Intégrité du type
  if (!state.componentTypes || !state.componentTypes[component.typeId]) {
    violations.push({
      code: 'UNKNOWN_COMPONENT_TYPE',
      message: `Component "${component.id}" references non-existent ComponentType ID: "${component.typeId}".`,
      offendingIds: [component.id],
    });
  }

  // 2. Intégrité du niveau
  if (!state.levels[component.levelId]) {
    violations.push({
      code: 'UNKNOWN_LEVEL',
      message: `Component "${component.id}" references non-existent Level ID: "${component.levelId}".`,
      offendingIds: [component.id],
    });
  }

  // 3. Intégrité de placement
  if (!Number.isFinite(component.placement.x) || !Number.isFinite(component.placement.y)) {
    violations.push({
      code: 'MALFORMED_COMPONENT',
      message: `Component "${component.id}" has non-finite placement coordinates.`,
      offendingIds: [component.id],
    });
  }

  // 4. Intégrité et géométrie du mur hôte si spécifié (Phase 8.5)
  if (component.placement.hostWallId) {
    const hostWall = state.walls[component.placement.hostWallId];
    if (!hostWall) {
      violations.push({
        code: 'UNKNOWN_HOST_WALL',
        message: `Component "${component.id}" references non-existent host wall ID: "${component.placement.hostWallId}".`,
        offendingIds: [component.id],
      });
    } else {
      const dx = hostWall.end.x - hostWall.start.x;
      const dy = hostWall.end.y - hostWall.start.y;
      const wallLen = Math.hypot(dx, dy);
      if (wallLen > 1e-4) {
        const ux = dx / wallLen;
        const uy = dy / wallLen;
        const px = component.placement.x - hostWall.start.x;
        const py = component.placement.y - hostWall.start.y;
        const s = px * ux + py * uy;
        const dPerp = Math.abs(-px * uy + py * ux);
        const wallType = state.wallTypes[hostWall.typeId];
        const thickness = wallType?.thickness ?? 200;
        const maxDist = thickness / 2 + 50;

        const ct = state.componentTypes ? state.componentTypes[component.typeId] : undefined;
        const isGlazing =
          ct &&
          (ct.family === 'glazing' ||
            ct.ifcEntity === 'IfcDoor' ||
            ct.ifcEntity === 'IfcWindow' ||
            ct.subType === 'sliding_door' ||
            ct.subType === 'french_window' ||
            Boolean(component.openingId));

        if (ct && isGlazing) {
          // Contrôle de distance orthogonale à l'axe du mur pour les menuiseries hôtes encastrées
          if (dPerp > maxDist) {
            violations.push({
              code: 'INVALID_HOST_WALL_DISTANCE',
              message: `Component "${component.id}" is placed too far from host wall centerline (${dPerp.toFixed(1)} mm > ${maxDist.toFixed(1)} mm).`,
              offendingIds: [component.id, hostWall.id],
            });
          }

          const dims = getComponentEffectiveDimensions(component, ct);
          const offsetAlong = s - dims.width / 2;

          // Contrôle strict des bornes longitudinales sans clampage silencieux
          if (offsetAlong < 0 || offsetAlong + dims.width > wallLen) {
            violations.push({
              code: 'INVALID_OPENING_POSITION',
              message: `Component "${component.id}" opening bounds [${offsetAlong.toFixed(1)}, ${(offsetAlong + dims.width).toFixed(1)}] exceed host wall length ${wallLen.toFixed(1)} mm.`,
              offendingIds: [component.id, hostWall.id],
            });
          }

          // Détection des chevauchements d'ouvertures (OPENING_OVERLAP)
          if (state.doors) {
            for (const d of Object.values(state.doors)) {
              if (d.hostWallId === hostWall.id && d.id !== component.id) {
                const dt = state.doorTypes?.[d.doorTypeId];
                const dw = dt?.width ?? 900;
                const dStart = d.offsetAlong;
                const dEnd = dStart + dw;
                const overlap = Math.min(offsetAlong + dims.width, dEnd) - Math.max(offsetAlong, dStart);
                if (overlap > 1) {
                  violations.push({
                    code: 'OPENING_OVERLAP',
                    message: `Component "${component.id}" opening overlaps existing door "${d.id}" on wall "${hostWall.id}".`,
                    offendingIds: [component.id, d.id, hostWall.id],
                  });
                }
              }
            }
          }

          if (state.windows) {
            for (const w of Object.values(state.windows)) {
              if (w.hostWallId === hostWall.id && w.id !== component.id) {
                const wt = state.windowTypes?.[w.windowTypeId];
                const ww = wt?.width ?? 1200;
                const wStart = w.offsetAlong;
                const wEnd = wStart + ww;
                const overlap = Math.min(offsetAlong + dims.width, wEnd) - Math.max(offsetAlong, wStart);
                if (overlap > 1) {
                  violations.push({
                    code: 'OPENING_OVERLAP',
                    message: `Component "${component.id}" opening overlaps existing window "${w.id}" on wall "${hostWall.id}".`,
                    offendingIds: [component.id, w.id, hostWall.id],
                  });
                }
              }
            }
          }

          if (state.components) {
            for (const other of Object.values(state.components)) {
              if (other.id !== component.id && other.placement.hostWallId === hostWall.id) {
                const otherType = state.componentTypes?.[other.typeId];
                const otherIsGlazing =
                  otherType &&
                  (otherType.family === 'glazing' ||
                    otherType.ifcEntity === 'IfcDoor' ||
                    otherType.ifcEntity === 'IfcWindow' ||
                    otherType.subType === 'sliding_door' ||
                    otherType.subType === 'french_window' ||
                    Boolean(other.openingId));
                if (otherType && otherIsGlazing) {
                  const otherDims = getComponentEffectiveDimensions(other, otherType);
                  const otherPx = other.placement.x - hostWall.start.x;
                  const otherPy = other.placement.y - hostWall.start.y;
                  const otherS = otherPx * ux + otherPy * uy;
                  const otherOffset = otherS - otherDims.width / 2;
                  const overlap =
                    Math.min(offsetAlong + dims.width, otherOffset + otherDims.width) -
                    Math.max(offsetAlong, otherOffset);
                  if (overlap > 1) {
                    violations.push({
                      code: 'OPENING_OVERLAP',
                      message: `Component "${component.id}" opening overlaps existing component opening "${other.id}" on wall "${hostWall.id}".`,
                      offendingIds: [component.id, other.id, hostWall.id],
                    });
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  // 5. Validation des surcharges dimensionnelles (Phase 8.4)
  const compType = state.componentTypes ? state.componentTypes[component.typeId] : undefined;
  if (compType) {
    if (component.widthOverride !== undefined) {
      if (!Number.isFinite(component.widthOverride) || component.widthOverride <= 0) {
        violations.push({
          code: 'INVALID_COMPONENT_DIMENSIONS',
          message: `Component "${component.id}" widthOverride must be a strictly positive finite number.`,
          offendingIds: [component.id],
        });
      } else {
        if (compType.minWidth !== undefined && component.widthOverride < compType.minWidth) {
          violations.push({
            code: 'INVALID_COMPONENT_DIMENSIONS',
            message: `Component "${component.id}" widthOverride (${component.widthOverride}) is below minimum allowed (${compType.minWidth}).`,
            offendingIds: [component.id],
          });
        }
        if (compType.maxWidth !== undefined && component.widthOverride > compType.maxWidth) {
          violations.push({
            code: 'INVALID_COMPONENT_DIMENSIONS',
            message: `Component "${component.id}" widthOverride (${component.widthOverride}) exceeds maximum allowed (${compType.maxWidth}).`,
            offendingIds: [component.id],
          });
        }
        if (
          compType.allowedWidths &&
          compType.allowedWidths.length > 0 &&
          !compType.allowedWidths.includes(component.widthOverride)
        ) {
          violations.push({
            code: 'INVALID_COMPONENT_DIMENSIONS',
            message: `Component "${component.id}" widthOverride (${component.widthOverride}) is not in allowed list [${compType.allowedWidths.join(', ')}].`,
            offendingIds: [component.id],
          });
        }
      }
    }

    if (component.depthOverride !== undefined) {
      if (!Number.isFinite(component.depthOverride) || component.depthOverride <= 0) {
        violations.push({
          code: 'INVALID_COMPONENT_DIMENSIONS',
          message: `Component "${component.id}" depthOverride must be a strictly positive finite number.`,
          offendingIds: [component.id],
        });
      } else {
        if (compType.minDepth !== undefined && component.depthOverride < compType.minDepth) {
          violations.push({
            code: 'INVALID_COMPONENT_DIMENSIONS',
            message: `Component "${component.id}" depthOverride (${component.depthOverride}) is below minimum allowed (${compType.minDepth}).`,
            offendingIds: [component.id],
          });
        }
        if (compType.maxDepth !== undefined && component.depthOverride > compType.maxDepth) {
          violations.push({
            code: 'INVALID_COMPONENT_DIMENSIONS',
            message: `Component "${component.id}" depthOverride (${component.depthOverride}) exceeds maximum allowed (${compType.maxDepth}).`,
            offendingIds: [component.id],
          });
        }
      }
    }

    if (component.heightOverride !== undefined) {
      if (!Number.isFinite(component.heightOverride) || component.heightOverride <= 0) {
        violations.push({
          code: 'INVALID_COMPONENT_DIMENSIONS',
          message: `Component "${component.id}" heightOverride must be a strictly positive finite number.`,
          offendingIds: [component.id],
        });
      } else {
        if (compType.minHeight !== undefined && component.heightOverride < compType.minHeight) {
          violations.push({
            code: 'INVALID_COMPONENT_DIMENSIONS',
            message: `Component "${component.id}" heightOverride (${component.heightOverride}) is below minimum allowed (${compType.minHeight}).`,
            offendingIds: [component.id],
          });
        }
        if (compType.maxHeight !== undefined && component.heightOverride > compType.maxHeight) {
          violations.push({
            code: 'INVALID_COMPONENT_DIMENSIONS',
            message: `Component "${component.id}" heightOverride (${component.heightOverride}) exceeds maximum allowed (${compType.maxHeight}).`,
            offendingIds: [component.id],
          });
        }
      }
    }
  }

  return violations;
}

export function validateComponent(component: Component, state: BimState): void {
  const violations = checkComponentViolations(component, state);
  if (violations.length > 0) {
    const v = violations[0];
    if (v) {
      throw new BimValidationError(v.code, v.message, { offendingIds: v.offendingIds });
    }
  }
}

/**
 * Teste l'intersection de deux polygones convexes 2D par le théorème des axes séparateurs (SAT).
 * Retourne true si les polygones se chevauchent de plus de toleranceMm.
 */
export function doConvexPolygonsIntersect(
  polyA: readonly Vec2[],
  polyB: readonly Vec2[],
  toleranceMm: number = 0.5,
): boolean {
  if (polyA.length < 3 || polyB.length < 3) return false;
  for (const currentPoly of [polyA, polyB]) {
    for (let i = 0; i < currentPoly.length; i++) {
      const p1 = currentPoly[i];
      const p2 = currentPoly[(i + 1) % currentPoly.length];
      if (!p1 || !p2) continue;
      const nx = -(p2.y - p1.y);
      const ny = p2.x - p1.x;
      const nLen = Math.hypot(nx, ny);
      if (nLen < 1e-6) continue;
      const unx = nx / nLen;
      const uny = ny / nLen;

      let minA = Infinity;
      let maxA = -Infinity;
      for (const pt of polyA) {
        const proj = pt.x * unx + pt.y * uny;
        if (proj < minA) minA = proj;
        if (proj > maxA) maxA = proj;
      }

      let minB = Infinity;
      let maxB = -Infinity;
      for (const pt of polyB) {
        const proj = pt.x * unx + pt.y * uny;
        if (proj < minB) minB = proj;
        if (proj > maxB) maxB = proj;
      }

      if (maxA - minB < toleranceMm || maxB - minA < toleranceMm) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Calcule les 4 sommets CCW de l'emprise 2D (OBB) d'un composant dans le repère global.
 */
export function getComponentObbVertices(comp: Component, state: BimState): Vec2[] {
  const type = state.componentTypes ? state.componentTypes[comp.typeId] : undefined;
  const dims = type
    ? getComponentEffectiveDimensions(comp, type)
    : {
        width: comp.widthOverride ?? 600,
        depth: comp.depthOverride ?? 600,
        height: comp.heightOverride ?? 800,
      };
  const halfW = dims.width / 2;
  const halfD = dims.depth / 2;
  const rot = comp.placement.rotation ?? 0;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const cx = comp.placement.x;
  const cy = comp.placement.y;

  const localCorners: [number, number][] = [
    [-halfW, -halfD],
    [halfW, -halfD],
    [halfW, halfD],
    [-halfW, halfD],
  ];

  return localCorners.map(([lx, ly]) =>
    vec2(cx + lx * cos - ly * sin, cy + lx * sin + ly * cos),
  );
}

/**
 * Calcule les 4 sommets CCW de la zone de dégagement fonctionnel d'un composant dans le repère global.
 * Retourne null si le type ne définit pas de dégagement (clearanceDepth <= 0).
 */
export function getComponentClearanceVertices(comp: Component, state: BimState): Vec2[] | null {
  const type = state.componentTypes ? state.componentTypes[comp.typeId] : undefined;
  if (!type) return null;
  const clearance = type.clearanceDepth ?? 0;
  if (clearance <= 0) return null;

  const dims = getComponentEffectiveDimensions(comp, type);
  const halfW = dims.width / 2;
  const halfD = dims.depth / 2;
  const rot = comp.placement.rotation ?? 0;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const cx = comp.placement.x;
  const cy = comp.placement.y;

  // Zone de dégagement en avant du composant : Y local dans [-halfD - clearance, -halfD]
  const localCorners: [number, number][] = [
    [-halfW, -halfD - clearance],
    [halfW, -halfD - clearance],
    [halfW, -halfD],
    [-halfW, -halfD],
  ];

  return localCorners.map(([lx, ly]) =>
    vec2(cx + lx * cos - ly * sin, cy + lx * sin + ly * cos),
  );
}

/**
 * Détecte les collisions physiques (2D / 3D OBB) d'un composant avec les autres composants
 * et les murs du même niveau (en ignorant le mur hôte s'il est hébergé).
 */
export function checkComponentCollisions(component: Component, state: BimState): RuleViolation[] {
  const violations: RuleViolation[] = [];
  const ct = state.componentTypes ? state.componentTypes[component.typeId] : undefined;
  if (!ct) return violations;

  const compDims = getComponentEffectiveDimensions(component, ct);
  const compLevel = state.levels[component.levelId];
  const compZBase = (compLevel?.elevation ?? 0) + (component.placement.elevationOffset ?? ct.defaultElevationOffset ?? 0);
  const compZTop = compZBase + compDims.height;
  const compPoly = getComponentObbVertices(component, state);

  // 1. Collisions contre les autres composants du même niveau
  if (state.components) {
    for (const other of Object.values(state.components)) {
      if (other.id === component.id) continue;
      if (other.levelId !== component.levelId) continue;
      const otherType = state.componentTypes ? state.componentTypes[other.typeId] : undefined;
      if (!otherType) continue;

      const otherDims = getComponentEffectiveDimensions(other, otherType);
      const otherLevel = state.levels[other.levelId];
      const otherZBase = (otherLevel?.elevation ?? 0) + (other.placement.elevationOffset ?? otherType.defaultElevationOffset ?? 0);
      const otherZTop = otherZBase + otherDims.height;

      // Chevauchement vertical strict
      if (Math.max(compZBase, otherZBase) < Math.min(compZTop, otherZTop) - 1) {
        const otherPoly = getComponentObbVertices(other, state);
        if (doConvexPolygonsIntersect(compPoly, otherPoly, 1)) {
          violations.push({
            code: 'COMPONENT_COLLISION',
            message: `Component "${component.id}" collides with component "${other.id}".`,
            offendingIds: [component.id, other.id],
          });
        }
      }
    }
  }

  // 2. Collisions contre les murs du même niveau (sauf le mur hôte)
  if (state.walls) {
    for (const wall of Object.values(state.walls)) {
      if (wall.levelId !== component.levelId) continue;
      if (component.placement.hostWallId === wall.id) continue;

      const wallType = state.wallTypes[wall.typeId];
      const thickness = wallType?.thickness ?? 200;
      const fp = computeWallFootprint2d({
        start: wall.start,
        end: wall.end,
        thickness,
        locationLine: 'center',
      });

      if (doConvexPolygonsIntersect(compPoly, fp.vertices, 1)) {
        violations.push({
          code: 'COMPONENT_COLLISION',
          message: `Component "${component.id}" collides with wall "${wall.id}".`,
          offendingIds: [component.id, wall.id],
        });
      }
    }
  }

  return violations;
}

/**
 * Analyse si la zone de dégagement fonctionnel recommandé d'un composant est obstruée
 * par un autre composant ou un mur.
 */
export function checkFunctionalClearance(
  component: Component,
  state: BimState,
): { isObstructed: boolean; obstacles: ElementId[] } {
  const clearancePoly = getComponentClearanceVertices(component, state);
  if (!clearancePoly) {
    return { isObstructed: false, obstacles: [] };
  }

  const obstacles: ElementId[] = [];

  // 1. Obstacles composants
  if (state.components) {
    for (const other of Object.values(state.components)) {
      if (other.id === component.id) continue;
      if (other.levelId !== component.levelId) continue;
      const otherPoly = getComponentObbVertices(other, state);
      if (doConvexPolygonsIntersect(clearancePoly, otherPoly, 1)) {
        obstacles.push(other.id);
      }
    }
  }

  // 2. Obstacles murs
  if (state.walls) {
    for (const wall of Object.values(state.walls)) {
      if (wall.levelId !== component.levelId) continue;
      if (component.placement.hostWallId === wall.id) continue;
      const wallType = state.wallTypes[wall.typeId];
      const thickness = wallType?.thickness ?? 200;
      const fp = computeWallFootprint2d({
        start: wall.start,
        end: wall.end,
        thickness,
        locationLine: 'center',
      });
      if (doConvexPolygonsIntersect(clearancePoly, fp.vertices, 1)) {
        obstacles.push(wall.id);
      }
    }
  }

  return { isObstructed: obstacles.length > 0, obstacles };
}

export function canDeleteComponentType(
  componentTypeId: ElementId,
  state: BimState,
): { readonly allowed: boolean; readonly reason?: string } {
  if (!state.componentTypes?.[componentTypeId]) {
    return { allowed: false, reason: `ComponentType "${componentTypeId}" does not exist.` };
  }
  const attached = Object.values(state.components ?? {}).filter((c) => c.typeId === componentTypeId);
  if (attached.length > 0) {
    return {
      allowed: false,
      reason: `ComponentType "${componentTypeId}" is referenced by ${attached.length} component(s).`,
    };
  }
  return { allowed: true };
}

export function canDeleteRoofType(
  roofTypeId: ElementId,
  state: BimState,
): { readonly allowed: boolean; readonly reason?: string } {
  if (!state.roofTypes?.[roofTypeId]) {
    return { allowed: false, reason: `RoofType "${roofTypeId}" does not exist.` };
  }
  const usingRoofs = Object.values(state.roofs ?? {}).filter((r) => r.roofTypeId === roofTypeId);
  if (usingRoofs.length > 0) {
    return {
      allowed: false,
      reason: `Cannot delete RoofType "${roofTypeId}": ${usingRoofs.length} roof(s) are using it.`,
    };
  }
  return { allowed: true };
}

export function canDeleteRoof(
  roofId: ElementId,
  state: BimState,
): { readonly allowed: boolean; readonly reason?: string } {
  if (!state.roofs?.[roofId]) {
    return { allowed: false, reason: `Roof "${roofId}" does not exist.` };
  }
  const referencingWalls = Object.values(state.walls).filter(
    (w) => w.topConstraint?.kind === 'roof' && w.topConstraint.roofId === roofId,
  );
  if (referencingWalls.length > 0) {
    return {
      allowed: false,
      reason: `Cannot delete Roof "${roofId}": ${referencingWalls.length} wall(s) reference it via topConstraint.`,
    };
  }
  return { allowed: true };
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

  const attachedComponents = Object.values(state.components ?? {}).filter((c) => c.levelId === levelId);
  if (attachedComponents.length > 0) {
    return {
      allowed: false,
      reason: `Cannot delete Level "${levelId}": ${attachedComponents.length} component(s) are attached to it.`,
    };
  }

  return { allowed: true };
}

// ---------------------------------------------------------------------------
// Validation Différentielle Post-Condition (Phase 6.0b / ADR-041 §6)
// ---------------------------------------------------------------------------

const CATEGORY_VALIDATORS: readonly ((
  id: ElementId,
  state: BimState,
) => readonly RuleViolation[])[] = [
  (id, state) => {
    const wall = state.walls[id];
    return wall ? [...checkWallViolations(wall, state), ...checkOpeningsOnWall(wall, state)] : [];
  },
  (id, state) => {
    const door = state.doors?.[id];
    return door ? checkDoorViolations(door, state) : [];
  },
  (id, state) => {
    const win = state.windows?.[id];
    return win ? checkWindowViolations(win, state) : [];
  },
  (id, state) => {
    const lvl = state.levels[id];
    return lvl ? checkLevelViolations(lvl, state) : [];
  },
  (id, state) => {
    const wt = state.wallTypes[id];
    return wt ? checkWallTypeViolations(wt) : [];
  },
  (id, state) => {
    const rm = state.rooms?.[id];
    return rm ? checkRoomViolations(rm, state) : [];
  },
  (id, state) => {
    const dim = state.dimensions?.[id];
    return dim ? checkDimensionViolations(dim, state) : [];
  },
  (id, state) => {
    const sl = state.slabs?.[id];
    return sl ? checkSlabViolations(sl, state) : [];
  },
  (id, state) => {
    const slt = state.slabTypes?.[id];
    return slt ? checkSlabTypeViolations(slt) : [];
  },
  (id, state) => {
    const st = state.stairs?.[id];
    return st ? checkStairViolations(st, state) : [];
  },
  (id, state) => {
    const stt = state.stairTypes?.[id];
    return stt ? checkStairTypeViolations(stt) : [];
  },
  (id, state) => {
    const rf = state.roofs?.[id];
    return rf ? checkRoofViolations(rf, state) : [];
  },
  (id, state) => {
    const rft = state.roofTypes?.[id];
    return rft ? checkRoofTypeViolations(rft) : [];
  },
  (id, state) => {
    const ro = state.roofOpenings?.[id];
    return ro ? checkRoofOpeningViolations(ro, state) : [];
  },
  (id, state) => {
    const comp = state.components?.[id];
    return comp ? checkComponentViolations(comp, state) : [];
  },
  (id, state) => {
    const compt = state.componentTypes?.[id];
    return compt ? checkComponentTypeViolations(compt) : [];
  },
];

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
    for (const validator of CATEGORY_VALIDATORS) {
      for (const v of validator(id, state)) {
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
    const first = draftViolations[0];
    if (first) {
      throw new BimValidationError(first.code, first.message, { offendingIds: first.offendingIds });
    }
    return;
  }

  const prevViolations = collectViolationsForDirty(previousState, dirtyIds);
  const prevByKey = new Map<string, RuleViolation>();
  for (const v of prevViolations) {
    const sortedIds = [...v.offendingIds].sort().join(',');
    prevByKey.set(`${v.code}:${sortedIds}`, v);
  }

  // Trouver la première violation introduite ou aggravée
  for (const v of draftViolations) {
    const sortedIds = [...v.offendingIds].sort().join(',');
    const key = `${v.code}:${sortedIds}`;
    const prev = prevByKey.get(key);

    if (!prev) {
      // Nouvelle violation introduite par la transaction
      throw new BimValidationError(v.code, v.message, { offendingIds: v.offendingIds });
    }

    // Violation existante : vérifier si elle est aggravée numériquement
    if (
      v.measurement !== undefined &&
      v.threshold !== undefined &&
      prev.measurement !== undefined &&
      prev.threshold !== undefined
    ) {
      const draftDelta = Math.abs(v.measurement - v.threshold);
      const prevDelta = Math.abs(prev.measurement - prev.threshold);
      if (draftDelta > prevDelta + 1e-4) {
        throw new BimValidationError(v.code, v.message, { offendingIds: v.offendingIds });
      }
    } else if (v.message !== prev.message) {
      throw new BimValidationError(v.code, v.message, { offendingIds: v.offendingIds });
    }
  }
}
