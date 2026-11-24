/**
 * mesh-generator/mep/fittings — Raccords MEP 3D haute fidélité (coudes, tés, croix, réductions, bouchons)
 *
 * Intègre les colliers d'emboîture, brides de raccordement aux ports, selles de renfort
 * et surfaces galbées conformes aux standards industriels de modélisation MEP (ADR-072).
 */

import type { RawMeshData } from '@tabax/geometry';
import type { MepFittingGeometryParams } from '../types.js';
import { RawMeshAccumulator, v3, add, sub, scale, len, normalize } from './common.js';
import { getMepSystemColor } from './colors.js';

export function generateFittingMesh(fitting: MepFittingGeometryParams): RawMeshData {
  const acc = new RawMeshAccumulator();
  const center = v3(fitting.position.x, fitting.position.y, fitting.position.z);
  const ports = fitting.ports;

  const color =
    fitting.color ?? getMepSystemColor(fitting.systemType, fitting.domain);

  switch (fitting.fittingType) {
    case 'elbow': {
      // Coude : mitered bend raccordant les 2 ports au centre + colliers de raccordement aux extrémités
      const port0 = ports[0];
      const port1 = ports[1];
      if (port0 && port1) {
        const p0 = v3(port0.position.x, port0.position.y, port0.position.z);
        const p1 = v3(port1.position.x, port1.position.y, port1.position.z);
        const r0 = Math.max(1, (port0.diameter ?? 32) / 2);
        const r1 = Math.max(1, (port1.diameter ?? 32) / 2);

        // Corps des deux branches du coude
        acc.addCylinder(p0, center, r0, 16, true);
        acc.addCylinder(center, p1, r1, 16, true);

        // Colliers d'emboîture aux deux ports
        const d0 = normalize(sub(center, p0));
        const d1 = normalize(sub(center, p1));
        const collarLen0 = Math.min(15, len(sub(center, p0)) * 0.3);
        const collarLen1 = Math.min(15, len(sub(center, p1)) * 0.3);

        acc.addCylinder(p0, add(p0, scale(d0, collarLen0)), r0 * 1.08, 16, true);
        acc.addCylinder(p1, add(p1, scale(d1, collarLen1)), r1 * 1.08, 16, true);
      } else {
        acc.addCylinder(sub(center, v3(0, 0, 20)), add(center, v3(0, 0, 20)), 20, 16, true);
      }
      break;
    }

    case 'tee': {
      // Té : corps principal droit + branche + bague de piquage et colliers de raccordement
      const port0 = ports[0];
      const port1 = ports[1];
      const port2 = ports[2];
      if (port0 && port1 && port2) {
        const p0 = v3(port0.position.x, port0.position.y, port0.position.z);
        const p1 = v3(port1.position.x, port1.position.y, port1.position.z);
        const p2 = v3(port2.position.x, port2.position.y, port2.position.z);
        const rMain = Math.max(1, (port0.diameter ?? 32) / 2);
        const rBranch = Math.max(1, (port2.diameter ?? 32) / 2);

        // Corps principal et branche
        acc.addCylinder(p0, p1, rMain, 16, true);
        acc.addCylinder(center, p2, rBranch, 16, true);

        // Bague de renfort au croisement (selle de piquage)
        acc.addCylinder(
          sub(center, scale(normalize(sub(p1, p0)), rBranch * 0.8)),
          add(center, scale(normalize(sub(p1, p0)), rBranch * 0.8)),
          rMain * 1.06,
          16,
          true,
        );

        // Colliers d'emboîture aux 3 ports
        const collarLen = 12;
        acc.addCylinder(p0, add(p0, scale(normalize(sub(center, p0)), collarLen)), rMain * 1.08, 16, true);
        acc.addCylinder(p1, add(p1, scale(normalize(sub(center, p1)), collarLen)), rMain * 1.08, 16, true);
        acc.addCylinder(p2, add(p2, scale(normalize(sub(center, p2)), collarLen)), rBranch * 1.08, 16, true);
      } else {
        acc.addCylinder(sub(center, v3(30, 0, 0)), add(center, v3(30, 0, 0)), 20, 16, true);
      }
      break;
    }

    case 'cross': {
      // Croix : axe principal + 2 branches latérales + colliers aux 4 ports
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

        // Colliers de raccordement aux 4 ports
        const cLen = 12;
        acc.addCylinder(p0, add(p0, scale(normalize(sub(center, p0)), cLen)), r0 * 1.08, 16, true);
        acc.addCylinder(p1, add(p1, scale(normalize(sub(center, p1)), cLen)), r0 * 1.08, 16, true);
        acc.addCylinder(p2, add(p2, scale(normalize(sub(center, p2)), cLen)), r2 * 1.08, 16, true);
        acc.addCylinder(p3, add(p3, scale(normalize(sub(center, p3)), cLen)), r2 * 1.08, 16, true);
      } else {
        acc.addCylinder(sub(center, v3(30, 0, 0)), add(center, v3(30, 0, 0)), 20, 16, true);
      }
      break;
    }

    case 'transition': {
      // Réduction : cône tronqué progressif + manchons cylindriques d'accostage aux deux bouts
      const port0 = ports[0];
      const port1 = ports[1];
      if (port0 && port1) {
        const p0 = v3(port0.position.x, port0.position.y, port0.position.z);
        const p1 = v3(port1.position.x, port1.position.y, port1.position.z);
        const r0 = Math.max(1, (port0.diameter ?? 40) / 2);
        const r1 = Math.max(1, (port1.diameter ?? 25) / 2);
        const d = normalize(sub(p1, p0));
        const totalL = len(sub(p1, p0));
        const collarL = Math.min(15, totalL * 0.2);

        const pConeStart = add(p0, scale(d, collarL));
        const pConeEnd = add(p1, scale(d, -collarL));

        // Manchons droits aux deux ports
        acc.addCylinder(p0, pConeStart, r0, 16, true);
        // Partie tronconique progressive
        acc.addTruncatedCone(pConeStart, pConeEnd, r0, r1, 16);
        // Manchon droit arrivée
        acc.addCylinder(pConeEnd, p1, r1, 16, true);
      } else {
        acc.addCylinder(sub(center, v3(0, 0, 20)), add(center, v3(0, 0, 20)), 20, 16, true);
      }
      break;
    }

    case 'cap': {
      // Bouchon : collerette d'emboîture + dôme / tête hexagonale de fermeture
      const port0 = ports[0];
      if (port0) {
        const p0 = v3(port0.position.x, port0.position.y, port0.position.z);
        const dir = v3(port0.direction.x, port0.direction.y, port0.direction.z);
        const normal = normalize(dir);
        const r0 = Math.max(1, (port0.diameter ?? 32) / 2);
        const collarLen = 14;
        const headLen = 10;
        const pCollarEnd = add(p0, scale(normal, collarLen));
        const pHeadEnd = add(pCollarEnd, scale(normal, headLen));

        // Collerette d'emboîture
        acc.addCylinder(p0, pCollarEnd, r0 * 1.08, 16, true);
        // Tête de fermeture avec méplat
        acc.addCylinder(pCollarEnd, pHeadEnd, r0 * 0.85, 16, true);
      } else {
        acc.addCylinder(sub(center, v3(0, 0, 10)), add(center, v3(0, 0, 10)), 20, 16, true);
      }
      break;
    }
  }

  return acc.toRawMeshData(fitting.id, {
    elementId: fitting.id,
    category: 'mepFitting',
    fittingType: fitting.fittingType,
    systemType: fitting.systemType,
    color,
  });
}
