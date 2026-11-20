/**
 * Normalisation des coordonnées spatiales des géométries IFC vers le repère Z-up Mini-BIM.
 * Conforme à ADR-003.
 *
 * WebIFC projette par défaut les coordonnées dans le repère Three.js standard Y-up.
 * Mini-BIM utilise une convention d'architecture stricte : Z est l'axe vertical (altimétrie),
 * et XY est le plan horizontal.
 *
 * Formule de bascule :
 *   X_mini = X_web * scaleToMm
 *   Y_mini = -Z_web * scaleToMm
 *   Z_mini = Y_web * scaleToMm
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Transforme un sommet local par la matrice 4x4 column-major de WebIFC et convertit vers le repère Mini-BIM en millimètres.
 */
export function transformVertexToMiniBim(
  lx: number,
  ly: number,
  lz: number,
  m: ArrayLike<number>,
  scaleToMm: number,
): Vec3 {
  // Multiplication matricielle column-major
  const m0 = m[0] ?? 0;
  const m1 = m[1] ?? 0;
  const m2 = m[2] ?? 0;
  const m4 = m[4] ?? 0;
  const m5 = m[5] ?? 0;
  const m6 = m[6] ?? 0;
  const m8 = m[8] ?? 0;
  const m9 = m[9] ?? 0;
  const m10 = m[10] ?? 0;
  const m12 = m[12] ?? 0;
  const m13 = m[13] ?? 0;
  const m14 = m[14] ?? 0;

  const wx = m0 * lx + m4 * ly + m8 * lz + m12;
  const wy = m1 * lx + m5 * ly + m9 * lz + m13;
  const wz = m2 * lx + m6 * ly + m10 * lz + m14;

  const rx = wx * scaleToMm;
  const ry = -wz * scaleToMm;
  const rz = wy * scaleToMm;

  return {
    x: Math.abs(rx) < 1e-12 ? 0 : rx,
    y: Math.abs(ry) < 1e-12 ? 0 : ry,
    z: Math.abs(rz) < 1e-12 ? 0 : rz,
  };
}

/**
 * Transforme un vecteur normal par la partie rotationnelle de la matrice 4x4 et convertit vers le repère Mini-BIM.
 */
export function transformNormalToMiniBim(
  lnx: number,
  lny: number,
  lnz: number,
  m: ArrayLike<number>,
): Vec3 {
  const m0 = m[0] ?? 0;
  const m1 = m[1] ?? 0;
  const m2 = m[2] ?? 0;
  const m4 = m[4] ?? 0;
  const m5 = m[5] ?? 0;
  const m6 = m[6] ?? 0;
  const m8 = m[8] ?? 0;
  const m9 = m[9] ?? 0;
  const m10 = m[10] ?? 0;

  const wnx = m0 * lnx + m4 * lny + m8 * lnz;
  const wny = m1 * lnx + m5 * lny + m9 * lnz;
  const wnz = m2 * lnx + m6 * lny + m10 * lnz;

  // Conversion Y-up -> Z-up
  const nx = Math.abs(wnx) < 1e-12 ? 0 : wnx;
  const ny = Math.abs(wnz) < 1e-12 ? 0 : -wnz;
  const nz = Math.abs(wny) < 1e-12 ? 0 : wny;

  const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (len > 1e-6) {
    const rx = nx / len;
    const ry = ny / len;
    const rz = nz / len;
    return {
      x: Math.abs(rx) < 1e-12 ? 0 : rx,
      y: Math.abs(ry) < 1e-12 ? 0 : ry,
      z: Math.abs(rz) < 1e-12 ? 0 : rz,
    };
  }
  return { x: 0, y: 0, z: 1 };
}
