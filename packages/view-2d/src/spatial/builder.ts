import type { DocumentFor2D, DetectedRoomFor2D } from '../types.js';
import type { SpatialItem } from './types.js';
import { SpatialGrid2D, type SpatialGridOptions } from './SpatialGrid2D.js';
import { LinearSpatialIndex2D } from './LinearSpatialIndex2D.js';
import {
  getWallAABB,
  getSlabAABB,
  getStairAABB,
  getRoofAABB,
  getComponentAABB,
  getDimensionAABB,
  getRoomAABB,
} from './culling.js';

export interface BuildSpatialIndexOptions extends SpatialGridOptions {
  readonly rooms?: readonly DetectedRoomFor2D[] | undefined;
}

/**
 * Extrait toutes les entités géométriques du document et les convertit en SpatialItem.
 */
export function extractSpatialItems(
  doc: DocumentFor2D,
  rooms?: readonly DetectedRoomFor2D[],
): SpatialItem[] {
  const items: SpatialItem[] = [];
  const state = doc.getState();

  // 1. Murs architecturaux
  if (state.walls) {
    for (const wall of Object.values(state.walls)) {
      const wallType = wall.typeId ? state.wallTypes?.[wall.typeId] : undefined;
      items.push({
        id: wall.id,
        category: 'wall',
        aabb: getWallAABB(wall, wallType),
        levelId: wall.levelId ?? null,
      });
    }
  }

  // 2. Dalles horizontales
  if (state.slabs) {
    for (const slab of Object.values(state.slabs)) {
      items.push({
        id: slab.id,
        category: 'slab',
        aabb: getSlabAABB(slab),
        levelId: slab.levelId ?? null,
      });
    }
  }

  // 3. Escaliers (traversants multi-niveaux)
  if (state.stairs) {
    for (const stair of Object.values(state.stairs)) {
      const stairType = stair.stairTypeId ? state.stairTypes?.[stair.stairTypeId] : undefined;
      const levelIds: string[] = [];
      if (stair.bottomLevelId) levelIds.push(stair.bottomLevelId);
      if (stair.topLevelId && stair.topLevelId !== stair.bottomLevelId) {
        levelIds.push(stair.topLevelId);
      }
      items.push({
        id: stair.id,
        category: 'stair',
        aabb: getStairAABB(stair, stairType),
        levelId: stair.bottomLevelId ?? null,
        levelIds,
      });
    }
  }

  // 4. Toitures
  if (state.roofs) {
    for (const roof of Object.values(state.roofs)) {
      items.push({
        id: roof.id,
        category: 'roof',
        aabb: getRoofAABB(roof),
        levelId: roof.levelId ?? null,
      });
    }
  }

  // 5. Composants d'aménagement et mobilier
  if (state.components) {
    for (const comp of Object.values(state.components)) {
      const compType = state.componentTypes?.[comp.typeId];
      items.push({
        id: comp.id,
        category: 'component',
        aabb: getComponentAABB(comp, compType),
        levelId: comp.levelId ?? null,
      });
    }
  }

  // 6. Cotations 2D
  if (state.dimensions) {
    for (const dim of Object.values(state.dimensions)) {
      const ref0 = dim.references[0];
      const wall = ref0 ? state.walls?.[ref0] : undefined;
      items.push({
        id: dim.id,
        category: 'dimension',
        aabb: getDimensionAABB(dim, wall),
        levelId: wall?.levelId ?? null,
      });
    }
  }

  // 7. Pièces détectées (si fournies)
  if (rooms) {
    for (const room of rooms) {
      if (!room.id) continue;
      items.push({
        id: room.id,
        category: 'room',
        aabb: getRoomAABB(room),
        levelId: room.levelId ?? null,
      });
    }
  }

  return items;
}

/**
 * Construit un index spatial `SpatialGrid2D` optimisé à partir d'un document BIM.
 */
export function buildSpatialIndex(
  doc: DocumentFor2D,
  options?: BuildSpatialIndexOptions,
): SpatialGrid2D {
  const grid = new SpatialGrid2D({ cellSizeMm: options?.cellSizeMm });
  const items = extractSpatialItems(doc, options?.rooms);
  for (const item of items) {
    grid.insert(item);
  }
  return grid;
}

/**
 * Construit un index spatial naïf linéaire `LinearSpatialIndex2D` pour étalonnage métrologique.
 */
export function buildLinearSpatialIndex(
  doc: DocumentFor2D,
  options?: { rooms?: readonly DetectedRoomFor2D[] },
): LinearSpatialIndex2D {
  const index = new LinearSpatialIndex2D();
  const items = extractSpatialItems(doc, options?.rooms);
  for (const item of items) {
    index.insert(item);
  }
  return index;
}
