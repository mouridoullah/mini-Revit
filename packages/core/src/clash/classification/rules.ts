import type {
  BimState,
  ElementId,
} from '../../types.js';
import type {
  ClashCategory,
  ClashDiscipline,
  ClashClassification,
  Vec3,
} from '../types.js';
import { isPointInPolygon, type Vec2 } from '@tabax/geometry';
import { computeStairShaft } from '../../stairs.js';

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
  clashPoint?: Vec3,
): boolean {
  if (idA === idB) return true;

  // 1. Connexions MEP autorisées (MepConnector direct ou à 2 sauts via nœud partagé)
  if (isMepCategory(catA) && isMepCategory(catB)) {
    if (areMepElementsConnected(idA, idB, state, clashPoint)) {
      return true;
    }

    // 1b. Segments linéaires MEP qui se rejoignent à leurs extrémités (coude direct / jonction naturelle)
    if (
      (catA === 'pipe' || catA === 'duct' || catA === 'cableTray') &&
      (catB === 'pipe' || catB === 'duct' || catB === 'cableTray')
    ) {
      const elemA = state.pipes?.[idA] ?? state.ducts?.[idA] ?? state.cableTrays?.[idA];
      const elemB = state.pipes?.[idB] ?? state.ducts?.[idB] ?? state.cableTrays?.[idB];
      if (elemA && elemB && areLinearMepNaturallyConnected(elemA, elemB)) {
        return true;
      }
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
    const stairId = catA === 'stair' ? idA : idB;
    const slabId = catA === 'slab' ? idA : idB;
    const stair = state.stairs?.[stairId];
    const slab = state.slabs?.[slabId];
    if (stair && slab && (slab.levelId === stair.topLevelId || slab.levelId === stair.bottomLevelId)) {
      return true;
    }
  }

  // 6. Mur et toiture attachée
  if ((catA === 'wall' && catB === 'roof') || (catA === 'roof' && catB === 'wall')) {
    const wallId = catA === 'wall' ? idA : idB;
    const roofId = catA === 'roof' ? idA : idB;
    const wall = state.walls?.[wallId];
    if (wall && wall.topConstraint?.kind === 'roof' && wall.topConstraint.roofId === roofId) {
      return true;
    }
  }

  // 7. Conduit MEP passant par une réservation / trémie de dalle (ADR-071)
  if (isMepCategory(catA) && catB === 'slab') {
    if (isMepPassingThroughSlabVoid(idA, idB, state)) {
      return true;
    }
  }
  if (catA === 'slab' && isMepCategory(catB)) {
    if (isMepPassingThroughSlabVoid(idB, idA, state)) {
      return true;
    }
  }

  return false;
}

/**
 * Vérifie si un conduit MEP (tuyau, gaine, chemin de câbles) traverse une dalle
 * au travers d'une trémie ou réservation autorisée (ADR-071).
 */
export function isMepPassingThroughSlabVoid(
  mepId: ElementId,
  slabId: ElementId,
  state: BimState,
): boolean {
  const slab = state.slabs?.[slabId];
  if (!slab) return false;

  const mep =
    state.pipes?.[mepId] ??
    state.ducts?.[mepId] ??
    state.cableTrays?.[mepId];

  if (!mep) return false;

  const level = state.levels?.[slab.levelId];
  const typeId = slab.slabTypeId ?? (slab as unknown as { typeId?: ElementId }).typeId;
  const slabType = typeId && state.slabTypes ? state.slabTypes[typeId] : undefined;
  const zBase = (level?.elevation ?? 0) + (slab.baseOffset ?? 0);
  const thickness = slabType?.thickness ?? (slab as unknown as { thickness?: number }).thickness ?? 200;
  const zTop = zBase;
  const zBottom = zBase - thickness;
  const zMid = (zTop + zBottom) * 0.5;

  const startZ = mep.start.z;
  const endZ = mep.end.z;

  let pt2D: Vec2;
  const dz = endZ - startZ;
  if (Math.abs(dz) > 1e-4) {
    const t = (zMid - startZ) / dz;
    // Vérifier si le segment coupe l'intervalle altimétrique de la dalle avec tolérance
    if (t < -0.1 || t > 1.1) return false;
    const clampedT = Math.max(0, Math.min(1, t));
    pt2D = {
      x: mep.start.x + clampedT * (mep.end.x - mep.start.x),
      y: mep.start.y + clampedT * (mep.end.y - mep.start.y),
    };
  } else {
    // Segment horizontal : vérifier le milieu
    pt2D = {
      x: (mep.start.x + mep.end.x) * 0.5,
      y: (mep.start.y + mep.end.y) * 0.5,
    };
  }

  // 1. Trous manuels de la dalle (slab.holes)
  if (slab.holes) {
    for (const hole of slab.holes) {
      if (hole.length >= 3 && isPointInPolygon(pt2D, hole)) {
        return true;
      }
    }
  }

  // 2. Trémies géométriques de la dalle (slab.openings)
  if (slab.openings) {
    for (const opening of slab.openings) {
      if (opening.length >= 3 && isPointInPolygon(pt2D, opening)) {
        return true;
      }
    }
  }

  // 3. Trémies dérivées des escaliers connectés au niveau de la dalle (computeStairShaft)
  if (state.stairs) {
    for (const stair of Object.values(state.stairs)) {
      if (stair.topLevelId === slab.levelId || stair.bottomLevelId === slab.levelId) {
        const shaft = computeStairShaft(stair, state);
        if (shaft.length >= 3 && isPointInPolygon(pt2D, shaft)) {
          return true;
        }
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
  clashPoint?: Vec3,
): ClashClassification {
  if (idA === idB) return 'IGNORED';

  if (isExcludedLegitimateContact(idA, idB, catA, catB, state, clashPoint)) {
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

function findPortOwner(portId: ElementId, state: BimState): ElementId | null {
  if (state.mepFittings) {
    for (const [id] of Object.entries(state.mepFittings)) {
      if (doesElementOwnPort(id, portId, state)) return id;
    }
  }
  if (state.pipes) {
    for (const [id] of Object.entries(state.pipes)) {
      if (doesElementOwnPort(id, portId, state)) return id;
    }
  }
  if (state.ducts) {
    for (const [id] of Object.entries(state.ducts)) {
      if (doesElementOwnPort(id, portId, state)) return id;
    }
  }
  if (state.cableTrays) {
    for (const [id] of Object.entries(state.cableTrays)) {
      if (doesElementOwnPort(id, portId, state)) return id;
    }
  }
  if (state.mepEquipments) {
    for (const [id] of Object.entries(state.mepEquipments)) {
      if (doesElementOwnPort(id, portId, state)) return id;
    }
  }
  return null;
}

function areMepElementsConnected(
  idA: ElementId,
  idB: ElementId,
  state: BimState,
  clashPoint?: Vec3,
): boolean {
  if (!state.mepConnectors) return false;

  const neighborsA = new Set<ElementId>();
  const neighborsB = new Set<ElementId>();

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

    if (elemA === idA && elemB) neighborsA.add(elemB);
    if (elemB === idA && elemA) neighborsA.add(elemA);
    if (elemA === idB && elemB) neighborsB.add(elemB);
    if (elemB === idB && elemA) neighborsB.add(elemA);

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

      if (matchA) {
        const owner = elemB ?? findPortOwner(portIdB, state);
        if (owner) neighborsA.add(owner);
      } else if (reverseA) {
        const owner = elemA ?? findPortOwner(portIdA, state);
        if (owner) neighborsA.add(owner);
      }

      if (matchB) {
        const owner = elemA ?? findPortOwner(portIdA, state);
        if (owner) neighborsB.add(owner);
      } else if (reverseB) {
        const owner = elemB ?? findPortOwner(portIdB, state);
        if (owner) neighborsB.add(owner);
      }
    }
  }

  // 3. Cas à 2 sauts : idA et idB partagent un raccord ou nœud commun (ex: 2 tuyaux reliés au même coude)
  for (const sharedId of neighborsA) {
    if (neighborsB.has(sharedId)) {
      const sharedFitting = state.mepFittings?.[sharedId];
      const sharedEquipment = state.mepEquipments?.[sharedId];
      const sharedNode = sharedFitting ?? sharedEquipment;

      if (sharedNode) {
        if (!clashPoint) {
          return true;
        }

        let maxReach = 150;
        const nodePos = sharedNode.position;
        if (sharedNode.ports && sharedNode.ports.length > 0) {
          for (const p of sharedNode.ports) {
            const pdx = p.position.x - nodePos.x;
            const pdy = p.position.y - nodePos.y;
            const pdz = p.position.z - nodePos.z;
            const dist = Math.sqrt(pdx * pdx + pdy * pdy + pdz * pdz);
            const dim = p.diameter ?? Math.max(p.width ?? 0, p.height ?? 0);
            maxReach = Math.max(maxReach, dist + dim * 1.5 + 50);
          }
        }

        const distFromNode = Math.hypot(
          clashPoint.x - nodePos.x,
          clashPoint.y - nodePos.y,
          clashPoint.z - nodePos.z,
        );
        if (distFromNode <= maxReach) {
          return true;
        }
      } else {
        // Nœud intermédiaire linéaire (deux raccords sur un même segment droit)
        return true;
      }
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

interface LinearMepElement {
  readonly start?: { readonly x: number; readonly y: number; readonly z?: number | undefined } | undefined;
  readonly end?: { readonly x: number; readonly y: number; readonly z?: number | undefined } | undefined;
  readonly diameter?: number | undefined;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
}

function areLinearMepNaturallyConnected(
  elemA: LinearMepElement,
  elemB: LinearMepElement,
): boolean {
  if (!elemA || !elemB || !elemA.start || !elemA.end || !elemB.start || !elemB.end) return false;
  const pA = [elemA.start, elemA.end];
  const pB = [elemB.start, elemB.end];
  const dimA = elemA.diameter ?? Math.max(elemA.width ?? 50, elemA.height ?? 50);
  const dimB = elemB.diameter ?? Math.max(elemB.width ?? 50, elemB.height ?? 50);
  const tol = Math.max(dimA, dimB) * 1.5 + 20;

  for (const a of pA) {
    const az = a.z ?? 0;
    for (const b of pB) {
      const bz = b.z ?? 0;
      const dist = Math.hypot(a.x - b.x, a.y - b.y, az - bz);
      if (dist <= tol) return true;
    }
  }
  return false;
}

