import type {
  Wall,
  Door,
  Window,
  BimState,
  ElementId,
} from '../types.js';
import type { RuleViolation } from './types.js';
import { assertNoViolations } from './utils.js';
import {
  type OpeningInput,
  validateOpenings,
  MIN_OPENING_CLEARANCE,
} from '@mini-bim/geometry';
import { resolveWallGeometry, getWallLocalHeadroom } from '../walls/resolve.js';
import { getComponentEffectiveDimensions } from '../components/dimensions.js';

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
 * Valide une porte hébergée par un mur linéaire.
 */
export function validateDoor(door: Door, state: BimState): void {
  assertNoViolations(checkDoorViolations(door, state));
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
 * Valide une fenêtre hébergée par un mur linéaire.
 */
export function validateWindow(window: Window, state: BimState): void {
  assertNoViolations(checkWindowViolations(window, state));
}
