/**
 * mesh-generator/mep/cable-trays — Chemins de câbles 3D métalliques profilés en U
 */

import type { RawMeshData } from '@tabax/geometry';
import type { CableTrayGeometryParams } from '../types.js';
import { RawMeshAccumulator, v3, add, sub, scale, cross, len, normalize, type Vec3D } from './common.js';
import { MEP_SYSTEM_COLORS } from './colors.js';

export function generateCableTrayMesh(tray: CableTrayGeometryParams): RawMeshData {
  const acc = new RawMeshAccumulator();
  const p1 = v3(tray.start.x, tray.start.y, tray.start.z);
  const p2 = v3(tray.end.x, tray.end.y, tray.end.z);
  const dir = sub(p2, p1);
  const l = len(dir);

  if (l > 1e-4) {
    const axis = normalize(dir);
    let u: Vec3D;
    let v: Vec3D;
    if (Math.abs(axis.z) > 0.99) {
      u = v3(1, 0, 0);
      v = v3(0, 1, 0);
    } else {
      u = normalize(cross(axis, v3(0, 0, 1)));
      v = cross(axis, u);
    }

    const width = Math.max(20, tray.width);
    const height = Math.max(10, tray.height);
    const wallThick = 4; // Épaisseur de paroi métallique du profilé en U

    // 1. Semelle de fondation (fond horizontal du U)
    const baseCenter1 = add(p1, scale(v, wallThick / 2));
    const baseCenter2 = add(p2, scale(v, wallThick / 2));
    acc.addBoxAlongAxis(baseCenter1, baseCenter2, width, wallThick, true);

    // 2. Aile gauche (flange verticale)
    const leftOffset = scale(u, -width / 2 + wallThick / 2);
    const leftP1 = add(add(p1, leftOffset), scale(v, height / 2));
    const leftP2 = add(add(p2, leftOffset), scale(v, height / 2));
    acc.addBoxAlongAxis(leftP1, leftP2, wallThick, height, true);

    // 3. Aile droite (flange verticale)
    const rightOffset = scale(u, width / 2 - wallThick / 2);
    const rightP1 = add(add(p1, rightOffset), scale(v, height / 2));
    const rightP2 = add(add(p2, rightOffset), scale(v, height / 2));
    acc.addBoxAlongAxis(rightP1, rightP2, wallThick, height, true);

    // 4. Barreaux transversaux (échelons de l'échelle à câbles tous les 300 mm)
    const rungSpacing = 300;
    const numRungs = Math.max(1, Math.floor(l / rungSpacing));
    const rungStep = l / (numRungs + 1);

    for (let i = 1; i <= numRungs; i++) {
      const dist = i * rungStep;
      const rungCenter = add(p1, scale(axis, dist));
      const rungP1 = add(add(rungCenter, scale(u, -width / 2 + wallThick)), scale(v, wallThick + 3));
      const rungP2 = add(add(rungCenter, scale(u, width / 2 - wallThick)), scale(v, wallThick + 3));
      acc.addBoxAlongAxis(rungP1, rungP2, 8, 8, true);
    }
  }

  const color = tray.color ?? MEP_SYSTEM_COLORS['power'] ?? '#f59e0b';

  return acc.toRawMeshData(tray.id, {
    elementId: tray.id,
    category: 'cableTray',
    levelId: tray.levelId,
    systemId: tray.systemId,
    color,
  });
}
