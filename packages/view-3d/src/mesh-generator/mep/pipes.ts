/**
 * mesh-generator/mep/pipes — Tuyauterie hydraulique et plomberie 3D haute fidélité
 *
 * Génère un modèle réaliste comprenant :
 * - Corps tubulaire régulier
 * - Manchons d'accouplement et bagues d'assemblage aux extrémités
 * - Colliers de supportage intermédiaires réguliers sur les longues portées
 * - Respect strict des boîtes englobantes et axes géométriques (ADR-026 / ADR-072)
 */

import type { RawMeshData } from '@tabax/geometry';
import type { PipeGeometryParams } from '../types.js';
import { RawMeshAccumulator, v3, add, sub, scale, len, normalize } from './common.js';
import { getMepSystemColor } from './colors.js';
import {
  composeMatrix4,
  type MepAssembly3D,
  type MepAssemblyPart,
  type MepInstanceAnchor,
  type MepMaterialRole,
} from './assembly-types.js';
import { UvMeshAccumulator } from './primitives.js';
import {
  buildSafeFrame,
  computeIntervalOffsets,
  isHorizontalRun,
  pushPartIfNonEmpty,
  type MepAssemblyOptions,
} from './assembly-builder-helpers.js';

function resolvePipeBodyRole(systemType?: string): MepMaterialRole {
  if (systemType === 'drainage_waste' || systemType === 'drainage_soil') {
    return 'pvc_matte';
  }
  return 'copper_brushed';
}

export function createPipeAssembly3D(
  pipe: PipeGeometryParams,
  options?: MepAssemblyOptions,
): MepAssembly3D {
  const isLod350 = (options?.detailLevel ?? 'lod350') === 'lod350';
  const parts: MepAssemblyPart[] = [];
  const instances: MepInstanceAnchor[] = [];

  const diameter = Math.max(4, pipe.diameter);
  const radius = diameter * 0.5;
  const p1 = v3(pipe.start.x, pipe.start.y, pipe.start.z);
  const p2 = v3(pipe.end.x, pipe.end.y, pipe.end.z);
  const dir = sub(p2, p1);
  const totalLength = len(dir);

  const bodyRole = resolvePipeBodyRole(pipe.systemType);
  const fluidColor = pipe.color ?? getMepSystemColor(pipe.systemType, pipe.domain);

  if (totalLength > 1e-4) {
    const { axis, u, v } = buildSafeFrame(dir);
    const horizontal = isHorizontalRun(axis);

    const bodyAcc = new UvMeshAccumulator();
    const hwAcc = new UvMeshAccumulator();
    const gasketAcc = new UvMeshAccumulator();
    const accentAcc = new UvMeshAccumulator();

    // 1. Corps tubulaire 20 segments (12 en lod200) avec UVs métriques
    const radialSegs = isLod350 ? 20 : 12;
    bodyAcc.addSmoothCylinder(p1, p2, radius, radialSegs, true);

    // 2. Manchons chanfreinés aux extrémités (lod350 et L >= 150 mm)
    if (isLod350 && totalLength >= 150) {
      const socketLen = Math.min(totalLength * 0.25, Math.max(36, 0.9 * diameter));
      const socketOuterR = radius * 1.14;
      bodyAcc.addFlangeProfile(
        add(p1, scale(axis, socketLen * 0.5)),
        axis,
        radius,
        socketOuterR,
        socketLen,
        1.5,
        20,
      );
      bodyAcc.addFlangeProfile(
        add(p2, scale(axis, -socketLen * 0.5)),
        axis,
        radius,
        socketOuterR,
        socketLen,
        1.5,
        20,
      );
    }

    // 3. Double bague d'identification fluide (20 mm espacées de 25 mm) tous les 2 400 mm
    const bandOffsets = computeIntervalOffsets(totalLength, 2400, 600, 140);
    for (const offset of bandOffsets) {
      const bandCenter = add(p1, scale(axis, offset));
      accentAcc.addFlangeProfile(
        sub(bandCenter, scale(axis, 22.5)),
        axis,
        radius,
        radius * 1.07,
        20,
        1,
        20,
      );
      accentAcc.addFlangeProfile(
        add(bandCenter, scale(axis, 22.5)),
        axis,
        radius,
        radius * 1.07,
        20,
        1,
        20,
      );
    }

    // 4. Brides PN16 boulonnées tous les 2 400 mm pour gros diamètres DN >= 65
    if (diameter >= 65 && totalLength >= 1500) {
      const flangeOffsets = computeIntervalOffsets(totalLength, 2400, 1500, 220);
      const flangeOuterR = radius + 35;
      const flangeThick = 14;
      for (const offset of flangeOffsets) {
        const fc = add(p1, scale(axis, offset));
        gasketAcc.addFlangeProfile(fc, axis, radius, flangeOuterR * 0.98, 3, 0.5, 24);
        hwAcc.addFlangeProfile(
          sub(fc, scale(axis, flangeThick * 0.5 + 1.5)),
          axis,
          radius,
          flangeOuterR,
          flangeThick,
          1.5,
          24,
        );
        hwAcc.addFlangeProfile(
          add(fc, scale(axis, flangeThick * 0.5 + 1.5)),
          axis,
          radius,
          flangeOuterR,
          flangeThick,
          1.5,
          24,
        );
        if (isLod350) {
          const boltR = radius + 21;
          const numBolts = diameter >= 125 ? 8 : 4;
          for (let b = 0; b < numBolts; b++) {
            const ang = (2 * Math.PI * b) / numBolts;
            const bPos = add(fc, add(scale(u, Math.cos(ang) * boltR), scale(v, Math.sin(ang) * boltR)));
            instances.push({
              prototypeKey: 'bolt_m10',
              matrix: composeMatrix4(add(bPos, scale(axis, 8)), u, v, axis),
              materialRole: 'zinc_hardware',
            });
          }
        }
      }
    }

    // 5. Colliers isophoniques tous les 1 200 mm (+ tige filetée verticale si tronçon horizontal uniquement, lod350)
    if (isLod350) {
      const clampOffsets = computeIntervalOffsets(totalLength, 1200, 400, 120);
      for (const offset of clampOffsets) {
        const cc = add(p1, scale(axis, offset));
        gasketAcc.addFlangeProfile(cc, axis, radius, radius * 1.07, 14, 0.8, 20);
        instances.push({
          prototypeKey: 'pipe_clamp',
          matrix: composeMatrix4(cc, u, v, axis, v3(radius * 1.07, radius * 1.07, 1)),
          materialRole: 'zinc_hardware',
        });
        if (horizontal) {
          const rodDrop = 160;
          const rodOrigin = add(cc, v3(0, 0, radius * 1.24));
          instances.push({
            prototypeKey: 'threaded_rod',
            matrix: composeMatrix4(
              rodOrigin,
              v3(1, 0, 0),
              v3(0, 1, 0),
              v3(0, 0, 1),
              v3(1, 1, rodDrop),
            ),
            materialRole: 'zinc_hardware',
          });
        }
      }
    }

    pushPartIfNonEmpty(parts, bodyAcc, pipe.id, bodyRole, fluidColor);
    pushPartIfNonEmpty(parts, hwAcc, pipe.id, 'zinc_hardware');
    pushPartIfNonEmpty(parts, gasketAcc, pipe.id, 'epdm_rubber');
    pushPartIfNonEmpty(parts, accentAcc, pipe.id, 'fluid_accent', fluidColor);
  }

  return {
    elementId: pipe.id,
    category: 'pipe',
    systemType: pipe.systemType,
    domain: pipe.domain,
    parts,
    instances,
  };
}

export function generatePipeMesh(pipe: PipeGeometryParams): RawMeshData {
  const acc = new RawMeshAccumulator();
  const radius = Math.max(1, pipe.diameter / 2);
  const p1 = v3(pipe.start.x, pipe.start.y, pipe.start.z);
  const p2 = v3(pipe.end.x, pipe.end.y, pipe.end.z);
  const dir = sub(p2, p1);
  const totalLength = len(dir);

  if (totalLength > 1e-4) {
    const axis = normalize(dir);
    // Corps tubulaire principal régulier au rayon nominal exact (caps = true garantit des terminaisons propres sans vide)
    acc.addCylinder(p1, p2, radius, 16, true);

    // Colliers de fixation et supportage réguliers sur les canalisations (ADR-072)
    // Disposés tous les 1 200 mm sur les canalisations d'au moins 1 500 mm
    // Relief franc de 12 % (rayon 1,12 x r) éliminant tout z-fighting à distance (ADR-026 / ADR-072)
    const clampInterval = 1200;
    const clampWidth = Math.min(20, Math.max(10, radius * 0.4));
    const clampRadius = radius * 1.12;
    if (totalLength >= 1500) {
      const numIntermediate = Math.max(1, Math.floor(totalLength / clampInterval));
      const step = totalLength / (numIntermediate + 1);
      for (let i = 1; i <= numIntermediate; i++) {
        const center = add(p1, scale(axis, i * step));
        const c1 = add(center, scale(axis, -clampWidth / 2));
        const c2 = add(center, scale(axis, clampWidth / 2));
        acc.addCylinder(c1, c2, clampRadius, 16, true);
      }
    }
  }

  const color = pipe.color ?? getMepSystemColor(pipe.systemType, pipe.domain);

  return acc.toRawMeshData(pipe.id, {
    elementId: pipe.id,
    category: 'pipe',
    levelId: pipe.levelId,
    systemId: pipe.systemId,
    systemType: pipe.systemType,
    domain: pipe.domain,
    color,
  });
}
