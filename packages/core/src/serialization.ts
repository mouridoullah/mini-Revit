import { type BimState } from './types.js';
import { BimValidationError } from './rules.js';

/**
 * Sérialise un état documentaire BimState en chaîne JSON standard.
 */
export function toJSON(state: BimState, pretty = false): string {
  return JSON.stringify(state, null, pretty ? 2 : undefined);
}

/**
 * Désérialise et valide rigoureusement une chaîne JSON en BimState.
 *
 * Échoue avec BimValidationError si le schéma est incompatible ou corrompu.
 */
export function fromJSON(jsonString: string): BimState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (err) {
    throw new BimValidationError(
      'INVALID_JSON',
      `Failed to parse JSON string: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new BimValidationError('MALFORMED_STATE', 'BIM document state must be a JSON object.');
  }

  const raw = parsed as Record<string, unknown>;

  // 1. Validation de la version de schéma
  if (raw['schemaVersion'] !== 1) {
    throw new BimValidationError(
      'UNSUPPORTED_SCHEMA_VERSION',
      `Unsupported schemaVersion: expected 1, got ${String(raw['schemaVersion'])}.`,
    );
  }

  // 2. Validation de l'unité
  if (raw['units'] !== 'mm') {
    throw new BimValidationError(
      'INVALID_UNITS',
      `Unsupported measurement units: expected "mm", got ${String(raw['units'])}.`,
    );
  }

  // 3. Validation de la présence des dictionnaires principaux
  if (!raw['levels'] || typeof raw['levels'] !== 'object' || Array.isArray(raw['levels'])) {
    throw new BimValidationError(
      'MISSING_REQUIRED_FIELDS',
      'Missing or invalid "levels" dictionary.',
    );
  }

  if (
    !raw['wallTypes'] ||
    typeof raw['wallTypes'] !== 'object' ||
    Array.isArray(raw['wallTypes'])
  ) {
    throw new BimValidationError(
      'MISSING_REQUIRED_FIELDS',
      'Missing or invalid "wallTypes" dictionary.',
    );
  }

  if (!raw['walls'] || typeof raw['walls'] !== 'object' || Array.isArray(raw['walls'])) {
    throw new BimValidationError(
      'MISSING_REQUIRED_FIELDS',
      'Missing or invalid "walls" dictionary.',
    );
  }

  // 4. Validation des éléments constitutifs et intégrité référentielle
  const levels = raw['levels'] as Record<string, unknown>;
  for (const [id, lvl] of Object.entries(levels)) {
    if (!lvl || typeof lvl !== 'object') {
      throw new BimValidationError('MALFORMED_LEVEL', `Malformed level entry at "${id}".`);
    }
    const l = lvl as Record<string, unknown>;
    if (l['id'] !== id) {
      throw new BimValidationError(
        'MALFORMED_LEVEL',
        `Level dictionary key "${id}" does not match internal id "${String(l['id'])}".`,
      );
    }
    if (typeof l['name'] !== 'string' || !Number.isFinite(l['elevation'])) {
      throw new BimValidationError(
        'MALFORMED_LEVEL',
        `Level "${id}" is missing required fields (name: string, elevation: finite number).`,
      );
    }
  }

  const wallTypes = raw['wallTypes'] as Record<string, unknown>;
  for (const [id, wt] of Object.entries(wallTypes)) {
    if (!wt || typeof wt !== 'object') {
      throw new BimValidationError('MALFORMED_WALL_TYPE', `Malformed wallType entry at "${id}".`);
    }
    const t = wt as Record<string, unknown>;
    if (t['id'] !== id) {
      throw new BimValidationError(
        'MALFORMED_WALL_TYPE',
        `WallType dictionary key "${id}" does not match internal id "${String(t['id'])}".`,
      );
    }
    if (
      typeof t['name'] !== 'string' ||
      !Number.isFinite(t['thickness']) ||
      (t['thickness'] as number) <= 0 ||
      !Number.isFinite(t['height']) ||
      (t['height'] as number) <= 0
    ) {
      throw new BimValidationError(
        'MALFORMED_WALL_TYPE',
        `WallType "${id}" is missing required fields or has invalid dimensions.`,
      );
    }
  }

  const walls = raw['walls'] as Record<string, unknown>;
  for (const [id, w] of Object.entries(walls)) {
    if (!w || typeof w !== 'object') {
      throw new BimValidationError('MALFORMED_WALL', `Malformed wall entry at "${id}".`);
    }
    const wall = w as Record<string, unknown>;
    if (wall['id'] !== id) {
      throw new BimValidationError(
        'MALFORMED_WALL',
        `Wall dictionary key "${id}" does not match internal id "${String(wall['id'])}".`,
      );
    }
    if (
      wall['category'] !== 'wall' ||
      typeof wall['typeId'] !== 'string' ||
      typeof wall['levelId'] !== 'string'
    ) {
      throw new BimValidationError(
        'MALFORMED_WALL',
        `Wall "${id}" is missing required fields or has invalid category.`,
      );
    }

    const typeId = wall['typeId'];
    if (!wallTypes[typeId]) {
      throw new BimValidationError(
        'UNKNOWN_WALL_TYPE',
        `Wall "${id}" references non-existent WallType ID: "${typeId}".`,
      );
    }

    const levelId = wall['levelId'];
    if (!levels[levelId]) {
      throw new BimValidationError(
        'UNKNOWN_LEVEL',
        `Wall "${id}" references non-existent Level ID: "${levelId}".`,
      );
    }

    const start = wall['start'] as Record<string, unknown> | undefined;
    const end = wall['end'] as Record<string, unknown> | undefined;

    if (
      !start ||
      !Number.isFinite(start['x']) ||
      !Number.isFinite(start['y']) ||
      !end ||
      !Number.isFinite(end['x']) ||
      !Number.isFinite(end['y'])
    ) {
      throw new BimValidationError(
        'MALFORMED_WALL',
        `Wall "${id}" has non-finite start or end coordinates.`,
      );
    }

    const sx = start['x'] as number;
    const sy = start['y'] as number;
    const ex = end['x'] as number;
    const ey = end['y'] as number;
    const len = Math.hypot(ex - sx, ey - sy);

    if (len <= 1e-4) {
      throw new BimValidationError(
        'INVALID_WALL_LENGTH',
        `Wall "${id}" has non-positive length (${len} mm).`,
      );
    }
  }

  return raw as unknown as BimState;
}
