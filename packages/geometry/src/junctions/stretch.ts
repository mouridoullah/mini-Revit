import { GEOM_CONFIG } from '../constants.js';
import {
  type Vec2,
  vec2,
  add,
  sub,
  mul,
  dot,
  cross2d,
  length,
  normalize,
  distance,
} from '../vec2.js';
import { distancePointToSegment } from '../segment.js';

/**
 * Entrée pour le calcul d'étirement élastique d'un mur voisin.
 */
export interface WallStretchInput {
  readonly movedWall: { readonly start: Vec2; readonly end: Vec2 };
  readonly delta: Vec2;
  readonly neighbor: { readonly start: Vec2; readonly end: Vec2 };
  readonly connection: 'endpoint-start' | 'endpoint-end' | 'mid';
}

/**
 * Résultat du calcul d'étirement élastique d'un mur voisin.
 */
export interface WallStretchResult {
  readonly newNeighborEndpoints: { readonly start: Vec2; readonly end: Vec2 };
  readonly deltaStart: Vec2;
  readonly deltaEnd: Vec2;
}

/**
 * Codes d'erreur typés pour les garde-fous d'étirement géométrique.
 */
export type WallStretchErrorCode =
  | 'WALL_STRETCH_PARALLEL'
  | 'WALL_STRETCH_COLLAPSE'
  | 'WALL_STRETCH_REVERSED'
  | 'WALL_STRETCH_CYCLE';

export class WallStretchError extends Error {
  constructor(
    public readonly code: WallStretchErrorCode,
    message?: string,
  ) {
    super(message ?? `Erreur d'étirement géométrique de mur : ${code}`);
    this.name = 'WallStretchError';
  }
}

/**
 * Interface abstraite d'un mur pour la détection géométrique de connectivité.
 */
export interface WallLike {
  readonly id: string;
  readonly start: Vec2;
  readonly end: Vec2;
  readonly levelId?: string;
}

/**
 * Voisin connecté détecté avec sa qualification topologique.
 */
export interface ConnectedNeighbor {
  readonly wallId: string;
  readonly neighbor: WallLike;
  readonly connection: 'endpoint-start' | 'endpoint-end' | 'mid';
}

/**
 * Calcule l'étirement élastique d'un mur voisin suite au déplacement d'un mur connecté.
 *
 * Conforme à l'ADR-044 :
 * - Option α (Revit-like) pour les extrémités : P' = P_A + Δ, l'autre extrémité reste ancrée.
 * - Intersection de droites directrices pour les connexions en T au corps (mid).
 * - Garde-fous : WALL_STRETCH_PARALLEL (|sin θ| < 0.05 en mid), COLLAPSE (< 100 mm si raccourci), REVERSED (inversion d'axe).
 */
export function computeWallStretch(input: WallStretchInput): WallStretchResult {
  const { movedWall, delta, neighbor, connection } = input;

  const B0 = neighbor.start;
  const B1 = neighbor.end;

  let newStart: Vec2;
  let newEnd: Vec2;

  if (connection === 'endpoint-start') {
    newStart = add(B0, delta);
    newEnd = B1;
  } else if (connection === 'endpoint-end') {
    newStart = B0;
    newEnd = add(B1, delta);
  } else {
    // Connexion en T au milieu ('mid')
    // Déterminer quelle extrémité de neighbor s'appuie sur movedWall
    const movedSeg = { start: movedWall.start, end: movedWall.end };
    const dist0 = distancePointToSegment(B0, movedSeg);
    const dist1 = distancePointToSegment(B1, movedSeg);

    const isStartIncident = dist0 <= dist1;

    // Vecteur directeur de neighbor
    const vB = sub(B1, B0);
    const uB = normalize(vB);

    // Droite du mur déplacé post-translation
    const movedStartPrime = add(movedWall.start, delta);
    const movedEndPrime = add(movedWall.end, delta);
    const vA = sub(movedEndPrime, movedStartPrime);
    const uA = normalize(vA);

    // Garde-fou quasi-parallélisme (|sin θ| < 0.05)
    const sinTheta = cross2d(uB, uA);
    if (Math.abs(sinTheta) < 0.05) {
      throw new WallStretchError(
        'WALL_STRETCH_PARALLEL',
        `Intersection en T quasi-parallèle (|sin θ| = ${Math.abs(sinTheta).toFixed(4)} < 0.05).`,
      );
    }

    // Calcul de l'intersection de droites infinies D_B ∩ D_A'
    // D_B(t) = B0 + t * vB
    // (B0 + t * vB - movedStartPrime) × uA = 0
    const denom = cross2d(vB, uA);
    const numer = cross2d(sub(movedStartPrime, B0), uA);
    const t = numer / denom;
    const intersectionPoint = add(B0, mul(vB, t));

    if (isStartIncident) {
      newStart = intersectionPoint;
      newEnd = B1;
    } else {
      newStart = B0;
      newEnd = intersectionPoint;
    }
  }

  // Vérification des garde-fous sur le nouveau voisin étiré
  const vOld = sub(B1, B0);
  const lenOld = length(vOld);

  const vNew = sub(newEnd, newStart);
  const lenNew = length(vNew);

  // 1. Garde-fou REVERSED : inversion de direction axiale
  const orientationDot = dot(vNew, vOld);
  if (orientationDot <= GEOM_CONFIG.EPSILON_NUMERICAL) {
    throw new WallStretchError(
      'WALL_STRETCH_REVERSED',
      "L'orientation axiale du mur s'est inversée lors de l'étirement.",
    );
  }

  // 2. Garde-fou COLLAPSE : longueur < 100 mm ET raccourcissement
  if (lenNew < 100.0 && lenNew < lenOld - GEOM_CONFIG.EPSILON_DISTANCE) {
    throw new WallStretchError(
      'WALL_STRETCH_COLLAPSE',
      `Le mur s'est effondré sous 100 mm (nouvelle longueur : ${lenNew.toFixed(1)} mm, initiale : ${lenOld.toFixed(1)} mm).`,
    );
  }

  const deltaStart = sub(newStart, B0);
  const deltaEnd = sub(newEnd, B1);

  return {
    newNeighborEndpoints: {
      start: newStart,
      end: newEnd,
    },
    deltaStart,
    deltaEnd,
  };
}

/**
 * Projette une abscisse curviligne offsetAlong sur un mur étiré/pivoté (Option β d'ADR-044).
 *
 * Calcule la position spatiale monde initiale M, puis la projette orthogonalement
 * sur le nouvel axe orienté [newWall.start, newWall.end].
 * En l'absence de rotation, se réduit rigoureusement à : offsetAlong - deltaL_start.
 */
export function projectOpeningOffset(
  oldOffsetAlong: number,
  oldWall: { readonly start: Vec2; readonly end: Vec2 },
  newWall: { readonly start: Vec2; readonly end: Vec2 },
): number {
  const oldVec = sub(oldWall.end, oldWall.start);
  const oldLen = length(oldVec);
  if (oldLen <= GEOM_CONFIG.EPSILON_DISTANCE) {
    return oldOffsetAlong;
  }
  const oldDir = vec2(oldVec.x / oldLen, oldVec.y / oldLen);

  // Position spatiale monde d'origine de la baie
  const worldPos = add(oldWall.start, mul(oldDir, oldOffsetAlong));

  // Vecteur et direction du nouveau mur
  const newVec = sub(newWall.end, newWall.start);
  const newLen = length(newVec);
  if (newLen <= GEOM_CONFIG.EPSILON_DISTANCE) {
    return oldOffsetAlong;
  }
  const newDir = vec2(newVec.x / newLen, newVec.y / newLen);

  // Projection orthogonale sur le nouvel axe depuis newWall.start
  return dot(sub(worldPos, newWall.start), newDir);
}

/**
 * Détecte les murs voisins connectés à un mur donné selon les tolérances topologiques.
 *
 * Gère rigoureusement :
 * - Les jonctions d'extrémités (L, L-bout-à-bout, colinéaires).
 * - Les jonctions en T au corps du mur.
 * - Les carrefours en X (Précision 3 : filtre le mur colinéaire opposé, seuls les 2 voisins transversaux adjacents suivent).
 */
export function findConnectedWalls(
  targetWall: WallLike,
  allWalls: readonly WallLike[],
  tolerance = 1.0,
): readonly ConnectedNeighbor[] {
  const targetSeg = { start: targetWall.start, end: targetWall.end };
  const targetLen = distance(targetWall.start, targetWall.end);
  if (targetLen <= GEOM_CONFIG.EPSILON_DISTANCE) {
    return [];
  }

  const candidates: Array<{
    wall: WallLike;
    connection: 'endpoint-start' | 'endpoint-end' | 'mid';
    sharedPoint: Vec2;
  }> = [];

  for (const w of allWalls) {
    if (w.id === targetWall.id) continue;
    if (targetWall.levelId && w.levelId && targetWall.levelId !== w.levelId) {
      continue;
    }

    // 1. Vérifier coïncidence des extrémités
    const dStartStart = distance(w.start, targetWall.start);
    const dStartEnd = distance(w.start, targetWall.end);
    const dEndStart = distance(w.end, targetWall.start);
    const dEndEnd = distance(w.end, targetWall.end);

    if (dStartStart <= tolerance) {
      candidates.push({ wall: w, connection: 'endpoint-start', sharedPoint: targetWall.start });
    } else if (dStartEnd <= tolerance) {
      candidates.push({ wall: w, connection: 'endpoint-start', sharedPoint: targetWall.end });
    } else if (dEndStart <= tolerance) {
      candidates.push({ wall: w, connection: 'endpoint-end', sharedPoint: targetWall.start });
    } else if (dEndEnd <= tolerance) {
      candidates.push({ wall: w, connection: 'endpoint-end', sharedPoint: targetWall.end });
    } else {
      // 2. Vérifier connexion en T (mid)
      const dStartBody = distancePointToSegment(w.start, targetSeg);
      const dEndBody = distancePointToSegment(w.end, targetSeg);

      if (dStartBody <= tolerance) {
        candidates.push({ wall: w, connection: 'mid', sharedPoint: w.start });
      } else if (dEndBody <= tolerance) {
        candidates.push({ wall: w, connection: 'mid', sharedPoint: w.end });
      }
    }
  }

  // Filtrage des carrefours en X (Précision 3 d'ADR-044) :
  // Si plusieurs murs partagent le même sommet d'extrémité, identifier s'il s'agit d'un X
  // où un mur opposé colinéaire continue tout droit.
  const result: ConnectedNeighbor[] = [];

  for (const c of candidates) {
    if (c.connection === 'mid') {
      result.push({ wallId: c.wall.id, neighbor: c.wall, connection: 'mid' });
      continue;
    }

    // Pour les connexions d'extrémités, vérifier si c est opposé colinéaire dans un carrefour ≥ 4 branches
    const wallsAtSharedPoint = candidates.filter(
      (other) =>
        other.connection !== 'mid' && distance(other.sharedPoint, c.sharedPoint) <= tolerance,
    );

    if (wallsAtSharedPoint.length >= 3) {
      // Total de 4 murs concourants (targetWall + au moins 3 candidats)
      // Calculer le vecteur directeur de c au nœud partagé
      const isStartAtNode = distance(c.wall.start, c.sharedPoint) <= tolerance;
      const cVecFromNode = isStartAtNode
        ? sub(c.wall.end, c.wall.start)
        : sub(c.wall.start, c.wall.end);
      const cDirFromNode = normalize(cVecFromNode);

      // Vecteur directeur de targetWall arrivant au nœud partagé
      const isTargetStartAtNode = distance(targetWall.start, c.sharedPoint) <= tolerance;
      const targetVecToNode = isTargetStartAtNode
        ? sub(targetWall.start, targetWall.end)
        : sub(targetWall.end, targetWall.start);
      const targetDirToNode = normalize(targetVecToNode);

      // Dans un X, le mur opposé continue dans la même direction (cDirFromNode · targetDirToNode ≈ 1)
      const alignment = dot(cDirFromNode, targetDirToNode);
      if (alignment > 0.95) {
        // Mur opposé dans la croix : il ne suit pas le déplacement direct de targetWall
        continue;
      }
    }

    result.push({ wallId: c.wall.id, neighbor: c.wall, connection: c.connection });
  }

  return result;
}
