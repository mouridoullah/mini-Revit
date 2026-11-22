import type { BimState, ElementId, Door, Window } from '../types.js';
import type {
  ClashResult,
  ClashDetectionOptions,
  Primitive3D,
  SpatialItem,
  ClashCategory,
  ClashDiscipline,
} from './types.js';
import { BVHTree } from './spatial/bvh.js';
import { testOBBVsOBB } from './narrow-phase/sat.js';
import { testCylinderVsCylinder, testCylinderVsOBB } from './narrow-phase/cylinder.js';
import {
  createWallPrimitives,
  createRoofPrimitives,
  createSlabPrimitive,
  createComponentPrimitive,
  createStairPrimitive,
  createPipePrimitive,
  createDuctPrimitive,
  createCableTrayPrimitive,
  createFittingPrimitive,
  createEquipmentPrimitive,
} from './narrow-phase/geometry-adapters.js';
import {
  classifyClashInteraction,
} from './classification/rules.js';

export interface IndexedElement {
  readonly id: ElementId;
  readonly category: ClashCategory;
  readonly discipline: ClashDiscipline;
  readonly primitive: Primitive3D;
}

/**
 * Moteur analytique pur de détection des conflits géométriques BIM (Clash Detection).
 *
 * Combine un index spatial 3D BVH (O(N log N)) en broad-phase et des tests d'intersection
 * analytiques exacts (SAT 3D OBB/OBB et cylindre/OBB) en narrow-phase, filtrés par
 * les règles sémantiques BIM pour éliminer 100% des faux positifs légitimes.
 */
export function detectClashes(
  state: BimState,
  options?: ClashDetectionOptions,
): ClashResult[] {
  const hardToleranceMm = options?.hardToleranceMm ?? 2.0;
  const clearanceDistanceMm = options?.clearanceDistanceMm ?? 25.0;
  const checkClearance = options?.checkClearance ?? false;

  // 1. Extraction et conversion des éléments en primitives géométriques
  const elements = extractIndexedElements(state, options?.filterElementIds);
  if (elements.length < 2) {
    return [];
  }

  // 2. Construction de l'index spatial 3D (Broad-phase BVH)
  const spatialItems: SpatialItem<IndexedElement>[] = elements.map((elem, idx) => ({
    id: `${elem.id}#${idx}`,
    aabb: elem.primitive.aabb,
    data: elem,
  }));

  const bvh = new BVHTree<IndexedElement>(spatialItems);

  // 3. Extraction des paires candidates d'AABB se chevauchant
  const queryTolerance = checkClearance ? Math.max(hardToleranceMm, clearanceDistanceMm) : hardToleranceMm;
  const candidatePairs = bvh.queryPairs(queryTolerance);

  const resultsMap = new Map<string, ClashResult>();

  // 4. Évaluation Narrow-Phase et Sémantique BIM de chaque paire candidate
  for (const [itemA, itemB] of candidatePairs) {
    const elemA = itemA.data;
    const elemB = itemB.data;

    // Ignorer les collisions internes entre fragments d'un même élément
    if (elemA.id === elemB.id) {
      continue;
    }

    // Filtre optionnel de matrice de disciplines (ex. MEP vs Structure uniquement)
    if (options?.disciplinePairs && options.disciplinePairs.length > 0) {
      if (!matchesDisciplineFilter(elemA.discipline, elemB.discipline, options.disciplinePairs)) {
        continue;
      }
    }

    // Narrow-phase : test géométrique exact selon les primitives
    const narrowRes = testPrimitivesIntersection(
      elemA.primitive,
      elemB.primitive,
      0,
    );

    if (narrowRes.intersects) {
      // Évaluation sémantique BIM
      const classification = classifyClashInteraction(
        elemA.id,
        elemB.id,
        elemA.category,
        elemB.category,
        narrowRes.penetrationDepthMm,
        hardToleranceMm,
        state,
      );

      if (classification === 'HARD_CLASH') {
        const idFirst = elemA.id.localeCompare(elemB.id) <= 0 ? elemA : elemB;
        const idSecond = idFirst === elemA ? elemB : elemA;
        const clashId = `${idFirst.id}__${idSecond.id}__hard`;

        const existing = resultsMap.get(clashId);
        if (!existing || narrowRes.penetrationDepthMm > existing.penetrationDepthMm) {
          resultsMap.set(clashId, {
            id: clashId,
            elementA: idFirst.id,
            elementB: idSecond.id,
            categoryA: idFirst.category,
            categoryB: idSecond.category,
            disciplineA: idFirst.discipline,
            disciplineB: idSecond.discipline,
            severity: 'hard',
            penetrationDepthMm: Number(narrowRes.penetrationDepthMm.toFixed(2)),
            intersectionBox: narrowRes.intersectionBox,
            point: narrowRes.point,
            description: `Collision solide (${idFirst.category} ↔ ${idSecond.category}) : pénétration de ${narrowRes.penetrationDepthMm.toFixed(1)} mm.`,
          });
        }
      }
    } else if (checkClearance) {
      // Test de proximité pour violation de zone de dégagement ('clearance')
      const clearanceRes = testPrimitivesIntersection(
        elemA.primitive,
        elemB.primitive,
        clearanceDistanceMm,
      );

      if (clearanceRes.intersects) {
        const classification = classifyClashInteraction(
          elemA.id,
          elemB.id,
          elemA.category,
          elemB.category,
          clearanceRes.penetrationDepthMm,
          hardToleranceMm,
          state,
        );

        if (classification === 'CLEARANCE') {
          const idFirst = elemA.id.localeCompare(elemB.id) <= 0 ? elemA : elemB;
          const idSecond = idFirst === elemA ? elemB : elemA;
          const clashId = `${idFirst.id}__${idSecond.id}__clearance`;

          if (!resultsMap.has(clashId)) {
            resultsMap.set(clashId, {
              id: clashId,
              elementA: idFirst.id,
              elementB: idSecond.id,
              categoryA: idFirst.category,
              categoryB: idSecond.category,
              disciplineA: idFirst.discipline,
              disciplineB: idSecond.discipline,
              severity: 'clearance',
              penetrationDepthMm: Number(clearanceRes.penetrationDepthMm.toFixed(2)),
              intersectionBox: clearanceRes.intersectionBox,
              point: clearanceRes.point,
              description: `Zone de dégagement (${idFirst.category} ↔ ${idSecond.category}) : proximité à moins de ${clearanceDistanceMm} mm.`,
            });
          }
        }
      }
    }
  }

  // 5. Conversion déterministe triée par identifiant canonique
  const results = Array.from(resultsMap.values());
  results.sort((a, b) => a.id.localeCompare(b.id));

  return results;
}

export function extractIndexedElements(
  state: BimState,
  filterIds?: readonly ElementId[],
): IndexedElement[] {
  const list: IndexedElement[] = [];
  const filterSet = filterIds ? new Set(filterIds) : null;

  const shouldInclude = (id: ElementId) => !filterSet || filterSet.has(id);

  // Pré-indexation des ouvertures par mur hôte O(D + W) pour éviter un O(N * (D + W))
  const doorsByWall = new Map<ElementId, Door[]>();
  if (state.doors) {
    for (const d of Object.values(state.doors)) {
      let dList = doorsByWall.get(d.hostWallId);
      if (!dList) {
        dList = [];
        doorsByWall.set(d.hostWallId, dList);
      }
      dList.push(d);
    }
  }

  const windowsByWall = new Map<ElementId, Window[]>();
  if (state.windows) {
    for (const win of Object.values(state.windows)) {
      let wList = windowsByWall.get(win.hostWallId);
      if (!wList) {
        wList = [];
        windowsByWall.set(win.hostWallId, wList);
      }
      wList.push(win);
    }
  }

  // Murs
  if (state.walls) {
    for (const wall of Object.values(state.walls)) {
      if (!shouldInclude(wall.id)) continue;
      const wallPrims = createWallPrimitives(
        wall,
        state,
        doorsByWall.get(wall.id),
        windowsByWall.get(wall.id),
      );
      for (const prim of wallPrims) {
        list.push({
          id: wall.id,
          category: 'wall',
          discipline: 'structure',
          primitive: prim,
        });
      }
    }
  }

  // Toitures
  if (state.roofs) {
    for (const roof of Object.values(state.roofs)) {
      if (!shouldInclude(roof.id)) continue;
      const roofPrims = createRoofPrimitives(roof, state);
      for (const prim of roofPrims) {
        list.push({
          id: roof.id,
          category: 'roof',
          discipline: 'architecture',
          primitive: prim,
        });
      }
    }
  }

  // Dalles
  if (state.slabs) {
    for (const slab of Object.values(state.slabs)) {
      if (!shouldInclude(slab.id)) continue;
      list.push({
        id: slab.id,
        category: 'slab',
        discipline: 'structure',
        primitive: createSlabPrimitive(slab, state),
      });
    }
  }

  // Composants / Mobilier
  if (state.components) {
    for (const comp of Object.values(state.components)) {
      if (!shouldInclude(comp.id)) continue;
      list.push({
        id: comp.id,
        category: 'component',
        discipline: 'architecture',
        primitive: createComponentPrimitive(comp, state),
      });
    }
  }

  // Escaliers
  if (state.stairs) {
    for (const stair of Object.values(state.stairs)) {
      if (!shouldInclude(stair.id)) continue;
      list.push({
        id: stair.id,
        category: 'stair',
        discipline: 'architecture',
        primitive: createStairPrimitive(stair, state),
      });
    }
  }

  // Tuyaux
  if (state.pipes) {
    for (const pipe of Object.values(state.pipes)) {
      if (!shouldInclude(pipe.id)) continue;
      list.push({
        id: pipe.id,
        category: 'pipe',
        discipline: 'mep',
        primitive: createPipePrimitive(pipe),
      });
    }
  }

  // Gaines
  if (state.ducts) {
    for (const duct of Object.values(state.ducts)) {
      if (!shouldInclude(duct.id)) continue;
      list.push({
        id: duct.id,
        category: 'duct',
        discipline: 'mep',
        primitive: createDuctPrimitive(duct),
      });
    }
  }

  // Chemins de câbles
  if (state.cableTrays) {
    for (const ct of Object.values(state.cableTrays)) {
      if (!shouldInclude(ct.id)) continue;
      list.push({
        id: ct.id,
        category: 'cableTray',
        discipline: 'mep',
        primitive: createCableTrayPrimitive(ct),
      });
    }
  }

  // Raccords MEP
  if (state.mepFittings) {
    for (const fit of Object.values(state.mepFittings)) {
      if (!shouldInclude(fit.id)) continue;
      list.push({
        id: fit.id,
        category: 'mepFitting',
        discipline: 'mep',
        primitive: createFittingPrimitive(fit),
      });
    }
  }

  // Équipements MEP
  if (state.mepEquipments) {
    for (const eq of Object.values(state.mepEquipments)) {
      if (!shouldInclude(eq.id)) continue;
      list.push({
        id: eq.id,
        category: 'mepEquipment',
        discipline: 'mep',
        primitive: createEquipmentPrimitive(eq),
      });
    }
  }

  return list;
}

function testPrimitivesIntersection(
  primA: Primitive3D,
  primB: Primitive3D,
  toleranceMm: number,
) {
  if (primA.kind === 'obb' && primB.kind === 'obb') {
    return testOBBVsOBB(primA.obb, primB.obb, toleranceMm);
  }
  if (primA.kind === 'cylinder' && primB.kind === 'cylinder') {
    return testCylinderVsCylinder(primA.cylinder, primB.cylinder, toleranceMm);
  }
  if (primA.kind === 'cylinder' && primB.kind === 'obb') {
    return testCylinderVsOBB(primA.cylinder, primB.obb, toleranceMm);
  }
  if (primA.kind === 'obb' && primB.kind === 'cylinder') {
    return testCylinderVsOBB(primB.cylinder, primA.obb, toleranceMm);
  }
  return {
    intersects: false,
    penetrationDepthMm: 0,
    intersectionBox: primA.aabb,
    point: { x: 0, y: 0, z: 0 },
  };
}

function matchesDisciplineFilter(
  d1: ClashDiscipline,
  d2: ClashDiscipline,
  pairs: readonly (readonly [ClashDiscipline, ClashDiscipline])[],
): boolean {
  for (const [p1, p2] of pairs) {
    if ((d1 === p1 && d2 === p2) || (d1 === p2 && d2 === p1)) {
      return true;
    }
  }
  return false;
}
