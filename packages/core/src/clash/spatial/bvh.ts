import type { AABB3D, SpatialItem, BVHStats } from '../types.js';
import { aabbUnion, intersectsAABB, aabbCenter, aabbExtents, makeEmptyAABB } from './aabb.js';

interface BVHNode<T> {
  box: AABB3D;
  left?: BVHNode<T> | undefined;
  right?: BVHNode<T> | undefined;
  items?: SpatialItem<T>[] | undefined; // Si feuille
}

const MAX_ITEMS_PER_LEAF = 4;

/**
 * Arbre BVH 3D (Bounding Volume Hierarchy / AABB Tree) pur TypeScript.
 *
 * Fournit une extraction des paires candidates en O(N log N) pour la détection
 * de clashs et l'optimisation des requêtes géométriques du Core (checkWallViolations).
 *
 * Déterministe : tri secondaire canonique sur item.id garantissant une reproductibilité
 * absolue indépendamment de l'ordre d'insertion.
 */
export class BVHTree<T = string> {
  private root: BVHNode<T> | undefined = undefined;
  private readonly itemsMap = new Map<string, SpatialItem<T>>();
  private isDirty = false;

  constructor(items?: readonly SpatialItem<T>[]) {
    if (items && items.length > 0) {
      for (const item of items) {
        this.itemsMap.set(item.id, item);
      }
      this.rebuild();
    }
  }

  /**
   * Nombre total d'éléments indexés.
   */
  public get size(): number {
    return this.itemsMap.size;
  }

  /**
   * Insère un élément dans l'index.
   */
  public insert(item: SpatialItem<T>): void {
    this.itemsMap.set(item.id, item);
    this.isDirty = true;
  }

  /**
   * Supprime un élément par son identifiant.
   */
  public remove(id: string): boolean {
    const existed = this.itemsMap.delete(id);
    if (existed) {
      this.isDirty = true;
    }
    return existed;
  }

  /**
   * Met à jour la boîte englobante ou la donnée d'un élément existant.
   */
  public update(id: string, newAabb: AABB3D, newData?: T): boolean {
    const existing = this.itemsMap.get(id);
    if (!existing) return false;
    const updated: SpatialItem<T> = {
      id,
      aabb: newAabb,
      data: newData !== undefined ? newData : existing.data,
    };
    this.itemsMap.set(id, updated);
    this.isDirty = true;
    return true;
  }

  /**
   * Vide l'arbre.
   */
  public clear(): void {
    this.itemsMap.clear();
    this.root = undefined;
    this.isDirty = false;
  }

  /**
   * Reconstruit la hiérarchie BVH de manière optimale et déterministe.
   */
  public rebuild(): void {
    const items = Array.from(this.itemsMap.values());
    if (items.length === 0) {
      this.root = undefined;
      this.isDirty = false;
      return;
    }

    this.root = this.buildRecursive(items);
    this.isDirty = false;
  }

  /**
   * Recherche tous les éléments dont l'AABB intersecte la boîte de requête.
   */
  public query(box: AABB3D, toleranceMm = 0): SpatialItem<T>[] {
    if (this.isDirty) {
      this.rebuild();
    }
    if (!this.root) return [];

    const results: SpatialItem<T>[] = [];
    const stack: BVHNode<T>[] = [this.root];

    while (stack.length > 0) {
      const node = stack.pop();
      if (!node) break;
      if (!intersectsAABB(node.box, box, toleranceMm)) {
        continue;
      }

      if (node.items) {
        for (const item of node.items) {
          if (intersectsAABB(item.aabb, box, toleranceMm)) {
            results.push(item);
          }
        }
      } else {
        if (node.left) stack.push(node.left);
        if (node.right) stack.push(node.right);
      }
    }

    // Tri canonique pour déterminisme
    results.sort((a, b) => a.id.localeCompare(b.id));
    return results;
  }

  /**
   * Détecte toutes les paires candidates en collision mutuelle en O(N log N).
   * Renvoie chaque paire [itemA, itemB] telle que itemA.id < itemB.id.
   */
  public queryPairs(toleranceMm = 0): Array<[SpatialItem<T>, SpatialItem<T>]> {
    if (this.isDirty) {
      this.rebuild();
    }
    if (!this.root) return [];

    const pairsMap = new Map<string, [SpatialItem<T>, SpatialItem<T>]>();

    // 1. Conflits internes au sous-arbre
    this.collideNodeWithSelf(this.root, pairsMap, toleranceMm);

    // 2. Conversion déterministe en liste ordonnée
    const pairs = Array.from(pairsMap.values());
    pairs.sort((p1, p2) => {
      const cmp = p1[0].id.localeCompare(p2[0].id);
      return cmp !== 0 ? cmp : p1[1].id.localeCompare(p2[1].id);
    });

    return pairs;
  }

  /**
   * Récupère les métriques structurelles du BVH.
   */
  public getStats(): BVHStats {
    if (this.isDirty) {
      this.rebuild();
    }
    if (!this.root) {
      return { totalNodes: 0, leafNodes: 0, maxDepth: 0, itemCount: 0 };
    }

    let totalNodes = 0;
    let leafNodes = 0;
    let maxDepth = 0;

    const traverse = (node: BVHNode<T>, depth: number) => {
      totalNodes++;
      if (depth > maxDepth) maxDepth = depth;
      if (node.items) {
        leafNodes++;
      } else {
        if (node.left) traverse(node.left, depth + 1);
        if (node.right) traverse(node.right, depth + 1);
      }
    };

    traverse(this.root, 1);

    return {
      totalNodes,
      leafNodes,
      maxDepth,
      itemCount: this.itemsMap.size,
    };
  }

  // --- Algorithmes de partitionnement et de collision hiérarchique ---

  private buildRecursive(items: SpatialItem<T>[]): BVHNode<T> {
    const nodeBox = this.computeUnionBox(items);

    if (items.length <= MAX_ITEMS_PER_LEAF) {
      // Feuille
      items.sort((a, b) => a.id.localeCompare(b.id));
      return {
        box: nodeBox,
        items,
      };
    }

    // Choisir l'axe de plus grande variance / étendue
    const extents = aabbExtents(nodeBox);
    let splitAxis: 'x' | 'y' | 'z' = 'x';
    if (extents.y >= extents.x && extents.y >= extents.z) {
      splitAxis = 'y';
    } else if (extents.z >= extents.x && extents.z >= extents.y) {
      splitAxis = 'z';
    }

    // Tri déterministe selon le centre le long de l'axe de division
    items.sort((a, b) => {
      const cA = aabbCenter(a.aabb);
      const cB = aabbCenter(b.aabb);
      const diff = cA[splitAxis] - cB[splitAxis];
      if (Math.abs(diff) > 1e-6) {
        return diff;
      }
      return a.id.localeCompare(b.id);
    });

    // Division médiane
    const mid = Math.floor(items.length / 2);
    const leftItems = items.slice(0, mid);
    const rightItems = items.slice(mid);

    const leftNode = this.buildRecursive(leftItems);
    const rightNode = this.buildRecursive(rightItems);

    return {
      box: aabbUnion(leftNode.box, rightNode.box),
      left: leftNode,
      right: rightNode,
    };
  }

  private computeUnionBox(items: readonly SpatialItem<T>[]): AABB3D {
    let u = makeEmptyAABB();
    for (const item of items) {
      u = aabbUnion(u, item.aabb);
    }
    return u;
  }

  private collideNodeWithSelf(
    node: BVHNode<T>,
    pairs: Map<string, [SpatialItem<T>, SpatialItem<T>]>,
    toleranceMm: number,
  ): void {
    if (node.items) {
      // Tester tous les éléments de la feuille entre eux
      const items = node.items;
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const a = items[i];
          const b = items[j];
          if (a && b && intersectsAABB(a.aabb, b.aabb, toleranceMm)) {
            this.addPair(a, b, pairs);
          }
        }
      }
      return;
    }

    if (node.left) {
      this.collideNodeWithSelf(node.left, pairs, toleranceMm);
    }
    if (node.right) {
      this.collideNodeWithSelf(node.right, pairs, toleranceMm);
    }
    if (node.left && node.right) {
      this.collideNodes(node.left, node.right, pairs, toleranceMm);
    }
  }

  private collideNodes(
    nodeA: BVHNode<T>,
    nodeB: BVHNode<T>,
    pairs: Map<string, [SpatialItem<T>, SpatialItem<T>]>,
    toleranceMm: number,
  ): void {
    if (!intersectsAABB(nodeA.box, nodeB.box, toleranceMm)) {
      return;
    }

    if (nodeA.items && nodeB.items) {
      for (const a of nodeA.items) {
        for (const b of nodeB.items) {
          if (a.id === b.id) continue;
          if (intersectsAABB(a.aabb, b.aabb, toleranceMm)) {
            this.addPair(a, b, pairs);
          }
        }
      }
      return;
    }

    if (nodeA.items) {
      if (nodeB.left) this.collideNodes(nodeA, nodeB.left, pairs, toleranceMm);
      if (nodeB.right) this.collideNodes(nodeA, nodeB.right, pairs, toleranceMm);
      return;
    }

    if (nodeB.items) {
      if (nodeA.left) this.collideNodes(nodeA.left, nodeB, pairs, toleranceMm);
      if (nodeA.right) this.collideNodes(nodeA.right, nodeB, pairs, toleranceMm);
      return;
    }

    // Deux nœuds internes : descendre dans le nœud le plus volumineux
    const volA = (nodeA.box.max.x - nodeA.box.min.x) * (nodeA.box.max.y - nodeA.box.min.y);
    const volB = (nodeB.box.max.x - nodeB.box.min.x) * (nodeB.box.max.y - nodeB.box.min.y);

    if (volA >= volB) {
      if (nodeA.left) this.collideNodes(nodeA.left, nodeB, pairs, toleranceMm);
      if (nodeA.right) this.collideNodes(nodeA.right, nodeB, pairs, toleranceMm);
    } else {
      if (nodeB.left) this.collideNodes(nodeA, nodeB.left, pairs, toleranceMm);
      if (nodeB.right) this.collideNodes(nodeA, nodeB.right, pairs, toleranceMm);
    }
  }

  private addPair(
    a: SpatialItem<T>,
    b: SpatialItem<T>,
    pairs: Map<string, [SpatialItem<T>, SpatialItem<T>]>,
  ): void {
    const first = a.id.localeCompare(b.id) <= 0 ? a : b;
    const second = first === a ? b : a;
    const key = `${first.id}__${second.id}`;
    if (!pairs.has(key)) {
      pairs.set(key, [first, second]);
    }
  }
}
