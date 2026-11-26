/**
 * mesh-generator/mep/cable-trays — Chemins de câbles 3D métalliques profilés en U haute fidélité
 *
 * Intègre :
 * - Profilé en U métallique (semelle inférieure + ailes latérales ajourées)
 * - Échelons transversaux d'échelle à câbles
 * - Bords roulés de sécurité sur les rives supérieures
 * - Nappes de câbles électriques réalistes (courants forts et courants faibles) reposant sur les barreaux
 */

import type { RawMeshData } from '@tabax/geometry';
import type { CableTrayGeometryParams } from '../types.js';
import { RawMeshAccumulator, v3, add, sub, scale, cross, len, normalize, type Vec3D } from './common.js';
import { MEP_SYSTEM_COLORS } from './colors.js';
import {
  composeMatrix4,
  type MepAssembly3D,
  type MepAssemblyPart,
  type MepInstanceAnchor,
} from './assembly-types.js';
import { UvMeshAccumulator } from './primitives.js';
import {
  buildSafeFrame,
  computeIntervalOffsets,
  isHorizontalRun,
  pushPartIfNonEmpty,
  type MepAssemblyOptions,
} from './assembly-builder-helpers.js';

export function createCableTrayAssembly3D(
  tray: CableTrayGeometryParams,
  options?: MepAssemblyOptions,
): MepAssembly3D {
  const isLod350 = (options?.detailLevel ?? 'lod350') === 'lod350';
  const style = tray.style ?? 'ladder';
  const parts: MepAssemblyPart[] = [];
  const instances: MepInstanceAnchor[] = [];

  const p1 = v3(tray.start.x, tray.start.y, tray.start.z);
  const p2 = v3(tray.end.x, tray.end.y, tray.end.z);
  const dir = sub(p2, p1);
  const l = len(dir);

  if (l > 1e-4) {
    const { axis, u, v } = buildSafeFrame(dir);
    const horizontal = isHorizontalRun(axis);
    const width = Math.max(40, tray.width);
    const height = Math.max(20, tray.height);
    const wallThick = 4;

    const steelAcc = new UvMeshAccumulator();
    const hwAcc = new UvMeshAccumulator();
    const cfoAcc = new UvMeshAccumulator();
    const cfaAcc = new UvMeshAccumulator();
    const earthAcc = new UvMeshAccumulator();

    const mid = scale(add(p1, p2), 0.5);

    if (style === 'perforated') {
      // Profilé U chanfreiné à bords roulés 12 mm + fond perforé texturé par nervures
      steelAcc.addBeveledBox(
        add(mid, scale(v, wallThick * 0.5)),
        width,
        l,
        wallThick,
        u,
        axis,
        v,
        1.2,
      );
      for (const sx of [-1, 1]) {
        const railOffset = scale(u, sx * (width * 0.5 - wallThick * 0.5));
        steelAcc.addBeveledBox(
          add(add(mid, railOffset), scale(v, height * 0.5)),
          wallThick,
          l,
          height,
          u,
          axis,
          v,
          1.2,
        );
        // Bord roulé de sécurité 12 mm
        steelAcc.addBeveledBox(
          add(add(mid, railOffset), scale(v, height)),
          12,
          l,
          wallThick,
          u,
          axis,
          v,
          1.2,
        );
      }
      // Éclisses d'aboutement boulonnées aux extrémités si tronçon suffisant
      if (l >= 150) {
        for (const endPt of [add(p1, scale(axis, 24)), add(p2, scale(axis, -24))]) {
          for (const sx of [-1, 1]) {
            const spPos = add(endPt, add(scale(u, sx * (width * 0.5 + 1.5)), scale(v, height * 0.5)));
            hwAcc.addBeveledBox(spPos, 3, 44, height * 0.72, u, axis, v, 0.8);
            if (isLod350) {
              instances.push({
                prototypeKey: 'bolt_m10',
                matrix: composeMatrix4(spPos, axis, v, scale(u, sx)),
                materialRole: 'zinc_hardware',
              });
            }
          }
        }
      }
    } else {
      // Échelle à câbles : 2 montants en C chanfreinés (25 x H mm) + barreaux instanciés
      for (const sx of [-1, 1]) {
        const railPos = add(mid, add(scale(u, sx * (width * 0.5 - 6)), scale(v, height * 0.5)));
        steelAcc.addBeveledBox(railPos, 12, l, height, u, axis, v, 1.5);
        steelAcc.addBeveledBox(
          add(mid, add(scale(u, sx * (width * 0.5 - 12)), scale(v, 2))),
          25,
          l,
          4,
          u,
          axis,
          v,
          1,
        );
        steelAcc.addBeveledBox(
          add(mid, add(scale(u, sx * (width * 0.5 - 12)), scale(v, height - 2))),
          25,
          l,
          4,
          u,
          axis,
          v,
          1,
        );
      }

      if (l >= 150) {
        for (const offset of computeIntervalOffsets(l, 300, 150, 60)) {
          const rungCenter = add(p1, add(scale(axis, offset), scale(v, 6)));
          instances.push({
            prototypeKey: 'ladder_rung',
            matrix: composeMatrix4(rungCenter, u, axis, v, v3(Math.max(20, width - 20), 1, 1)),
            materialRole: 'galvanized_steel',
          });
        }
      }
    }

    // Pendards verticaux sur chemins horizontaux
    if (isLod350 && horizontal) {
      for (const offset of computeIntervalOffsets(l, 1200, 450, 160)) {
        const hc = add(p1, scale(axis, offset));
        for (const sx of [-1, 1]) {
          instances.push({
            prototypeKey: 'threaded_rod',
            matrix: composeMatrix4(
              add(hc, add(scale(u, sx * (width * 0.5 + 10)), v3(0, 0, height))),
              v3(1, 0, 0),
              v3(0, 1, 0),
              v3(0, 0, 1),
              v3(1, 1, 160),
            ),
            materialRole: 'zinc_hardware',
          });
        }
      }
    }

    // 3 nappes de câbles distinctes (CFO, CFA, Terre)
    if (l >= 100) {
      const zBase = wallThick + 14;
      const cfoOff = add(scale(u, -width * 0.22), scale(v, zBase));
      cfoAcc.addSmoothCylinder(add(p1, cfoOff), add(p2, cfoOff), 8, 12, true);

      const cfaOff = add(scale(u, width * 0.22), scale(v, zBase - 2));
      cfaAcc.addSmoothCylinder(add(p1, cfaOff), add(p2, cfaOff), 6, 12, true);

      const earthOff = scale(v, zBase - 4);
      earthAcc.addSmoothCylinder(add(p1, earthOff), add(p2, earthOff), 4, 12, true);
    }

    pushPartIfNonEmpty(parts, steelAcc, tray.id, 'galvanized_steel');
    pushPartIfNonEmpty(parts, hwAcc, tray.id, 'zinc_hardware');
    pushPartIfNonEmpty(parts, cfoAcc, tray.id, 'cable_cfo');
    pushPartIfNonEmpty(parts, cfaAcc, tray.id, 'cable_cfa');
    pushPartIfNonEmpty(parts, earthAcc, tray.id, 'cable_earth');
  }

  return {
    elementId: tray.id,
    category: 'cableTray',
    systemType: tray.systemType ?? 'power',
    domain: 'electrical',
    parts,
    instances,
  };
}

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

    // Rebord de sécurité supérieur gauche (bord roulé)
    const leftRimP1 = add(add(p1, leftOffset), scale(v, height));
    const leftRimP2 = add(add(p2, leftOffset), scale(v, height));
    acc.addBoxAlongAxis(leftRimP1, leftRimP2, wallThick * 2, wallThick, true);

    // 3. Aile droite (flange verticale)
    const rightOffset = scale(u, width / 2 - wallThick / 2);
    const rightP1 = add(add(p1, rightOffset), scale(v, height / 2));
    const rightP2 = add(add(p2, rightOffset), scale(v, height / 2));
    acc.addBoxAlongAxis(rightP1, rightP2, wallThick, height, true);

    // Rebord de sécurité supérieur droit (bord roulé)
    const rightRimP1 = add(add(p1, rightOffset), scale(v, height));
    const rightRimP2 = add(add(p2, rightOffset), scale(v, height));
    acc.addBoxAlongAxis(rightRimP1, rightRimP2, wallThick * 2, wallThick, true);

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

    // 5. Nappes de câbles réalistes posées sur les échelons le long du chemin
    if (l >= 100) {
      const cableZOffset = wallThick + 12;
      // Câble d'alimentation principal (CFO, Ø16 mm)
      const cfoOffset = scale(u, -width * 0.22);
      const cfo1 = add(add(p1, cfoOffset), scale(v, cableZOffset));
      const cfo2 = add(add(p2, cfoOffset), scale(v, cableZOffset));
      acc.addCylinder(cfo1, cfo2, 8, 12, true);

      // Câble courants faibles / communication (CFA, Ø12 mm)
      const cfaOffset = scale(u, width * 0.22);
      const cfa1 = add(add(p1, cfaOffset), scale(v, cableZOffset - 2));
      const cfa2 = add(add(p2, cfaOffset), scale(v, cableZOffset - 2));
      acc.addCylinder(cfa1, cfa2, 6, 12, true);

      // Câble de terre / liaison équipotentielle (Ø8 mm)
      const groundOffset = scale(u, 0);
      const g1 = add(add(p1, groundOffset), scale(v, cableZOffset - 4));
      const g2 = add(add(p2, groundOffset), scale(v, cableZOffset - 4));
      acc.addCylinder(g1, g2, 4, 12, true);
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
