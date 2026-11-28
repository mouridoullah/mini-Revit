/**
 * mesh-generator/mep/prototypes — Prototypes géométriques unitaires pour GPU InstancedMesh
 *
 * Chaque prototype est centré sur son repère local standard afin d'être instancié en masse
 * sans duplication mémoire CPU/GPU (boulons M10, équerres de brides, colliers, tiges, barreaux, etc.).
 */

import type { RawMeshData } from '@tabax/geometry';
import { v3 } from './common.js';
import type { MepInstancePrototypeKey } from './assembly-types.js';
import { UvMeshAccumulator } from './primitives.js';

const U_X = v3(1, 0, 0);
const V_Y = v3(0, 1, 0);
const W_Z = v3(0, 0, 1);

function buildBoltM10Prototype(): RawMeshData {
  const acc = new UvMeshAccumulator();
  // Tête hexagonale H17 x 7 mm + rondelle + tige M10 x 24 mm
  acc.addHexPrism(v3(0, 0, 5.5), W_Z, 17, 7);
  acc.addSmoothCylinder(v3(0, 0, 0), v3(0, 0, 2), 11, 12, true);
  acc.addSmoothCylinder(v3(0, 0, -24), v3(0, 0, 0), 5, 10, true);
  return acc.toRawMeshData('proto_bolt_m10');
}

function buildFlangeCornerPrototype(): RawMeshData {
  const acc = new UvMeshAccumulator();
  // Équerre d'angle en L pour bride rectangulaire (30 x 30 x 5 mm)
  acc.addBeveledBox(v3(12, 2.5, 0), 24, 5, 22, U_X, V_Y, W_Z, 1);
  acc.addBeveledBox(v3(2.5, 12, 0), 5, 24, 22, U_X, V_Y, W_Z, 1);
  return acc.toRawMeshData('proto_flange_corner');
}

function buildPipeClampPrototype(): RawMeshData {
  const acc = new UvMeshAccumulator();
  // Collier unitaire (rayon intérieur normalisé = 1, largeur axiale = 18 mm) + oreilles de serrage
  acc.addFlangeProfile(v3(0, 0, 0), W_Z, 1.0, 1.18, 18, 1.2, 20);
  acc.addBeveledBox(v3(1.22, 0, 0), 0.2, 0.24, 18, U_X, V_Y, W_Z, 0.04);
  acc.addBeveledBox(v3(-1.22, 0, 0), 0.2, 0.24, 18, U_X, V_Y, W_Z, 0.04);
  return acc.toRawMeshData('proto_pipe_clamp');
}

function buildThreadedRodPrototype(): RawMeshData {
  const acc = new UvMeshAccumulator();
  // Tige filetée Ø8 mm de longueur unitaire 1 mm le long de Z (scalée par la portée)
  acc.addSmoothCylinder(v3(0, 0, 0), v3(0, 0, 1), 4, 8, true);
  return acc.toRawMeshData('proto_threaded_rod');
}

function buildLadderRungPrototype(): RawMeshData {
  const acc = new UvMeshAccumulator();
  // Barreau transversal de largeur unitaire 1 mm le long de X, section 18 x 12 mm chanfreinée
  acc.addBeveledBox(v3(0, 0, 0), 1, 18, 12, U_X, V_Y, W_Z, 0.2);
  return acc.toRawMeshData('proto_ladder_rung');
}

function buildCableGlandPrototype(): RawMeshData {
  const acc = new UvMeshAccumulator();
  // Presse-étoupe ISO M20 : embase filetée + écrou 6 pans + dôme de serrage conique
  acc.addSmoothCylinder(v3(0, 0, -6), v3(0, 0, 0), 11, 12, true);
  acc.addHexPrism(v3(0, 0, 4), W_Z, 24, 8);
  acc.addSmoothCylinder(v3(0, 0, 8), v3(0, 0, 18), 10, 12, true);
  acc.addHexPrism(v3(0, 0, 20), W_Z, 22, 6);
  return acc.toRawMeshData('proto_cable_gland');
}

function buildCabinetHingePrototype(): RawMeshData {
  const acc = new UvMeshAccumulator();
  // Charnière cylindrique d'armoire TGBT (axe Z, H = 56 mm, Ø12 mm + patte)
  acc.addSmoothCylinder(v3(0, 0, -28), v3(0, 0, 28), 6, 12, true);
  acc.addBeveledBox(v3(6, 0, 0), 10, 4, 44, U_X, V_Y, W_Z, 1);
  return acc.toRawMeshData('proto_cabinet_hinge');
}

function buildDiffuserBladePrototype(): RawMeshData {
  const acc = new UvMeshAccumulator();
  // Ailette profilée de longueur unitaire 1 mm selon X, orientée à 30° dans le plan (Y, Z)
  const cos30 = Math.cos(Math.PI / 6);
  const sin30 = Math.sin(Math.PI / 6);
  const vTilted = v3(0, cos30, sin30);
  const wTilted = v3(0, -sin30, cos30);
  acc.addBeveledBox(v3(0, 0, 0), 1, 22, 3, U_X, vTilted, wTilted, 0.2);
  return acc.toRawMeshData('proto_diffuser_blade');
}

let cachedPrototypes: Readonly<Record<MepInstancePrototypeKey, RawMeshData>> | null = null;

export function getAllMepPrototypes(): Readonly<Record<MepInstancePrototypeKey, RawMeshData>> {
  if (cachedPrototypes) return cachedPrototypes;
  cachedPrototypes = {
    bolt_m10: buildBoltM10Prototype(),
    flange_corner: buildFlangeCornerPrototype(),
    pipe_clamp: buildPipeClampPrototype(),
    threaded_rod: buildThreadedRodPrototype(),
    ladder_rung: buildLadderRungPrototype(),
    cable_gland: buildCableGlandPrototype(),
    cabinet_hinge: buildCabinetHingePrototype(),
    diffuser_blade: buildDiffuserBladePrototype(),
  };
  return cachedPrototypes;
}

export function getMepPrototypeMesh(key: MepInstancePrototypeKey): RawMeshData {
  return getAllMepPrototypes()[key];
}
