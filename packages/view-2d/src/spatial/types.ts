import type { BoundingBox2D } from '../types.js';

export interface SpatialItem<T = unknown> {
  readonly id: string;
  readonly aabb: BoundingBox2D;
  readonly levelId?: string | null | undefined;
  readonly levelIds?: readonly string[] | undefined;
  readonly category: string;
  readonly data?: T;
}

export interface SpatialIndexStats {
  readonly count: number;
  readonly cellCount?: number;
  readonly memoryBytesEstimate: number;
}

export interface SpatialQueryResult<T = unknown> {
  readonly items: readonly SpatialItem<T>[];
  readonly itemIds: ReadonlySet<string>;
  readonly traversedCount: number;
  readonly retainedCount: number;
  readonly searchTimeMs: number;
}

export interface SpatialIndex2D<T = unknown> {
  insert(item: SpatialItem<T>): void;
  remove(id: string): boolean;
  clear(): void;
  query(bounds: BoundingBox2D, levelFilter?: string | null): SpatialQueryResult<T>;
  queryIds(bounds: BoundingBox2D, levelFilter?: string | null): ReadonlySet<string>;
  getStats(): SpatialIndexStats;
}
