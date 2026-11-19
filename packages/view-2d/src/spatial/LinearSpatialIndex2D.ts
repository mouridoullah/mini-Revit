import type { BoundingBox2D } from '../types.js';
import type {
  SpatialIndex2D,
  SpatialItem,
  SpatialQueryResult,
  SpatialIndexStats,
} from './types.js';
import { aabbIntersects } from './culling.js';

/**
 * Index spatial naïf linéaire (scan O(N) exhaustif de toutes les entités).
 * Utilisé comme référence métrologique pour quantifier les gains du SpatialGrid2D.
 */
export class LinearSpatialIndex2D<T = unknown> implements SpatialIndex2D<T> {
  private readonly items: Map<string, SpatialItem<T>> = new Map();

  public insert(item: SpatialItem<T>): void {
    this.items.set(item.id, item);
  }

  public remove(id: string): boolean {
    return this.items.delete(id);
  }

  public clear(): void {
    this.items.clear();
  }

  public query(bounds: BoundingBox2D, levelFilter?: string | null): SpatialQueryResult<T> {
    const t0 = performance.now();
    const retainedItems: SpatialItem<T>[] = [];
    const retainedIds = new Set<string>();
    let traversedCount = 0;

    for (const item of this.items.values()) {
      traversedCount++;
      if (levelFilter) {
        if (item.levelIds && item.levelIds.length > 0) {
          if (!item.levelIds.includes(levelFilter)) continue;
        } else if (item.levelId && item.levelId !== levelFilter) {
          continue;
        }
      }
      if (aabbIntersects(item.aabb, bounds)) {
        retainedItems.push(item);
        retainedIds.add(item.id);
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
    return {
      count: this.items.size,
      memoryBytesEstimate: this.items.size * 96,
    };
  }
}
