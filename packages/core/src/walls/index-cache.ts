import { computeEffectiveSlabPolygon, type Vec2 } from '@mini-bim/geometry';
import { isDraft, original, type Draft } from 'immer';
import type {
  BimState,
  ElementId,
  Wall,
  Slab,
  SlabType,
  Door,
  Window,
  Component,
  Roof,
  Dimension,
  Room,
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
  readonly componentsByLevelId: Map<ElementId, Component[]>;
  readonly wallsByLevelId: Map<ElementId, Wall[]>;
  readonly dimensionsByRefId: Map<ElementId, Dimension[]>;
  readonly roomsByLevelId: Map<ElementId, Room[]>;
  readonly slabsByLevelId: Map<ElementId, CachedSlabInfo[]>;
  readonly roofs: CachedRoofInfo[];
  readonly resolvedWallsCache: Map<ElementId, unknown>;
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

// Sous-caches à granularité de collection profitant du partage structurel d'Immer (Phase 10)
const doorsSubCache = new WeakMap<Record<ElementId, Door>, Map<ElementId, Door[]>>();
const windowsSubCache = new WeakMap<Record<ElementId, Window>, Map<ElementId, Window[]>>();
const componentsSubCache = new WeakMap<
  Record<ElementId, Component>,
  { byHost: Map<ElementId, Component[]>; byLevel: Map<ElementId, Component[]> }
>();
const wallsByLevelSubCache = new WeakMap<Record<ElementId, Wall>, Map<ElementId, Wall[]>>();
const dimensionsByRefSubCache = new WeakMap<Record<ElementId, Dimension>, Map<ElementId, Dimension[]>>();
const roomsByLevelSubCache = new WeakMap<Record<ElementId, Room>, Map<ElementId, Room[]>>();
const roofsSubCache = new WeakMap<Record<ElementId, Roof>, CachedRoofInfo[]>();

/**
 * Implémentation paresseuse (lazy) de WallResolutionIndex.
 * Chaque collection relationnelle ou spatiale n'est construite que lorsqu'elle est accédée
 * pour la première fois. Grâce aux sous-caches WeakMap par collection immuable,
 * les entités non modifiées lors d'une transaction sont récupérées en O(1) sans recalcul.
 */
class LazyWallResolutionIndex implements WallResolutionIndex {
  private _doorsByHostWallId?: Map<ElementId, Door[]>;
  private _windowsByHostWallId?: Map<ElementId, Window[]>;
  private _compCaches?: { byHost: Map<ElementId, Component[]>; byLevel: Map<ElementId, Component[]> };
  private _wallsByLevelId?: Map<ElementId, Wall[]>;
  private _dimensionsByRefId?: Map<ElementId, Dimension[]>;
  private _roomsByLevelId?: Map<ElementId, Room[]>;
  private _slabsByLevelId?: Map<ElementId, CachedSlabInfo[]>;
  private _roofs?: CachedRoofInfo[];
  public readonly resolvedWallsCache = new Map<ElementId, unknown>();

  constructor(private readonly state: BimState) {}

  public get doorsByHostWallId(): Map<ElementId, Door[]> {
    if (!this._doorsByHostWallId) {
      let cached = this.state.doors ? doorsSubCache.get(this.state.doors) : undefined;
      if (!cached) {
        cached = new Map<ElementId, Door[]>();
        if (this.state.doors) {
          for (const id in this.state.doors) {
            const door = this.state.doors[id];
            if (door?.hostWallId) {
              let list = cached.get(door.hostWallId);
              if (!list) {
                list = [];
                cached.set(door.hostWallId, list);
              }
              list.push(door);
            }
          }
          doorsSubCache.set(this.state.doors, cached);
        }
      }
      this._doorsByHostWallId = cached;
    }
    return this._doorsByHostWallId;
  }

  public get windowsByHostWallId(): Map<ElementId, Window[]> {
    if (!this._windowsByHostWallId) {
      let cached = this.state.windows ? windowsSubCache.get(this.state.windows) : undefined;
      if (!cached) {
        cached = new Map<ElementId, Window[]>();
        if (this.state.windows) {
          for (const id in this.state.windows) {
            const win = this.state.windows[id];
            if (win?.hostWallId) {
              let list = cached.get(win.hostWallId);
              if (!list) {
                list = [];
                cached.set(win.hostWallId, list);
              }
              list.push(win);
            }
          }
          windowsSubCache.set(this.state.windows, cached);
        }
      }
      this._windowsByHostWallId = cached;
    }
    return this._windowsByHostWallId;
  }

  private ensureComponents(): { byHost: Map<ElementId, Component[]>; byLevel: Map<ElementId, Component[]> } {
    if (!this._compCaches) {
      let cached = this.state.components ? componentsSubCache.get(this.state.components) : undefined;
      if (!cached) {
        const byHost = new Map<ElementId, Component[]>();
        const byLevel = new Map<ElementId, Component[]>();
        if (this.state.components) {
          for (const id in this.state.components) {
            const comp = this.state.components[id];
            if (!comp) continue;
            const hostWallId = comp.placement?.hostWallId;
            if (hostWallId) {
              let list = byHost.get(hostWallId);
              if (!list) {
                list = [];
                byHost.set(hostWallId, list);
              }
              list.push(comp);
            }
            if (comp.levelId) {
              let lList = byLevel.get(comp.levelId);
              if (!lList) {
                lList = [];
                byLevel.set(comp.levelId, lList);
              }
              lList.push(comp);
            }
          }
          cached = { byHost, byLevel };
          componentsSubCache.set(this.state.components, cached);
        } else {
          cached = { byHost, byLevel };
        }
      }
      this._compCaches = cached;
    }
    return this._compCaches;
  }

  public get componentsByHostWallId(): Map<ElementId, Component[]> {
    return this.ensureComponents().byHost;
  }

  public get componentsByLevelId(): Map<ElementId, Component[]> {
    return this.ensureComponents().byLevel;
  }

  public get wallsByLevelId(): Map<ElementId, Wall[]> {
    if (!this._wallsByLevelId) {
      let cached = this.state.walls ? wallsByLevelSubCache.get(this.state.walls) : undefined;
      if (!cached) {
        cached = new Map<ElementId, Wall[]>();
        if (this.state.walls) {
          for (const id in this.state.walls) {
            const wall = this.state.walls[id];
            if (wall?.levelId) {
              let list = cached.get(wall.levelId);
              if (!list) {
                list = [];
                cached.set(wall.levelId, list);
              }
              list.push(wall);
            }
          }
          wallsByLevelSubCache.set(this.state.walls, cached);
        }
      }
      this._wallsByLevelId = cached;
    }
    return this._wallsByLevelId;
  }

  public get dimensionsByRefId(): Map<ElementId, Dimension[]> {
    if (!this._dimensionsByRefId) {
      let cached = this.state.dimensions ? dimensionsByRefSubCache.get(this.state.dimensions) : undefined;
      if (!cached) {
        cached = new Map<ElementId, Dimension[]>();
        if (this.state.dimensions) {
          for (const id in this.state.dimensions) {
            const dim = this.state.dimensions[id];
            if (dim?.references) {
              for (let i = 0; i < dim.references.length; i++) {
                const refId = dim.references[i];
                if (refId) {
                  let list = cached.get(refId);
                  if (!list) {
                    list = [];
                    cached.set(refId, list);
                  }
                  list.push(dim);
                }
              }
            }
          }
          dimensionsByRefSubCache.set(this.state.dimensions, cached);
        }
      }
      this._dimensionsByRefId = cached;
    }
    return this._dimensionsByRefId;
  }

  public get roomsByLevelId(): Map<ElementId, Room[]> {
    if (!this._roomsByLevelId) {
      let cached = this.state.rooms ? roomsByLevelSubCache.get(this.state.rooms) : undefined;
      if (!cached) {
        cached = new Map<ElementId, Room[]>();
        if (this.state.rooms) {
          for (const id in this.state.rooms) {
            const room = this.state.rooms[id];
            if (room?.levelId) {
              let list = cached.get(room.levelId);
              if (!list) {
                list = [];
                cached.set(room.levelId, list);
              }
              list.push(room);
            }
          }
          roomsByLevelSubCache.set(this.state.rooms, cached);
        }
      }
      this._roomsByLevelId = cached;
    }
    return this._roomsByLevelId;
  }

  public get slabsByLevelId(): Map<ElementId, CachedSlabInfo[]> {
    if (!this._slabsByLevelId) {
      const map = new Map<ElementId, CachedSlabInfo[]>();
      if (this.state.slabs) {
        for (const id in this.state.slabs) {
          const slab = this.state.slabs[id];
          if (!slab) continue;
          const geom = getOrComputeSlabGeometry(slab);
          if (!geom) continue;
          const slabType = this.state.slabTypes?.[slab.slabTypeId];
          let list = map.get(slab.levelId);
          if (!list) {
            list = [];
            map.set(slab.levelId, list);
          }
          list.push({
            slab,
            slabType,
            geometry: geom,
          });
        }
      }
      this._slabsByLevelId = map;
    }
    return this._slabsByLevelId;
  }

  public get roofs(): CachedRoofInfo[] {
    if (!this._roofs) {
      let cached = this.state.roofs ? roofsSubCache.get(this.state.roofs) : undefined;
      if (!cached) {
        cached = [];
        if (this.state.roofs) {
          for (const id in this.state.roofs) {
            const roof = this.state.roofs[id];
            if (!roof) continue;
            const fp = roof.footprint;
            if (!fp || fp.length < 3) continue;
            let minX = Infinity;
            let maxX = -Infinity;
            let minY = Infinity;
            let maxY = -Infinity;
            for (let i = 0; i < fp.length; i++) {
              const p = fp[i];
              if (!p) continue;
              if (p.x < minX) minX = p.x;
              if (p.x > maxX) maxX = p.x;
              if (p.y < minY) minY = p.y;
              if (p.y > maxY) maxY = p.y;
            }
            cached.push({
              roof,
              aabb: { minX, minY, maxX, maxY },
            });
          }
          roofsSubCache.set(this.state.roofs, cached);
        }
      }
      this._roofs = cached;
    }
    return this._roofs;
  }
}

export interface WallResolutionIndexOptions {
  /**
   * Si true, court-circuite la dé-proxification Immer et instancie un index frais directement sur l'état fourni.
   * À utiliser si resolveWallGeometry est invoqué sur un draft Immer en cours de mutation.
   */
  readonly bypassUnwrap?: boolean;
}

/**
 * Cache de résolution d'indexation spatiale et relationnelle indexé par référence immuable BimState (WeakMap).
 * Permet à resolveWallGeometry et computeWallVerticalBounds de résoudre en O(1) les entités associées
 * sans aucun scan complet quadratique du modèle.
 *
 * NOTE DE SÉCURITÉ ARCHITECTURALE (ADR-062) :
 * Lorsqu'un draft Immer lui est passé, getOrBuildWallResolutionIndex utilise par défaut original(draft)
 * pour éviter les pièges Proxy de V8 sur les millions d'accès de lecture.
 * Si une commande a déjà muté des entités dans ce draft et a besoin de résoudre la géométrie
 * avec les valeurs fraîchement modifiées, elle DOIT passer `{ bypassUnwrap: true }`.
 */
export const wallResolutionIndexCache = new WeakMap<BimState, WallResolutionIndex>();

export function getOrBuildWallResolutionIndex(
  state: BimState,
  options?: WallResolutionIndexOptions,
): WallResolutionIndex {
  if (options?.bypassUnwrap) {
    return new LazyWallResolutionIndex(state);
  }
  const unwrappedState = (isDraft(state) ? (original((state as unknown) as Draft<BimState>) ?? state) : state) as BimState;
  const cached = wallResolutionIndexCache.get(unwrappedState);
  if (cached) return cached;

  const index = new LazyWallResolutionIndex(unwrappedState);
  wallResolutionIndexCache.set(unwrappedState, index);
  return index;
}
