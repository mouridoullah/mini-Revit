import { GEOM_CONFIG } from './constants.js';
import { type Vec2, sub, length, perp, add, mul, normalize } from './vec2.js';
import { type Segment2, segment2 } from './segment.js';

/**
 * Position de la ligne de justification / référence par rapport au corps du mur :
 * - 'center' : l'axe géométrique se situe au centre exact de l'épaisseur du mur.
 * - 'exterior' : l'axe géométrique se situe sur la face extérieure (+n) ; le mur s'épaissit vers l'intérieur.
 * - 'interior' : l'axe géométrique se situe sur la face intérieure (-n) ; le mur s'épaissit vers l'extérieur.
 */
export type LocationLine = 'center' | 'exterior' | 'interior';

/**
 * Paramètres nécessaires au calcul de l'emprise 2D d'un mur isolé.
 */
export interface WallGeometryInput {
  readonly start: Vec2;
  readonly end: Vec2;
  readonly thickness: number; // Épaisseur en millimètres (> 0)
  readonly locationLine: LocationLine;
}

/**
 * Résultat du calcul de l'emprise 2D d'un mur droit isolé.
 */
export interface WallFootprint2D {
  /**
   * Les 4 sommets formant le polygone d'emprise rectangulaire, ordonnés dans le sens
   * trigonométrique anti-horaire (CCW) : [V0, V1, V2, V3].
   * - V0 : Coin de départ côté intérieur (-n)
   * - V1 : Coin d'arrivée côté intérieur (-n)
   * - V2 : Coin d'arrivée côté extérieur (+n)
   * - V3 : Coin de départ côté extérieur (+n)
   */
  readonly vertices: readonly [Vec2, Vec2, Vec2, Vec2];

  /**
   * Segment de la face extérieure (+n).
   */
  readonly exteriorFace: Segment2;

  /**
   * Segment de la face intérieure (-n).
   */
  readonly interiorFace: Segment2;

  /**
   * Segment de l'axe central réel du corps du mur.
   */
  readonly centerAxis: Segment2;

  /**
   * Vecteur directeur unitaire orienté de start vers end.
   */
  readonly direction: Vec2;

  /**
   * Normale unitaire gauche (+90° par rapport à direction), pointant vers l'extérieur.
   */
  readonly normal: Vec2;

  /**
   * Longueur nominale de l'axe de référence du mur (en mm).
   */
  readonly length: number;

  /**
   * Épaisseur nominale du mur (en mm).
   */
  readonly thickness: number;

  /**
   * Décalage scalaire de la face intérieure le long de la normale (mm).
   */
  readonly interiorOffset: number;

  /**
   * Décalage scalaire de la face extérieure le long de la normale (mm).
   */
  readonly exteriorOffset: number;
}

/**
 * Calcule l'emprise 2D (footprint) d'un mur droit isolé avec gestion de la ligne de référence.
 *
 * @throws {RangeError} Si l'épaisseur est inférieure ou égale à zéro ou non finie.
 * @throws {RangeError} Si la longueur du mur est inférieure ou égale au seuil de dégénérescence.
 */
export function computeWallFootprint2d(input: WallGeometryInput): WallFootprint2D {
  const { start, end, thickness, locationLine } = input;

  if (!Number.isFinite(thickness) || thickness <= 0) {
    throw new RangeError(
      `L'épaisseur du mur doit être un nombre strictement positif (reçu : ${thickness})`,
    );
  }

  const axisVector = sub(end, start);
  const wallLength = length(axisVector);

  if (wallLength <= GEOM_CONFIG.EPSILON_DISTANCE) {
    throw new RangeError(
      `La longueur du mur (${wallLength.toFixed(6)} mm) est inférieure ou égale au seuil de dégénérescence (${GEOM_CONFIG.EPSILON_DISTANCE} mm)`,
    );
  }

  const direction = normalize(axisVector);
  const normal = perp(direction);

  // Calcul des décalages signés le long de la normale unitaire gauche
  let interiorOffset: number;
  let exteriorOffset: number;

  switch (locationLine) {
    case 'center':
      interiorOffset = -thickness / 2;
      exteriorOffset = thickness / 2;
      break;
    case 'exterior':
      // L'axe est sur la face extérieure (+n) ; le corps se développe vers l'intérieur (-n)
      interiorOffset = -thickness;
      exteriorOffset = 0;
      break;
    case 'interior':
      // L'axe est sur la face intérieure (-n) ; le corps se développe vers l'extérieur (+n)
      interiorOffset = 0;
      exteriorOffset = thickness;
      break;
    default: {
      const _exhaustiveCheck: never = locationLine;
      throw new Error(`LocationLine non supportée : ${_exhaustiveCheck}`);
    }
  }

  // Calcul des 4 sommets du contour rectangulaire (ordre CCW)
  const v0 = add(start, mul(normal, interiorOffset));
  const v1 = add(end, mul(normal, interiorOffset));
  const v2 = add(end, mul(normal, exteriorOffset));
  const v3 = add(start, mul(normal, exteriorOffset));

  // Axes et faces caractéristiques
  const centerScalar = (interiorOffset + exteriorOffset) / 2;
  const centerStart = add(start, mul(normal, centerScalar));
  const centerEnd = add(end, mul(normal, centerScalar));

  const interiorFace = segment2(v0, v1);
  const exteriorFace = segment2(v3, v2);
  const centerAxis = segment2(centerStart, centerEnd);

  return {
    vertices: [v0, v1, v2, v3],
    interiorFace,
    exteriorFace,
    centerAxis,
    direction,
    normal,
    length: wallLength,
    thickness,
    interiorOffset,
    exteriorOffset,
  };
}
