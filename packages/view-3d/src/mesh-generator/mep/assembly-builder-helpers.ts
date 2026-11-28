/**
 * mesh-generator/mep/assembly-builder-helpers — Utilitaires partagés pour assemblages LOD 350
 *
 * Garantit des repères Z-up sans gimbal lock sur les colonnes verticales (|dir.z| > 0.99),
 * le filtrage LOD 350 / LOD 200 et les intervalles bornés sur tronçons courts.
 */

import { v3, cross, normalize, type Vec3D } from './common.js';
import type {
  MepAssemblyPart,
  MepInstanceAnchor,
  MepMaterialRole,
} from './assembly-types.js';
import type { MepPortGeometryParams } from '../types.js';
import type { UvMeshAccumulator } from './primitives.js';

export type MepDetailLevel = 'lod350' | 'lod200';

export interface MepAssemblyOptions {
  readonly detailLevel?: MepDetailLevel | undefined;
}

/**
 * Construit un repère local orthonormé sûr sans gimbal lock (notamment sur colonnes verticales dir = (0,0,±1)).
 */
export function buildSafeFrame(axisInput: Vec3D): { axis: Vec3D; u: Vec3D; v: Vec3D } {
  const axis = normalize(axisInput);
  const ref = Math.abs(axis.z) > 0.99 ? v3(1, 0, 0) : v3(0, 0, 1);
  const u = normalize(cross(axis, ref));
  const v = normalize(cross(axis, u));
  return { axis, u, v };
}

export function isHorizontalRun(axis: Vec3D): boolean {
  return Math.abs(axis.z) < 0.35;
}

export function pushPartIfNonEmpty(
  parts: MepAssemblyPart[],
  acc: UvMeshAccumulator,
  elementId: string,
  materialRole: MepMaterialRole,
  color?: string,
): void {
  const raw = acc.toRawMeshData(elementId, { materialRole });
  if (raw.positions.length === 0 || raw.indices.length === 0) return;
  parts.push({
    rawData: raw,
    materialRole,
    ...(color !== undefined ? { color } : {}),
  });
}

/**
 * Calcule les abscisses de répartition régulière entre extrémités en évitant tout chevauchement.
 */
export function computeIntervalOffsets(
  totalLengthMm: number,
  intervalMm: number,
  minClearLengthMm: number,
  edgeMarginMm: number,
): number[] {
  if (totalLengthMm < minClearLengthMm || intervalMm <= 0) return [];
  const usable = totalLengthMm - 2 * edgeMarginMm;
  if (usable <= 20) return [];
  const count = Math.max(1, Math.floor(totalLengthMm / intervalMm));
  const step = totalLengthMm / (count + 1);
  const offsets: number[] = [];
  for (let i = 1; i <= count; i++) {
    const pos = i * step;
    if (pos >= edgeMarginMm && pos <= totalLengthMm - edgeMarginMm) {
      offsets.push(pos);
    }
  }
  return offsets;
}

/**
 * Ajoute des pastilles métalliques chanfreinées sur chaque port de raccordement d'un équipement.
 */
export function appendEquipmentPortPads(
  acc: UvMeshAccumulator,
  ports: readonly MepPortGeometryParams[] | undefined,
): void {
  if (!ports || ports.length === 0) return;
  for (const port of ports) {
    const pos = v3(port.position.x, port.position.y, port.position.z);
    const dir = normalize(v3(port.direction.x, port.direction.y, port.direction.z));
    const padR = Math.max(8, (port.diameter ?? 32) * 0.5);
    acc.addFlangeProfile(pos, dir, padR * 0.55, padR * 1.15, 14, 1.5, 16);
  }
}

export function resolveEquipmentBasis(rotationRad = 0): { u: Vec3D; v: Vec3D; w: Vec3D } {
  const cos = Math.cos(rotationRad);
  const sin = Math.sin(rotationRad);
  return {
    u: v3(cos, sin, 0),
    v: v3(-sin, cos, 0),
    w: v3(0, 0, 1),
  };
}

export type AnchorList = MepInstanceAnchor[];
