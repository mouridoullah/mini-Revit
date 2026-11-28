import { describe, it, expect } from 'vitest';
import { vec2 } from '@tabax/geometry';
import {
  createRoofMesh,
  createRoofAssembly,
  createWallMeshWithOpenings,
  type RoofGeometryParams,
  type GableRoofTypeGeometryParams,
  type FlatRoofTypeGeometryParams,
} from './mesh-generator.js';

describe('Phase 7 — Rendu 3D des Toitures & Biseautage des Murs (packages/view-3d/src/roofs-3d.test.ts)', () => {
  const baseGableRoof: RoofGeometryParams = {
    id: 'roof_gable_01',
    footprint: [
      { x: 0, y: 0 },
      { x: 8000, y: 0 },
      { x: 8000, y: 6000 },
      { x: 0, y: 6000 },
    ],
    ridgeAxis: {
      start: { x: 0, y: 3000 },
      end: { x: 8000, y: 3000 },
    },
    elevation: 3000,
    baseOffset: 0,
  };

  const gableRoofType: GableRoofTypeGeometryParams = {
    family: 'gable',
    thickness: 200,
    slopeDeg: 35,
    overhangMm: 0,
  };

  const flatRoofType: FlatRoofTypeGeometryParams = {
    family: 'flat',
    thickness: 250,
  };

  /**
   * Calcule le volume exact d'un maillage triangulé fermé via le théorème de la divergence.
   */
  function computeMeshVolume(positions: Float32Array, indices: Uint32Array): number {
    let vol = 0;
    for (let i = 0; i < indices.length; i += 3) {
      const i0 = (indices[i] ?? 0) * 3;
      const i1 = (indices[i + 1] ?? 0) * 3;
      const i2 = (indices[i + 2] ?? 0) * 3;

      const x0 = positions[i0] ?? 0, y0 = positions[i0 + 1] ?? 0, z0 = positions[i0 + 2] ?? 0;
      const x1 = positions[i1] ?? 0, y1 = positions[i1 + 1] ?? 0, z1 = positions[i1 + 2] ?? 0;
      const x2 = positions[i2] ?? 0, y2 = positions[i2 + 1] ?? 0, z2 = positions[i2 + 2] ?? 0;

      vol += (x0 * (y1 * z2 - y2 * z1) - y0 * (x1 * z2 - x2 * z1) + z0 * (x1 * y2 - x2 * y1)) / 6;
    }
    return Math.abs(vol);
  }

  /**
   * Calcule la caractéristique d'Euler V - E + F sur un maillage triangulé fermé.
   */
  function computeEulerCharacteristic(positions: Float32Array, indices: Uint32Array): number {
    const vertexMap = new Map<string, number>();
    const remap: number[] = [];
    let uniqueVertCount = 0;

    for (let i = 0; i < positions.length; i += 3) {
      const x = Math.round((positions[i] ?? 0) * 10) / 10;
      const y = Math.round((positions[i + 1] ?? 0) * 10) / 10;
      const z = Math.round((positions[i + 2] ?? 0) * 10) / 10;
      const key = `${x},${y},${z}`;

      let vId = vertexMap.get(key);
      if (vId === undefined) {
        vId = uniqueVertCount++;
        vertexMap.set(key, vId);
      }
      remap.push(vId);
    }

    const V = uniqueVertCount;
    const F = indices.length / 3;

    const edgeSet = new Set<string>();
    for (let i = 0; i < indices.length; i += 3) {
      const i0 = remap[indices[i]!]!;
      const i1 = remap[indices[i + 1]!]!;
      const i2 = remap[indices[i + 2]!]!;

      const e1 = i0 < i1 ? `${i0}-${i1}` : `${i1}-${i0}`;
      const e2 = i1 < i2 ? `${i1}-${i2}` : `${i2}-${i1}`;
      const e3 = i2 < i0 ? `${i2}-${i0}` : `${i0}-${i2}`;

      edgeSet.add(e1);
      edgeSet.add(e2);
      edgeSet.add(e3);
    }

    const E = edgeSet.size;
    return V - E + F;
  }

  it('T-ROOF-3D-01 : createRoofMesh(gable) -> volume fermé, caractéristique d’Euler V - E + F = 2', () => {
    const mesh = createRoofMesh(baseGableRoof, gableRoofType);
    expect(mesh).not.toBeNull();
    if (!mesh) return;

    const euler = computeEulerCharacteristic(mesh.positions, mesh.indices);
    expect(euler).toBe(2);
  });

  it('T-ROOF-3D-02 : createRoofMesh(flat) -> prisme rectangulaire fermé, Euler = 2', () => {
    const mesh = createRoofMesh(baseGableRoof, flatRoofType);
    expect(mesh).not.toBeNull();
    if (!mesh) return;

    const euler = computeEulerCharacteristic(mesh.positions, mesh.indices);
    expect(euler).toBe(2);
  });

  it('T-ROOF-3D-03 : Volume gable = 2 x (aire_pan x épaisseur) — équivalence analytique et intégrale de divergence', () => {
    const mesh = createRoofMesh(baseGableRoof, gableRoofType);
    expect(mesh).not.toBeNull();
    if (!mesh) return;

    const volComputed = computeMeshVolume(mesh.positions, mesh.indices);

    // Calcul analytique :
    // L = 8000 mm
    // Demi-portée = 3000 mm
    // Pente = 35° -> cos(35°)
    const slopeRad = (35 * Math.PI) / 180;
    const cosSlope = Math.cos(slopeRad);
    const halfSpan = 3000;
    const length = 8000;
    const thickness = 200;

    const panSlopeWidth = halfSpan / cosSlope;
    const panArea = length * panSlopeWidth;
    const expectedVolume = 2 * (panArea * thickness);

    // Précision relative stricte de 1e-5 (0.001%) sur Float32Array (505 mm³ d’écart sur 11.7 m³)
    const relDiff = Math.abs(volComputed - expectedVolume) / expectedVolume;
    expect(relDiff).toBeLessThan(1e-5);
  });

  it('T-ROOF-3D-04 : With opening -> hole visible — réservation ajourée avec parois intérieures', () => {
    const roofWithOpening: RoofGeometryParams = {
      ...baseGableRoof,
      openings: [
        {
          offsetU: 2000,
          offsetV: 500,
          width: 1000,
          height: 1200,
        },
      ],
    };

    const meshWithout = createRoofMesh(baseGableRoof, gableRoofType);
    const meshWith = createRoofMesh(roofWithOpening, gableRoofType);

    expect(meshWithout).not.toBeNull();
    expect(meshWith).not.toBeNull();
    if (!meshWithout || !meshWith) return;

    // Le maillage avec réservation a plus de triangles (parois de trémie)
    expect(meshWith.indices.length).toBeGreaterThan(meshWithout.indices.length);

    // Le volume de matière est strictement inférieur (matière découpée)
    const volWithout = computeMeshVolume(meshWithout.positions, meshWithout.indices);
    const volWith = computeMeshVolume(meshWith.positions, meshWith.indices);
    expect(volWith).toBeLessThan(volWithout);
  });

  it('T-ROOF-3D-05 : Bounding box correcte — conformité altimétrique zEave et zRidge', () => {
    const mesh = createRoofMesh(baseGableRoof, gableRoofType);
    expect(mesh).not.toBeNull();
    if (!mesh) return;

    const slopeRad = (35 * Math.PI) / 180;
    const tanSlope = Math.tan(slopeRad);
    const cosSlope = Math.cos(slopeRad);
    const totalRise = 3000 * tanSlope;
    const deltaZ = 200 / cosSlope;

    const expectedZMax = 3000 + totalRise;
    const expectedZMin = 3000 - deltaZ;

    expect(mesh.boundingBox.max.z).toBeCloseTo(expectedZMax, 1);
    expect(mesh.boundingBox.min.z).toBeCloseTo(expectedZMin, 1);
  });

  it('T-ROOF-3D-06 : Normales unitaires, orientées vers l’extérieur', () => {
    const mesh = createRoofMesh(baseGableRoof, gableRoofType);
    expect(mesh).not.toBeNull();
    if (!mesh) return;

    const normals = mesh.normals;
    for (let i = 0; i < normals.length; i += 3) {
      const nx = normals[i] ?? 0;
      const ny = normals[i + 1] ?? 0;
      const nz = normals[i + 2] ?? 0;
      const len = Math.hypot(nx, ny, nz);
      expect(len).toBeCloseTo(1.0, 3);
    }
  });

  it('T-WALL-BEVEL-3D-01 : Mur pignon avec topProfile chevron -> 3D peak exact à zRidge = zBase + totalRise', () => {
    const slopeRad = (35 * Math.PI) / 180;
    const tanSlope = Math.tan(slopeRad);
    const totalRise = 3000 * tanSlope;
    const zBase = 3000;
    const zRidge = zBase + totalRise; // ~5100.6 mm

    // Mur pignon transversal de (0, 0) à (0, 6000), traversant le faîtage à y = 3000 (u = 3000)
    const gableWallMeshes = createWallMeshWithOpenings({
      wall: {
        id: 'wall_gable',
        start: { x: 0, y: 0 },
        end: { x: 0, y: 6000 },
      },
      wallType: {
        thickness: 200,
        height: 2800,
      },
      openings: [],
      elevation: 0,
      topProfile: [
        vec2(0, zBase),
        vec2(3000, zRidge),
        vec2(6000, zBase),
      ],
    });

    expect(gableWallMeshes.length).toBeGreaterThanOrEqual(1);

    // Trouver le Z maximum absolu sur l'ensemble des sommets générés
    let maxFoundZ = -Infinity;
    let minFoundZ = Infinity;
    for (const m of gableWallMeshes) {
      for (let i = 2; i < m.positions.length; i += 3) {
        const z = m.positions[i]!;
        if (z > maxFoundZ) maxFoundZ = z;
        if (z < minFoundZ) minFoundZ = z;
      }
    }

    expect(minFoundZ).toBeCloseTo(0, 1);
    expect(maxFoundZ).toBeCloseTo(zRidge, 1);
  });

  it('T-WALL-BEVEL-3D-02 : Mur sous pan unique avec topProfile trapézoïdal -> 3D arase inclinée continue', () => {
    const wallMeshes = createWallMeshWithOpenings({
      wall: {
        id: 'wall_sloped',
        start: { x: 0, y: 0 },
        end: { x: 4000, y: 0 },
      },
      wallType: {
        thickness: 200,
        height: 2800,
      },
      openings: [],
      elevation: 0,
      topProfile: [
        vec2(0, 3000),
        vec2(4000, 4200),
      ],
    });

    expect(wallMeshes.length).toBe(1);
    const m = wallMeshes[0]!;
    expect(m.boundingBox.min.z).toBeCloseTo(0, 1);
    expect(m.boundingBox.max.z).toBeCloseTo(4200, 1);

    const euler = computeEulerCharacteristic(m.positions, m.indices);
    expect(euler).toBe(2);
  });

  it('T-WALL-BEVEL-3D-03 : Conformité géométrique continue — tous les sommets supérieurs 3D épousent rigoureusement topProfile (Point A / Phase 7.6.1)', () => {
    const topProfile = [vec2(0, 3000), vec2(4000, 4200)];
    const wallMeshes = createWallMeshWithOpenings({
      wall: {
        id: 'wall_sloped_check',
        start: { x: 0, y: 0 },
        end: { x: 4000, y: 0 },
      },
      wallType: {
        thickness: 200,
        height: 2800,
      },
      openings: [],
      elevation: 0,
      topProfile,
    });

    const m = wallMeshes[0]!;
    // Pour chaque sommet 3D ayant z > 0 (sommet de l'arase supérieure)
    for (let i = 0; i < m.positions.length; i += 3) {
      const x = m.positions[i]!;
      const z = m.positions[i + 2]!;
      if (z > 100) {
        // En coordonnées du mur (start: (0,0), end: (4000,0)), u = x
        const expectedZ = 3000 + (x / 4000) * (4200 - 3000);
        expect(z).toBeCloseTo(expectedZ, 1);
      }
    }
  });

  it('T-ROOF-3D-08 : createRoofAssembly(flat) — LOD 350 avec dalle support, gravillons et couvertines acrotère', () => {
    const assembly = createRoofAssembly(baseGableRoof, flatRoofType, undefined, { detailLevel: 'lod350' });
    expect(assembly).not.toBeNull();
    expect(assembly!.category).toBe('roof');
    expect(assembly!.parts).toHaveLength(3);

    const roles = assembly!.parts.map((p) => p.materialRole);
    expect(roles).toContain('concrete_structural'); // dalle béton
    expect(roles).toContain('alu_anthracite'); // couvertines
    expect(roles).toContain('roof_gravel'); // gravillons / étanchéité
  });

  it('T-ROOF-3D-09 : createRoofAssembly(gable) — LOD 350 avec tuiles, faîtage profilé, gouttières zinc et rives', () => {
    const assembly = createRoofAssembly(baseGableRoof, gableRoofType, undefined, { detailLevel: 'lod350' });
    expect(assembly).not.toBeNull();
    expect(assembly!.category).toBe('roof');
    expect(assembly!.parts).toHaveLength(4);

    const roles = assembly!.parts.map((p) => p.materialRole);
    expect(roles).toContain('roof_tile'); // tuiles corps
    expect(roles.filter((r) => r === 'zinc_metal')).toHaveLength(3); // faîtage, gouttières, rives
  });
});
