/**
 * mesh-generator/mep/ducts — Gaines aérauliques 3D haute fidélité (circulaires et rectangulaires)
 *
 * Intègre les cadres de brides transversales d'assemblage en tôle galvanisée
 * et manchons à lèvres d'étanchéité réguliers, respectant strictement les cotes AABB (ADR-072).
 */

import type { RawMeshData } from '@tabax/geometry';
import type { DuctGeometryParams } from '../types.js';
import { RawMeshAccumulator, v3, add, sub, scale, len, normalize } from './common.js';
import { getMepSystemColor } from './colors.js';
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

export function createDuctAssembly3D(
  duct: DuctGeometryParams,
  options?: MepAssemblyOptions,
): MepAssembly3D {
  const isLod350 = (options?.detailLevel ?? 'lod350') === 'lod350';
  const parts: MepAssemblyPart[] = [];
  const instances: MepInstanceAnchor[] = [];

  const p1 = v3(duct.start.x, duct.start.y, duct.start.z);
  const p2 = v3(duct.end.x, duct.end.y, duct.end.z);
  const dir = sub(p2, p1);
  const totalLength = len(dir);
  const fluidColor = duct.color ?? getMepSystemColor(duct.systemType, duct.domain ?? 'hvac');

  if (totalLength > 1e-4) {
    const { axis, u, v } = buildSafeFrame(dir);
    const horizontal = isHorizontalRun(axis);
    const bodyAcc = new UvMeshAccumulator();
    const gasketAcc = new UvMeshAccumulator();
    const accentAcc = new UvMeshAccumulator();

    if (duct.shape === 'round') {
      const diameter = Math.max(50, duct.diameter ?? 200);
      const radius = diameter * 0.5;
      bodyAcc.addSmoothCylinder(p1, p2, radius, 24, true);

      if (totalLength >= 150) {
        const collarLen = Math.min(60, totalLength * 0.22);
        const startC = add(p1, scale(axis, collarLen * 0.5));
        const endC = add(p2, scale(axis, -collarLen * 0.5));
        bodyAcc.addFlangeProfile(startC, axis, radius, radius * 1.07, collarLen, 1.5, 24);
        bodyAcc.addFlangeProfile(endC, axis, radius, radius * 1.07, collarLen, 1.5, 24);
        gasketAcc.addFlangeProfile(p1, axis, radius * 0.99, radius * 1.09, 4, 0.8, 24);
        gasketAcc.addFlangeProfile(p2, axis, radius * 0.99, radius * 1.09, 4, 0.8, 24);
      }

      const seamOffsets = computeIntervalOffsets(totalLength, 1200, 1400, 150);
      for (const offset of seamOffsets) {
        const sc = add(p1, scale(axis, offset));
        bodyAcc.addFlangeProfile(sc, axis, radius, radius * 1.07, 40, 1.2, 24);
        gasketAcc.addFlangeProfile(sc, axis, radius * 0.99, radius * 1.08, 3, 0.5, 24);
      }

      if (totalLength >= 500) {
        accentAcc.addFlangeProfile(
          add(p1, scale(axis, totalLength * 0.5)),
          axis,
          radius,
          radius * 1.04,
          24,
          1,
          24,
        );
      }

      const clampOffsets = computeIntervalOffsets(totalLength, 1200, 450, 140);
      for (const offset of clampOffsets) {
        const cc = add(p1, scale(axis, offset));
        instances.push({
          prototypeKey: 'pipe_clamp',
          matrix: composeMatrix4(cc, u, v, axis, v3(radius * 1.04, radius * 1.04, 1)),
          materialRole: 'zinc_hardware',
        });
        if (isLod350 && horizontal) {
          instances.push({
            prototypeKey: 'threaded_rod',
            matrix: composeMatrix4(
              add(cc, v3(0, 0, radius * 1.22)),
              v3(1, 0, 0),
              v3(0, 1, 0),
              v3(0, 0, 1),
              v3(1, 1, 160),
            ),
            materialRole: 'zinc_hardware',
          });
        }
      }
    } else {
      const width = Math.max(40, duct.width ?? 300);
      const height = Math.max(40, duct.height ?? 200);
      bodyAcc.addChamferedRectTube(p1, p2, width, height, 3, true, u, v);

      const flangeDepth = 25;
      const flangeW = width + 50;
      const flangeH = height + 50;

      const emitRectFlange = (centerPt: ReturnType<typeof v3>) => {
        gasketAcc.addChamferedRectTube(
          sub(centerPt, scale(axis, 1.5)),
          add(centerPt, scale(axis, 1.5)),
          flangeW * 0.99,
          flangeH * 0.99,
          2,
          false,
          u,
          v,
        );
        bodyAcc.addChamferedRectTube(
          sub(centerPt, scale(axis, flangeDepth * 0.5)),
          add(centerPt, scale(axis, flangeDepth * 0.5)),
          flangeW,
          flangeH,
          2.5,
          false,
          u,
          v,
        );
        if (isLod350) {
          const corners: Array<[number, number, ReturnType<typeof v3>, ReturnType<typeof v3>]> = [
            [-1, -1, u, v],
            [1, -1, scale(u, -1), v],
            [1, 1, scale(u, -1), scale(v, -1)],
            [-1, 1, u, scale(v, -1)],
          ];
          for (const [sx, sy, cu, cv] of corners) {
            const cPos = add(
              centerPt,
              add(scale(u, sx * (flangeW * 0.5 - 2)), scale(v, sy * (flangeH * 0.5 - 2))),
            );
            instances.push({
              prototypeKey: 'flange_corner',
              matrix: composeMatrix4(cPos, cu, cv, axis),
              materialRole: 'zinc_hardware',
            });
            const bPos = add(
              centerPt,
              add(scale(u, sx * (flangeW * 0.5 - 12)), scale(v, sy * (flangeH * 0.5 - 12))),
            );
            instances.push({
              prototypeKey: 'bolt_m10',
              matrix: composeMatrix4(add(bPos, scale(axis, 8)), u, v, axis),
              materialRole: 'zinc_hardware',
            });
          }
        }
      };

      if (totalLength >= 150) {
        emitRectFlange(add(p1, scale(axis, flangeDepth * 0.5)));
        emitRectFlange(add(p2, scale(axis, -flangeDepth * 0.5)));
      }
      for (const offset of computeIntervalOffsets(totalLength, 1200, 1400, 180)) {
        emitRectFlange(add(p1, scale(axis, offset)));
      }
      if (totalLength >= 500) {
        const mid = add(p1, scale(axis, totalLength * 0.5));
        accentAcc.addChamferedRectTube(
          sub(mid, scale(axis, 12)),
          add(mid, scale(axis, 12)),
          width + 10,
          height + 10,
          2,
          false,
          u,
          v,
        );
      }
      if (isLod350 && horizontal) {
        for (const offset of computeIntervalOffsets(totalLength, 1200, 450, 160)) {
          const hc = add(p1, scale(axis, offset));
          for (const sx of [-1, 1]) {
            instances.push({
              prototypeKey: 'threaded_rod',
              matrix: composeMatrix4(
                add(hc, add(scale(u, sx * (width * 0.5 + 14)), v3(0, 0, height * 0.5))),
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
    }

    pushPartIfNonEmpty(parts, bodyAcc, duct.id, 'galvanized_steel');
    pushPartIfNonEmpty(parts, gasketAcc, duct.id, 'epdm_rubber');
    pushPartIfNonEmpty(parts, accentAcc, duct.id, 'fluid_accent', fluidColor);
  }

  return {
    elementId: duct.id,
    category: 'duct',
    systemType: duct.systemType,
    domain: duct.domain ?? 'hvac',
    parts,
    instances,
  };
}

export function generateDuctMesh(duct: DuctGeometryParams): RawMeshData {
  const acc = new RawMeshAccumulator();
  const p1 = v3(duct.start.x, duct.start.y, duct.start.z);
  const p2 = v3(duct.end.x, duct.end.y, duct.end.z);
  const dir = sub(p2, p1);
  const totalLength = len(dir);

  if (totalLength > 1e-4) {
    const axis = normalize(dir);

    if (duct.shape === 'round') {
      const radius = Math.max(1, (duct.diameter ?? 200) / 2);
      // Corps tubulaire circulaire fermé aux extrémités (caps = true élimine l'effet de vide en terminaison)
      acc.addCylinder(p1, p2, radius, 16, true);

      // Manchons circulaires à brides d'étanchéité avec relief franc (rayon 1,08 x r)
      if (totalLength >= 150) {
        const flangeWidth = Math.min(30, totalLength * 0.08);
        const flangeRadius = radius * 1.08;
        // Bride de début
        acc.addCylinder(p1, add(p1, scale(axis, flangeWidth)), flangeRadius, 16, false);
        // Bride de fin
        acc.addCylinder(add(p2, scale(axis, -flangeWidth)), p2, flangeRadius, 16, false);

        // Brides intermédiaires tous les 1 200 mm
        const flangeInterval = 1200;
        if (totalLength > flangeInterval) {
          const numIntermediate = Math.floor(totalLength / flangeInterval);
          const step = totalLength / (numIntermediate + 1);
          for (let i = 1; i <= numIntermediate; i++) {
            const center = add(p1, scale(axis, i * step));
            const c1 = add(center, scale(axis, -flangeWidth / 2));
            const c2 = add(center, scale(axis, flangeWidth / 2));
            acc.addCylinder(c1, c2, flangeRadius, 16, false);
          }
        }
      }
    } else {
      const width = Math.max(1, duct.width ?? 300);
      const height = Math.max(1, duct.height ?? 200);

      // Corps de gaine rectangulaire fermé (caps = true garantit des plénums et bouches opaques)
      acc.addBoxAlongAxis(p1, p2, width, height, true);

      // Cadres de brides rectangulaires d'assemblage en tôle avec relief franc (+6 %)
      if (totalLength >= 150) {
        const flangeWidth = Math.min(25, totalLength * 0.06);
        const flangeW = width * 1.06;
        const flangeH = height * 1.06;
        // Cadre de début
        acc.addBoxAlongAxis(p1, add(p1, scale(axis, flangeWidth)), flangeW, flangeH, false);
        // Cadre de fin
        acc.addBoxAlongAxis(add(p2, scale(axis, -flangeWidth)), p2, flangeW, flangeH, false);

        // Cadres intermédiaires tous les 1 200 mm
        const flangeInterval = 1200;
        if (totalLength > flangeInterval) {
          const numIntermediate = Math.floor(totalLength / flangeInterval);
          const step = totalLength / (numIntermediate + 1);
          for (let i = 1; i <= numIntermediate; i++) {
            const center = add(p1, scale(axis, i * step));
            const c1 = add(center, scale(axis, -flangeWidth / 2));
            const c2 = add(center, scale(axis, flangeWidth / 2));
            acc.addBoxAlongAxis(c1, c2, flangeW, flangeH, false);
          }
        }
      }
    }
  }

  const color = duct.color ?? getMepSystemColor(duct.systemType, duct.domain);

  return acc.toRawMeshData(duct.id, {
    elementId: duct.id,
    category: 'duct',
    shape: duct.shape,
    levelId: duct.levelId,
    systemId: duct.systemId,
    systemType: duct.systemType,
    domain: duct.domain,
    color,
  });
}
