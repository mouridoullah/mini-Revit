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

  // 4. Validation des éléments constitutifs
  const levels = raw['levels'] as Record<string, unknown>;
  for (const [id, lvl] of Object.entries(levels)) {
    if (!lvl || typeof lvl !== 'object') {
      throw new BimValidationError('MALFORMED_LEVEL', `Malformed level entry at "${id}".`);
    }
    const l = lvl as Record<string, unknown>;
    if (typeof l['name'] !== 'string' || typeof l['elevation'] !== 'number') {
      throw new BimValidationError(
        'MALFORMED_LEVEL',
        `Level "${id}" is missing required fields (name: string, elevation: number).`,
      );
    }
  }

  const wallTypes = raw['wallTypes'] as Record<string, unknown>;
  for (const [id, wt] of Object.entries(wallTypes)) {
    if (!wt || typeof wt !== 'object') {
      throw new BimValidationError('MALFORMED_WALL_TYPE', `Malformed wallType entry at "${id}".`);
    }
    const t = wt as Record<string, unknown>;
    if (
      typeof t['name'] !== 'string' ||
      typeof t['thickness'] !== 'number' ||
      typeof t['height'] !== 'number'
    ) {
      throw new BimValidationError(
        'MALFORMED_WALL_TYPE',
        `WallType "${id}" is missing required fields (name, thickness, height).`,
      );
    }
  }

  const walls = raw['walls'] as Record<string, unknown>;
  for (const [id, w] of Object.entries(walls)) {
    if (!w || typeof w !== 'object') {
      throw new BimValidationError('MALFORMED_WALL', `Malformed wall entry at "${id}".`);
    }
    const wall = w as Record<string, unknown>;
    const start = wall['start'] as Record<string, unknown> | undefined;
    const end = wall['end'] as Record<string, unknown> | undefined;

    if (
      wall['category'] !== 'wall' ||
      typeof wall['typeId'] !== 'string' ||
      typeof wall['levelId'] !== 'string' ||
      !start ||
      typeof start['x'] !== 'number' ||
      typeof start['y'] !== 'number' ||
      !end ||
      typeof end['x'] !== 'number' ||
      typeof end['y'] !== 'number'
    ) {
      throw new BimValidationError(
        'MALFORMED_WALL',
        `Wall "${id}" is missing required fields (typeId, levelId, start: Vec2, end: Vec2).`,
      );
    }
  }

  return raw as unknown as BimState;
}
