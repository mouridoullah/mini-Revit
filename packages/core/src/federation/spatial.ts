/**
 * Coordination spatiale et détection de conflits entre le modèle natif et les maquettes fédérées.
 * Exploite l'index spatial BVH 3D développé en Phase 9.4.
 * Conforme à ADR-059.
 */

import { type BimState } from '../types.js';
import { type FederatedModel, type FederatedEntity, type FederatedClashCandidate } from './types.js';
import { BVHTree } from '../clash/spatial/bvh.js';
import { intersectsAABB, aabbIntersection } from '../clash/spatial/aabb.js';
import { extractIndexedElements, type IndexedElement } from '../clash/engine.js';
import { type SpatialItem, type AABB3D } from '../clash/types.js';

/**
 * Extrait les items spatiaux d'un modèle fédéré pour insertion dans le BVH.
 */
export function extractFederatedSpatialItems(
  model: FederatedModel,
  offset: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 },
): SpatialItem<FederatedEntity>[] {
  const items: SpatialItem<FederatedEntity>[] = [];

  for (const entity of Object.values(model.entities)) {
    const aabb: AABB3D = {
      min: {
        x: entity.aabb.min.x + offset.x,
        y: entity.aabb.min.y + offset.y,
        z: entity.aabb.min.z + offset.z,
      },
      max: {
        x: entity.aabb.max.x + offset.x,
        y: entity.aabb.max.y + offset.y,
        z: entity.aabb.max.z + offset.z,
      },
    };

    items.push({
      id: `${model.id}:${entity.expressId}`,
      aabb,
      data: entity,
    });
  }

  return items;
}

/**
 * Recherche les interférences spatiales candidates entre les éléments natifs Mini-BIM
 * (murs, dalles, composants, réseaux MEP) et les entités d'une maquette IFC fédérée.
 *
 * @param state État du modèle natif Mini-BIM.
 * @param federatedModel Maquette IFC externe en lecture seule.
 * @param options Options de coordination (décalage, tolérance).
 */
export function detectFederatedClashes(
  state: BimState,
  federatedModel: FederatedModel,
  options: {
    offset?: { x: number; y: number; z: number } | undefined;
    clearanceMm?: number | undefined;
  } = {},
): FederatedClashCandidate[] {
  const offset = options.offset ?? { x: 0, y: 0, z: 0 };
  const clearance = options.clearanceMm ?? 0;

  // 1. Extraction des primitives spatiales natives
  const nativeElements = extractIndexedElements(state);
  const nativeItems: SpatialItem<IndexedElement>[] = nativeElements.map((p) => ({
    id: p.id,
    aabb: p.primitive.aabb,
    data: p,
  }));

  // 2. Extraction des entités fédérées
  const federatedItems = extractFederatedSpatialItems(federatedModel, offset);

  if (nativeItems.length === 0 || federatedItems.length === 0) {
    return [];
  }

  // 3. Construction du BVH pour les entités fédérées
  const fedTree = new BVHTree(federatedItems);
  const candidates: FederatedClashCandidate[] = [];

  // 4. Requête du BVH pour chaque primitive native
  for (const nativeItem of nativeItems) {
    const queryBox: AABB3D = clearance > 0
      ? {
          min: {
            x: nativeItem.aabb.min.x - clearance,
            y: nativeItem.aabb.min.y - clearance,
            z: nativeItem.aabb.min.z - clearance,
          },
          max: {
            x: nativeItem.aabb.max.x + clearance,
            y: nativeItem.aabb.max.y + clearance,
            z: nativeItem.aabb.max.z + clearance,
          },
        }
      : nativeItem.aabb;

    const intersectingFedItems = fedTree.query(queryBox);

    for (const fedItem of intersectingFedItems) {
      const fedEntity = fedItem.data;
      const fedAabb: AABB3D = {
        min: {
          x: fedEntity.aabb.min.x + offset.x,
          y: fedEntity.aabb.min.y + offset.y,
          z: fedEntity.aabb.min.z + offset.z,
        },
        max: {
          x: fedEntity.aabb.max.x + offset.x,
          y: fedEntity.aabb.max.y + offset.y,
          z: fedEntity.aabb.max.z + offset.z,
        },
      };

      if (intersectsAABB(queryBox, fedAabb)) {
        const overlapBox = aabbIntersection(queryBox, fedAabb);
        if (!overlapBox) continue;
        const point = {
          x: (overlapBox.min.x + overlapBox.max.x) / 2,
          y: (overlapBox.min.y + overlapBox.max.y) / 2,
          z: (overlapBox.min.z + overlapBox.max.z) / 2,
        };

        const dx = Math.max(0, overlapBox.max.x - overlapBox.min.x);
        const dy = Math.max(0, overlapBox.max.y - overlapBox.min.y);
        const dz = Math.max(0, overlapBox.max.z - overlapBox.min.z);
        const penetrationEstimate = Math.min(dx, dy, dz);

        candidates.push({
          modelId: federatedModel.id,
          expressId: fedEntity.expressId,
          ifcType: fedEntity.ifcType,
          nativeId: nativeItem.id,
          nativeCategory: nativeItem.data.category,
          intersectionBox: overlapBox,
          point,
          penetrationEstimateMm: Math.round(penetrationEstimate * 10) / 10,
        });
      }
    }
  }

  return candidates;
}
