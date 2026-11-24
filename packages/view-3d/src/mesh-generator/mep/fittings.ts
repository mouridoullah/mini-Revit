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
      // Coude : raccord coudé haute fidélité avec balayage toroïdal courbe, colliers d'emboîture et rotule centrale
      const port0 = ports[0];
      const port1 = ports[1];
      if (port0 && port1) {
        let p0 = v3(port0.position.x, port0.position.y, port0.position.z);
        let p1 = v3(port1.position.x, port1.position.y, port1.position.z);
        const r0 = Math.max(1, (port0.diameter ?? 32) / 2);
        const r1 = Math.max(1, (port1.diameter ?? 32) / 2);
        const maxR = Math.max(r0, r1);

        // Si les positions des ports coïncident avec le centre, déduire p0 et p1 des directions
        if (len(sub(center, p0)) < 1e-3) {
          const dir0 = port0.direction
            ? normalize(v3(port0.direction.x, port0.direction.y, port0.direction.z))
            : v3(-1, 0, 0);
          p0 = add(center, scale(dir0, maxR * 3));
        }
        if (len(sub(center, p1)) < 1e-3) {
          const dir1 = port1.direction
            ? normalize(v3(port1.direction.x, port1.direction.y, port1.direction.z))
            : v3(0, 1, 0);
          p1 = add(center, scale(dir1, maxR * 3));
        }

        const toCenter0 = sub(center, p0);
        const toCenter1 = sub(center, p1);
        const l0 = len(toCenter0);
        const l1 = len(toCenter1);

        if (l0 > 1e-3 && l1 > 1e-3) {
          const d0 = normalize(toCenter0);
          const d1 = normalize(toCenter1);

          // Rayon de courbure du coude : démarre à dBend avant le centre sur chaque branche
          const dBend = Math.min(l0 * 0.75, l1 * 0.75, maxR * 1.6);
          const b0 = sub(center, scale(d0, dBend));
          const b1 = sub(center, scale(d1, dBend));

          // Tronçon droit amont (sans bouchon interne à b0)
          if (len(sub(b0, p0)) > 1) {
            acc.addCylinder(p0, b0, r0, 16, false);
          }

          // Balayage courbe toroïdal continu (ADR-072) sans aucune face plane saillante
          acc.addCurvedSweep(b0, center, b1, r0, r1, 16, 12);

          // Tronçon droit aval (sans bouchon interne à b1)
          if (len(sub(p1, b1)) > 1) {
            acc.addCylinder(b1, p1, r1, 16, false);
          }

          // Noyau sphérique interne au coude pour garantir l'étanchéité géométrique
          acc.addSphere(center, maxR * 1.02, 10, 16);

          // Colliers d'emboîture aux deux ports externes
          const collarLen0 = Math.min(18, Math.max(8, l0 * 0.25));
          const collarLen1 = Math.min(18, Math.max(8, l1 * 0.25));

          acc.addCylinder(p0, add(p0, scale(d0, collarLen0)), r0 * 1.08, 16, false);
          acc.addCylinder(p1, add(p1, scale(d1, collarLen1)), r1 * 1.08, 16, false);
        } else {
          acc.addSphere(center, maxR * 1.1, 10, 16);
        }
      } else {
        acc.addSphere(center, 20, 10, 16);
      }
      break;
    }

    case 'tee': {
      // Té : corps principal droit + branche + selle de renfort et colliers de raccordement
      const port0 = ports[0];
      const port1 = ports[1];
      const port2 = ports[2];
      if (port0 && port1 && port2) {
        let p0 = v3(port0.position.x, port0.position.y, port0.position.z);
        let p1 = v3(port1.position.x, port1.position.y, port1.position.z);
        let p2 = v3(port2.position.x, port2.position.y, port2.position.z);
        const rMain = Math.max(1, (port0.diameter ?? 32) / 2);
        const rBranch = Math.max(1, (port2.diameter ?? 32) / 2);

        if (len(sub(center, p0)) < 1e-3 && port0.direction) {
          p0 = add(center, scale(normalize(v3(port0.direction.x, port0.direction.y, port0.direction.z)), rMain * 2.5));
        }
        if (len(sub(center, p1)) < 1e-3 && port1.direction) {
          p1 = add(center, scale(normalize(v3(port1.direction.x, port1.direction.y, port1.direction.z)), rMain * 2.5));
        }
        if (len(sub(center, p2)) < 1e-3 && port2.direction) {
          p2 = add(center, scale(normalize(v3(port2.direction.x, port2.direction.y, port2.direction.z)), rBranch * 2.5));
        }

        // Corps principal et branche (caps = false sur la branche et le corps pour ne pas générer de disque saillant)
        acc.addCylinder(p0, p1, rMain, 16, false);
        acc.addCylinder(center, p2, rBranch, 16, false);

        // Renfort sphérique au piquage garantissant une jonction galbée continue
        acc.addSphere(center, Math.max(rMain, rBranch) * 1.05, 12, 16);

        // Bague de renfort au croisement (selle de piquage)
        const dirMain = normalize(sub(p1, p0));
        acc.addCylinder(
          sub(center, scale(dirMain, rBranch * 0.8)),
          add(center, scale(dirMain, rBranch * 0.8)),
          rMain * 1.06,
          16,
          false,
        );

        // Colliers d'emboîture aux 3 ports (caps = false)
        const collarLen0 = Math.min(15, Math.max(8, len(sub(center, p0)) * 0.25));
        const collarLen1 = Math.min(15, Math.max(8, len(sub(center, p1)) * 0.25));
        const collarLen2 = Math.min(15, Math.max(8, len(sub(center, p2)) * 0.25));
        acc.addCylinder(p0, add(p0, scale(normalize(sub(center, p0)), collarLen0)), rMain * 1.08, 16, false);
        acc.addCylinder(p1, add(p1, scale(normalize(sub(center, p1)), collarLen1)), rMain * 1.08, 16, false);
        acc.addCylinder(p2, add(p2, scale(normalize(sub(center, p2)), collarLen2)), rBranch * 1.08, 16, false);
      } else {
        acc.addSphere(center, 20, 10, 16);
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
        let p0 = v3(port0.position.x, port0.position.y, port0.position.z);
        let p1 = v3(port1.position.x, port1.position.y, port1.position.z);
        let p2 = v3(port2.position.x, port2.position.y, port2.position.z);
        let p3 = v3(port3.position.x, port3.position.y, port3.position.z);
        const r0 = Math.max(1, (port0.diameter ?? 32) / 2);
        const r2 = Math.max(1, (port2.diameter ?? 32) / 2);

        if (len(sub(center, p0)) < 1e-3 && port0.direction) {
          p0 = add(center, scale(normalize(v3(port0.direction.x, port0.direction.y, port0.direction.z)), r0 * 2.5));
        }
        if (len(sub(center, p1)) < 1e-3 && port1.direction) {
          p1 = add(center, scale(normalize(v3(port1.direction.x, port1.direction.y, port1.direction.z)), r0 * 2.5));
        }
        if (len(sub(center, p2)) < 1e-3 && port2.direction) {
          p2 = add(center, scale(normalize(v3(port2.direction.x, port2.direction.y, port2.direction.z)), r2 * 2.5));
        }
        if (len(sub(center, p3)) < 1e-3 && port3.direction) {
          p3 = add(center, scale(normalize(v3(port3.direction.x, port3.direction.y, port3.direction.z)), r2 * 2.5));
        }

        acc.addCylinder(p0, p1, r0, 16, false);
        acc.addCylinder(center, p2, r2, 16, false);
        acc.addCylinder(center, p3, r2, 16, false);
        acc.addSphere(center, Math.max(r0, r2) * 1.05, 12, 16);

        // Colliers de raccordement aux 4 ports
        const cLen = 12;
        acc.addCylinder(p0, add(p0, scale(normalize(sub(center, p0)), cLen)), r0 * 1.08, 16, false);
        acc.addCylinder(p1, add(p1, scale(normalize(sub(center, p1)), cLen)), r0 * 1.08, 16, false);
        acc.addCylinder(p2, add(p2, scale(normalize(sub(center, p2)), cLen)), r2 * 1.08, 16, false);
        acc.addCylinder(p3, add(p3, scale(normalize(sub(center, p3)), cLen)), r2 * 1.08, 16, false);
      } else {
        acc.addSphere(center, 20, 10, 16);
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
        acc.addCylinder(p0, pConeStart, r0, 16, false);
        // Partie tronconique progressive
        acc.addTruncatedCone(pConeStart, pConeEnd, r0, r1, 16);
        // Manchon droit arrivée
        acc.addCylinder(pConeEnd, p1, r1, 16, false);
      } else {
        acc.addCylinder(sub(center, v3(0, 0, 20)), add(center, v3(0, 0, 20)), 20, 16, false);
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
        acc.addCylinder(p0, pCollarEnd, r0 * 1.08, 16, false);
        // Tête de fermeture avec dôme hémisphérique
        acc.addCylinder(pCollarEnd, pHeadEnd, r0 * 0.85, 16, true);
        acc.addSphere(pHeadEnd, r0 * 0.85, 8, 16);
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
