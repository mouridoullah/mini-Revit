import { GEOM_CONFIG, MIN_OPENING_CLEARANCE } from '../constants.js';
import { type Vec2, add, mul, sub, normalize, distance } from '../vec2.js';
import { signedArea, clipPolygonWithHalfPlane } from '../polygon.js';
import { type OpeningInput, type WallPiece, type WallPieceRole } from './types.js';
import { assertValidOpenings } from './validate.js';

/**
 * Définition d'un mur hôte pour le découpage d'ouvertures.
 */
export interface SlicingWallInput {
  readonly id: string;
  readonly start: Vec2;
  readonly end: Vec2;
  readonly thickness: number;
  readonly height: number;
  /**
   * Polygone 2D d'emprise du mur (résolu par le moteur de jonctions ou nominal).
   * Doit être orienté CCW et étanche.
   */
  readonly polygon: readonly Vec2[];
}

/**
 * Résultat complet du découpage 2.5D d'un mur percé.
 */
export interface SlicedWallResult {
  readonly wallId: string;
  readonly pieces: readonly WallPiece[];
  /**
   * Aire 2D totale du contour du mur hôte (mm²).
   */
  readonly totalArea2D: number;
  /**
   * Volume théorique plein du mur sans ouvertures (mm³).
   */
  readonly wallVolume: number;
  /**
   * Volume cumulé de matière pleine des pièces extrudées (mm³).
   */
  readonly solidVolume: number;
  /**
   * Volume cumulé des réservations de vides d'ouvertures (mm³).
   */
  readonly voidVolume: number;
}

/**
 * Découpe un mur hôte 2D en tranches paramétriques 2.5D (Sutherland-Hodgman)
 * selon une liste d'ouvertures (portes et fenêtres).
 *
 * Complexité algorithmique : O(k · m)
 * où :
 * - k est le nombre d'ouvertures hébergées par le mur.
 * - m est le nombre de sommets du polygone résolu du mur.
 *
 * Propriété fondamentale de partition :
 * - La somme des aires 2D des tranches le long de l'axe est identiquement égale à l'aire 2D du mur hôte.
 * - Volume(solides) = Volume(mur) - Volume(vides) à ±1e-6 mm³ près.
 *
 * @param wall Mur hôte avec son polygone résolu et sa hauteur
 * @param openings Liste des ouvertures paramétriques sur ce mur
 * @param minClearance Garde minimale exigée aux extrémités et entre baies (par défaut 50 mm)
 */
export function sliceWallWithOpenings(
  wall: SlicingWallInput,
  openings: readonly OpeningInput[],
  minClearance: number = MIN_OPENING_CLEARANCE,
): SlicedWallResult {
  const wallVec = sub(wall.end, wall.start);
  const wallLength = distance(wall.start, wall.end);

  if (wallLength <= GEOM_CONFIG.EPSILON_DISTANCE) {
    throw new RangeError(
      `Impossible de découper un mur de longueur nulle ou dégénérée : "${wall.id}" (${wallLength} mm)`,
    );
  }

  if (wall.height <= 0 || !Number.isFinite(wall.height)) {
    throw new RangeError(
      `Hauteur de mur invalide pour "${wall.id}" : ${wall.height} mm (doit être > 0)`,
    );
  }

  const wallDir = normalize(wallVec);
  const totalArea2D = Math.abs(signedArea(wall.polygon));
  const wallVolume = totalArea2D * wall.height;

  // Si aucune ouverture n'est présente, renvoie une tranche unique pleine hauteur
  if (openings.length === 0) {
    const singlePiece: WallPiece = {
      id: `${wall.id}_piece_0`,
      wallId: wall.id,
      poly2D: wall.polygon,
      z0: 0,
      z1: wall.height,
      role: 'full',
      area2D: totalArea2D,
      uInterval: [0, wallLength],
    };

    return {
      wallId: wall.id,
      pieces: [singlePiece],
      totalArea2D,
      wallVolume,
      solidVolume: wallVolume,
      voidVolume: 0,
    };
  }

  // 1. Validation stricte de toutes les ouvertures
  assertValidOpenings(openings, wallLength, wall.height, minClearance);

  // 2. Tri des ouvertures par position de début uStart croissant
  const sorted = [...openings].sort((a, b) => a.u - a.width / 2 - (b.u - b.width / 2));

  const pieces: WallPiece[] = [];
  const k = sorted.length;

  // Fonction utilitaire pour instancier un WallPiece
  const addPiece = (
    poly: readonly Vec2[],
    z0: number,
    z1: number,
    role: WallPieceRole,
    uInterval: readonly [number, number],
    openingId?: string,
  ) => {
    if (poly.length < 3 || z1 <= z0) return;
    const area = Math.abs(signedArea(poly));
    if (area <= GEOM_CONFIG.EPSILON_DISTANCE_SQUARED) return;

    pieces.push({
      id: `${wall.id}_piece_${pieces.length}`,
      wallId: wall.id,
      poly2D: poly,
      z0,
      z1,
      role,
      area2D: area,
      uInterval,
      openingId,
    });
  };

  // Vecteur inverse pour demi-plan u <= u_cut
  const negWallDir = mul(wallDir, -1);

  // 3. Tranche pleine hauteur initiale (avant la première ouverture)
  const firstOp = sorted[0];
  if (!firstOp)
    return { wallId: wall.id, pieces: [], totalArea2D, wallVolume, solidVolume: 0, voidVolume: 0 };
  const firstUStart = firstOp.u - firstOp.width / 2;
  const pCutFirst = add(wall.start, mul(wallDir, firstUStart));
  const polyFirstFull = clipPolygonWithHalfPlane(wall.polygon, pCutFirst, negWallDir);

  addPiece(polyFirstFull, 0, wall.height, 'full', [0, firstUStart]);

  // 4. Parcours des ouvertures et des tranches intermédiaires
  for (let i = 0; i < k; i++) {
    const op = sorted[i];
    if (!op) continue;
    const uStart = op.u - op.width / 2;
    const uEnd = op.u + op.width / 2;

    const pStart = add(wall.start, mul(wallDir, uStart));
    const pEnd = add(wall.start, mul(wallDir, uEnd));

    // Découpage du polygone 2D de la bande de l'ouverture [uStart, uEnd]
    const step1 = clipPolygonWithHalfPlane(wall.polygon, pStart, wallDir);
    const polyOpeningBand = clipPolygonWithHalfPlane(step1, pEnd, negWallDir);

    // 4.a Sous-tranche Allège (Sill) si sillZ > 0
    if (op.sillZ > GEOM_CONFIG.EPSILON_DISTANCE) {
      addPiece(polyOpeningBand, 0, op.sillZ, 'sill', [uStart, uEnd], op.id);
    }

    // 4.b Réservation du Vide (Void)
    const lintelZ = op.sillZ + op.height;
    addPiece(polyOpeningBand, op.sillZ, lintelZ, 'void', [uStart, uEnd], op.id);

    // 4.c Sous-tranche Linteau (Lintel) si lintelZ < wallHeight
    if (lintelZ < wall.height - GEOM_CONFIG.EPSILON_DISTANCE) {
      addPiece(polyOpeningBand, lintelZ, wall.height, 'lintel', [uStart, uEnd], op.id);
    }

    // 4.d Tranche pleine hauteur intermédiaire entre op[i] et op[i+1]
    if (i < k - 1) {
      const nextOp = sorted[i + 1];
      if (nextOp) {
        const nextUStart = nextOp.u - nextOp.width / 2;

        const pNextStart = add(wall.start, mul(wallDir, nextUStart));
        const stepInter = clipPolygonWithHalfPlane(wall.polygon, pEnd, wallDir);
        const polyInter = clipPolygonWithHalfPlane(stepInter, pNextStart, negWallDir);

        addPiece(polyInter, 0, wall.height, 'full', [uEnd, nextUStart]);
      }
    }
  }

  // 5. Tranche pleine hauteur finale (après la dernière ouverture)
  const lastOp = sorted[k - 1];
  if (lastOp) {
    const lastUEnd = lastOp.u + lastOp.width / 2;
    const pCutLast = add(wall.start, mul(wallDir, lastUEnd));
    const polyLastFull = clipPolygonWithHalfPlane(wall.polygon, pCutLast, wallDir);

    addPiece(polyLastFull, 0, wall.height, 'full', [lastUEnd, wallLength]);
  }

  // 6. Calcul des bilans volumiques
  let solidVolume = 0;
  let voidVolume = 0;

  for (const p of pieces) {
    const vol = p.area2D * (p.z1 - p.z0);
    if (p.role === 'void') {
      voidVolume += vol;
    } else {
      solidVolume += vol;
    }
  }

  return {
    wallId: wall.id,
    pieces,
    totalArea2D,
    wallVolume,
    solidVolume,
    voidVolume,
  };
}
