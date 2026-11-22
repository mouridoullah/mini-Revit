/**
 * @tabax/core/mep/commands/helpers
 *
 * Fonctions utilitaires partagées pour la manipulation des éléments et graphes MEP.
 */

import type { BimState, ElementId } from '../../types.js';

export type MepElementKind = 'pipe' | 'duct' | 'cableTray' | 'mepFitting' | 'mepEquipment';

export function getMepElementKind(state: BimState, id: ElementId): MepElementKind | null {
  if (state.pipes?.[id]) return 'pipe';
  if (state.ducts?.[id]) return 'duct';
  if (state.cableTrays?.[id]) return 'cableTray';
  if (state.mepFittings?.[id]) return 'mepFitting';
  if (state.mepEquipments?.[id]) return 'mepEquipment';
  return null;
}

/**
 * Détache et supprime les connecteurs incidents aux ports spécifiés lors de la suppression d'un élément MEP.
 */
export function detachIncidentConnectors(draft: BimState, portIds: Set<ElementId>): ElementId[] {
  const detached: ElementId[] = [];
  if (draft.mepConnectors) {
    for (const [connId, conn] of Object.entries(draft.mepConnectors)) {
      if (conn && (portIds.has(conn.portAId) || portIds.has(conn.portBId))) {
        detached.push(connId);
        Reflect.deleteProperty(draft.mepConnectors, connId);
      }
    }
  }
  return detached;
}

/**
 * Retire un élément MEP de tous les systèmes auxquels il est rattaché.
 */
export function removeElementFromSystems(draft: BimState, elementId: ElementId): void {
  if (draft.mepSystems) {
    for (const sys of Object.values(draft.mepSystems)) {
      if (sys && sys.elementIds.includes(elementId)) {
        const updated = {
          ...sys,
          elementIds: sys.elementIds.filter((id) => id !== elementId),
        };
        draft.mepSystems[sys.id] = updated;
      }
    }
  }
}
