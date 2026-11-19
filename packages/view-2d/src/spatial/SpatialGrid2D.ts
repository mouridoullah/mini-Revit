import type { BoundingBox2D } from '../types.js';
import type {
  SpatialIndex2D,
  SpatialItem,
  SpatialQueryResult,
  SpatialIndexStats,
} from './types.js';
import { aabbIntersects } from './culling.js';

export interface SpatialGridOptions {
  readonly cellSizeMm?: number | undefined;
}

/**
 * Grille spatiale uniforme (Uniform Hash Grid 2D) à haute performance.
 *
 * Découpe l'espace mondial (en millimètres) en cellules carrées régulières (défaut : 5 000 mm).
 * Permet une insertion en O(k) où k est le nombre de cellules couvertes par l'AABB (souvent 1 à 4),
 * et une recherche par fenêtre de vue (frustum) en O(c + m) où c est le nombre de cellules visibles
 * et m le nombre d'entités candidates.
 */
export class SpatialGrid2D<T = unknown> implements SpatialIndex2D<T> {
  public readonly cellSize: number;
  private readonly items: Map<string, SpatialItem<T>> = new Map();
  private readonly cells: Map<string, Set<string>> = new Map();

  public constructor(options?: SpatialGridOptions) {
    this.cellSize = Math.max(100, options?.cellSizeMm ?? 5000);
  }

  private getCellCoord(val: number): number {
    return Math.floor(val / this.cellSize);
  }

  private cellKey(cx: number, cy: number): string {
    return `${cx}:${cy}`;
  }

  public insert(item: SpatialItem<T>): void {
    if (this.items.has(item.id)) {
      this.remove(item.id);
    }
    this.items.set(item.id, item);

    const minCx = this.getCellCoord(item.aabb.min.x);
    const maxCx = this.getCellCoord(item.aabb.max.x);
    const minCy = this.getCellCoord(item.aabb.min.y);
    const maxCy = this.getCellCoord(item.aabb.max.y);

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const key = this.cellKey(cx, cy);
        let set = this.cells.get(key);
        if (!set) {
          set = new Set();
          this.cells.set(key, set);
        }
        set.add(item.id);
      }
    }
  }

  public remove(id: string): boolean {
    const item = this.items.get(id);
    if (!item) return false;

    const minCx = this.getCellCoord(item.aabb.min.x);
    const maxCx = this.getCellCoord(item.aabb.max.x);
    const minCy = this.getCellCoord(item.aabb.min.y);
    const maxCy = this.getCellCoord(item.aabb.max.y);

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const key = this.cellKey(cx, cy);
        const set = this.cells.get(key);
        if (set) {
          set.delete(id);
          if (set.size === 0) {
            this.cells.delete(key);
          }
        }
      }
    }

    this.items.delete(id);
    return true;
  }

  public clear(): void {
    this.items.clear();
    this.cells.clear();
  }

  public query(bounds: BoundingBox2D, levelFilter?: string | null): SpatialQueryResult<T> {
    const t0 = performance.now();

    const minCx = this.getCellCoord(bounds.min.x);
    const maxCx = this.getCellCoord(bounds.max.x);
    const minCy = this.getCellCoord(bounds.min.y);
    const maxCy = this.getCellCoord(bounds.max.y);

    const candidateIds = new Set<string>();
    let traversedCount = 0;

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const key = this.cellKey(cx, cy);
        const set = this.cells.get(key);
        if (set) {
          for (const id of set) {
            traversedCount++;
            candidateIds.add(id);
          }
        }
      }
    }

    const retainedItems: SpatialItem<T>[] = [];
    const retainedIds = new Set<string>();

    for (const id of candidateIds) {
      const item = this.items.get(id);
      if (!item) continue;

      // Filtrage par niveau si spécifié
      if (levelFilter) {
        if (item.levelIds && item.levelIds.length > 0) {
          if (!item.levelIds.includes(levelFilter)) continue;
        } else if (item.levelId && item.levelId !== levelFilter) {
          continue;
        }
      }

      // Test AABB exact
      if (aabbIntersects(item.aabb, bounds)) {
        retainedItems.push(item);
        retainedIds.add(id);
      }
    }

    const t1 = performance.now();

    return {
      items: retainedItems,
      itemIds: retainedIds,
      traversedCount,
      retainedCount: retainedItems.length,
      searchTimeMs: t1 - t0,
    };
  }

  public queryIds(bounds: BoundingBox2D, levelFilter?: string | null): ReadonlySet<string> {
    return this.query(bounds, levelFilter).itemIds;
  }

  public getStats(): SpatialIndexStats {
    let entryCount = 0;
    for (const s of this.cells.values()) {
      entryCount += s.size;
    }
    // Estimation d'empreinte mémoire en octets
    const memoryBytesEstimate =
      this.items.size * 128 + // Objets SpatialItem et hash map overhead
      this.cells.size * 64 +  // Overhead clés de cellules
      entryCount * 16;        // Identifiants dans les sets

    return {
      count: this.items.size,
      cellCount: this.cells.size,
      memoryBytesEstimate,
    };
  }
}
