import type {
  BimState,
  ElementId,
} from '../../types.js';
import type {
  ClashCategory,
  ClashDiscipline,
  ClashClassification,
} from '../types.js';

export function getElementCategory(id: ElementId, state: BimState): ClashCategory | null {
  if (state.walls && state.walls[id]) return 'wall';
  if (state.slabs && state.slabs[id]) return 'slab';
  if (state.doors && state.doors[id]) return 'door';
  if (state.windows && state.windows[id]) return 'window';
  if (state.stairs && state.stairs[id]) return 'stair';
  if (state.roofs && state.roofs[id]) return 'roof';
  if (state.components && state.components[id]) return 'component';
  if (state.pipes && state.pipes[id]) return 'pipe';
  if (state.ducts && state.ducts[id]) return 'duct';
  if (state.cableTrays && state.cableTrays[id]) return 'cableTray';
  if (state.mepFittings && state.mepFittings[id]) return 'mepFitting';
  if (state.mepEquipments && state.mepEquipments[id]) return 'mepEquipment';
  return null;
}

export function categoryToDiscipline(cat: ClashCategory): ClashDiscipline {
  switch (cat) {
    case 'wall':
    case 'slab':
      return 'structure';
    case 'door':
    case 'window':
    case 'stair':
    case 'roof':
    case 'component':
      return 'architecture';
    case 'pipe':
    case 'duct':
    case 'cableTray':
    case 'mepFitting':
    case 'mepEquipment':
      return 'mep';
  }
}

/**
 * Vérifie si deux éléments BIM possèdent une relation métier normale les autorisant à se toucher ou s'intersecter.
 */
export function isExcludedLegitimateContact(
  idA: ElementId,
  idB: ElementId,
  catA: ClashCategory,
  catB: ClashCategory,
  state: BimState,
): boolean {
  if (idA === idB) return true;

  // 1. Connexions MEP autorisées (MepConnector)
  if (isMepCategory(catA) && isMepCategory(catB)) {
    if (areMepElementsConnected(idA, idB, state)) {
      return true;
    }
  }

  // 2. Ouvertures hébergées (Door/Window) dans leur mur hôte
  if ((catA === 'door' || catA === 'window') && catB === 'wall') {
    const opening = (state.doors && state.doors[idA]) || (state.windows && state.windows[idA]);
    if (opening && opening.hostWallId === idB) return true;
  }
  if ((catB === 'door' || catB === 'window') && catA === 'wall') {
    const opening = (state.doors && state.doors[idB]) || (state.windows && state.windows[idB]);
    if (opening && opening.hostWallId === idA) return true;
  }

  // 3. Composant adossé à son mur hôte (hostWallId)
  if (catA === 'component' && catB === 'wall') {
    const comp = state.components && state.components[idA];
    if (comp && comp.placement.hostWallId === idB) return true;
  }
  if (catB === 'component' && catA === 'wall') {
    const comp = state.components && state.components[idB];
    if (comp && comp.placement.hostWallId === idA) return true;
  }

  // 4. Murs connectés aux extrémités (Jonctions L, T, X ou aboutés)
  if (catA === 'wall' && catB === 'wall') {
    const wallA = state.walls && state.walls[idA];
    const wallB = state.walls && state.walls[idB];
    if (wallA && wallB && areWallsNaturallyConnected(wallA, wallB)) {
      return true;
    }
  }

  // 5. Escalier dans sa trémie de dalle
  if ((catA === 'stair' && catB === 'slab') || (catA === 'slab' && catB === 'stair')) {
    const stair = (state.stairs && (state.stairs[idA] || state.stairs[idB])) as {
      bottomLevelId: string;
      topLevelId: string;
    } | undefined;
    const slab = (state.slabs && (state.slabs[idA] || state.slabs[idB])) as {
      levelId: string;
      holes?: unknown[];
    } | undefined;
    if (stair && slab && (slab.levelId === stair.topLevelId || slab.levelId === stair.bottomLevelId)) {
      if (slab.holes && slab.holes.length > 0) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Analyse sémantique et qualification d'une interaction physique ou de proximité.
 */
export function classifyClashInteraction(
  idA: ElementId,
  idB: ElementId,
  catA: ClashCategory,
  catB: ClashCategory,
  penetrationDepthMm: number,
  hardToleranceMm: number,
  state: BimState,
): ClashClassification {
  if (idA === idB) return 'IGNORED';

  if (isExcludedLegitimateContact(idA, idB, catA, catB, state)) {
    return 'LEGITIMATE_CONTACT';
  }

  // Contact normal plan Mur <-> Dalle (le mur est posé sur la dalle ou sous sa face inférieure)
  if ((catA === 'wall' && catB === 'slab') || (catA === 'slab' && catB === 'wall')) {
    if (penetrationDepthMm <= hardToleranceMm) {
      return 'LEGITIMATE_CONTACT';
    }
  }

  // Pénétration physique réelle supérieure au seuil solide
  if (penetrationDepthMm > hardToleranceMm) {
    return 'HARD_CLASH';
  }

  return 'CLEARANCE';
}

function isMepCategory(cat: ClashCategory): boolean {
  return (
    cat === 'pipe' ||
    cat === 'duct' ||
    cat === 'cableTray' ||
    cat === 'mepFitting' ||
    cat === 'mepEquipment'
  );
}

function doesElementOwnPort(elemId: ElementId, portId: ElementId, state: BimState): boolean {
  if (portId.includes(elemId)) return true;

  const elem =
    state.pipes?.[elemId] ??
    state.ducts?.[elemId] ??
    state.cableTrays?.[elemId] ??
    state.mepFittings?.[elemId] ??
    state.mepEquipments?.[elemId];

  if (!elem) return false;
  if (elem.ports?.some((p) => p.id === portId)) return true;
  return false;
}

function areMepElementsConnected(idA: ElementId, idB: ElementId, state: BimState): boolean {
  if (!state.mepConnectors) return false;

  for (const conn of Object.values(state.mepConnectors)) {
    const raw = conn as unknown as {
      portA?: { elementId?: ElementId; id?: ElementId };
      portB?: { elementId?: ElementId; id?: ElementId };
      portAId?: ElementId;
      portBId?: ElementId;
    };

    // 1. Cas direct où portA / portB embarquent directement elementId
    const elemA = raw.portA?.elementId;
    const elemB = raw.portB?.elementId;
    if ((elemA === idA && elemB === idB) || (elemA === idB && elemB === idA)) {
      return true;
    }

    // 2. Cas standard portAId / portBId
    const portIdA = raw.portAId ?? raw.portA?.id;
    const portIdB = raw.portBId ?? raw.portB?.id;

    if (portIdA && portIdB) {
      const matchA = doesElementOwnPort(idA, portIdA, state);
      const matchB = doesElementOwnPort(idB, portIdB, state);
      if (matchA && matchB) return true;

      const reverseA = doesElementOwnPort(idA, portIdB, state);
      const reverseB = doesElementOwnPort(idB, portIdA, state);
      if (reverseA && reverseB) return true;
    }
  }
  return false;
}

function areWallsNaturallyConnected(
  wA: { start: { x: number; y: number }; end: { x: number; y: number } },
  wB: { start: { x: number; y: number }; end: { x: number; y: number } },
): boolean {
  const TOL_SQ = 4.0; // 2 mm max
  const d1 = distSq2D(wA.start, wB.start);
  const d2 = distSq2D(wA.start, wB.end);
  const d3 = distSq2D(wA.end, wB.start);
  const d4 = distSq2D(wA.end, wB.end);

  if (d1 <= TOL_SQ || d2 <= TOL_SQ || d3 <= TOL_SQ || d4 <= TOL_SQ) {
    return true;
  }

  // Jonction en T : l'extrémité de l'un est sur le segment de l'autre
  if (isPointNearSegment(wA.start, wB.start, wB.end) || isPointNearSegment(wA.end, wB.start, wB.end)) {
    return true;
  }
  if (isPointNearSegment(wB.start, wA.start, wA.end) || isPointNearSegment(wB.end, wA.start, wA.end)) {
    return true;
  }

  return false;
}

function distSq2D(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return dx * dx + dy * dy;
}

function isPointNearSegment(
  p: { x: number; y: number },
  sA: { x: number; y: number },
  sB: { x: number; y: number },
  tolMm = 2.0,
): boolean {
  const dx = sB.x - sA.x;
  const dy = sB.y - sA.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 1e-4) return false;

  const t = Math.max(0, Math.min(1, ((p.x - sA.x) * dx + (p.y - sA.y) * dy) / lenSq));
  const projX = sA.x + t * dx;
  const projY = sA.y + t * dy;

  const d2 = (p.x - projX) * (p.x - projX) + (p.y - projY) * (p.y - projY);
  return d2 <= tolMm * tolMm;
}
