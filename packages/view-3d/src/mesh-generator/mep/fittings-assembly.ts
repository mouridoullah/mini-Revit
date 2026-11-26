/**
 * mesh-generator/mep/fittings-assembly — Raccords MEP LOD 350 multi-matériaux (coudes, tés, croix, réductions, bouchons)
 *
 * Prend en charge sections circulaires ET rectangulaires :
 * - Coudes segmentés (3–5 viroles) pour gaines circulaires D >= 200 mm, coudes toroïdaux doux sinon
 * - Réductions excentriques honorant `eccentricAlignment` (`center` | `flat_top` | `flat_bottom`)
 * - Coudes/tés/bouchons rectangulaires chanfreinés avec cadres L + équerres + boulons instanciés
 */

import type { MepFittingGeometryParams, MepPortGeometryParams } from '../types.js';
import { v3, add, sub, scale, len, normalize, type Vec3D } from './common.js';
import { getMepSystemColor } from './colors.js';
import {
  composeMatrix4,
  type MepAssembly3D,
  type MepAssemblyPart,
  type MepInstanceAnchor,
  type MepMaterialRole,
} from './assembly-types.js';
import { UvMeshAccumulator } from './primitives.js';
import { buildSafeFrame, pushPartIfNonEmpty, type MepAssemblyOptions } from './assembly-builder-helpers.js';

function resolveFittingBodyRole(domain?: string, systemType?: string): MepMaterialRole {
  if (domain === 'hvac') return 'galvanized_steel';
  if (systemType === 'drainage_waste' || systemType === 'drainage_soil') return 'pvc_matte';
  return 'copper_brushed';
}

function resolvePortEndPoint(
  center: Vec3D,
  port: MepPortGeometryParams,
  fallbackDir: Vec3D,
  fallbackReach: number,
): Vec3D {
  const pos = v3(port.position.x, port.position.y, port.position.z);
  if (len(sub(center, pos)) >= 1e-3) return pos;
  const dir = port.direction
    ? normalize(v3(port.direction.x, port.direction.y, port.direction.z))
    : fallbackDir;
  return add(center, scale(dir, fallbackReach));
}

function appendRectFlangeWithInstances(
  bodyAcc: UvMeshAccumulator,
  gasketAcc: UvMeshAccumulator,
  instances: MepInstanceAnchor[],
  centerPt: Vec3D,
  axis: Vec3D,
  width: number,
  height: number,
  isLod350: boolean,
): void {
  const { u, v } = buildSafeFrame(axis);
  const fw = width + 44;
  const fh = height + 44;
  gasketAcc.addChamferedRectTube(
    sub(centerPt, scale(axis, 1.5)),
    add(centerPt, scale(axis, 1.5)),
    fw * 0.99,
    fh * 0.99,
    2,
    false,
    u,
    v,
  );
  bodyAcc.addChamferedRectTube(
    sub(centerPt, scale(axis, 11)),
    add(centerPt, scale(axis, 11)),
    fw,
    fh,
    2,
    false,
    u,
    v,
  );
  if (!isLod350) return;

  const corners: Array<[number, number, Vec3D, Vec3D]> = [
    [-1, -1, u, v],
    [1, -1, scale(u, -1), v],
    [1, 1, scale(u, -1), scale(v, -1)],
    [-1, 1, u, scale(v, -1)],
  ];
  for (const [sx, sy, cu, cv] of corners) {
    const cPos = add(centerPt, add(scale(u, sx * (fw * 0.5 - 2)), scale(v, sy * (fh * 0.5 - 2))));
    instances.push({
      prototypeKey: 'flange_corner',
      matrix: composeMatrix4(cPos, cu, cv, axis),
      materialRole: 'zinc_hardware',
    });
  }
}

export function createMepFittingAssembly3D(
  fitting: MepFittingGeometryParams,
  options?: MepAssemblyOptions,
): MepAssembly3D {
  const isLod350 = (options?.detailLevel ?? 'lod350') === 'lod350';
  const parts: MepAssemblyPart[] = [];
  const instances: MepInstanceAnchor[] = [];
  const center = v3(fitting.position.x, fitting.position.y, fitting.position.z);
  const ports = fitting.ports;

  const bodyRole = resolveFittingBodyRole(fitting.domain, fitting.systemType);
  const fluidColor = fitting.color ?? getMepSystemColor(fitting.systemType, fitting.domain);
  const bodyAcc = new UvMeshAccumulator();
  const gasketAcc = new UvMeshAccumulator();
  const hwAcc = new UvMeshAccumulator();

  const port0 = ports[0];
  const port1 = ports[1];
  const port2 = ports[2];
  const port3 = ports[3];
  const isRect =
    port0?.shape === 'rectangular' || (port0?.width !== undefined && port0.diameter === undefined);

  switch (fitting.fittingType) {
    case 'elbow': {
      if (port0 && port1) {
        const w0 = Math.max(20, port0.width ?? port0.diameter ?? 200);
        const h0 = Math.max(20, port0.height ?? port0.diameter ?? 200);
        const r0 = Math.max(8, (port0.diameter ?? w0) * 0.5);
        const r1 = Math.max(8, (port1.diameter ?? port1.width ?? w0) * 0.5);
        const maxR = Math.max(r0, r1);
        const p0 = resolvePortEndPoint(center, port0, v3(-1, 0, 0), maxR * 3);
        const p1 = resolvePortEndPoint(center, port1, v3(0, 1, 0), maxR * 3);

        if (isRect) {
          const w1 = Math.max(20, port1.width ?? w0);
          const h1 = Math.max(20, port1.height ?? h0);
          bodyAcc.addChamferedRectTube(p0, center, w0, h0, 3, true);
          bodyAcc.addChamferedRectTube(center, p1, w1, h1, 3, true);
          appendRectFlangeWithInstances(
            bodyAcc,
            gasketAcc,
            instances,
            p0,
            normalize(sub(center, p0)),
            w0,
            h0,
            isLod350,
          );
          appendRectFlangeWithInstances(
            bodyAcc,
            gasketAcc,
            instances,
            p1,
            normalize(sub(center, p1)),
            w1,
            h1,
            isLod350,
          );
        } else {
          const d0 = normalize(sub(center, p0));
          const d1 = normalize(sub(center, p1));
          const l0 = len(sub(center, p0));
          const l1 = len(sub(center, p1));
          const dBend = Math.min(l0 * 0.75, l1 * 0.75, maxR * 1.6);
          const b0 = sub(center, scale(d0, dBend));
          const b1 = sub(center, scale(d1, dBend));

          if (len(sub(b0, p0)) > 1) bodyAcc.addSmoothCylinder(p0, b0, r0, 24, false);

          // Coude segmenté en 4 viroles pour gaines circulaires >= 200 mm, sinon balayage lisse
          if (fitting.domain === 'hvac' && maxR * 2 >= 200) {
            const gores = 4;
            let prev = b0;
            for (let g = 1; g <= gores; g++) {
              const t = g / gores;
              const pt = add(
                add(scale(b0, (1 - t) ** 2), scale(center, 2 * (1 - t) * t)),
                scale(b1, t ** 2),
              );
              const segDir = sub(pt, prev);
              if (len(segDir) > 1) {
                const rad = r0 + t * (r1 - r0);
                bodyAcc.addSmoothCylinder(prev, pt, rad, 24, false);
                if (g < gores) {
                  bodyAcc.addFlangeProfile(pt, segDir, rad, rad * 1.05, 8, 1, 24);
                }
              }
              prev = pt;
            }
          } else {
            bodyAcc.addCurvedSweep(b0, center, b1, r0, r1, 24, 16);
          }

          if (len(sub(p1, b1)) > 1) bodyAcc.addSmoothCylinder(b1, p1, r1, 24, false);
          bodyAcc.addFlangeProfile(add(p0, scale(d0, 10)), d0, r0, r0 * 1.1, 20, 1.5, 24);
          bodyAcc.addFlangeProfile(add(p1, scale(d1, 10)), d1, r1, r1 * 1.1, 20, 1.5, 24);
          gasketAcc.addFlangeProfile(p0, d0, r0 * 0.99, r0 * 1.09, 3, 0.5, 24);
          gasketAcc.addFlangeProfile(p1, d1, r1 * 0.99, r1 * 1.09, 3, 0.5, 24);
        }
      }
      break;
    }

    case 'tee':
    case 'cross': {
      if (port0 && port1 && port2) {
        const w0 = Math.max(20, port0.width ?? port0.diameter ?? 150);
        const h0 = Math.max(20, port0.height ?? port0.diameter ?? 150);
        const rMain = Math.max(8, (port0.diameter ?? w0) * 0.5);
        const rBranch = Math.max(8, (port2.diameter ?? port2.width ?? w0) * 0.5);

        const p0 = resolvePortEndPoint(center, port0, v3(-1, 0, 0), rMain * 2.5);
        const p1 = resolvePortEndPoint(center, port1, v3(1, 0, 0), rMain * 2.5);
        const p2 = resolvePortEndPoint(center, port2, v3(0, 1, 0), rBranch * 2.5);
        const p3 =
          fitting.fittingType === 'cross' && port3
            ? resolvePortEndPoint(center, port3, v3(0, -1, 0), rBranch * 2.5)
            : null;

        if (isRect) {
          const bw = Math.max(20, port2.width ?? w0);
          const bh = Math.max(20, port2.height ?? h0);
          bodyAcc.addChamferedRectTube(p0, p1, w0, h0, 3, true);
          bodyAcc.addChamferedRectTube(center, p2, bw, bh, 3, true);
          appendRectFlangeWithInstances(
            bodyAcc,
            gasketAcc,
            instances,
            p0,
            normalize(sub(p1, p0)),
            w0,
            h0,
            isLod350,
          );
          appendRectFlangeWithInstances(
            bodyAcc,
            gasketAcc,
            instances,
            p1,
            normalize(sub(p0, p1)),
            w0,
            h0,
            isLod350,
          );
          appendRectFlangeWithInstances(
            bodyAcc,
            gasketAcc,
            instances,
            p2,
            normalize(sub(center, p2)),
            bw,
            bh,
            isLod350,
          );
          if (p3) {
            bodyAcc.addChamferedRectTube(center, p3, bw, bh, 3, true);
            appendRectFlangeWithInstances(
              bodyAcc,
              gasketAcc,
              instances,
              p3,
              normalize(sub(center, p3)),
              bw,
              bh,
              isLod350,
            );
          }
        } else {
          bodyAcc.addSmoothCylinder(p0, p1, rMain, 24, true);
          bodyAcc.addSmoothCylinder(center, p2, rBranch, 20, true);
          const mainDir = normalize(sub(p1, p0));
          bodyAcc.addFlangeProfile(center, mainDir, rMain, rMain * 1.1, rBranch * 1.6, 2, 24);
          if (p3) bodyAcc.addSmoothCylinder(center, p3, rBranch, 20, true);

          for (const [pt, rad] of [
            [p0, rMain],
            [p1, rMain],
            [p2, rBranch],
            ...(p3 ? [[p3, rBranch] as const] : []),
          ] as const) {
            const d = normalize(sub(center, pt));
            bodyAcc.addFlangeProfile(add(pt, scale(d, 8)), d, rad, rad * 1.1, 16, 1.5, 20);
            gasketAcc.addFlangeProfile(pt, d, rad * 0.99, rad * 1.09, 3, 0.5, 20);
          }
        }
      }
      break;
    }

    case 'transition': {
      if (port0 && port1) {
        const p0 = v3(port0.position.x, port0.position.y, port0.position.z);
        let p1 = v3(port1.position.x, port1.position.y, port1.position.z);
        const h0 = port0.height ?? port0.diameter ?? 200;
        const h1 = port1.height ?? port1.diameter ?? 150;
        const align = fitting.eccentricAlignment ?? 'center';
        if (align === 'flat_top') {
          p1 = add(p1, v3(0, 0, (h0 - h1) * 0.5));
        } else if (align === 'flat_bottom') {
          p1 = add(p1, v3(0, 0, -(h0 - h1) * 0.5));
        }

        const dir = normalize(sub(p1, p0));
        const totalL = Math.max(40, len(sub(p1, p0)));
        if (isRect) {
          const w0 = Math.max(20, port0.width ?? 200);
          const w1 = Math.max(20, port1.width ?? 150);
          const pMid = scale(add(p0, p1), 0.5);
          bodyAcc.addChamferedRectTube(p0, pMid, w0, h0, 3, true);
          bodyAcc.addChamferedRectTube(pMid, p1, w1, h1, 3, true);
          appendRectFlangeWithInstances(bodyAcc, gasketAcc, instances, p0, dir, w0, h0, isLod350);
          appendRectFlangeWithInstances(
            bodyAcc,
            gasketAcc,
            instances,
            p1,
            scale(dir, -1),
            w1,
            h1,
            isLod350,
          );
        } else {
          const r0 = Math.max(8, h0 * 0.5);
          const r1 = Math.max(8, h1 * 0.5);
          const slices = 10;
          let prev = p0;
          for (let s = 1; s <= slices; s++) {
            const t = s / slices;
            const pt = add(p0, scale(sub(p1, p0), t));
            const r = r0 + t * (r1 - r0);
            bodyAcc.addSmoothCylinder(prev, pt, r, 24, s === slices);
            prev = pt;
          }
          bodyAcc.addFlangeProfile(add(p0, scale(dir, Math.min(12, totalL * 0.2))), dir, r0, r0 * 1.1, 16, 1.5, 24);
          bodyAcc.addFlangeProfile(add(p1, scale(dir, -Math.min(12, totalL * 0.2))), dir, r1, r1 * 1.1, 16, 1.5, 24);
        }
      }
      break;
    }

    case 'cap': {
      if (port0) {
        const p0 = v3(port0.position.x, port0.position.y, port0.position.z);
        const dir = normalize(
          port0.direction ? v3(port0.direction.x, port0.direction.y, port0.direction.z) : v3(0, 0, 1),
        );
        if (isRect) {
          const w0 = Math.max(20, port0.width ?? 200);
          const h0 = Math.max(20, port0.height ?? 150);
          bodyAcc.addChamferedRectTube(sub(p0, scale(dir, 14)), add(p0, scale(dir, 14)), w0, h0, 3, true);
          appendRectFlangeWithInstances(bodyAcc, gasketAcc, instances, p0, dir, w0, h0, isLod350);
        } else {
          const r0 = Math.max(8, (port0.diameter ?? 32) * 0.5);
          bodyAcc.addFlangeProfile(add(p0, scale(dir, 7)), dir, r0, r0 * 1.12, 16, 1.5, 24);
          bodyAcc.addSmoothCylinder(sub(p0, scale(dir, 10)), add(p0, scale(dir, 2)), r0 * 1.1, 24, true);
          hwAcc.addHexPrism(sub(p0, scale(dir, 12)), dir, r0 * 0.9, 8);
          gasketAcc.addFlangeProfile(p0, dir, r0 * 0.99, r0 * 1.09, 3, 0.5, 24);
        }
      }
      break;
    }
  }

  pushPartIfNonEmpty(parts, bodyAcc, fitting.id, bodyRole);
  pushPartIfNonEmpty(parts, gasketAcc, fitting.id, 'epdm_rubber');
  pushPartIfNonEmpty(parts, hwAcc, fitting.id, 'zinc_hardware');

  return {
    elementId: fitting.id,
    category: 'mepFitting',
    systemType: fitting.systemType,
    domain: fitting.domain,
    parts,
    instances,
    ...(parts.length === 0 ? { systemType: fluidColor } : {}),
  };
}
