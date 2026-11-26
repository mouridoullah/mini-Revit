/**
 * mesh-generator/mep/assembly-types — Contrat neutre LOD 350 multi-matériaux et instances GPU
 *
 * Zéro dépendance Three.js : produit des descriptions pures consommées par @tabax/view-3d/rendering.
 */

import type { RawMeshData } from '@tabax/geometry';
import type { Vec3D } from './common.js';

export type MepMaterialRole =
  | 'galvanized_steel'
  | 'copper_brushed'
  | 'pvc_matte'
  | 'brass_machined'
  | 'steel_ral7035'
  | 'zinc_hardware'
  | 'epdm_rubber'
  | 'anodized_alu'
  | 'fluid_accent'
  | 'cable_cfo'
  | 'cable_cfa'
  | 'cable_earth';

export type MepInstancePrototypeKey =
  | 'bolt_m10'
  | 'flange_corner'
  | 'pipe_clamp'
  | 'threaded_rod'
  | 'ladder_rung'
  | 'cable_gland'
  | 'cabinet_hinge'
  | 'diffuser_blade';

export interface MepAssemblyPart {
  readonly rawData: RawMeshData;
  readonly materialRole: MepMaterialRole;
  readonly color?: string | undefined;
}

export interface MepInstanceAnchor {
  readonly prototypeKey: MepInstancePrototypeKey;
  /** Matrice 4x4 column-major compatible THREE.Matrix4.fromArray(). */
  readonly matrix: readonly number[];
  readonly materialRole: MepMaterialRole;
  readonly color?: string | undefined;
}

export interface MepAssembly3D {
  readonly elementId: string;
  readonly category: 'pipe' | 'duct' | 'cableTray' | 'mepFitting' | 'mepEquipment';
  readonly systemType?: string | undefined;
  readonly domain?: string | undefined;
  readonly parts: readonly MepAssemblyPart[];
  readonly instances: readonly MepInstanceAnchor[];
}

/**
 * Construit une matrice 4x4 column-major (ordre Three.js Matrix4.elements) à partir
 * d'une origine, de trois axes orthonormés (u, v, w) et d'une échelle optionnelle (sx, sy, sz).
 */
export function composeMatrix4(
  origin: Vec3D,
  u: Vec3D,
  v: Vec3D,
  w: Vec3D,
  scaleXYZ: Vec3D = { x: 1, y: 1, z: 1 },
): readonly number[] {
  return [
    u.x * scaleXYZ.x,
    u.y * scaleXYZ.x,
    u.z * scaleXYZ.x,
    0,
    v.x * scaleXYZ.y,
    v.y * scaleXYZ.y,
    v.z * scaleXYZ.y,
    0,
    w.x * scaleXYZ.z,
    w.y * scaleXYZ.z,
    w.z * scaleXYZ.z,
    0,
    origin.x,
    origin.y,
    origin.z,
    1,
  ];
}
