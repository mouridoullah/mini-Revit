/**
 * mesh-generator/roof-details — Détails architecturaux LOD 350 pour toitures (faîtage, rives, chéneaux, acrotères)
 *
 * Module extrait de roofs.ts afin de garder chaque générateur sous les seuils ADR-072.
 */

import {
  vec2,
  triangulatePolygonWithHoles,
  type RawMeshData,
  type Vec2,
} from '@tabax/geometry';
import type {
  RoofGeometryParams,
  RoofTypeGeometryParams,
  GableRoofTypeGeometryParams,
} from './types.js';
import {
  ArchitecturalMeshAccumulator,
  type Vec3D,
} from '../components/architectural-primitives.js';
import type {
  ComponentAssembly3D,
  ComponentAssemblyPart,
  ComponentMaterialRole,
  ComponentDetailLevel,
} from '../components/types.js';

export interface RoofAssemblyOptions {
  readonly detailLevel?: ComponentDetailLevel;
  readonly tileMaterial?: ComponentMaterialRole;
  readonly gravelMaterial?: ComponentMaterialRole;
  readonly metalMaterial?: ComponentMaterialRole;
  readonly structureMaterial?: ComponentMaterialRole;
  readonly parapetMaterial?: ComponentMaterialRole;
  readonly hasRidgeCap?: boolean;
  readonly hasGutters?: boolean;
  readonly hasBargeBoards?: boolean;
}

/**
 * Construit les pièces LOD 350 d'une toiture plate (couvertines d'acrotère + étanchéité gravillons).
 */
export function buildFlatRoofDetailParts(
  roof: RoofGeometryParams,
  roofType: RoofTypeGeometryParams,
  effectivePolygon?: { outer: readonly Vec2[]; holes: readonly (readonly Vec2[])[] },
  options?: RoofAssemblyOptions,
): ComponentAssemblyPart[] {
  const parts: ComponentAssemblyPart[] = [];
  const elevation = roof.elevation ?? 0;
  const baseOffset = roof.baseOffset ?? 0;
  const zBase = elevation + baseOffset;
  const thickness = Math.max(10, roofType.thickness);

  const parapetAcc = new ArchitecturalMeshAccumulator();
  const boundary2D =
    effectivePolygon?.outer && effectivePolygon.outer.length >= 3
      ? effectivePolygon.outer
      : roof.footprint.map((p) => vec2(p.x, p.y));

  const zSup = zBase + thickness;
  const parapetWidth = 160;
  const parapetHeight = 50;
  const zVec: Vec3D = { x: 0, y: 0, z: 1 };

  const n = boundary2D.length;
  for (let i = 0; i < n; i++) {
    const p1 = boundary2D[i];
    const p2 = boundary2D[(i + 1) % n];
    if (!p1 || !p2) continue;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const segLen = Math.hypot(dx, dy);
    if (segLen < 1e-3) continue;

    const uDir: Vec3D = { x: dx / segLen, y: dy / segLen, z: 0 };
    const nDir: Vec3D = { x: dy / segLen, y: -dx / segLen, z: 0 };

    const center: Vec3D = {
      x: (p1.x + p2.x) / 2,
      y: (p1.y + p2.y) / 2,
      z: zSup + parapetHeight / 2,
    };

    parapetAcc.addBeveledBox(
      center,
      { x: segLen, y: parapetWidth, z: parapetHeight },
      4,
      uDir,
      nDir,
      zVec,
    );
  }

  parts.push({
    rawData: parapetAcc.toRawMeshData(`${roof.id}_parapets`),
    materialRole: options?.parapetMaterial ?? 'alu_anthracite',
  });

  const gravelAcc = new ArchitecturalMeshAccumulator();
  const { vertices, indices: topIndices } = triangulatePolygonWithHoles(
    boundary2D,
    effectivePolygon?.holes ? effectivePolygon.holes.map((h) => [...h]) : [],
  );

  const zGravel = zSup + 4;
  for (const v of vertices) {
    gravelAcc.addVertex({ x: v.x, y: v.y, z: zGravel }, zVec, v.x / 1000, v.y / 1000);
  }
  for (let i = 0; i < topIndices.length; i += 3) {
    const i0 = topIndices[i];
    const i1 = topIndices[i + 1];
    const i2 = topIndices[i + 2];
    if (i0 !== undefined && i1 !== undefined && i2 !== undefined) {
      gravelAcc.addTriangle(i0, i1, i2);
    }
  }

  parts.push({
    rawData: gravelAcc.toRawMeshData(`${roof.id}_surface`),
    materialRole: options?.gravelMaterial ?? 'roof_gravel',
  });

  return parts;
}

/**
 * Construit les pièces LOD 350 d'une toiture 2 pans (faîtage zinc, gouttières demi-rondes, rives de pignon).
 */
export function buildGableRoofDetailParts(
  roof: RoofGeometryParams,
  roofType: RoofTypeGeometryParams,
  options?: RoofAssemblyOptions,
): ComponentAssemblyPart[] {
  const parts: ComponentAssemblyPart[] = [];
  const elevation = roof.elevation ?? 0;
  const baseOffset = roof.baseOffset ?? 0;
  const zBase = elevation + baseOffset;

  const gableType = roofType as GableRoofTypeGeometryParams;
  const slopeDeg = roof.slopeOverrideDeg ?? gableType.slopeDeg ?? 35;
  const slopeRad = (slopeDeg * Math.PI) / 180;
  const tanSlope = Math.tan(slopeRad);
  const cosSlope = Math.cos(slopeRad);

  const ridgeAxis = roof.ridgeAxis ?? {
    start: { x: 0, y: 0 },
    end: { x: 1000, y: 0 },
  };

  const ridgeDx = ridgeAxis.end.x - ridgeAxis.start.x;
  const ridgeDy = ridgeAxis.end.y - ridgeAxis.start.y;
  const ridgeLen = Math.hypot(ridgeDx, ridgeDy);
  const uRidge = ridgeLen > 1e-5 ? vec2(ridgeDx / ridgeLen, ridgeDy / ridgeLen) : vec2(1, 0);
  const nRidge = vec2(-uRidge.y, uRidge.x);

  let sMin = Infinity;
  let sMax = -Infinity;
  let dMin = Infinity;
  let dMax = -Infinity;

  for (const v of roof.footprint) {
    const s = (v.x - ridgeAxis.start.x) * uRidge.x + (v.y - ridgeAxis.start.y) * uRidge.y;
    const d = (v.x - ridgeAxis.start.x) * nRidge.x + (v.y - ridgeAxis.start.y) * nRidge.y;
    if (s < sMin) sMin = s;
    if (s > sMax) sMax = s;
    if (d < dMin) dMin = d;
    if (d > dMax) dMax = d;
  }

  const overhang = roof.overhangOverride ?? gableType.overhangMm ?? 0;
  if (overhang > 0) {
    sMin -= overhang;
    sMax += overhang;
    dMin -= overhang;
    dMax += overhang;
  }

  const w1 = Math.max(10, Math.abs(dMin));
  const w2 = Math.max(10, Math.abs(dMax));
  const maxHalfSpan = Math.max(w1, w2);
  const totalRise = maxHalfSpan * tanSlope;
  const zRidge = zBase + totalRise;
  const zEave = zBase;
  const sLen = sMax - sMin;

  const uRidge3D: Vec3D = { x: uRidge.x, y: uRidge.y, z: 0 };
  const nRidge3D: Vec3D = { x: nRidge.x, y: nRidge.y, z: 0 };
  const zVec: Vec3D = { x: 0, y: 0, z: 1 };

  // 1. Faîtage surélevé en relief profilé
  if (options?.hasRidgeCap !== false) {
    const ridgeAcc = new ArchitecturalMeshAccumulator();
    const sMid = (sMin + sMax) / 2;
    const ridgeCenter: Vec3D = {
      x: ridgeAxis.start.x + sMid * uRidge.x,
      y: ridgeAxis.start.y + sMid * uRidge.y,
      z: zRidge + 25,
    };

    ridgeAcc.addBeveledBox(
      ridgeCenter,
      { x: sLen + 40, y: 220, z: 60 },
      8,
      uRidge3D,
      nRidge3D,
      zVec,
    );

    parts.push({
      rawData: ridgeAcc.toRawMeshData(`${roof.id}_ridge`),
      materialRole: options?.metalMaterial ?? 'zinc_metal',
    });
  }

  // 2. Gouttières demi-rondes en zinc le long des deux lignes d'égout
  if (options?.hasGutters !== false) {
    const gutterAcc = new ArchitecturalMeshAccumulator();
    const sMid = (sMin + sMax) / 2;
    const gutterRadius = 60;

    for (const dSign of [-w1, w2]) {
      const eaveCenter: Vec3D = {
        x: ridgeAxis.start.x + sMid * uRidge.x + dSign * nRidge.x,
        y: ridgeAxis.start.y + sMid * uRidge.y + dSign * nRidge.y,
        z: zEave - 20,
      };
      gutterAcc.addBeveledBox(
        eaveCenter,
        { x: sLen + 60, y: gutterRadius * 2, z: gutterRadius },
        12,
        uRidge3D,
        nRidge3D,
        zVec,
      );

      const dropBottom: Vec3D = {
        x: ridgeAxis.start.x + (sMin + 150) * uRidge.x + dSign * nRidge.x,
        y: ridgeAxis.start.y + (sMin + 150) * uRidge.y + dSign * nRidge.y,
        z: zEave - 180,
      };
      gutterAcc.addSmoothCylinder(
        dropBottom,
        { x: dropBottom.x, y: dropBottom.y, z: zEave },
        40,
        12,
        true,
      );
    }

    parts.push({
      rawData: gutterAcc.toRawMeshData(`${roof.id}_gutters`),
      materialRole: options?.metalMaterial ?? 'zinc_metal',
    });
  }

  // 3. Rives de toiture sur les deux pignons
  if (options?.hasBargeBoards !== false) {
    const bargeAcc = new ArchitecturalMeshAccumulator();
    const bargeWidth = 40;
    const bargeDepth = 180;
    const slopeLen1 = w1 / cosSlope;
    const slopeLen2 = w2 / cosSlope;

    for (const sPos of [sMin, sMax]) {
      const panels: ReadonlyArray<{ midD: number; slopeLen: number; nSign: number }> = [
        { midD: -w1 / 2, slopeLen: slopeLen1, nSign: 1 },
        { midD: w2 / 2, slopeLen: slopeLen2, nSign: -1 },
      ];
      for (const p of panels) {
        const midZ = zRidge - Math.abs(p.midD) * tanSlope;
        const centerBarge: Vec3D = {
          x: ridgeAxis.start.x + sPos * uRidge.x + p.midD * nRidge.x,
          y: ridgeAxis.start.y + sPos * uRidge.y + p.midD * nRidge.y,
          z: midZ,
        };
        const dirSlope: Vec3D = {
          x: p.nSign * nRidge.x * cosSlope,
          y: p.nSign * nRidge.y * cosSlope,
          z: Math.sin(slopeRad),
        };
        bargeAcc.addBeveledBox(
          centerBarge,
          { x: bargeWidth, y: p.slopeLen + 20, z: bargeDepth },
          4,
          uRidge3D,
          dirSlope,
          zVec,
        );
      }
    }

    parts.push({
      rawData: bargeAcc.toRawMeshData(`${roof.id}_barge_boards`),
      materialRole: options?.metalMaterial ?? 'zinc_metal',
    });
  }

  return parts;
}

/**
 * Assemble la toiture LOD 350 complète à partir de son maillage structurel de base.
 */
export function createRoofAssemblyFromBase(
  baseMesh: RawMeshData,
  roof: RoofGeometryParams,
  roofType: RoofTypeGeometryParams,
  effectivePolygon?: { outer: readonly Vec2[]; holes: readonly (readonly Vec2[])[] },
  options?: RoofAssemblyOptions,
): ComponentAssembly3D {
  const detailLevel = options?.detailLevel ?? 'lod350';
  const isGable = roofType.family === 'gable';
  const defaultRole: ComponentMaterialRole = isGable ? 'roof_tile' : 'concrete_structural';

  const parts: ComponentAssemblyPart[] = [
    {
      rawData: baseMesh,
      materialRole: options?.structureMaterial ?? defaultRole,
    },
  ];

  if (detailLevel === 'lod350') {
    const detailParts = isGable
      ? buildGableRoofDetailParts(roof, roofType, options)
      : buildFlatRoofDetailParts(roof, roofType, effectivePolygon, options);
    parts.push(...detailParts);
  }

  return {
    elementId: roof.id,
    category: 'roof',
    family: 'roof',
    subType: roofType.family,
    parts,
  };
}
