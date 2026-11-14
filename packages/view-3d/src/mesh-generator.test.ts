import { describe, it, expect } from 'vitest';
import {
  createWallMesh,
  createWallMeshWithOpenings,
  createOpeningPlaceholder,
  type WallGeometryParams,
  type WallTypeGeometryParams,
  type OpeningGeometryParams,
} from './mesh-generator.js';
import { type RawMeshData } from '@mini-bim/geometry';

/**
 * Calcule le volume exact d'un maillage 3D fermé (RawMeshData) par le théorème de divergence.
 */
function computeMeshVolume(mesh: RawMeshData): number {
  const p = mesh.positions;
  const idx = mesh.indices;
  let totalSignedVolume = 0;

  for (let i = 0; i < idx.length; i += 3) {
    const i0 = idx[i]! * 3;
    const i1 = idx[i + 1]! * 3;
    const i2 = idx[i + 2]! * 3;

    const x0 = p[i0]!,
      y0 = p[i0 + 1]!,
      z0 = p[i0 + 2]!;
    const x1 = p[i1]!,
      y1 = p[i1 + 1]!,
      z1 = p[i1 + 2]!;
    const x2 = p[i2]!,
      y2 = p[i2 + 1]!,
      z2 = p[i2 + 2]!;

    // Déterminant de la matrice 3x3 formée par les 3 sommets du triangle
    const det = x0 * (y1 * z2 - y2 * z1) - y0 * (x1 * z2 - x2 * z1) + z0 * (x1 * y2 - x2 * y1);
    totalSignedVolume += det;
  }

  return Math.abs(totalSignedVolume / 6.0);
}

describe('mesh-generator — Générateur de maillage 3D neutre pour view-3d', () => {
  it('génère un RawMeshData 3D fermé et valide pour un mur architectural à altitude 0', () => {
    const wall = {
      id: 'w_gen_01',
      start: { x: 0, y: 0 },
      end: { x: 4000, y: 0 },
    };
    const wallType = {
      thickness: 200,
      height: 2800,
    };

    const mesh = createWallMesh(wall, wallType, 0);
    expect(mesh).not.toBeNull();
    if (!mesh) return;

    expect(mesh.elementId).toBe('w_gen_01');
    expect(mesh.role).toBe('full');

    // 8 sommets topologiques dédoublés pour normales franches :
    // 4 sommets fond (normal -Z) + 4 sommets couvercle (normal +Z) + 4x4 sommets flancs = 24 sommets = 72 floats
    expect(mesh.positions.length).toBe(72);
    expect(mesh.normals.length).toBe(72);
    // 12 triangles (2 fond + 2 couvercle + 8 flancs) = 36 indices
    expect(mesh.indices.length).toBe(36);

    // Vérification de la présence de normales verticales +Z (couvercle) et -Z (fond)
    let hasUpNormal = false;
    let hasDownNormal = false;
    for (let i = 0; i < mesh.normals.length; i += 3) {
      const nz = mesh.normals[i + 2]!;
      if (Math.abs(nz - 1) < 1e-4) hasUpNormal = true;
      if (Math.abs(nz - -1) < 1e-4) hasDownNormal = true;
    }
    expect(hasUpNormal).toBe(true);
    expect(hasDownNormal).toBe(true);

    // Hauteur Z = 2800 mm
    expect(mesh.boundingBox.min.z).toBeCloseTo(0, 1);
    expect(mesh.boundingBox.max.z).toBeCloseTo(2800, 1);
  });

  it('génère un maillage prenant en compte l’élévation altimétrique du niveau', () => {
    const wall = {
      id: 'w_gen_r1',
      start: { x: 0, y: 0 },
      end: { x: 5000, y: 0 },
    };
    const wallType = {
      thickness: 300,
      height: 2700,
    };
    const elevation = 3200; // R+1 à +3.20m

    const mesh = createWallMesh(wall, wallType, elevation);
    expect(mesh).not.toBeNull();
    if (!mesh) return;

    expect(mesh.boundingBox.min.z).toBeCloseTo(3200, 1);
    expect(mesh.boundingBox.max.z).toBeCloseTo(5900, 1);
  });

  /* =========================================================================
   * TESTS PHASE 3.2 : MURS PERCÉS ET PLACEHOLDERS D'OUVERTURES
   * ========================================================================= */

  const testWall: WallGeometryParams = {
    id: 'wall_host_3d',
    start: { x: 0, y: 0 },
    end: { x: 6000, y: 0 },
  };

  const testWallType: WallTypeGeometryParams = {
    thickness: 200,
    height: 2800,
  };

  it('createWallMeshWithOpenings sur mur plein (0 ouvertures) retourne 1 pièce de volume total', () => {
    const meshes = createWallMeshWithOpenings({
      wall: testWall,
      wallType: testWallType,
      openings: [],
    });

    expect(meshes).toHaveLength(1);
    const m = meshes[0]!;
    expect(m.elementId).toBe('wall_host_3d');
    expect(m.role).toBe('full');

    const expectedVolume = 6000 * 200 * 2800; // 3 360 000 000 mm³
    const measuredVolume = computeMeshVolume(m);
    expect(measuredVolume).toBeCloseTo(expectedVolume, -2);
  });

  it('createWallMeshWithOpenings avec 1 fenêtre génère exactement 4 pièces (full, sill, lintel, full)', () => {
    const windowOp: OpeningGeometryParams = {
      id: 'win_test',
      kind: 'window',
      offsetAlong: 2000,
      width: 1200,
      height: 1400,
      sillHeight: 900,
    };

    const meshes = createWallMeshWithOpenings({
      wall: testWall,
      wallType: testWallType,
      openings: [windowOp],
    });

    // Pièces attendues : full avant [0..2000], sill [2000..3200] z[0..900], lintel [2000..3200] z[2300..2800], full après [3200..6000]
    expect(meshes).toHaveLength(4);

    // Invariant fondamental : toutes les pièces portent elementId = wall.id pour le raycasting/picking
    for (const mesh of meshes) {
      expect(mesh.elementId).toBe('wall_host_3d');
    }

    const roles = meshes.map((m) => m.role);
    expect(roles).toEqual(['full', 'sill', 'lintel', 'full']);
  });

  it('createWallMeshWithOpenings avec 1 porte génère 3 pièces si linteau présent, ou 2 si pleine hauteur', () => {
    // 1. Porte standard (2100 mm < hauteur mur 2800 mm) -> linteau présent au-dessus de la porte
    const standardDoor: OpeningGeometryParams = {
      id: 'door_standard',
      kind: 'door',
      offsetAlong: 1000,
      width: 900,
      height: 2100,
      sillHeight: 0,
    };

    const meshesStandard = createWallMeshWithOpenings({
      wall: testWall,
      wallType: testWallType,
      openings: [standardDoor],
    });

    // Pièces attendues : full avant [0..1000], lintel [1000..1900] z[2100..2800], full après [1900..6000] (pas de sill car sillHeight = 0)
    expect(meshesStandard).toHaveLength(3);
    expect(meshesStandard.map((m) => m.role)).toEqual(['full', 'lintel', 'full']);

    // 2. Porte pleine hauteur (2800 mm = hauteur mur) -> aucun linteau
    const fullHeightDoor: OpeningGeometryParams = {
      id: 'door_full_h',
      kind: 'door',
      offsetAlong: 1000,
      width: 900,
      height: 2800,
      sillHeight: 0,
    };

    const meshesFullH = createWallMeshWithOpenings({
      wall: testWall,
      wallType: testWallType,
      openings: [fullHeightDoor],
    });

    // Pièces attendues : full avant [0..1000], full après [1900..6000]
    expect(meshesFullH).toHaveLength(2);
    expect(meshesFullH.map((m) => m.role)).toEqual(['full', 'full']);
  });

  it('createWallMeshWithOpenings avec 1 porte + 1 fenêtre génère 6 pièces distinctes', () => {
    const door: OpeningGeometryParams = {
      id: 'door_1',
      kind: 'door',
      offsetAlong: 800,
      width: 900,
      height: 2100,
      sillHeight: 0,
    };

    const win: OpeningGeometryParams = {
      id: 'win_1',
      kind: 'window',
      offsetAlong: 2500,
      width: 1200,
      height: 1400,
      sillHeight: 900,
    };

    const meshes = createWallMeshWithOpenings({
      wall: testWall,
      wallType: testWallType,
      openings: [door, win],
    });

    // Séquence :
    // [0..800] full
    // [800..1700] door -> lintel (z 2100..2800)
    // [1700..2500] full intermédiaire
    // [2500..3700] window -> sill (z 0..900) + lintel (z 2300..2800)
    // [3700..6000] full final
    expect(meshes).toHaveLength(6);
    expect(meshes.map((m) => m.role)).toEqual(['full', 'lintel', 'full', 'sill', 'lintel', 'full']);
  });

  it('createOpeningPlaceholder génère un maillage 3D avec boîte englobante et dimensions exactes', () => {
    const doorParams: OpeningGeometryParams = {
      id: 'door_placeholder_test',
      kind: 'door',
      offsetAlong: 1500,
      width: 900,
      height: 2100,
      sillHeight: 0,
    };

    const doorMesh = createOpeningPlaceholder(doorParams, testWall, 0);
    expect(doorMesh.elementId).toBe('door_placeholder_test');
    expect(doorMesh.boundingBox.min.z).toBeCloseTo(0, 1);
    expect(doorMesh.boundingBox.max.z).toBeCloseTo(2100, 1);

    // Boîte porte = width 900 × height 2100 × thickness 50 mm
    const expectedDoorVolume = 900 * 50 * 2100;
    const measuredDoorVolume = computeMeshVolume(doorMesh);
    expect(measuredDoorVolume).toBeCloseTo(expectedDoorVolume, -2);

    const winParams: OpeningGeometryParams = {
      id: 'win_placeholder_test',
      kind: 'window',
      offsetAlong: 3000,
      width: 1200,
      height: 1400,
      sillHeight: 900,
    };

    const winMesh = createOpeningPlaceholder(winParams, testWall, 500); // élévation niveau 500 mm
    expect(winMesh.elementId).toBe('win_placeholder_test');
    // z0 = 500 + 900 = 1400, z1 = 1400 + 1400 = 2800
    expect(winMesh.boundingBox.min.z).toBeCloseTo(1400, 1);
    expect(winMesh.boundingBox.max.z).toBeCloseTo(2800, 1);

    // Boîte fenêtre = width 1200 × height 1400 × thickness 30 mm
    const expectedWinVolume = 1200 * 30 * 1400;
    const measuredWinVolume = computeMeshVolume(winMesh);
    expect(measuredWinVolume).toBeCloseTo(expectedWinVolume, -2);
  });

  it('conservation des volumes : Σ volumes pièces = volume mur - Σ volumes ouvertures (preuve chiffrée)', () => {
    const door: OpeningGeometryParams = {
      id: 'd_vol',
      kind: 'door',
      offsetAlong: 1000,
      width: 900,
      height: 2100,
      sillHeight: 0,
    };

    const win: OpeningGeometryParams = {
      id: 'w_vol',
      kind: 'window',
      offsetAlong: 3000,
      width: 1400,
      height: 1200,
      sillHeight: 1000,
    };

    const meshes = createWallMeshWithOpenings({
      wall: testWall,
      wallType: testWallType,
      openings: [door, win],
    });

    const wallTotalVolume = 6000 * 200 * 2800; // 3 360 000 000 mm³
    const doorVoidVolume = 900 * 200 * 2100; //   378 000 000 mm³
    const winVoidVolume = 1400 * 200 * 1200; //   336 000 000 mm³
    const expectedSolidVolume = wallTotalVolume - (doorVoidVolume + winVoidVolume); // 2 646 000 000 mm³

    let measuredSolidVolume = 0;
    for (const m of meshes) {
      measuredSolidVolume += computeMeshVolume(m);
    }

    // Sur un mur aligné sur les axes (coordonnées entières exactes), le résidu de volume est strictement 0.0e+0
    expect(measuredSolidVolume).toBe(expectedSolidVolume);
    expect(Math.abs(measuredSolidVolume - expectedSolidVolume)).toBe(0);
  });

  it('conservation des volumes sur mur orienté à 45° : résidu sous-millimétrique documenté dû aux coordonnées irrationnelles (sqrt(2))', () => {
    const L = 6000;
    const c = Math.SQRT1_2;
    const wall45: WallGeometryParams = {
      id: 'w_45_vol',
      start: { x: 0, y: 0 },
      end: { x: L * c, y: L * c },
    };

    const door: OpeningGeometryParams = {
      id: 'd_45',
      kind: 'door',
      offsetAlong: 1000,
      width: 900,
      height: 2100,
      sillHeight: 0,
    };

    const win: OpeningGeometryParams = {
      id: 'w_45',
      kind: 'window',
      offsetAlong: 3000,
      width: 1400,
      height: 1200,
      sillHeight: 1000,
    };

    const meshes = createWallMeshWithOpenings({
      wall: wall45,
      wallType: testWallType,
      openings: [door, win],
    });

    const expectedSolidVolume = 2646000000; // 3360e6 - 378e6 - 336e6

    let measuredSolidVolume = 0;
    for (const m of meshes) {
      measuredSolidVolume += computeMeshVolume(m);
    }

    // Le résidu brut float64 provient de la projection de sqrt(2) sur la géométrie en Float32Array
    const residualDelta = Math.abs(measuredSolidVolume - expectedSolidVolume);
    // Erreur relative < 2e-7 sur 2.646 milliards de mm³ (soit moins de 0.00002% d'écart global)
    expect(residualDelta / expectedSolidVolume).toBeLessThan(2e-7);
    expect(residualDelta).toBeLessThan(500); // 489.36 mm³ sur un volume total de 2 646 000 000 mm³
  });
});
