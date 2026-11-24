/**
 * mesh-generator/mep/equipment — Équipements techniques MEP 3D (chaudières, CTA, pompes, armoires)
 */

import type { RawMeshData } from '@tabax/geometry';
import type { MepEquipmentGeometryParams } from '../types.js';
import { RawMeshAccumulator, v3, add, scale, normalize, type Vec3D } from './common.js';
import { DEFAULT_MEP_COLOR } from './colors.js';

export function generateEquipmentMesh(eq: MepEquipmentGeometryParams): RawMeshData {
  const acc = new RawMeshAccumulator();
  const center = v3(eq.position.x, eq.position.y, eq.position.z);
  const rot = eq.rotation ?? 0;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);

  const u = v3(cos, sin, 0); // Axe local X tourné
  const v = v3(-sin, cos, 0); // Axe local Y tourné
  const w = v3(0, 0, 1); // Axe vertical Z

  const halfW = Math.max(10, eq.width) / 2;
  const halfD = Math.max(10, eq.depth) / 2;
  const height = Math.max(10, eq.height);

  const getPt = (su: number, sv: number, zRel: number): Vec3D => {
    return add(
      center,
      add(scale(u, su * halfW), add(scale(v, sv * halfD), scale(w, zRel))),
    );
  };

  // 6 faces de la boîte d'enveloppe de l'équipement
  // 1. Face bas (Z = 0)
  {
    const n = scale(w, -1);
    const c0 = acc.addVertex(getPt(-1, -1, 0), n);
    const c1 = acc.addVertex(getPt(1, -1, 0), n);
    const c2 = acc.addVertex(getPt(1, 1, 0), n);
    const c3 = acc.addVertex(getPt(-1, 1, 0), n);
    acc.addQuad(c0, c1, c2, c3);
  }
  // 2. Face haut (Z = height)
  {
    const n = w;
    const c0 = acc.addVertex(getPt(-1, -1, height), n);
    const c1 = acc.addVertex(getPt(-1, 1, height), n);
    const c2 = acc.addVertex(getPt(1, 1, height), n);
    const c3 = acc.addVertex(getPt(1, -1, height), n);
    acc.addQuad(c0, c1, c2, c3);
  }
  // 3. Face avant (-V)
  {
    const n = scale(v, -1);
    const c0 = acc.addVertex(getPt(-1, -1, 0), n);
    const c1 = acc.addVertex(getPt(-1, -1, height), n);
    const c2 = acc.addVertex(getPt(1, -1, height), n);
    const c3 = acc.addVertex(getPt(1, -1, 0), n);
    acc.addQuad(c0, c1, c2, c3);
  }
  // 4. Face arrière (+V)
  {
    const n = v;
    const c0 = acc.addVertex(getPt(1, 1, 0), n);
    const c1 = acc.addVertex(getPt(1, 1, height), n);
    const c2 = acc.addVertex(getPt(-1, 1, height), n);
    const c3 = acc.addVertex(getPt(-1, 1, 0), n);
    acc.addQuad(c0, c1, c2, c3);
  }
  // 5. Face droite (+U)
  {
    const n = u;
    const c0 = acc.addVertex(getPt(1, -1, 0), n);
    const c1 = acc.addVertex(getPt(1, -1, height), n);
    const c2 = acc.addVertex(getPt(1, 1, height), n);
    const c3 = acc.addVertex(getPt(1, 1, 0), n);
    acc.addQuad(c0, c1, c2, c3);
  }
  // 6. Face gauche (-U)
  {
    const n = scale(u, -1);
    const c0 = acc.addVertex(getPt(-1, 1, 0), n);
    const c1 = acc.addVertex(getPt(-1, 1, height), n);
    const c2 = acc.addVertex(getPt(-1, -1, height), n);
    const c3 = acc.addVertex(getPt(-1, -1, 0), n);
    acc.addQuad(c0, c1, c2, c3);
  }

  // Ajout de pastilles en relief sur chaque port de raccordement
  if (eq.ports && eq.ports.length > 0) {
    for (const port of eq.ports) {
      const portPos = v3(port.position.x, port.position.y, port.position.z);
      const portDir = normalize(v3(port.direction.x, port.direction.y, port.direction.z));
      const padRadius = Math.max(8, (port.diameter ?? 32) / 2);
      const padOut = add(portPos, scale(portDir, 15));
      acc.addCylinder(portPos, padOut, padRadius, 12, true);
    }
  }

  const color = eq.color ?? DEFAULT_MEP_COLOR;

  return acc.toRawMeshData(eq.id, {
    elementId: eq.id,
    category: 'mepEquipment',
    family: eq.family,
    levelId: eq.levelId,
    systemId: eq.systemId,
    color,
  });
}
