import { type BimState, type V1BimState } from './types.js';
import { BimValidationError } from './rules.js';
import { migrateSchemaV1toV2 } from './migrations/v1_to_v2.js';

/**
 * Sérialise un état documentaire BimState en chaîne JSON standard.
 */
export function toJSON(state: BimState, pretty = false): string {
  return JSON.stringify(state, null, pretty ? 2 : undefined);
}

/**
 * Désérialise et valide rigoureusement une chaîne JSON en BimState (Schéma v2 / ADR-043 / ADR-045).
 *
 * Échoue avec BimValidationError si le schéma est incompatible ou corrompu.
 * Migre automatiquement les documents V1 ou non versionnés vers le schéma V2.
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

  // 1. Détection et validation de la version de schéma
  const schemaVer = raw['schemaVersion'];
  if (typeof schemaVer === 'number' && schemaVer > 2) {
    throw new BimValidationError(
      'UNSUPPORTED_SCHEMA_VERSION',
      `Unsupported schemaVersion: expected <= 2, got ${String(schemaVer)}.`,
    );
  }

  // 2. Migration automatique si V1 ou absent
  let state: BimState;
  if (schemaVer === 1 || schemaVer === undefined) {
    state = migrateSchemaV1toV2(raw as unknown as V1BimState);
  } else if (schemaVer === 2) {
    state = raw as unknown as BimState;
  } else {
    throw new BimValidationError(
      'UNSUPPORTED_SCHEMA_VERSION',
      `Unsupported schemaVersion: expected 1 or 2, got ${String(schemaVer)}.`,
    );
  }

  // 3. Validation de l'unité
  if (state.units !== 'mm') {
    throw new BimValidationError(
      'INVALID_UNITS',
      `Unsupported measurement units: expected "mm", got ${String(state.units)}.`,
    );
  }

  // 4. Validation des dictionnaires principaux requis en V2
  const requiredDicts = [
    'levels',
    'wallTypes',
    'slabTypes',
    'doorTypes',
    'windowTypes',
    'walls',
    'slabs',
    'doors',
    'windows',
    'rooms',
    'dimensions',
  ] as const;

  for (const dict of requiredDicts) {
    if (!state[dict] || typeof state[dict] !== 'object' || Array.isArray(state[dict])) {
      throw new BimValidationError(
        'MISSING_REQUIRED_FIELDS',
        `Missing or invalid "${dict}" dictionary in V2 state.`,
      );
    }
  }

  // 5. Validation des Niveaux (Level)
  for (const [id, lvl] of Object.entries(state.levels)) {
    if (!lvl || typeof lvl !== 'object') {
      throw new BimValidationError('MALFORMED_LEVEL', `Malformed level entry at "${id}".`);
    }
    if (lvl.id !== id) {
      throw new BimValidationError(
        'MALFORMED_LEVEL',
        `Level dictionary key "${id}" does not match internal id "${lvl.id}".`,
      );
    }
    if (typeof lvl.name !== 'string' || !Number.isFinite(lvl.elevation)) {
      throw new BimValidationError(
        'MALFORMED_LEVEL',
        `Level "${id}" is missing required fields (name: string, elevation: finite number).`,
      );
    }
  }

  // 6. Validation des WallTypes
  for (const [id, wt] of Object.entries(state.wallTypes)) {
    if (!wt || typeof wt !== 'object') {
      throw new BimValidationError('MALFORMED_WALL_TYPE', `Malformed wallType entry at "${id}".`);
    }
    if (wt.id !== id) {
      throw new BimValidationError(
        'MALFORMED_WALL_TYPE',
        `WallType dictionary key "${id}" does not match internal id "${wt.id}".`,
      );
    }
    if (
      typeof wt.name !== 'string' ||
      !Number.isFinite(wt.thickness) ||
      wt.thickness <= 0 ||
      !Number.isFinite(wt.height) ||
      wt.height <= 0
    ) {
      throw new BimValidationError(
        'MALFORMED_WALL_TYPE',
        `WallType "${id}" is missing required fields or has invalid dimensions.`,
      );
    }
  }

  // 7. Validation des SlabTypes
  for (const [id, st] of Object.entries(state.slabTypes)) {
    if (!st || typeof st !== 'object') {
      throw new BimValidationError('MALFORMED_SLAB_TYPE', `Malformed slabType entry at "${id}".`);
    }
    if (st.id !== id) {
      throw new BimValidationError(
        'MALFORMED_SLAB_TYPE',
        `SlabType dictionary key "${id}" does not match internal id "${st.id}".`,
      );
    }
    if (typeof st.name !== 'string' || !Number.isFinite(st.thickness) || st.thickness <= 0) {
      throw new BimValidationError(
        'MALFORMED_SLAB_TYPE',
        `SlabType "${id}" is missing required fields or has invalid thickness.`,
      );
    }
  }

  // 8. Validation des DoorTypes
  for (const [id, dt] of Object.entries(state.doorTypes)) {
    if (!dt || typeof dt !== 'object') {
      throw new BimValidationError('MALFORMED_DOOR_TYPE', `Malformed doorType entry at "${id}".`);
    }
    if (dt.id !== id) {
      throw new BimValidationError(
        'MALFORMED_DOOR_TYPE',
        `DoorType dictionary key "${id}" does not match internal id "${dt.id}".`,
      );
    }
    if (
      typeof dt.name !== 'string' ||
      !Number.isFinite(dt.width) ||
      dt.width <= 0 ||
      !Number.isFinite(dt.height) ||
      dt.height <= 0
    ) {
      throw new BimValidationError(
        'MALFORMED_DOOR_TYPE',
        `DoorType "${id}" is missing required fields or has invalid dimensions.`,
      );
    }
  }

  // 9. Validation des WindowTypes
  for (const [id, wint] of Object.entries(state.windowTypes)) {
    if (!wint || typeof wint !== 'object') {
      throw new BimValidationError(
        'MALFORMED_WINDOW_TYPE',
        `Malformed windowType entry at "${id}".`,
      );
    }
    if (wint.id !== id) {
      throw new BimValidationError(
        'MALFORMED_WINDOW_TYPE',
        `WindowType dictionary key "${id}" does not match internal id "${wint.id}".`,
      );
    }
    if (
      typeof wint.name !== 'string' ||
      !Number.isFinite(wint.width) ||
      wint.width <= 0 ||
      !Number.isFinite(wint.height) ||
      wint.height <= 0 ||
      !Number.isFinite(wint.defaultSillHeight) ||
      wint.defaultSillHeight < 0
    ) {
      throw new BimValidationError(
        'MALFORMED_WINDOW_TYPE',
        `WindowType "${id}" is missing required fields or has invalid dimensions.`,
      );
    }
  }

  // 10. Validation des Murs (Wall)
  for (const [id, w] of Object.entries(state.walls)) {
    if (!w || typeof w !== 'object') {
      throw new BimValidationError('MALFORMED_WALL', `Malformed wall entry at "${id}".`);
    }
    if (w.id !== id) {
      throw new BimValidationError(
        'MALFORMED_WALL',
        `Wall dictionary key "${id}" does not match internal id "${w.id}".`,
      );
    }
    if (w.category !== 'wall' || typeof w.typeId !== 'string' || typeof w.levelId !== 'string') {
      throw new BimValidationError(
        'MALFORMED_WALL',
        `Wall "${id}" is missing required fields or has invalid category.`,
      );
    }
    if (!state.wallTypes[w.typeId]) {
      throw new BimValidationError(
        'UNKNOWN_WALL_TYPE',
        `Wall "${id}" references non-existent WallType ID: "${w.typeId}".`,
      );
    }
    if (!state.levels[w.levelId]) {
      throw new BimValidationError(
        'UNKNOWN_LEVEL',
        `Wall "${id}" references non-existent Level ID: "${w.levelId}".`,
      );
    }
    if (
      !w.start ||
      !Number.isFinite(w.start.x) ||
      !Number.isFinite(w.start.y) ||
      !w.end ||
      !Number.isFinite(w.end.x) ||
      !Number.isFinite(w.end.y)
    ) {
      throw new BimValidationError(
        'MALFORMED_WALL',
        `Wall "${id}" has non-finite start or end coordinates.`,
      );
    }
    const len = Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y);
    if (len <= 1e-4) {
      throw new BimValidationError(
        'INVALID_WALL_LENGTH',
        `Wall "${id}" has non-positive length (${len} mm).`,
      );
    }
  }

  // 11. Validation des Portes (Door)
  for (const [id, d] of Object.entries(state.doors)) {
    if (!d || typeof d !== 'object') {
      throw new BimValidationError('MALFORMED_DOOR', `Malformed door entry at "${id}".`);
    }
    if (d.id !== id) {
      throw new BimValidationError(
        'MALFORMED_DOOR',
        `Door dictionary key "${id}" does not match internal id "${d.id}".`,
      );
    }
    if (d.category !== 'door' || typeof d.hostWallId !== 'string') {
      throw new BimValidationError(
        'MALFORMED_DOOR',
        `Door "${id}" is missing required fields or has invalid category.`,
      );
    }
    if (!state.walls[d.hostWallId]) {
      throw new BimValidationError(
        'UNKNOWN_HOST_WALL',
        `Door "${id}" references non-existent host wall ID: "${d.hostWallId}".`,
      );
    }
    if (!d.doorTypeId || !state.doorTypes[d.doorTypeId]) {
      throw new BimValidationError(
        'UNKNOWN_DOOR_TYPE',
        `Door "${id}" references non-existent DoorType ID: "${d.doorTypeId}".`,
      );
    }
    if (!Number.isFinite(d.offsetAlong) || d.offsetAlong < 0) {
      throw new BimValidationError('MALFORMED_DOOR', `Door "${id}" has negative offsetAlong.`);
    }
    if (
      !d.swing ||
      !['left', 'right'].includes(d.swing.side) ||
      !['in', 'out'].includes(d.swing.direction)
    ) {
      throw new BimValidationError(
        'MALFORMED_DOOR',
        `Door "${id}" has invalid swing configuration.`,
      );
    }
  }

  // 12. Validation des Fenêtres (Window)
  for (const [id, win] of Object.entries(state.windows)) {
    if (!win || typeof win !== 'object') {
      throw new BimValidationError('MALFORMED_WINDOW', `Malformed window entry at "${id}".`);
    }
    if (win.id !== id) {
      throw new BimValidationError(
        'MALFORMED_WINDOW',
        `Window dictionary key "${id}" does not match internal id "${win.id}".`,
      );
    }
    if (win.category !== 'window' || typeof win.hostWallId !== 'string') {
      throw new BimValidationError(
        'MALFORMED_WINDOW',
        `Window "${id}" is missing required fields or has invalid category.`,
      );
    }
    if (!state.walls[win.hostWallId]) {
      throw new BimValidationError(
        'UNKNOWN_HOST_WALL',
        `Window "${id}" references non-existent host wall ID: "${win.hostWallId}".`,
      );
    }
    if (!win.windowTypeId || !state.windowTypes[win.windowTypeId]) {
      throw new BimValidationError(
        'UNKNOWN_WINDOW_TYPE',
        `Window "${id}" references non-existent WindowType ID: "${win.windowTypeId}".`,
      );
    }
    if (!Number.isFinite(win.offsetAlong) || win.offsetAlong < 0) {
      throw new BimValidationError('MALFORMED_WINDOW', `Window "${id}" has negative offsetAlong.`);
    }
    if (!Number.isFinite(win.sillHeight) || win.sillHeight < 0) {
      throw new BimValidationError('MALFORMED_WINDOW', `Window "${id}" has negative sillHeight.`);
    }
  }

  // 13. Validation des Dalles (Slab)
  for (const [id, sl] of Object.entries(state.slabs)) {
    if (!sl || typeof sl !== 'object') {
      throw new BimValidationError('MALFORMED_SLAB', `Malformed slab entry at "${id}".`);
    }
    if (sl.id !== id) {
      throw new BimValidationError(
        'MALFORMED_SLAB',
        `Slab dictionary key "${id}" does not match internal id "${sl.id}".`,
      );
    }
    if (
      sl.category !== 'slab' ||
      typeof sl.slabTypeId !== 'string' ||
      typeof sl.levelId !== 'string'
    ) {
      throw new BimValidationError(
        'MALFORMED_SLAB',
        `Slab "${id}" is missing required fields or has invalid category.`,
      );
    }
    if (!state.slabTypes[sl.slabTypeId]) {
      throw new BimValidationError(
        'UNKNOWN_SLAB_TYPE',
        `Slab "${id}" references non-existent SlabType ID: "${sl.slabTypeId}".`,
      );
    }
    if (!state.levels[sl.levelId]) {
      throw new BimValidationError(
        'UNKNOWN_LEVEL',
        `Slab "${id}" references non-existent Level ID: "${sl.levelId}".`,
      );
    }
    if (!Array.isArray(sl.boundary) || sl.boundary.length < 3) {
      throw new BimValidationError('INVALID_SLAB_BOUNDARY', `Slab "${id}" has invalid boundary.`);
    }
  }

  // 14. Validation des Pièces (Room)
  for (const [id, r] of Object.entries(state.rooms)) {
    if (!r || typeof r !== 'object') {
      throw new BimValidationError('MALFORMED_ROOM', `Malformed room entry at "${id}".`);
    }
    if (r.id !== id) {
      throw new BimValidationError(
        'MALFORMED_ROOM',
        `Room dictionary key "${id}" does not match internal id "${r.id}".`,
      );
    }
    if (r.category !== 'room' || typeof r.name !== 'string' || typeof r.levelId !== 'string') {
      throw new BimValidationError(
        'MALFORMED_ROOM',
        `Room "${id}" is missing required fields or has invalid category.`,
      );
    }
    if (!r.seed || !Number.isFinite(r.seed.x) || !Number.isFinite(r.seed.y)) {
      throw new BimValidationError(
        'MALFORMED_ROOM',
        `Room "${id}" has invalid or missing seed coordinates.`,
      );
    }
  }

  // 15. Validation des Cotations (Dimension)
  for (const [id, dim] of Object.entries(state.dimensions)) {
    if (!dim || typeof dim !== 'object') {
      throw new BimValidationError('MALFORMED_DIMENSION', `Malformed dimension entry at "${id}".`);
    }
    if (dim.id !== id) {
      throw new BimValidationError(
        'MALFORMED_DIMENSION',
        `Dimension dictionary key "${id}" does not match internal id "${dim.id}".`,
      );
    }
    if (
      dim.category !== 'dimension' ||
      typeof dim.levelId !== 'string' ||
      !Array.isArray(dim.references) ||
      !Number.isFinite(dim.offset) ||
      !Number.isFinite(dim.value)
    ) {
      throw new BimValidationError(
        'MALFORMED_DIMENSION',
        `Dimension "${id}" is missing required fields or has invalid types.`,
      );
    }
  }

  return state;
}
