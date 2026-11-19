import type { Room, BimState } from '../types.js';
import type { RuleViolation } from './types.js';
import { assertNoViolations } from './utils.js';
import { isPointInPolygon } from '@mini-bim/geometry';
import { detectRooms } from '../rooms/detect.js';

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
 * Valide l'intégrité métier et spatiale d'une pièce architecturale (Room).
 */
export function validateRoom(room: Room, state: BimState): void {
  assertNoViolations(checkRoomViolations(room, state));
}
