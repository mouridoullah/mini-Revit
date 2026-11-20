import { describe, it, expect } from 'vitest';
import { BVHTree } from './bvh.js';
import {
  createAABB,
  intersectsAABB,
  aabbIntersection,
  expandAABB,
  aabbVolume,
} from './aabb.js';
import type { SpatialItem } from '../types.js';

describe('Index Spatial 3D & BVH (AABB Tree)', () => {
  it('teste les opérations fondamentales sur les AABB 3D', () => {
    const boxA = createAABB({ x: 0, y: 0, z: 0 }, { x: 100, y: 100, z: 100 });
    const boxB = createAABB({ x: 50, y: 50, z: 50 }, { x: 150, y: 150, z: 150 });
    const boxC = createAABB({ x: 200, y: 200, z: 200 }, { x: 300, y: 300, z: 300 });

    expect(intersectsAABB(boxA, boxB)).toBe(true);
    expect(intersectsAABB(boxA, boxC)).toBe(false);

    const inter = aabbIntersection(boxA, boxB);
    expect(inter).not.toBeNull();
    expect(inter?.min).toEqual({ x: 50, y: 50, z: 50 });
    expect(inter?.max).toEqual({ x: 100, y: 100, z: 100 });
    expect(aabbVolume(inter!)).toBe(125000);

    const expanded = expandAABB(boxA, 10);
    expect(expanded.min).toEqual({ x: -10, y: -10, z: -10 });
    expect(expanded.max).toEqual({ x: 110, y: 110, z: 110 });
  });

  it('insère, met à jour et supprime des éléments dans le BVH', () => {
    const bvh = new BVHTree<string>();

    const item1: SpatialItem<string> = {
      id: 'elem_1',
      aabb: createAABB({ x: 0, y: 0, z: 0 }, { x: 100, y: 100, z: 100 }),
      data: 'elem_1',
    };
    const item2: SpatialItem<string> = {
      id: 'elem_2',
      aabb: createAABB({ x: 50, y: 50, z: 50 }, { x: 150, y: 150, z: 150 }),
      data: 'elem_2',
    };
    const item3: SpatialItem<string> = {
      id: 'elem_3',
      aabb: createAABB({ x: 500, y: 500, z: 500 }, { x: 600, y: 600, z: 600 }),
      data: 'elem_3',
    };

    bvh.insert(item1);
    bvh.insert(item2);
    bvh.insert(item3);

    expect(bvh.size).toBe(3);

    // Query intersectant elem_1 et elem_2
    const q1 = bvh.query(createAABB({ x: 20, y: 20, z: 20 }, { x: 80, y: 80, z: 80 }));
    expect(q1.map((i) => i.id)).toEqual(['elem_1', 'elem_2']);

    // Query vers elem_3
    const q2 = bvh.query(createAABB({ x: 550, y: 550, z: 550 }, { x: 560, y: 560, z: 560 }));
    expect(q2.map((i) => i.id)).toEqual(['elem_3']);

    // Suppression elem_2
    const removed = bvh.remove('elem_2');
    expect(removed).toBe(true);
    expect(bvh.size).toBe(2);

    const q3 = bvh.query(createAABB({ x: 20, y: 20, z: 20 }, { x: 80, y: 80, z: 80 }));
    expect(q3.map((i) => i.id)).toEqual(['elem_1']);
  });

  it('extrait les paires candidates en collision mutuelle en O(N log N)', () => {
    const bvh = new BVHTree<string>();

    // Grille 3x3 de boîtes de 100x100 espacées de 50 (se chevauchent donc par 50 mm)
    const items: SpatialItem<string>[] = [];
    let idCounter = 1;

    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        const id = `box_${idCounter++}`;
        items.push({
          id,
          aabb: createAABB(
            { x: x * 80, y: y * 80, z: 0 },
            { x: x * 80 + 100, y: y * 80 + 100, z: 50 },
          ),
          data: id,
        });
      }
    }

    for (const item of items) {
      bvh.insert(item);
    }

    const pairs = bvh.queryPairs();
    expect(pairs.length).toBeGreaterThan(0);

    // Vérifier que chaque paire retournée par le BVH a bien des AABB qui s'intersectent
    for (const [a, b] of pairs) {
      expect(a.id < b.id).toBe(true);
      expect(intersectsAABB(a.aabb, b.aabb)).toBe(true);
    }

    // Comparaison avec un algorithme naïf exhaustif O(N^2)
    const bruteForcePairs: string[] = [];
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const itemI = items[i];
        const itemJ = items[j];
        if (itemI && itemJ && intersectsAABB(itemI.aabb, itemJ.aabb)) {
          const first = itemI.id < itemJ.id ? itemI : itemJ;
          const second = first === itemI ? itemJ : itemI;
          bruteForcePairs.push(`${first.id}__${second.id}`);
        }
      }
    }

    const bvhPairKeys = pairs.map(([a, b]) => `${a.id}__${b.id}`);
    expect(bvhPairKeys.sort()).toEqual(bruteForcePairs.sort());
  });

  it('garantit un déterminisme absolu quel que soit l’ordre d’insertion', () => {
    const rawItems: SpatialItem<string>[] = [
      { id: 'c', aabb: createAABB({ x: 10, y: 10, z: 0 }, { x: 30, y: 30, z: 10 }), data: 'c' },
      { id: 'a', aabb: createAABB({ x: 0, y: 0, z: 0 }, { x: 20, y: 20, z: 10 }), data: 'a' },
      { id: 'b', aabb: createAABB({ x: 15, y: 15, z: 0 }, { x: 35, y: 35, z: 10 }), data: 'b' },
      { id: 'd', aabb: createAABB({ x: 200, y: 200, z: 0 }, { x: 220, y: 220, z: 10 }), data: 'd' },
    ];

    const bvh1 = new BVHTree<string>(rawItems);
    const bvh2 = new BVHTree<string>([...rawItems].reverse());

    const pairs1 = bvh1.queryPairs();
    const pairs2 = bvh2.queryPairs();

    expect(pairs1.map(([a, b]) => `${a.id}-${b.id}`)).toEqual(
      pairs2.map(([a, b]) => `${a.id}-${b.id}`),
    );
  });
});
