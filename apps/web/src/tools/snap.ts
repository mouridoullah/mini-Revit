import { type Vec2 } from '@mini-bim/view-2d';

/**
 * Constante 1 / √2 (soit √2 / 2) en précision flottante 64 bits IEEE-754 (~1.11e-16).
 * Définie via la constante standard Math.SQRT1_2.
 */
const SQRT1_2 = Math.SQRT1_2;

/**
 * Vecteurs unitaires précalculés pour les 8 directions cardinales et semi-cardinales (multiples de 45°).
 * Garantit une précision absolue (exactement 0 sur les composantes orthogonales)
 * sans perturbation par les imprécisions de calcul flottant de Math.sin / Math.cos.
 */
const SNAP_DIRECTIONS: readonly (readonly [number, number])[] = [
  [1, 0], // 0° (Est, +X)
  [SQRT1_2, SQRT1_2], // 45° (Nord-Est)
  [0, 1], // 90° (Nord, +Y)
  [-SQRT1_2, SQRT1_2], // 135° (Nord-Ouest)
  [-1, 0], // 180° (Ouest, -X)
  [-SQRT1_2, -SQRT1_2], // 225° (Sud-Ouest)
  [0, -1], // 270° (Sud, -Y)
  [SQRT1_2, -SQRT1_2], // 315° (Sud-Est)
];

/**
 * Projette le point `current` sur le multiple de 45° le plus proche par rapport à `start`,
 * selon la stratégie de **longueur conservée** (rayon polaire euclidien préservé).
 *
 * Justification architecturale :
 * Dans les logiciels de CAO/BIM (AutoCAD, Revit), l'aimantation angulaire (polar/ortho snap)
 * préserve la distance curseur-origine `r = ||current - start||` tout en alignant la direction
 * sur le rayon polaire snappé : `start + r * dir_snapped`.
 * Une projection scalaire dot-product rétrécirait artificiellement le mur lors d'une déviation
 * angulaire de quelques degrés (ex: cos(1°) à 44° réduirait la longueur).
 *
 * Fonction PURE sans aucun effet secondaire.
 *
 * @param start Point d'origine du vecteur
 * @param current Point cible courant à aligner
 * @returns Nouveau point aligné à un multiple exact de 45°
 */
export function snapAngle45(start: Vec2, current: Vec2): Vec2 {
  const dx = current.x - start.x;
  const dy = current.y - start.y;
  const length = Math.hypot(dx, dy);

  if (length < 1e-9) {
    return { x: start.x, y: start.y };
  }

  const angle = Math.atan2(dy, dx);
  // Index du multiple de 45° le plus proche dans [-4, 4]
  const k = Math.round(angle / (Math.PI / 4));
  // Normalisation dans [0, 7]
  const normalizedIndex = ((k % 8) + 8) % 8;

  const dir = SNAP_DIRECTIONS[normalizedIndex];
  if (!dir) {
    return { x: current.x, y: current.y };
  }

  const [dirX, dirY] = dir;

  return {
    x: start.x + length * dirX,
    y: start.y + length * dirY,
  };
}

/**
 * Aligne une valeur sur un pas (step), avec arrondi au pair le plus proche (banker's rounding)
 * pour éliminer les biais d'arrondi sur les valeurs médianes (ex: 105 mm avec step 10 mm -> 100 mm).
 *
 * @param value Valeur flottante ou entière
 * @param step Pas d'alignement (ex: 50 pour 50 mm, 10 pour 10 mm)
 * @returns Valeur alignée sur le multiple de step le plus proche
 */
export function snapToStep(value: number, step: number): number {
  if (step <= 0) return value;
  const scaled = value / step;
  const floor = Math.floor(scaled);
  const diff = scaled - floor;
  let rounded: number;
  if (Math.abs(diff - 0.5) < 1e-9) {
    rounded = floor % 2 === 0 ? floor : floor + 1;
  } else {
    rounded = Math.round(scaled);
  }
  return rounded * step;
}

/**
 * Aligne un point monde sur le sommet existant le plus proche si la distance est <= maxDistance.
 */
export function snapToVertices(point: Vec2, vertices: readonly Vec2[], maxDistance: number): Vec2 {
  let closest: Vec2 | null = null;
  let minDistSq = maxDistance * maxDistance;

  for (const v of vertices) {
    const dx = v.x - point.x;
    const dy = v.y - point.y;
    const distSq = dx * dx + dy * dy;
    if (distSq <= minDistSq) {
      minDistSq = distSq;
      closest = v;
    }
  }

  return closest ?? point;
}
