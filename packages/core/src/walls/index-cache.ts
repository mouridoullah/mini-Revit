import { computeEffectiveSlabPolygon, type Vec2 } from '@mini-bim/geometry';
import type {
  BimState,
  ElementId,
  Slab,
  SlabType,
  Door,
  Window,
  Component,
  Roof,
} from '../types.js';

export interface EffectiveSlabGeometry {
  readonly outer: readonly Vec2[];
  readonly holes: readonly (readonly Vec2[])[];
  readonly aabb: {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
  };
}

export interface CachedSlabInfo {
  readonly slab: Slab;
  readonly slabType?: SlabType | undefined;
  readonly geometry: EffectiveSlabGeometry;
}

export interface CachedRoofInfo {
  readonly roof: Roof;
  readonly aabb: {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
  };
}

export interface WallResolutionIndex {
  readonly doorsByHostWallId: Map<ElementId, Door[]>;
  readonly windowsByHostWallId: Map<ElementId, Window[]>;
  readonly componentsByHostWallId: Map<ElementId, Component[]>;
  readonly slabsByLevelId: Map<ElementId, CachedSlabInfo[]>;
  readonly roofs: CachedRoofInfo[];
}

/**
 * Cache géométrique pur indexé par l'objet Slab (WeakMap).
 * Grâce au partage structurel d'Immer, un polygone de dalle non modifiée
 * n'est calculé qu'une seule fois et réutilisé indéfiniment sans fuite mémoire.
 */
export const slabGeometryCache = new WeakMap<Slab, EffectiveSlabGeometry>();

export function getOrComputeSlabGeometry(slab: Slab): EffectiveSlabGeometry | null {
  const cached = slabGeometryCache.get(slab);
  if (cached) return cached;

  try {
    const effectivePolygon = computeEffectiveSlabPolygon({
      boundary: slab.boundary,
      holes: slab.holes,
      openings: slab.openings,
    });

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const pt of effectivePolygon.outer) {
      if (pt.x < minX) minX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y > maxY) maxY = pt.y;
    }

    const res: EffectiveSlabGeometry = {
      outer: effectivePolygon.outer,
      holes: effectivePolygon.holes,
      aabb: { minX, minY, maxX, maxY },
    };
    slabGeometryCache.set(slab, res);
    return res;
  } catch {
    return null;
  }
}

/**
 * Cache de résolution d'indexation spatiale et relationnelle indexé par référence immuable BimState (WeakMap).
 * Permet à resolveWallGeometry et computeWallVerticalBounds de résoudre en O(1) les entités associées
 * sans aucun scan complet quadratique du modèle.
 */
export const wallResolutionIndexCache = new WeakMap<BimState, WallResolutionIndex>();

export function getOrBuildWallResolutionIndex(state: BimState): WallResolutionIndex {
  const cached = wallResolutionIndexCache.get(state);
  if (cached) return cached;

  const doorsByHostWallId = new Map<ElementId, Door[]>();
  if (state.doors) {
    for (const door of Object.values(state.doors)) {
      if (door?.hostWallId) {
        let list = doorsByHostWallId.get(door.hostWallId);
        if (!list) {
          list = [];
          doorsByHostWallId.set(door.hostWallId, list);
        }
        list.push(door);
      }
    }
  }

  const windowsByHostWallId = new Map<ElementId, Window[]>();
  if (state.windows) {
    for (const win of Object.values(state.windows)) {
      if (win?.hostWallId) {
        let list = windowsByHostWallId.get(win.hostWallId);
        if (!list) {
          list = [];
          windowsByHostWallId.set(win.hostWallId, list);
        }
        list.push(win);
      }
    }
  }

  const componentsByHostWallId = new Map<ElementId, Component[]>();
  if (state.components) {
    for (const comp of Object.values(state.components)) {
      const hostWallId = comp?.placement?.hostWallId;
      if (hostWallId) {
        let list = componentsByHostWallId.get(hostWallId);
        if (!list) {
          list = [];
          componentsByHostWallId.set(hostWallId, list);
        }
        list.push(comp);
      }
    }
  }

  const slabsByLevelId = new Map<ElementId, CachedSlabInfo[]>();
  if (state.slabs) {
    for (const slab of Object.values(state.slabs)) {
      if (!slab) continue;
      const geom = getOrComputeSlabGeometry(slab);
      if (!geom) continue;
      const slabType = state.slabTypes?.[slab.slabTypeId];
      let list = slabsByLevelId.get(slab.levelId);
      if (!list) {
        list = [];
        slabsByLevelId.set(slab.levelId, list);
      }
      list.push({
        slab,
        slabType,
        geometry: geom,
      });
    }
  }

  const roofs: CachedRoofInfo[] = [];
  if (state.roofs) {
    for (const roof of Object.values(state.roofs)) {
      if (!roof) continue;
      const fp = roof.footprint;
      if (!fp || fp.length < 3) continue;
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const p of fp) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      roofs.push({
        roof,
        aabb: { minX, minY, maxX, maxY },
      });
    }
  }

  const index: WallResolutionIndex = {
    doorsByHostWallId,
    windowsByHostWallId,
    componentsByHostWallId,
    slabsByLevelId,
    roofs,
  };

  wallResolutionIndexCache.set(state, index);
  return index;
}
