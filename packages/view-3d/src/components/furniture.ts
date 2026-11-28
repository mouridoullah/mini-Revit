/**
 * components/furniture — Mobilier d'aménagement intérieur LOD 350 multi-matériaux
 *
 * Gère : bed, table, chair, sofa, cabinet
 * Fournit à la fois createFurnitureAssembly (LOD 350) et createFurnitureMesh (compatibilité ascendante).
 */

import type { RawMeshData } from '@tabax/geometry';
import type {
  ComponentMeshInput,
  ComponentTypeMeshInput,
  ComponentAssembly3D,
  ComponentAssemblyPart,
  ComponentInstanceAnchor,
  ComponentMaterialRole,
  CreateComponentAssemblyOptions,
} from './types.js';
import {
  ArchitecturalMeshAccumulator,
  sub,
  len as vecLen,
  normalize,
  v3,
  type Vec3D,
} from './architectural-primitives.js';
import { computeOrthonormalBasis, composeMatrix4 } from '../mesh-generator/shared/primitives.js';
import { createAssemblyPart, mergeAssemblyParts } from './assembly-helper.js';

export const FURNITURE_SUBTYPES = ['bed', 'table', 'chair', 'sofa', 'cabinet'] as const;
export type FurnitureSubType = (typeof FURNITURE_SUBTYPES)[number];

function pushLegInstance(
  instances: ComponentInstanceAnchor[],
  p0: Vec3D,
  p1: Vec3D,
  radius: number,
  materialRole: ComponentMaterialRole,
): void {
  const axis = sub(p1, p0);
  const length = vecLen(axis);
  if (length <= 1e-4) return;
  const w = normalize(axis);
  const { u, v } = computeOrthonormalBasis(w);
  instances.push({
    prototypeKey: 'furniture_leg',
    matrix: composeMatrix4(p0, u, v, w, v3(radius, radius, length)),
    materialRole,
  });
}

export function createFurnitureAssembly(
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
    case 'bed': {
      // 1. Cadre et tête de lit en bois noyer / chêne
      const accWood = new ArchitecturalMeshAccumulator();
      const frameH = height * 0.45;
      const headH = height;
      const headD = Math.min(90, depth * 0.06);

      // Cadre de lit périphérique
      accWood.addBeveledBox(
        pt(0, -headD / 2, frameH / 2),
        v3(width, depth - headD, frameH),
        8,
        uAxis,
        vAxis,
        wAxis,
      );

      // Tête de lit haute
      accWood.addBeveledBox(
        pt(0, depth / 2 - headD / 2, headH / 2),
        v3(width * 1.05, headD, headH),
        10,
        uAxis,
        vAxis,
        wAxis,
      );
      parts.push(createAssemblyPart(accWood.toRawMeshData(`${id}_bed_wood`), 'wood_dark'));

      // 2. Matelas épais et oreillers moelleux
      const accBedding = new ArchitecturalMeshAccumulator();
      const mattressH = height * 0.4;
      const mattressZ = frameH + mattressH / 2 - 20;

      // Matelas
      accBedding.addPaddedCushion(
        pt(0, -headD / 2, mattressZ),
        v3(width * 0.94, depth - headD - 30, mattressH),
        uAxis,
        vAxis,
        wAxis,
      );

      // 2 Oreillers
      const pillowW = width * 0.4;
      const pillowD = (depth - headD) * 0.22;
      const pillowH = 140;
      const pillowY = depth / 2 - headD - pillowD / 2 - 20;
      accBedding.addPaddedCushion(
        pt(-width * 0.24, pillowY, frameH + mattressH + pillowH / 2 - 30),
        v3(pillowW, pillowD, pillowH),
        uAxis,
        vAxis,
        wAxis,
      );
      accBedding.addPaddedCushion(
        pt(width * 0.24, pillowY, frameH + mattressH + pillowH / 2 - 30),
        v3(pillowW, pillowD, pillowH),
        uAxis,
        vAxis,
        wAxis,
      );
      parts.push(createAssemblyPart(accBedding.toRawMeshData(`${id}_mattress`), 'fabric_cushion'));

      // 3. Couette bordée
      const accQuilt = new ArchitecturalMeshAccumulator();
      const quiltD = (depth - headD) * 0.65;
      const quiltY = -headD / 2 - (depth - headD) * 0.15;
      accQuilt.addPaddedCushion(
        pt(0, quiltY, frameH + mattressH + 15),
        v3(width * 0.96, quiltD, 50),
        uAxis,
        vAxis,
        wAxis,
      );
      parts.push(createAssemblyPart(accQuilt.toRawMeshData(`${id}_quilt`), 'fabric_upholstery'));
      break;
    }

    case 'table': {
      // 1. Plateau en bois noble avec chanfrein
      const accTop = new ArchitecturalMeshAccumulator();
      const topThick = 40;
      accTop.addBeveledBox(
        pt(0, 0, height - topThick / 2),
        v3(width, depth, topThick),
        6,
        uAxis,
        vAxis,
        wAxis,
      );
      parts.push(createAssemblyPart(accTop.toRawMeshData(`${id}_top`), 'wood_oak'));

      // 2. Piétement métallique fin contemporain (GPU InstancedMesh)
      const legRadius = 18;
      const legH = height - topThick;
      const insetX = width / 2 - 60;
      const insetY = depth / 2 - 60;

      pushLegInstance(instances, pt(-insetX, -insetY, 0), pt(-insetX + 15, -insetY + 15, legH), legRadius, 'alu_anthracite');
      pushLegInstance(instances, pt(insetX, -insetY, 0), pt(insetX - 15, -insetY + 15, legH), legRadius, 'alu_anthracite');
      pushLegInstance(instances, pt(-insetX, insetY, 0), pt(-insetX + 15, insetY - 15, legH), legRadius, 'alu_anthracite');
      pushLegInstance(instances, pt(insetX, insetY, 0), pt(insetX - 15, insetY - 15, legH), legRadius, 'alu_anthracite');
      break;
    }

    case 'chair': {
      const seatZ = height * 0.52;
      const seatThick = 45;

      // 1. Assise et dossier capitonnés tissu d'ameublement
      const accSeat = new ArchitecturalMeshAccumulator();
      // Assise galbée
      accSeat.addPaddedCushion(
        pt(0, 0, seatZ - seatThick / 2),
        v3(width * 0.95, depth * 0.9, seatThick),
        uAxis,
        vAxis,
        wAxis,
      );
      // Dossier ergonomique
      const backH = height - seatZ;
      accSeat.addPaddedCushion(
        pt(0, depth / 2 - 25, seatZ + backH / 2),
        v3(width * 0.88, 35, backH * 0.95),
        uAxis,
        vAxis,
        wAxis,
      );
      parts.push(createAssemblyPart(accSeat.toRawMeshData(`${id}_cushions`), 'fabric_upholstery'));

      // 2. Piètement métallique fin (GPU InstancedMesh)
      const legR = 12;
      const lZ = seatZ - seatThick;
      const lX = width / 2 - 25;
      const lY = depth / 2 - 25;

      pushLegInstance(instances, pt(-lX, -lY, 0), pt(-lX + 10, -lY + 10, lZ), legR, 'chrome_hardware');
      pushLegInstance(instances, pt(lX, -lY, 0), pt(lX - 10, -lY + 10, lZ), legR, 'chrome_hardware');
      pushLegInstance(instances, pt(-lX, lY, 0), pt(-lX + 10, lY - 10, lZ), legR, 'chrome_hardware');
      pushLegInstance(instances, pt(lX, lY, 0), pt(lX - 10, lY - 10, lZ), legR, 'chrome_hardware');
      break;
    }

    case 'sofa': {
      const seatH = height * 0.44;
      const backD = Math.min(200, depth * 0.28);
      const armW = Math.min(180, width * 0.12);

      // 1. Structure caisson tapissier et accoudoirs
      const accFrame = new ArchitecturalMeshAccumulator();
      // Base inférieure
      accFrame.addBeveledBox(
        pt(0, 0, seatH * 0.5),
        v3(width, depth, seatH),
        15,
        uAxis,
        vAxis,
        wAxis,
      );
      // Dossier principal
      accFrame.addBeveledBox(
        pt(0, depth / 2 - backD / 2, seatH + (height - seatH) / 2),
        v3(width, backD, height - seatH),
        15,
        uAxis,
        vAxis,
        wAxis,
      );
      // 2 Accoudoirs
      const armH = height * 0.75;
      accFrame.addBeveledBox(
        pt(-width / 2 + armW / 2, -backD / 4, armH / 2),
        v3(armW, depth - backD / 2, armH),
        20,
        uAxis,
        vAxis,
        wAxis,
      );
      accFrame.addBeveledBox(
        pt(width / 2 - armW / 2, -backD / 4, armH / 2),
        v3(armW, depth - backD / 2, armH),
        20,
        uAxis,
        vAxis,
        wAxis,
      );
      parts.push(createAssemblyPart(accFrame.toRawMeshData(`${id}_sofa_frame`), 'fabric_upholstery'));

      // 2. Coussins d'assise et de dossier moelleux séparés
      const accCushions = new ArchitecturalMeshAccumulator();
      const innerW = width - 2 * armW;
      const innerD = depth - backD;
      const halfCushionW = innerW / 2 - 10;
      const cushionH = 130;

      // 2 coussins d'assise
      accCushions.addPaddedCushion(
        pt(-innerW / 4, -backD / 2, seatH + cushionH / 2),
        v3(halfCushionW, innerD * 0.95, cushionH),
        uAxis,
        vAxis,
        wAxis,
      );
      accCushions.addPaddedCushion(
        pt(innerW / 4, -backD / 2, seatH + cushionH / 2),
        v3(halfCushionW, innerD * 0.95, cushionH),
        uAxis,
        vAxis,
        wAxis,
      );

      // 2 coussins de dossier
      const backCushionH = (height - seatH) * 0.85;
      accCushions.addPaddedCushion(
        pt(-innerW / 4, depth / 2 - backD - 20, seatH + backCushionH / 2 + 30),
        v3(halfCushionW, 100, backCushionH),
        uAxis,
        vAxis,
        wAxis,
      );
      accCushions.addPaddedCushion(
        pt(innerW / 4, depth / 2 - backD - 20, seatH + backCushionH / 2 + 30),
        v3(halfCushionW, 100, backCushionH),
        uAxis,
        vAxis,
        wAxis,
      );
      parts.push(createAssemblyPart(accCushions.toRawMeshData(`${id}_cushions`), 'fabric_cushion'));

      // 3. Pieds fins surélevés (GPU InstancedMesh)
      const feetR = 15;
      const fX = width / 2 - armW / 2;
      const fY = depth / 2 - 80;
      pushLegInstance(instances, pt(-fX, -fY, -30), pt(-fX, -fY, 10), feetR, 'alu_anthracite');
      pushLegInstance(instances, pt(fX, -fY, -30), pt(fX, -fY, 10), feetR, 'alu_anthracite');
      pushLegInstance(instances, pt(-fX, fY, -30), pt(-fX, fY, 10), feetR, 'alu_anthracite');
      pushLegInstance(instances, pt(fX, fY, -30), pt(fX, fY, 10), feetR, 'alu_anthracite');
      break;
    }

    // Armoire / dressing contemporain
    case 'cabinet':
    default: {
      // 1. Corps de l'armoire
      const accBody = new ArchitecturalMeshAccumulator();
      const plinthH = 80;
      accBody.addBeveledBox(
        pt(0, 0, plinthH + (height - plinthH) / 2),
        v3(width, depth, height - plinthH),
        6,
        uAxis,
        vAxis,
        wAxis,
      );
      parts.push(createAssemblyPart(accBody.toRawMeshData(`${id}_cabinet_body`), 'wood_dark'));

      // 2. Socle en retrait
      const accPlinth = new ArchitecturalMeshAccumulator();
      accPlinth.addBeveledBox(
        pt(0, 20, plinthH / 2),
        v3(width * 0.98, depth - 40, plinthH),
        2,
        uAxis,
        vAxis,
        wAxis,
      );
      parts.push(createAssemblyPart(accPlinth.toRawMeshData(`${id}_cabinet_plinth`), 'alu_anthracite'));

      // 3. Poignées filantes verticales (GPU InstancedMesh)
      const hX = 20;
      const hY = -depth / 2 - 8;
      const hLen = height * 0.2;
      const hMidZ = height * 0.5;
      const negU = v3(-uAxis.x, -uAxis.y, 0);
      instances.push({
        prototypeKey: 'cabinet_pull',
        matrix: composeMatrix4(pt(-hX, hY, hMidZ), wAxis, vAxis, negU, v3(hLen, 1, 1)),
        materialRole: 'chrome_hardware',
      });
      instances.push({
        prototypeKey: 'cabinet_pull',
        matrix: composeMatrix4(pt(hX, hY, hMidZ), wAxis, vAxis, negU, v3(hLen, 1, 1)),
        materialRole: 'chrome_hardware',
      });
      break;
    }
  }

  return {
    elementId: id,
    category: 'component',
    family: 'furniture',
    subType: compType.subType,
    parts,
    ...(instances.length > 0 ? { instances } : {}),
  };
}

export function createFurnitureMesh(
  comp: ComponentMeshInput,
  compType: ComponentTypeMeshInput,
  levelElevation = 0,
): RawMeshData | null {
  const assembly = createFurnitureAssembly(comp, compType, levelElevation);
  if (!assembly) return null;
  return mergeAssemblyParts(assembly.parts, comp.id);
}
