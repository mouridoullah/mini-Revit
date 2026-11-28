/**
 * components/kitchen — Meubles de cuisine et électroménager LOD 350 multi-matériaux
 *
 * Gère : kitchen_base, kitchen_wall, sink_unit, appliance
 * Fournit à la fois createKitchenAssembly (LOD 350) et createKitchenMesh (compatibilité ascendante).
 */

import type { RawMeshData } from '@tabax/geometry';
import type {
  ComponentMeshInput,
  ComponentTypeMeshInput,
  ComponentAssembly3D,
  ComponentAssemblyPart,
  ComponentInstanceAnchor,
  CreateComponentAssemblyOptions,
} from './types.js';
import {
  ArchitecturalMeshAccumulator,
  v3,
  add,
  type Vec3D,
} from './architectural-primitives.js';
import { composeMatrix4 } from '../mesh-generator/shared/primitives.js';
import { createAssemblyPart, mergeAssemblyParts } from './assembly-helper.js';

export const KITCHEN_SUBTYPES = [
  'kitchen_base',
  'kitchen_wall',
  'sink_unit',
  'appliance',
] as const;
export type KitchenSubType = (typeof KITCHEN_SUBTYPES)[number];

export function createKitchenAssembly(
  comp: ComponentMeshInput,
  compType: ComponentTypeMeshInput,
  levelElevation = 0,
  _options?: CreateComponentAssemblyOptions,
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
  const instances: ComponentInstanceAnchor[] = [];
  const id = comp.id;

  switch (compType.subType) {
    case 'kitchen_base': {
      // 1. Socle / plinthe en retrait anthracite
      const accPlinth = new ArchitecturalMeshAccumulator();
      const plinthH = 100;
      const plinthRecess = 50;
      accPlinth.addBeveledBox(
        pt(0, plinthRecess / 2, plinthH / 2),
        v3(width, depth - plinthRecess, plinthH),
        2,
        uAxis,
        vAxis,
        wAxis,
      );
      parts.push(createAssemblyPart(accPlinth.toRawMeshData(`${id}_plinth`), 'alu_anthracite'));

      // 2. Caisson meuble bas et façades tiroirs en chêne
      const accWood = new ArchitecturalMeshAccumulator();
      const topThick = 38;
      const carcassH = height - plinthH - topThick;
      accWood.addBeveledBox(
        pt(0, 0, plinthH + carcassH / 2),
        v3(width * 0.98, depth * 0.96, carcassH),
        4,
        uAxis,
        vAxis,
        wAxis,
      );
      parts.push(createAssemblyPart(accWood.toRawMeshData(`${id}_carcass`), 'wood_oak'));

      // 3. Plan de travail en quartz blanc biseauté
      const accTop = new ArchitecturalMeshAccumulator();
      accTop.addBeveledBox(
        pt(0, 0, height - topThick / 2),
        v3(width, depth, topThick),
        4,
        uAxis,
        vAxis,
        wAxis,
      );
      parts.push(createAssemblyPart(accTop.toRawMeshData(`${id}_worktop`), 'quartz_white'));

      // 4. Poignées de préhension filantes en inox (GPU InstancedMesh)
      const handleW = width * 0.7;
      for (const ratio of [0.85, 0.4]) {
        instances.push({
          prototypeKey: 'cabinet_pull',
          matrix: composeMatrix4(
            pt(0, -depth / 2 - 8, plinthH + carcassH * ratio),
            uAxis,
            vAxis,
            wAxis,
            v3(handleW, 1, 1),
          ),
          materialRole: 'stainless_brushed',
        });
      }
      break;
    }

    case 'kitchen_wall': {
      // 1. Caisson meuble haut suspendu
      const accWallWood = new ArchitecturalMeshAccumulator();
      accWallWood.addBeveledBox(
        pt(0, 0, height / 2),
        v3(width, depth, height),
        4,
        uAxis,
        vAxis,
        wAxis,
      );
      parts.push(createAssemblyPart(accWallWood.toRawMeshData(`${id}_wall_carcass`), 'wood_oak'));

      // 2. Poignées ou profils de prise de main en aluminium
      const accWallAlu = new ArchitecturalMeshAccumulator();
      accWallAlu.addBeveledBox(
        pt(0, -depth / 2 + 10, 10),
        v3(width * 0.9, 15, 15),
        2,
        uAxis,
        vAxis,
        wAxis,
      );
      parts.push(createAssemblyPart(accWallAlu.toRawMeshData(`${id}_wall_alu`), 'alu_anthracite'));
      break;
    }

    case 'sink_unit': {
      // 1. Socle meuble bas
      const accPlinth = new ArchitecturalMeshAccumulator();
      accPlinth.addBeveledBox(
        pt(0, 25, 50),
        v3(width, depth - 50, 100),
        2,
        uAxis,
        vAxis,
        wAxis,
      );
      parts.push(createAssemblyPart(accPlinth.toRawMeshData(`${id}_plinth`), 'alu_anthracite'));

      // 2. Caisson meuble
      const accWood = new ArchitecturalMeshAccumulator();
      accWood.addBeveledBox(
        pt(0, 0, 100 + (height - 100 - 38) / 2),
        v3(width * 0.98, depth * 0.96, height - 100 - 38),
        4,
        uAxis,
        vAxis,
        wAxis,
      );
      parts.push(createAssemblyPart(accWood.toRawMeshData(`${id}_carcass`), 'wood_oak'));

      // 3. Plan de travail avec découpe
      const accTop = new ArchitecturalMeshAccumulator();
      accTop.addBeveledBox(
        pt(0, 0, height - 19),
        v3(width, depth, 38),
        4,
        uAxis,
        vAxis,
        wAxis,
      );
      parts.push(createAssemblyPart(accTop.toRawMeshData(`${id}_worktop`), 'quartz_white'));

      // 4. Évier inox brossé avec cuve évidée et égouttoir
      const accSink = new ArchitecturalMeshAccumulator();
      const sinkW = Math.min(width * 0.85, 1000);
      const sinkD = depth * 0.8;
      // Bordure périphérique inox de l'évier
      accSink.addBeveledBox(
        pt(0, 0, height + 4),
        v3(sinkW, sinkD, 8),
        3,
        uAxis,
        vAxis,
        wAxis,
      );
      // Cuve creusée
      accSink.addBasin(
        pt(-sinkW * 0.22, 0, height + 4),
        v3(sinkW * 0.45, sinkD * 0.85, 200),
        20,
        190,
        uAxis,
        vAxis,
      );
      // Égouttoir avec cannelures
      accSink.addBeveledBox(
        pt(sinkW * 0.25, 0, height + 6),
        v3(sinkW * 0.42, sinkD * 0.8, 4),
        2,
        uAxis,
        vAxis,
        wAxis,
      );
      parts.push(createAssemblyPart(accSink.toRawMeshData(`${id}_sink_inox`), 'stainless_brushed'));

      // 5. Robinetterie mitigeur orientable chromé
      const accFaucet = new ArchitecturalMeshAccumulator();
      const faucetBase = pt(0, sinkD / 2 - 30, height + 8);
      accFaucet.addSmoothCylinder(faucetBase, add(faucetBase, { x: 0, y: 0, z: 60 }), 18, 16, true);
      accFaucet.addCurvedSpout(add(faucetBase, { x: 0, y: 0, z: 50 }), 220, 160, 12, 16);
      accFaucet.addSmoothCylinder(
        add(faucetBase, { x: 25, y: 0, z: 50 }),
        add(faucetBase, { x: 60, y: 0, z: 55 }),
        8,
        12,
        true,
      );
      parts.push(createAssemblyPart(accFaucet.toRawMeshData(`${id}_faucet`), 'chrome_hardware'));
      break;
    }

    case 'appliance': {
      if (height >= 1400) {
        // Grand réfrigérateur combiné inox
        const accFridge = new ArchitecturalMeshAccumulator();
        accFridge.addBeveledBox(
          pt(0, 0, height / 2),
          v3(width, depth, height),
          12,
          uAxis,
          vAxis,
          wAxis,
        );
        parts.push(createAssemblyPart(accFridge.toRawMeshData(`${id}_fridge_body`), 'stainless_brushed'));

        // Poignées verticales et affichage digital
        const accDetails = new ArchitecturalMeshAccumulator();
        accDetails.addSmoothCylinder(
          pt(-width / 2 + 40, -depth / 2 - 25, height * 0.55),
          pt(-width / 2 + 40, -depth / 2 - 25, height * 0.85),
          10,
          12,
          true,
        );
        accDetails.addSmoothCylinder(
          pt(-width / 2 + 40, -depth / 2 - 25, height * 0.15),
          pt(-width / 2 + 40, -depth / 2 - 25, height * 0.45),
          10,
          12,
          true,
        );
        parts.push(createAssemblyPart(accDetails.toRawMeshData(`${id}_fridge_handles`), 'alu_anthracite'));

        // Écran numérique
        const accDisplay = new ArchitecturalMeshAccumulator();
        accDisplay.addBeveledBox(
          pt(0, -depth / 2 - 2, height * 0.75),
          v3(140, 6, 80),
          2,
          uAxis,
          vAxis,
          wAxis,
        );
        parts.push(createAssemblyPart(accDisplay.toRawMeshData(`${id}_display`), 'appliance_display'));
      } else {
        // Bloc plaque de cuisson induction + four encastré
        // 1. Corps du caisson four
        const accOvenBody = new ArchitecturalMeshAccumulator();
        accOvenBody.addBeveledBox(
          pt(0, 0, height / 2),
          v3(width, depth, height),
          4,
          uAxis,
          vAxis,
          wAxis,
        );
        parts.push(createAssemblyPart(accOvenBody.toRawMeshData(`${id}_oven_body`), 'stainless_brushed'));

        // 2. Vitre teintée du four
        const accGlass = new ArchitecturalMeshAccumulator();
        accGlass.addBeveledBox(
          pt(0, -depth / 2 - 2, height * 0.45),
          v3(width * 0.85, 8, height * 0.55),
          2,
          uAxis,
          vAxis,
          wAxis,
        );
        parts.push(createAssemblyPart(accGlass.toRawMeshData(`${id}_oven_glass`), 'glass_tinted'));

        // 3. Poignée tubulaire du four et bandeau
        const accOvenHandles = new ArchitecturalMeshAccumulator();
        accOvenHandles.addSmoothCylinder(
          pt(-width * 0.35, -depth / 2 - 25, height * 0.72),
          pt(width * 0.35, -depth / 2 - 25, height * 0.72),
          10,
          16,
          true,
        );
        parts.push(createAssemblyPart(accOvenHandles.toRawMeshData(`${id}_oven_handle`), 'chrome_hardware'));

        // 4. Plaque vitrocéramique à induction sur le dessus
        const accCooktop = new ArchitecturalMeshAccumulator();
        accCooktop.addBeveledBox(
          pt(0, 0, height + 4),
          v3(width * 0.95, depth * 0.95, 8),
          2,
          uAxis,
          vAxis,
          wAxis,
        );
        parts.push(createAssemblyPart(accCooktop.toRawMeshData(`${id}_cooktop`), 'glass_tinted'));

        // Sérigraphie foyers d'induction
        const accBurners = new ArchitecturalMeshAccumulator();
        const bOffset = width * 0.22;
        accBurners.addSmoothCylinder(pt(-bOffset, -bOffset, height + 9), pt(-bOffset, -bOffset, height + 10), 80, 16, true);
        accBurners.addSmoothCylinder(pt(bOffset, -bOffset, height + 9), pt(bOffset, -bOffset, height + 10), 90, 16, true);
        accBurners.addSmoothCylinder(pt(-bOffset, bOffset, height + 9), pt(-bOffset, bOffset, height + 10), 75, 16, true);
        accBurners.addSmoothCylinder(pt(bOffset, bOffset, height + 9), pt(bOffset, bOffset, height + 10), 110, 16, true);
        parts.push(createAssemblyPart(accBurners.toRawMeshData(`${id}_burners`), 'alu_anthracite'));
      }
      break;
    }

    default:
      return null;
  }

  return {
    elementId: id,
    category: 'component',
    family: 'kitchen',
    subType: compType.subType,
    parts,
    ...(instances.length > 0 ? { instances } : {}),
  };
}

export function createKitchenMesh(
  comp: ComponentMeshInput,
  compType: ComponentTypeMeshInput,
  levelElevation = 0,
): RawMeshData | null {
  const assembly = createKitchenAssembly(comp, compType, levelElevation);
  if (!assembly) return null;
  return mergeAssemblyParts(assembly.parts, comp.id);
}
