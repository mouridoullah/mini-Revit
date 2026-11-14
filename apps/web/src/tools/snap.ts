import { type Vec2 } from '@mini-bim/view-2d';

const SQRT2_OVER_2 = Math.SQRT2 / 2;

/**
 * Vecteurs unitaires précalculés pour les 8 directions cardinales et semi-cardinales (multiples de 45°).
 * Garantit une précision absolue (exactement 0 sur les composantes orthogonales)
 * sans perturbation par les imprécisions de calcul flottant de Math.sin / Math.cos.
 */
const SNAP_DIRECTIONS: readonly (readonly [number, number])[] = [
  [1, 0], // 0° (Est, +X)
  [SQRT2_OVER_2, SQRT2_OVER_2], // 45° (Nord-Est)
  [0, 1], // 90° (Nord, +Y)
  [-SQRT2_OVER_2, SQRT2_OVER_2], // 135° (Nord-Ouest)
  [-1, 0], // 180° (Ouest, -X)
  [-SQRT2_OVER_2, -SQRT2_OVER_2], // 225° (Sud-Ouest)
  [0, -1], // 270° (Sud, -Y)
  [SQRT2_OVER_2, -SQRT2_OVER_2], // 315° (Sud-Est)
];

/**
 * Projette le point `current` sur le multiple de 45° le plus proche par rapport à `start`,
 * tout en conservant rigoureusement la distance euclidienne (longueur du segment).
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
