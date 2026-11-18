import type { BimState, ElementId } from '../types.js';
import { BimValidationError } from '../rules.js';
import type { RelationDef, EntityCategory } from './types.js';
import { RELATIONS_REGISTRY } from './registry.js';

function getEntitiesForCategory(
  state: BimState,
  category: EntityCategory,
): Record<string, Record<string, unknown>> {
  const dict: unknown = (() => {
    switch (category) {
      case 'wall':
        return state.walls ?? {};
      case 'door':
        return state.doors ?? {};
      case 'window':
        return state.windows ?? {};
      case 'dimension':
        return state.dimensions ?? {};
      case 'room':
        return state.rooms ?? {};
      case 'wallType':
        return state.wallTypes ?? {};
      case 'level':
        return state.levels ?? {};
      case 'slab':
        return state.slabs ?? {};
      case 'doorType':
        return state.doorTypes ?? {};
      case 'windowType':
        return state.windowTypes ?? {};
      case 'slabType':
        return state.slabTypes ?? {};
      case 'stair':
        return state.stairs ?? {};
      case 'stairType':
        return state.stairTypes ?? {};
      case 'roof':
        return state.roofs ?? {};
      case 'roofType':
        return state.roofTypes ?? {};
      case 'roofOpening':
        return state.roofOpenings ?? {};
      case 'component':
        return state.components ?? {};
      case 'componentType':
        return state.componentTypes ?? {};
      default:
        return {};
    }
  })();
  return dict as Record<string, Record<string, unknown>>;
}

export interface CascadeResult {
  readonly cascadeDeletes: readonly ElementId[];
  readonly restrictViolations: readonly ElementId[];
}

export interface ResolveCascadeOptions {
  readonly throwOnRestrict?: boolean;
  readonly registry?: readonly RelationDef[];
}

/**
 * Résout récursivement les dépendances de suppression à partir du registre déclaratif.
 * Identifie les suppressions en cascade (onDelete: 'cascade') et les violations de restriction (onDelete: 'restrict').
 */
export function resolveCascadeDeletions(
  state: BimState,
  targetId: ElementId,
  options: ResolveCascadeOptions = {},
): CascadeResult {
  const { throwOnRestrict = true, registry = RELATIONS_REGISTRY } = options;

  const toDelete = new Set<ElementId>([targetId]);
  const restrictViolationsSet = new Set<ElementId>();

  // File d'attente pour la propagation en cascade descendante (BFS)
  const queue: ElementId[] = [targetId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;

    for (const rel of registry) {
      const sourceEntities = getEntitiesForCategory(state, rel.sourceCategory);

      for (const [sourceId, entity] of Object.entries(sourceEntities)) {
        if (!entity) continue;

        let referencesTarget = false;
        if (rel.isArray) {
          const arr = entity[rel.field];
          if (Array.isArray(arr) && arr.includes(currentId)) {
            referencesTarget = true;
          }
        } else {
          if (entity[rel.field] === currentId) {
            referencesTarget = true;
          }
        }

        if (referencesTarget) {
          if (rel.onDelete === 'restrict') {
            restrictViolationsSet.add(sourceId);
          } else if (rel.onDelete === 'cascade') {
            if (!toDelete.has(sourceId)) {
              toDelete.add(sourceId);
              queue.push(sourceId);
            }
          }
        }
      }
    }
  }

  const restrictViolations = Array.from(restrictViolationsSet).sort();
  const cascadeDeletes = Array.from(toDelete).sort();

  if (throwOnRestrict && restrictViolations.length > 0) {
    throw new BimValidationError(
      'DELETE_RESTRICTED',
      `Cannot delete element "${targetId}": referenced by active element(s) with restrict policy (${restrictViolations.join(', ')}).`,
      { blockingIds: restrictViolations },
    );
  }

  return {
    cascadeDeletes,
    restrictViolations,
  };
}
