/**
 * components/architectural-prototypes — Prototypes géométriques unitaires pour GPU InstancedMesh architectural
 *
 * Centralise les pièces répétitives d'architecture et d'équipement (potelets de garde-corps,
 * poignées/béquilles de porte, charnières, poignées filantes, piétements de mobilier)
 * afin d'être rendues via THREE.InstancedMesh sans duplication de buffers CPU/GPU.
 */

import type { RawMeshData } from '@tabax/geometry';
import type { ComponentInstancePrototypeKey } from './types.js';
import { ArchitecturalMeshAccumulator, v3 } from './architectural-primitives.js';

const U_X = v3(1, 0, 0);
const V_Y = v3(0, 1, 0);
const W_Z = v3(0, 0, 1);

function buildRailingPostPrototype(): RawMeshData {
  const acc = new ArchitecturalMeshAccumulator();
  // Potelet cylindrique Ø36 mm de hauteur unitaire 1 mm le long de +Z (scalé par la hauteur)
  acc.addSmoothCylinder(v3(0, 0, 0), v3(0, 0, 1), 18, 12, true);
  return acc.toRawMeshData('proto_railing_post');
}

function buildDoorHandlePrototype(): RawMeshData {
  const acc = new ArchitecturalMeshAccumulator();
  // Rosace Ø52 mm ép. 8 mm sur y = 0..8, col cylindrique + levier biseauté le long de -X (+Y vers extérieur)
  acc.addSmoothCylinder(v3(0, 0, 0), v3(0, 8, 0), 26, 14, true);
  acc.addSmoothCylinder(v3(0, 8, 0), v3(0, 42, 0), 9, 10, true);
  acc.addBeveledBox(v3(-52, 46, 0), v3(120, 14, 18), 3, U_X, V_Y, W_Z);
  return acc.toRawMeshData('proto_door_handle');
}

function buildDoorHingePrototype(): RawMeshData {
  const acc = new ArchitecturalMeshAccumulator();
  // Charnière / paumelle Ø14 mm x H 90 mm centrée sur l'axe Z + platine d'appui
  acc.addSmoothCylinder(v3(0, 0, -45), v3(0, 0, 45), 7, 12, true);
  acc.addBeveledBox(v3(8, 0, 0), v3(16, 4, 72), 1, U_X, V_Y, W_Z);
  return acc.toRawMeshData('proto_door_hinge');
}

function buildCabinetPullPrototype(): RawMeshData {
  const acc = new ArchitecturalMeshAccumulator();
  // Poignée filante horizontale Ø12 mm de longueur unitaire 1 mm le long de X (scalée en X)
  acc.addSmoothCylinder(v3(-0.5, 0, 0), v3(0.5, 0, 0), 6, 12, true);
  return acc.toRawMeshData('proto_cabinet_pull');
}

function buildFurnitureLegPrototype(): RawMeshData {
  const acc = new ArchitecturalMeshAccumulator();
  // Pied cylindrique unitaire (rayon 1 mm, hauteur 1 mm le long de +Z), scalé en (r, r, H)
  acc.addSmoothCylinder(v3(0, 0, 0), v3(0, 0, 1), 1, 12, true);
  return acc.toRawMeshData('proto_furniture_leg');
}

let cachedArchPrototypes: Readonly<Record<ComponentInstancePrototypeKey, RawMeshData>> | null = null;

export function getAllArchitecturalPrototypes(): Readonly<
  Record<ComponentInstancePrototypeKey, RawMeshData>
> {
  if (cachedArchPrototypes) return cachedArchPrototypes;
  cachedArchPrototypes = {
    railing_post: buildRailingPostPrototype(),
    door_handle: buildDoorHandlePrototype(),
    door_hinge: buildDoorHingePrototype(),
    cabinet_pull: buildCabinetPullPrototype(),
    furniture_leg: buildFurnitureLegPrototype(),
  };
  return cachedArchPrototypes;
}

export function getArchitecturalPrototypeMesh(key: ComponentInstancePrototypeKey): RawMeshData {
  return getAllArchitecturalPrototypes()[key];
}
