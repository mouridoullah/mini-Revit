/**
 * components/glazing — Menuiseries vitrées paramétriques LOD 200 / LOD 350 multi-matériaux
 *
 * Gère : sliding_door, french_window
 * Fournit à la fois createGlazingAssembly (LOD 350 / LOD 200) et createGlazingMesh (compatibilité).
 */

import type { RawMeshData } from '@tabax/geometry';
import type {
  ComponentMeshInput,
  ComponentTypeMeshInput,
  ComponentAssembly3D,
  ComponentAssemblyPart,
  CreateComponentAssemblyOptions,
} from './types.js';
import {
  ArchitecturalMeshAccumulator,
  v3,
  type Vec3D,
} from './architectural-primitives.js';
import { createAssemblyPart, mergeAssemblyParts } from './assembly-helper.js';

export const GLAZING_SUBTYPES = ['sliding_door', 'french_window'] as const;
export type GlazingSubType = (typeof GLAZING_SUBTYPES)[number];

export function createGlazingAssembly(
  comp: ComponentMeshInput,
  compType: ComponentTypeMeshInput,
  levelElevation = 0,
  options?: CreateComponentAssemblyOptions,
): ComponentAssembly3D | null {
  const width = comp.widthOverride ?? compType.width;
  const depth = comp.depthOverride ?? compType.depth;
  const height = comp.heightOverride ?? compType.height;
  if (width <= 0 || depth <= 0 || height <= 0) return null;

  const elevationOffset = comp.placement.elevationOffset ?? compType.defaultElevationOffset ?? 0;
  const zBase = levelElevation + elevationOffset;
  const rotation = comp.placement.rotation ?? 0;
  const cx = comp.placement.x;
  const cy = comp.placement.y;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const uAxis: Vec3D = { x: cos, y: sin, z: 0 };
  const vAxis: Vec3D = { x: -sin, y: cos, z: 0 };
  const wAxis: Vec3D = { x: 0, y: 0, z: 1 };

  const pt = (lx: number, ly: number, lz: number): Vec3D => {
    return {
      x: cx + uAxis.x * lx + vAxis.x * ly,
      y: cy + uAxis.y * lx + vAxis.y * ly,
      z: zBase + lz,
    };
  };

  const parts: ComponentAssemblyPart[] = [];
  const id = comp.id;
  const isLod350 = options?.detailLevel === 'lod350';

  switch (compType.subType) {
    case 'sliding_door': {
      const frameW = 50;
      const frameD = Math.min(depth, 70);

      // 1. Profilés dormant alu anthracite (4 boîtes : montants gauche/droit, traverse haute, seuil bas)
      const accAlu = new ArchitecturalMeshAccumulator();
      accAlu.addBeveledBox(
        pt(-width / 2 + frameW / 2, 0, height / 2),
        v3(frameW, frameD, height),
        0,
        uAxis,
        vAxis,
        wAxis,
      );
      accAlu.addBeveledBox(
        pt(width / 2 - frameW / 2, 0, height / 2),
        v3(frameW, frameD, height),
        0,
        uAxis,
        vAxis,
        wAxis,
      );
      accAlu.addBeveledBox(
        pt(0, 0, height - frameW / 2),
        v3(width - 2 * frameW, frameD, frameW),
        0,
        uAxis,
        vAxis,
        wAxis,
      );
      accAlu.addBeveledBox(
        pt(0, 0, frameW / 2),
        v3(width - 2 * frameW, frameD, frameW),
        0,
        uAxis,
        vAxis,
        wAxis,
      );

      if (isLod350) {
        // Chicane centrale de croisement des vantaux
        accAlu.addBeveledBox(
          pt(0, 0, height / 2),
          v3(40, frameD * 0.9, height - 2 * frameW),
          2,
          uAxis,
          vAxis,
          wAxis,
        );
      }
      parts.push(createAssemblyPart(accAlu.toRawMeshData(`${id}_alu_frame`), 'alu_anthracite'));

      // 2. Vitrages (2 vantaux)
      const accGlass = new ArchitecturalMeshAccumulator();
      const glassW = (width - 2 * frameW) / 2 + 20;
      const glassH = height - 2 * frameW;
      const glassCenterZ = frameW + glassH / 2;

      accGlass.addBeveledBox(
        pt(-width / 4, -14, glassCenterZ),
        v3(glassW, 12, glassH),
        0,
        uAxis,
        vAxis,
        wAxis,
      );
      accGlass.addBeveledBox(
        pt(width / 4, 14, glassCenterZ),
        v3(glassW, 12, glassH),
        0,
        uAxis,
        vAxis,
        wAxis,
      );
      parts.push(createAssemblyPart(accGlass.toRawMeshData(`${id}_glazing`), 'glass_clear'));

      if (isLod350) {
        // Poignées cuvettes inox encastrées
        const accHandles = new ArchitecturalMeshAccumulator();
        const handleZ = 1050;
        accHandles.addBeveledBox(pt(-15, -frameD / 2 - 2, handleZ), v3(25, 6, 140), 2, uAxis, vAxis, wAxis);
        accHandles.addBeveledBox(pt(15, frameD / 2 + 2, handleZ), v3(25, 6, 140), 2, uAxis, vAxis, wAxis);
        parts.push(createAssemblyPart(accHandles.toRawMeshData(`${id}_handles`), 'chrome_hardware'));
      }
      break;
    }

    case 'french_window': {
      const frameW = 50;
      const frameD = Math.min(depth, 70);

      // 1. Cadre dormant et meneau alu anthracite (5 boîtes)
      const accFrame = new ArchitecturalMeshAccumulator();
      accFrame.addBeveledBox(
        pt(-width / 2 + frameW / 2, 0, height / 2),
        v3(frameW, frameD, height),
        0,
        uAxis,
        vAxis,
        wAxis,
      );
      accFrame.addBeveledBox(
        pt(width / 2 - frameW / 2, 0, height / 2),
        v3(frameW, frameD, height),
        0,
        uAxis,
        vAxis,
        wAxis,
      );
      accFrame.addBeveledBox(
        pt(0, 0, height - frameW / 2),
        v3(width - 2 * frameW, frameD, frameW),
        0,
        uAxis,
        vAxis,
        wAxis,
      );
      accFrame.addBeveledBox(
        pt(0, 0, frameW / 2),
        v3(width - 2 * frameW, frameD, frameW),
        0,
        uAxis,
        vAxis,
        wAxis,
      );
      accFrame.addBeveledBox(
        pt(0, 0, height / 2),
        v3(frameW, frameD, height - 2 * frameW),
        0,
        uAxis,
        vAxis,
        wAxis,
      );
      parts.push(createAssemblyPart(accFrame.toRawMeshData(`${id}_frame`), 'alu_anthracite'));

      // 2. Vitrages (2 vantaux)
      const accGlass = new ArchitecturalMeshAccumulator();
      const paneW = (width - 3 * frameW) / 2;
      const paneH = height - 2 * frameW;
      const paneCenterZ = frameW + paneH / 2;

      accGlass.addBeveledBox(
        pt(-paneW / 2 - frameW / 2, 0, paneCenterZ),
        v3(paneW, 12, paneH),
        0,
        uAxis,
        vAxis,
        wAxis,
      );
      accGlass.addBeveledBox(
        pt(paneW / 2 + frameW / 2, 0, paneCenterZ),
        v3(paneW, 12, paneH),
        0,
        uAxis,
        vAxis,
        wAxis,
      );
      parts.push(createAssemblyPart(accGlass.toRawMeshData(`${id}_glazing`), 'glass_clear'));

      if (isLod350) {
        // Poignée à béquille
        const accHandle = new ArchitecturalMeshAccumulator();
        const hBase = pt(-15, -frameD / 2 - 15, 1050);
        accHandle.addSmoothCylinder(hBase, pt(-15, -frameD / 2, 1050), 12, 12, true);
        accHandle.addSmoothCylinder(hBase, pt(-140, -frameD / 2 - 15, 1050), 9, 12, true);
        parts.push(createAssemblyPart(accHandle.toRawMeshData(`${id}_handle`), 'chrome_hardware'));
      }
      break;
    }

    default:
      return null;
  }

  return {
    elementId: id,
    category: 'component',
    family: 'glazing',
    subType: compType.subType,
    parts,
  };
}

export function createGlazingMesh(
  comp: ComponentMeshInput,
  compType: ComponentTypeMeshInput,
  levelElevation = 0,
): RawMeshData | null {
  const assembly = createGlazingAssembly(comp, compType, levelElevation);
  if (!assembly) return null;
  return mergeAssemblyParts(assembly.parts, comp.id);
}
