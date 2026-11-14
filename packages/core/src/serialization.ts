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

  // 5. Validation des portes (si présentes)
  const doors = (raw['doors'] ?? {}) as Record<string, unknown>;
  if (typeof doors !== 'object' || Array.isArray(doors)) {
    throw new BimValidationError('MALFORMED_STATE', 'Invalid "doors" dictionary.');
  }

  for (const [id, d] of Object.entries(doors)) {
    if (!d || typeof d !== 'object') {
      throw new BimValidationError('MALFORMED_DOOR', `Malformed door entry at "${id}".`);
    }
    const door = d as Record<string, unknown>;
    if (door['id'] !== id) {
      throw new BimValidationError(
        'MALFORMED_DOOR',
        `Door dictionary key "${id}" does not match internal id "${String(door['id'])}".`,
      );
    }
    if (
      door['category'] !== 'door' ||
      door['kind'] !== 'door' ||
      typeof door['hostWallId'] !== 'string'
    ) {
      throw new BimValidationError(
        'MALFORMED_DOOR',
        `Door "${id}" is missing required fields or has invalid category/kind.`,
      );
    }

    const hostWallId = door['hostWallId'];
    if (!walls[hostWallId]) {
      throw new BimValidationError(
        'UNKNOWN_HOST_WALL',
        `Door "${id}" references non-existent host wall ID: "${hostWallId}".`,
      );
    }

    if (
      !Number.isFinite(door['offsetAlong']) ||
      (door['offsetAlong'] as number) < 0 ||
      !Number.isFinite(door['width']) ||
      (door['width'] as number) <= 0 ||
      !Number.isFinite(door['height']) ||
      (door['height'] as number) <= 0
    ) {
      throw new BimValidationError(
        'MALFORMED_DOOR',
        `Door "${id}" has invalid dimensions or negative offsetAlong.`,
      );
    }

    const swing = door['swing'] as Record<string, unknown> | undefined;
    if (
      !swing ||
      !['left', 'right'].includes(String(swing['side'])) ||
      !['in', 'out'].includes(String(swing['direction']))
    ) {
      throw new BimValidationError(
        'MALFORMED_DOOR',
        `Door "${id}" has invalid swing configuration.`,
      );
    }
  }

  // 6. Validation des fenêtres (si présentes)
  const windows = (raw['windows'] ?? {}) as Record<string, unknown>;
  if (typeof windows !== 'object' || Array.isArray(windows)) {
    throw new BimValidationError('MALFORMED_STATE', 'Invalid "windows" dictionary.');
  }

  for (const [id, w] of Object.entries(windows)) {
    if (!w || typeof w !== 'object') {
      throw new BimValidationError('MALFORMED_WINDOW', `Malformed window entry at "${id}".`);
    }
    const win = w as Record<string, unknown>;
    if (win['id'] !== id) {
      throw new BimValidationError(
        'MALFORMED_WINDOW',
        `Window dictionary key "${id}" does not match internal id "${String(win['id'])}".`,
      );
    }
    if (
      win['category'] !== 'window' ||
      win['kind'] !== 'window' ||
      typeof win['hostWallId'] !== 'string'
    ) {
      throw new BimValidationError(
        'MALFORMED_WINDOW',
        `Window "${id}" is missing required fields or has invalid category/kind.`,
      );
    }

    const hostWallId = win['hostWallId'];
    if (!walls[hostWallId]) {
      throw new BimValidationError(
        'UNKNOWN_HOST_WALL',
        `Window "${id}" references non-existent host wall ID: "${hostWallId}".`,
      );
    }

    if (
      !Number.isFinite(win['offsetAlong']) ||
      (win['offsetAlong'] as number) < 0 ||
      !Number.isFinite(win['width']) ||
      (win['width'] as number) <= 0 ||
      !Number.isFinite(win['height']) ||
      (win['height'] as number) <= 0 ||
      !Number.isFinite(win['sillHeight']) ||
      (win['sillHeight'] as number) < 0
    ) {
      throw new BimValidationError(
        'MALFORMED_WINDOW',
        `Window "${id}" has invalid dimensions, negative offsetAlong, or negative sillHeight.`,
      );
    }
  }

  // 7. Validation des pièces (si présentes, rétrocompatible)
  const rooms = (raw['rooms'] ?? {}) as Record<string, unknown>;
  if (typeof rooms !== 'object' || Array.isArray(rooms)) {
    throw new BimValidationError('MALFORMED_STATE', 'Invalid "rooms" dictionary.');
  }

  for (const [id, r] of Object.entries(rooms)) {
    if (!r || typeof r !== 'object') {
      throw new BimValidationError('MALFORMED_ROOM', `Malformed room entry at "${id}".`);
    }
    const rm = r as Record<string, unknown>;
    if (rm['id'] !== id) {
      throw new BimValidationError(
        'MALFORMED_ROOM',
        `Room dictionary key "${id}" does not match internal id "${String(rm['id'])}".`,
      );
    }
    if (
      rm['category'] !== 'room' ||
      typeof rm['name'] !== 'string' ||
      typeof rm['levelId'] !== 'string'
    ) {
      throw new BimValidationError(
        'MALFORMED_ROOM',
        `Room "${id}" is missing required fields or has invalid category.`,
      );
    }
    const seed = rm['seed'] as Record<string, unknown> | undefined;
    if (
      !seed ||
      typeof seed !== 'object' ||
      !Number.isFinite(seed['x']) ||
      !Number.isFinite(seed['y'])
    ) {
      throw new BimValidationError(
        'MALFORMED_ROOM',
        `Room "${id}" has invalid or missing seed coordinates.`,
      );
    }
  }

  // 8. Validation des cotations (si présentes, rétrocompatible)
  const dimensions = (raw['dimensions'] ?? {}) as Record<string, unknown>;
  if (typeof dimensions !== 'object' || Array.isArray(dimensions)) {
    throw new BimValidationError('MALFORMED_STATE', 'Invalid "dimensions" dictionary.');
  }

  for (const [id, d] of Object.entries(dimensions)) {
    if (!d || typeof d !== 'object') {
      throw new BimValidationError('MALFORMED_DIMENSION', `Malformed dimension entry at "${id}".`);
    }
    const dim = d as Record<string, unknown>;
    if (dim['id'] !== id) {
      throw new BimValidationError(
        'MALFORMED_DIMENSION',
        `Dimension dictionary key "${id}" does not match internal id "${String(dim['id'])}".`,
      );
    }
    if (
      dim['category'] !== 'dimension' ||
      typeof dim['levelId'] !== 'string' ||
      !Array.isArray(dim['references']) ||
      !Number.isFinite(dim['offset']) ||
      !Number.isFinite(dim['value'])
    ) {
      throw new BimValidationError(
        'MALFORMED_DIMENSION',
        `Dimension "${id}" is missing required fields or has invalid types.`,
      );
    }
  }

  return {
    ...raw,
    doors: doors as unknown as Record<string, import('./types.js').Door>,
    windows: windows as unknown as Record<string, import('./types.js').Window>,
    rooms: rooms as unknown as Record<string, import('./types.js').Room>,
    dimensions: dimensions as unknown as Record<string, import('./types.js').Dimension>,
  } as unknown as BimState;
}
