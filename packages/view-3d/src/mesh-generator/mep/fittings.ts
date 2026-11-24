/**
 * mesh-generator/mep/fittings — Raccords MEP 3D (coudes, tés, croix, réductions, bouchons)
 */

import type { RawMeshData } from '@tabax/geometry';
import type { MepFittingGeometryParams } from '../types.js';
import { RawMeshAccumulator, v3, add, sub, scale, normalize } from './common.js';
import { getMepSystemColor } from './colors.js';

export function generateFittingMesh(fitting: MepFittingGeometryParams): RawMeshData {
  const acc = new RawMeshAccumulator();
  const center = v3(fitting.position.x, fitting.position.y, fitting.position.z);
  const ports = fitting.ports;

  const color =
    fitting.color ?? getMepSystemColor(fitting.systemType, fitting.domain);

  switch (fitting.fittingType) {
    case 'elbow': {
      // Coude : mitered bend raccordant les 2 ports au centre
      const port0 = ports[0];
      const port1 = ports[1];
      if (port0 && port1) {
        const p0 = v3(port0.position.x, port0.position.y, port0.position.z);
        const p1 = v3(port1.position.x, port1.position.y, port1.position.z);
        const r0 = Math.max(1, (port0.diameter ?? 32) / 2);
        const r1 = Math.max(1, (port1.diameter ?? 32) / 2);

        acc.addCylinder(p0, center, r0, 16, true);
        acc.addCylinder(center, p1, r1, 16, true);
      } else {
        // Fallback cylindre court
        acc.addCylinder(
          sub(center, v3(0, 0, 20)),
          add(center, v3(0, 0, 20)),
          20,
          16,
          true,
        );
      }
      break;
    }

    case 'tee': {
      // Té : tuyau droit entre port 0 et port 1 + branche vers port 2
      const port0 = ports[0];
      const port1 = ports[1];
      const port2 = ports[2];
      if (port0 && port1 && port2) {
        const p0 = v3(port0.position.x, port0.position.y, port0.position.z);
        const p1 = v3(port1.position.x, port1.position.y, port1.position.z);
        const p2 = v3(port2.position.x, port2.position.y, port2.position.z);
        const rMain = Math.max(1, (port0.diameter ?? 32) / 2);
        const rBranch = Math.max(1, (port2.diameter ?? 32) / 2);

        acc.addCylinder(p0, p1, rMain, 16, true);
        acc.addCylinder(center, p2, rBranch, 16, true);
      } else {
        acc.addCylinder(
          sub(center, v3(30, 0, 0)),
          add(center, v3(30, 0, 0)),
          20,
          16,
          true,
        );
      }
      break;
    }

    case 'cross': {
      // Croix : axe principal (port 0 -> 1) + 2 branches (center -> 2, center -> 3)
      const port0 = ports[0];
      const port1 = ports[1];
      const port2 = ports[2];
      const port3 = ports[3];
      if (port0 && port1 && port2 && port3) {
        const p0 = v3(port0.position.x, port0.position.y, port0.position.z);
        const p1 = v3(port1.position.x, port1.position.y, port1.position.z);
        const p2 = v3(port2.position.x, port2.position.y, port2.position.z);
        const p3 = v3(port3.position.x, port3.position.y, port3.position.z);
        const r0 = Math.max(1, (port0.diameter ?? 32) / 2);
        const r2 = Math.max(1, (port2.diameter ?? 32) / 2);

        acc.addCylinder(p0, p1, r0, 16, true);
        acc.addCylinder(center, p2, r2, 16, true);
        acc.addCylinder(center, p3, r2, 16, true);
      } else {
        acc.addCylinder(
          sub(center, v3(30, 0, 0)),
          add(center, v3(30, 0, 0)),
          20,
          16,
          true,
        );
      }
      break;
    }

    case 'transition': {
      // Réduction : cône tronqué entre port 0 et port 1
      const port0 = ports[0];
      const port1 = ports[1];
      if (port0 && port1) {
        const p0 = v3(port0.position.x, port0.position.y, port0.position.z);
        const p1 = v3(port1.position.x, port1.position.y, port1.position.z);
        const r0 = Math.max(1, (port0.diameter ?? 40) / 2);
        const r1 = Math.max(1, (port1.diameter ?? 25) / 2);

        acc.addTruncatedCone(p0, p1, r0, r1, 16);
      } else {
        acc.addCylinder(
          sub(center, v3(0, 0, 20)),
          add(center, v3(0, 0, 20)),
          20,
          16,
          true,
        );
      }
      break;
    }

    case 'cap': {
      // Bouchon : chapeau court à l'extrémité du port
      const port0 = ports[0];
      if (port0) {
        const p0 = v3(port0.position.x, port0.position.y, port0.position.z);
        const dir = v3(port0.direction.x, port0.direction.y, port0.direction.z);
        const normal = normalize(dir);
        const r0 = Math.max(1, (port0.diameter ?? 32) / 2);
        const capThickness = 20;
        const pEnd = add(p0, scale(normal, capThickness));

        acc.addCylinder(p0, pEnd, r0 * 1.05, 16, true);
      } else {
        acc.addCylinder(
          sub(center, v3(0, 0, 10)),
          add(center, v3(0, 0, 10)),
          20,
          16,
          true,
        );
      }
      break;
    }
  }

  return acc.toRawMeshData(fitting.id, {
    elementId: fitting.id,
    category: 'mepFitting',
    fittingType: fitting.fittingType,
    levelId: fitting.levelId,
    systemId: fitting.systemId,
    systemType: fitting.systemType,
    domain: fitting.domain,
    color,
  });
}
