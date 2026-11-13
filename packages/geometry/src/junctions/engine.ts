import { GEOM_CONFIG } from '../constants.js';
import { type Vec2, distance, sub, normalize } from '../vec2.js';
import { computeWallFootprint2d } from '../wall-geometry.js';
import { signedArea } from '../polygon.js';
import {
  type WallInput,
  type WallEnd,
  type ResolvedWall,
  type DetectedJunction,
  type JunctionSolution,
} from './types.js';
import { analyzeTopology } from './topology.js';
import { solveLMiter } from './miter.js';
import { solveTJunction } from './t-junction.js';
import { solveXJunction } from './x-junction.js';
import { solveCollinearJunction } from './collinear.js';
import { solveMultiJunction } from './multi.js';

/**
 * Nettoie un polygone en éliminant les sommets consécutifs quasi-identiques.
 */
function cleanPolygon(vertices: readonly Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  const n = vertices.length;
  if (n === 0) return out;

  for (let i = 0; i < n; i++) {
    const cur = vertices[i];
    const next = vertices[(i + 1) % n];
    if (cur && next && distance(cur, next) > GEOM_CONFIG.EPSILON_DISTANCE) {
      out.push(cur);
    }
  }
  return out;
}

/**
 * Moteur principal de résolution des jonctions de murs.
 *
 * Traite les jonctions en L, T, X, colinéaires et multiples de façon déterministe
 * et sans superposition ni vide géométrique.
 *
 * @param walls Liste des murs à interconnecter
 * @param mergeTolerance Tolérance d'accrochage des extrémités (mm)
 */
export function solveWallJunctions(
  walls: readonly WallInput[],
  mergeTolerance: number = GEOM_CONFIG.VERTEX_MERGE_TOLERANCE,
): JunctionSolution {
  if (walls.length === 0) {
    return { walls: [], junctions: [], totalArea: 0 };
  }

  // 1. Validation préalable
  for (const w of walls) {
    if (!Number.isFinite(w.thickness) || w.thickness <= 0) {
      throw new RangeError(
        `Épaisseur invalide pour le mur "${w.id}" : ${w.thickness} (doit être > 0)`,
      );
    }
    const len = distance(w.start, w.end);
    if (len <= GEOM_CONFIG.EPSILON_DISTANCE) {
      throw new RangeError(`Longueur dégénérée pour le mur "${w.id}" : ${len} mm`);
    }
  }

  const detectedJunctions: DetectedJunction[] = [];
  const activeWalls: WallInput[] = [...walls];
  const wallEndModifications = new Map<
    string,
    { start?: readonly Vec2[]; end?: readonly Vec2[] }
  >();

  const getMod = (wallId: string) => {
    let m = wallEndModifications.get(wallId);
    if (!m) {
      m = {};
      wallEndModifications.set(wallId, m);
    }
    return m;
  };

  // 2. Détection de la topologie initiale
  const topology = analyzeTopology(activeWalls, mergeTolerance);

  // 3. Traitement des Jonctions en X (croisements intérieurs)
  const xWallSplits = new Map<string, { branch1: WallInput; branch2: WallInput }>();
  for (const xConn of topology.xConnections) {
    const w1 = activeWalls.find((w) => w.id === xConn.wallId1);
    const w2 = activeWalls.find((w) => w.id === xConn.wallId2);
    if (!w1 || !w2) continue;

    const xRes = solveXJunction(w1, w2, xConn.intersectionPoint);

    detectedJunctions.push({
      id: `junction_X_${detectedJunctions.length}`,
      type: 'X',
      point: xConn.intersectionPoint,
      wallIds: [w1.id, w2.id],
      details: {
        primaryWallId: xRes.primaryWallId,
        secondaryWallId: xRes.secondaryWallId,
      },
    });

    // Enregistrer les modifications pour les branches du mur secondaire
    const secWall = w1.id === xRes.secondaryWallId ? w1 : w2;
    const branch1Input: WallInput = {
      ...secWall,
      id: xRes.branch1.id,
      start: xRes.branch1.start,
      end: xRes.branch1.end,
    };
    const branch2Input: WallInput = {
      ...secWall,
      id: xRes.branch2.id,
      start: xRes.branch2.start,
      end: xRes.branch2.end,
    };

    getMod(branch1Input.id).end = xRes.branch1.tResult.vertices;
    getMod(branch2Input.id).start = xRes.branch2.tResult.vertices;

    xWallSplits.set(secWall.id, { branch1: branch1Input, branch2: branch2Input });
  }

  // 4. Traitement des Jonctions en T (aboutements)
  const handledTEnds = new Set<string>(); // "wallId:end"
  for (const tConn of topology.tConnections) {
    const throughWall = activeWalls.find((w) => w.id === tConn.throughWallId);
    const stemWall = activeWalls.find((w) => w.id === tConn.stemWallId);
    if (!throughWall || !stemWall) continue;

    const key = `${stemWall.id}:${tConn.stemEnd}`;
    if (handledTEnds.has(key)) continue;

    const tRes = solveTJunction(throughWall, stemWall, tConn.stemEnd, tConn.intersectionPoint);

    const mod = getMod(stemWall.id);
    if (tConn.stemEnd === 'start') {
      mod.start = tRes.vertices;
    } else {
      mod.end = tRes.vertices;
    }

    handledTEnds.add(key);
    detectedJunctions.push({
      id: `junction_T_${detectedJunctions.length}`,
      type: 'T',
      point: tConn.intersectionPoint,
      wallIds: [throughWall.id, stemWall.id],
      details: { throughWallId: throughWall.id, stemWallId: stemWall.id, hitFace: tRes.hitFace },
    });
  }

  // 5. Traitement des Nœuds d'extrémités (L, Colinéaire, Multi)
  const wallInputMap = new Map<string, WallInput>(activeWalls.map((w) => [w.id, w]));

  for (const node of topology.nodes) {
    // Filtrer les extrémités déjà traitées par un T
    const validEndpoints = node.endpoints.filter(
      (ep) => !handledTEnds.has(`${ep.wallId}:${ep.end}`),
    );

    if (validEndpoints.length === 0) continue;

    if (validEndpoints.length === 1) {
      // Bout libre (cap droit orthogonal)
      continue;
    }

    if (validEndpoints.length === 2) {
      const ep1 = validEndpoints[0];
      const ep2 = validEndpoints[1];
      if (!ep1 || !ep2) continue;

      const w1 = wallInputMap.get(ep1.wallId);
      const w2 = wallInputMap.get(ep2.wallId);
      if (!w1 || !w2) continue;

      // Calculer l'angle entre les directions sortantes pour distinguer L et Colinéaire
      const v1 = ep1.end === 'start' ? sub(w1.end, w1.start) : sub(w1.start, w1.end);
      const v2 = ep2.end === 'start' ? sub(w2.end, w2.start) : sub(w2.start, w2.end);

      const d1 = normalize(v1);
      const d2 = normalize(v2);

      const dotVal = d1.x * d2.x + d1.y * d2.y;

      if (Math.abs(dotVal + 1) <= GEOM_CONFIG.EPSILON_COLLINEAR) {
        // Colinéaire abouté (directions opposées)
        const colRes = solveCollinearJunction(w1, ep1.end, w2, ep2.end, node.point);
        getMod(w1.id)[ep1.end] = colRes.vertices1;
        getMod(w2.id)[ep2.end] = colRes.vertices2;

        detectedJunctions.push({
          id: `junction_collinear_${detectedJunctions.length}`,
          type: 'collinear',
          point: node.point,
          wallIds: [w1.id, w2.id],
        });
      } else {
        // Jonction en L
        const lRes = solveLMiter(w1, ep1.end, w2, ep2.end, node.point);
        getMod(w1.id)[ep1.end] = lRes.result1.vertices;
        getMod(w2.id)[ep2.end] = lRes.result2.vertices;

        detectedJunctions.push({
          id: `junction_L_${detectedJunctions.length}`,
          type: 'L',
          point: node.point,
          wallIds: [w1.id, w2.id],
          details: { isBevelled: lRes.result1.isBevelled || lRes.result2.isBevelled },
        });
      }
    } else {
      // Jonction multiple (3 murs ou plus)
      const incidentList: { wall: WallInput; end: WallEnd }[] = [];
      for (const ep of validEndpoints) {
        const w = wallInputMap.get(ep.wallId);
        if (w) incidentList.push({ wall: w, end: ep.end });
      }

      const multiRes = solveMultiJunction(incidentList, node.point);
      for (const res of multiRes) {
        getMod(res.wallId)[res.end] = res.vertices;
      }

      detectedJunctions.push({
        id: `junction_multi_${detectedJunctions.length}`,
        type: 'multi',
        point: node.point,
        wallIds: incidentList.map((i) => i.wall.id),
      });
    }
  }

  // 6. Assemblage des polygones finaux de chaque mur
  const resolvedWalls: ResolvedWall[] = [];

  // Murs à traiter : les murs réguliers (hors murs secondaires scindés en X) + branches créées
  const wallsToAssemble: { wall: WallInput; origId: string }[] = [];
  for (const w of activeWalls) {
    const split = xWallSplits.get(w.id);
    if (split) {
      wallsToAssemble.push({ wall: split.branch1, origId: w.id });
      wallsToAssemble.push({ wall: split.branch2, origId: w.id });
    } else {
      wallsToAssemble.push({ wall: w, origId: w.id });
    }
  }

  for (const { wall, origId } of wallsToAssemble) {
    const baseFp = computeWallFootprint2d({
      start: wall.start,
      end: wall.end,
      thickness: wall.thickness,
      locationLine: wall.locationLine,
    });

    const mod = wallEndModifications.get(wall.id);

    // Sommets de base :
    // V0: start interior (-n)
    // V1: end interior (-n)
    // V2: end exterior (+n)
    // V3: start exterior (+n)
    // Ordre CCW nominal : [V0, V1, V2, V3]

    // À l'extrémité start : de right à left => [V0, V3]
    // À l'extrémité end : de right à left => [V2, V1]

    let startVerts: readonly Vec2[];
    if (mod?.start && mod.start.length >= 2) {
      // mod.start[0] est à droite (côté intérieur), mod.start[1...] est à gauche (côté extérieur)
      startVerts = mod.start;
    } else {
      startVerts = [baseFp.vertices[0], baseFp.vertices[3]];
    }

    let endVerts: readonly Vec2[];
    if (mod?.end && mod.end.length >= 2) {
      // mod.end[0] est à droite (côté extérieur), mod.end[1...] est à gauche (côté intérieur)
      endVerts = mod.end;
    } else {
      endVerts = [baseFp.vertices[2], baseFp.vertices[1]];
    }

    // Reconstruction du polygone CCW :
    // Start side : startVerts[0] (V0), puis vers end side : endVerts[1] (V1), endVerts[0] (V2),
    // puis retour vers start side : startVerts[1] (V3).
    const firstStart = startVerts[0];
    const lastEnd = endVerts[endVerts.length - 1];
    if (!firstStart || !lastEnd) continue;

    const polyRaw: Vec2[] = [
      firstStart, // Départ intérieur
      lastEnd, // Arrivée intérieure
      ...endVerts.slice(0, endVerts.length - 1), // Sommets d'arrivée extérieurs
      ...startVerts.slice(1), // Sommets de départ extérieurs
    ];

    const polyClean = cleanPolygon(polyRaw);
    let area = signedArea(polyClean);

    // Garantie d'orientation CCW
    let finalPoly = polyClean;
    if (area < 0) {
      finalPoly = [...polyClean].reverse();
      area = Math.abs(area);
    }

    resolvedWalls.push({
      id: wall.id,
      originalWallId: origId,
      polygon: finalPoly,
      area: Math.abs(area),
      start: wall.start,
      end: wall.end,
      thickness: wall.thickness,
      locationLine: wall.locationLine,
    });
  }

  const totalArea = resolvedWalls.reduce((acc, w) => acc + w.area, 0);

  return {
    walls: resolvedWalls,
    junctions: detectedJunctions,
    totalArea,
  };
}
