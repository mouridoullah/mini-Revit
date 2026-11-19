import type { BimState, ElementId } from '../types.js';
import { BimValidationError } from '../rules.js';
import type { RelationDef, EntityCategory } from './types.js';
import { RELATIONS_REGISTRY } from './registry.js';
import { getCategoryDescriptor } from './descriptors.js';

export function getEntitiesForCategory(
  state: BimState,
  category: EntityCategory,
): Record<string, Record<string, unknown>> {
  const desc = getCategoryDescriptor(category);
  if (!desc) return {};
  const collection = state[desc.stateField];
  return (collection ?? {}) as unknown as Record<string, Record<string, unknown>>;
}

export function getEntityFieldValue(entity: Record<string, unknown>, field: string): unknown {
  if (!field.includes('.')) return entity[field];
  const parts = field.split('.');
  let curr: unknown = entity;
  for (const part of parts) {
    if (!curr || typeof curr !== 'object') return undefined;
    curr = (curr as Record<string, unknown>)[part];
  }
  return curr;
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
        const val = getEntityFieldValue(entity, rel.field);
        if (rel.isArray) {
          if (Array.isArray(val) && val.includes(currentId)) {
            referencesTarget = true;
          }
        } else {
          if (val === currentId) {
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
