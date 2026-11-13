import { GEOM_CONFIG } from '../constants.js';
import { type Vec2, vec2, distance } from '../vec2.js';
import { segment2, intersectSegments, projectPointOnSegment } from '../segment.js';
import { type WallInput, type WallEnd, type WallEndRef } from './types.js';

/**
 * Nœud topologique regroupant une ou plusieurs extrémités de murs coïncidentes.
 */
export interface TopologicalNode {
  readonly id: string;
  readonly point: Vec2;
  readonly endpoints: readonly WallEndRef[];
}

/**
 * Relation de jonction en T détectée (mur secondaire aboutissant sur l'intérieur d'un mur principal).
 */
export interface TConnection {
  readonly throughWallId: string;
  readonly stemWallId: string;
  readonly stemEnd: WallEnd;
  readonly intersectionPoint: Vec2;
  readonly tOnThroughWall: number; // Paramètre t ∈ (0, 1) sur le mur traversant
}

/**
 * Relation de jonction en X détectée (croisement intérieur de deux murs).
 */
export interface XConnection {
  readonly wallId1: string;
  readonly wallId2: string;
  readonly intersectionPoint: Vec2;
  readonly t1: number; // Paramètre sur mur 1
  readonly t2: number; // Paramètre sur mur 2
}

/**
 * Analyse et structure le graphe de connectivité spatiale entre les murs.
 */
export interface TopologyAnalysis {
  readonly nodes: readonly TopologicalNode[];
  readonly tConnections: readonly TConnection[];
  readonly xConnections: readonly XConnection[];
}

/**
 * Construit l'analyse topologique des connexions entre murs.
 *
 * @param walls Liste des murs d'entrée
 * @param mergeTolerance Tolérance de fusion des extrémités (par défaut 1.0 mm)
 */
export function analyzeTopology(
  walls: readonly WallInput[],
  mergeTolerance: number = GEOM_CONFIG.VERTEX_MERGE_TOLERANCE,
): TopologyAnalysis {
  // 1. Regroupement des extrémités en nœuds topologiques
  const rawEndpoints: { wallId: string; end: WallEnd; pt: Vec2 }[] = [];
  for (const w of walls) {
    rawEndpoints.push({ wallId: w.id, end: 'start', pt: w.start });
    rawEndpoints.push({ wallId: w.id, end: 'end', pt: w.end });
  }

  const nodes: TopologicalNode[] = [];
  const assigned = new Set<number>();

  for (let i = 0; i < rawEndpoints.length; i++) {
    if (assigned.has(i)) continue;

    const base = rawEndpoints[i];
    if (!base) continue;

    const cluster: WallEndRef[] = [];
    const pts: Vec2[] = [];
    const basePt = base.pt;

    cluster.push({ wallId: base.wallId, end: base.end });
    pts.push(basePt);
    assigned.add(i);

    for (let j = i + 1; j < rawEndpoints.length; j++) {
      if (assigned.has(j)) continue;
      const candidate = rawEndpoints[j];
      if (candidate && distance(basePt, candidate.pt) <= mergeTolerance) {
        cluster.push({ wallId: candidate.wallId, end: candidate.end });
        pts.push(candidate.pt);
        assigned.add(j);
      }
    }

    // Calcul du point moyen du cluster
    let sumX = 0;
    let sumY = 0;
    for (const p of pts) {
      sumX += p.x;
      sumY += p.y;
    }
    const center = vec2(sumX / pts.length, sumY / pts.length);

    nodes.push({
      id: `node_${nodes.length}`,
      point: center,
      endpoints: cluster,
    });
  }

  // 2. Détection des jonctions en T (extrémité d'un mur arrivant sur le corps d'un autre)
  const tConnections: TConnection[] = [];

  for (const ep of rawEndpoints) {
    for (const otherWall of walls) {
      if (otherWall.id === ep.wallId) continue;

      const otherSeg = segment2(otherWall.start, otherWall.end);
      const proj = projectPointOnSegment(ep.pt, otherSeg);

      // Le point doit être strictement à l'intérieur du segment (hors des extrémités d'accrochage)
      const epsT = mergeTolerance / Math.max(1, distance(otherWall.start, otherWall.end));
      if (proj.t > epsT && proj.t < 1 - epsT) {
        // La distance doit être inférieure à la demi-épaisseur du mur traversant + marge
        const distToAxis = distance(ep.pt, proj.point);
        const maxDist = otherWall.thickness / 2 + mergeTolerance;

        if (distToAxis <= maxDist) {
          tConnections.push({
            throughWallId: otherWall.id,
            stemWallId: ep.wallId,
            stemEnd: ep.end,
            intersectionPoint: proj.point,
            tOnThroughWall: proj.t,
          });
        }
      }
    }
  }

  // 3. Détection des croisements en X (intersections intérieures de deux axes)
  const xConnections: XConnection[] = [];
  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      const w1 = walls[i];
      const w2 = walls[j];
      if (!w1 || !w2) continue;

      const s1 = segment2(w1.start, w1.end);
      const s2 = segment2(w2.start, w2.end);

      const inter = intersectSegments(s1, s2);
      if (inter.type === 'point') {
        const epsT1 = mergeTolerance / Math.max(1, distance(w1.start, w1.end));
        const epsT2 = mergeTolerance / Math.max(1, distance(w2.start, w2.end));

        // Strictement à l'intérieur des deux segments (ni start ni end)
        if (inter.t > epsT1 && inter.t < 1 - epsT1 && inter.u > epsT2 && inter.u < 1 - epsT2) {
          xConnections.push({
            wallId1: w1.id,
            wallId2: w2.id,
            intersectionPoint: inter.point,
            t1: inter.t,
            t2: inter.u,
          });
        }
      }
    }
  }

  return { nodes, tConnections, xConnections };
}
