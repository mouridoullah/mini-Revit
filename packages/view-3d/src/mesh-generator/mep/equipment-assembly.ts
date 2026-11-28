/**
 * mesh-generator/mep/equipment-assembly — Équipements techniques MEP LOD 350 multi-matériaux
 *
 * Route les familles spécialisées (`valve`, `check_valve`, `air_diffuser`, `junction_box`,
 * `electrical_panel`) et modélise les 8 autres familles (`boiler`, `heat_pump`, `water_heater`,
 * `pump`, `ahu`, `fan`, `radiator`, `meter`) avec chanfreins, UVs métriques et contraste PBR.
 */

import type { MepEquipmentGeometryParams } from '../types.js';
import { v3, add, scale } from './common.js';
import { getMepSystemColor } from './colors.js';
import {
  composeMatrix4,
  type MepAssembly3D,
  type MepAssemblyPart,
  type MepInstanceAnchor,
} from './assembly-types.js';
import { UvMeshAccumulator } from './primitives.js';
import {
  appendEquipmentPortPads,
  buildSafeFrame,
  pushPartIfNonEmpty,
  resolveEquipmentBasis,
  type MepAssemblyOptions,
} from './assembly-builder-helpers.js';
import { createAirDiffuserAssembly } from './hvac-terminals.js';
import { createCheckValveAssembly, createValveAssembly } from './valves.js';
import { createElectricalPanelAssembly, createJunctionBoxAssembly } from './electrical.js';

export function createMepEquipmentAssembly3D(
  eq: MepEquipmentGeometryParams,
  options?: MepAssemblyOptions,
): MepAssembly3D {
  switch (eq.family) {
    case 'valve':
      return createValveAssembly(eq, options);
    case 'check_valve':
      return createCheckValveAssembly(eq);
    case 'air_diffuser':
      return createAirDiffuserAssembly(eq, options);
    case 'junction_box':
      return createJunctionBoxAssembly(eq, options);
    case 'electrical_panel':
      return createElectricalPanelAssembly(eq, options);
    default:
      break;
  }

  const isLod350 = (options?.detailLevel ?? 'lod350') === 'lod350';
  const parts: MepAssemblyPart[] = [];
  const instances: MepInstanceAnchor[] = [];

  const center = v3(eq.position.x, eq.position.y, eq.position.z);
  const { u, v, w } = resolveEquipmentBasis(eq.rotation ?? 0);

  const width = Math.max(20, eq.width);
  const depth = Math.max(20, eq.depth);
  const height = Math.max(20, eq.height);
  const boxCenter = add(center, scale(w, height * 0.5));

  const systemType = eq.ports?.[0]?.systemType;
  const domain = eq.ports?.[0]?.domain;
  const fluidColor = eq.color ?? getMepSystemColor(systemType, domain);

  const ralAcc = new UvMeshAccumulator();
  const galvaAcc = new UvMeshAccumulator();
  const copperAcc = new UvMeshAccumulator();
  const brassAcc = new UvMeshAccumulator();
  const darkAcc = new UvMeshAccumulator();
  const aluAcc = new UvMeshAccumulator();
  const hwAcc = new UvMeshAccumulator();
  const accentAcc = new UvMeshAccumulator();

  switch (eq.family) {
    case 'boiler': {
      // Jaquette RAL 7035 chanfreinée + plots anti-vibratiles EPDM + bandeau noir + buse cheminée inox
      ralAcc.addBeveledBox(add(center, scale(w, height * 0.54)), width, depth, height * 0.9, u, v, w, 3);
      const footH = height * 0.09;
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          darkAcc.addBeveledBox(
            add(center, add(scale(u, sx * width * 0.38), add(scale(v, sy * depth * 0.38), scale(w, footH * 0.5)))),
            width * 0.14,
            depth * 0.14,
            footH,
            u,
            v,
            w,
            1.5,
          );
        }
      }
      darkAcc.addBeveledBox(
        add(center, add(scale(v, -depth * 0.51), scale(w, height * 0.74))),
        width * 0.68,
        14,
        height * 0.18,
        u,
        v,
        w,
        2,
      );
      galvaAcc.addSmoothCylinder(
        add(center, scale(w, height * 0.94)),
        add(center, scale(w, height * 1.15)),
        Math.min(width, depth) * 0.15,
        20,
        true,
      );
      accentAcc.addFlangeProfile(add(center, scale(w, height * 0.96)), w, Math.min(width, depth) * 0.15, Math.min(width, depth) * 0.18, 12, 1, 20);
      break;
    }

    case 'heat_pump': {
      // Caisson RAL 7035 + rails EPDM + grille hélice alu + échangeur galva arrière
      ralAcc.addBeveledBox(add(center, scale(w, height * 0.53)), width, depth, height * 0.92, u, v, w, 3);
      const fanR = Math.min(width, height) * 0.36;
      const fanCenter = add(boxCenter, scale(v, -depth * 0.5));
      darkAcc.addSmoothCylinder(fanCenter, add(fanCenter, scale(v, -6)), fanR, 24, true);
      aluAcc.addFlangeProfile(add(fanCenter, scale(v, -8)), v, fanR * 0.92, fanR * 1.04, 8, 1.5, 24);
      aluAcc.addSmoothCylinder(fanCenter, add(fanCenter, scale(v, -18)), fanR * 0.24, 16, true);
      galvaAcc.addBeveledBox(add(boxCenter, scale(v, depth * 0.51)), width * 0.88, 10, height * 0.8, u, v, w, 1.5);
      const skidH = height * 0.06;
      for (const sx of [-1, 1]) {
        darkAcc.addBeveledBox(
          add(center, add(scale(u, sx * width * 0.38), scale(w, skidH * 0.5))),
          width * 0.15,
          depth * 1.04,
          skidH,
          u,
          v,
          w,
          1.5,
        );
      }
      break;
    }

    case 'water_heater': {
      // Cuve calorifugée RAL 7035 + calotte + bandeau accent + pied noir + capot thermostat + piquages cuivre
      const tankR = Math.min(width, depth) * 0.47;
      const tankBot = add(center, scale(w, height * 0.1));
      const tankTop = add(center, scale(w, height * 0.9));
      ralAcc.addSmoothCylinder(tankBot, tankTop, tankR, 24, true);
      ralAcc.addSmoothCylinder(tankTop, add(center, scale(w, height * 0.98)), tankR * 0.86, 24, true);
      darkAcc.addSmoothCylinder(center, tankBot, tankR * 0.88, 20, true);
      darkAcc.addBeveledBox(
        add(center, add(scale(v, -tankR * 0.95), scale(w, height * 0.24))),
        width * 0.36,
        depth * 0.14,
        height * 0.2,
        u,
        v,
        w,
        2,
      );
      accentAcc.addFlangeProfile(add(center, scale(w, height * 0.72)), w, tankR * 0.99, tankR * 1.03, 28, 1, 24);
      copperAcc.addSmoothCylinder(add(center, scale(w, height * 0.98)), add(center, scale(w, height * 1.04)), 16, 16, true);
      break;
    }

    case 'pump': {
      // Volute accent + brides PN16 zinguées + moteur alu à ailettes + boîte à bornes RAL 7035
      const voluteR = Math.min(width, height) * 0.34;
      const pipeR = voluteR * 0.55;
      accentAcc.addSmoothCylinder(
        add(boxCenter, scale(v, -depth * 0.2)),
        add(boxCenter, scale(v, depth * 0.2)),
        voluteR,
        20,
        true,
      );
      const pLeft = add(boxCenter, scale(u, -width * 0.5));
      const pRight = add(boxCenter, scale(u, width * 0.5));
      copperAcc.addSmoothCylinder(pLeft, pRight, pipeR, 20, true);
      const flangeL = add(pLeft, scale(u, 8));
      const flangeR = add(pRight, scale(u, -8));
      hwAcc.addFlangeProfile(flangeL, u, pipeR, pipeR * 1.38, 14, 1.5, 20);
      hwAcc.addFlangeProfile(flangeR, u, pipeR, pipeR * 1.38, 14, 1.5, 20);

      const motorBot = add(boxCenter, scale(w, voluteR * 0.55));
      const motorTop = add(boxCenter, scale(w, height * 0.46));
      aluAcc.addSmoothCylinder(motorBot, motorTop, voluteR * 0.74, 20, true);
      ralAcc.addBeveledBox(add(motorTop, scale(w, 12)), width * 0.28, depth * 0.28, 24, u, v, w, 2);

      if (isLod350) {
        const boltFrame = buildSafeFrame(u);
        for (let b = 0; b < 4; b++) {
          const ang = (Math.PI * 0.5) * b;
          const off = add(scale(boltFrame.u, Math.cos(ang) * pipeR * 1.18), scale(boltFrame.v, Math.sin(ang) * pipeR * 1.18));
          instances.push({ prototypeKey: 'bolt_m10', matrix: composeMatrix4(add(flangeL, off), boltFrame.u, boltFrame.v, boltFrame.axis), materialRole: 'zinc_hardware' });
          instances.push({ prototypeKey: 'bolt_m10', matrix: composeMatrix4(add(flangeR, off), boltFrame.u, boltFrame.v, boltFrame.axis), materialRole: 'zinc_hardware' });
        }
      }
      break;
    }

    case 'ahu': {
      // CTA modulaire : caisson RAL 7035 + profilés d'ossature galva + socle EPDM + poignées alu
      const plinthH = 80;
      darkAcc.addBeveledBox(add(center, scale(w, plinthH * 0.5)), width * 0.98, depth * 0.96, plinthH, u, v, w, 2);
      const ahuCenter = add(center, scale(w, plinthH + (height - plinthH) * 0.5));
      ralAcc.addBeveledBox(ahuCenter, width, depth, height - plinthH, u, v, w, 3);
      for (const su of [-0.33, 0, 0.33]) {
        galvaAcc.addBeveledBox(
          add(ahuCenter, scale(u, su * width)),
          Math.min(width, depth) * 0.04,
          depth * 1.02,
          (height - plinthH) * 1.01,
          u,
          v,
          w,
          1.5,
        );
      }
      for (const su of [-0.33, 0.33]) {
        aluAcc.addBeveledBox(
          add(ahuCenter, add(scale(u, su * width + width * 0.11), scale(v, -depth * 0.52))),
          18,
          14,
          64,
          u,
          v,
          w,
          2,
        );
      }
      break;
    }

    case 'fan': {
      // Volute galva chanfreinée + pavillon alu + rejet carré chanfreiné + support EPDM
      const fanR = Math.min(width, height) * 0.4;
      const f1 = add(boxCenter, scale(v, -depth * 0.25));
      const f2 = add(boxCenter, scale(v, depth * 0.25));
      galvaAcc.addSmoothCylinder(f1, f2, fanR, 24, true);
      aluAcc.addFlangeProfile(f1, v, fanR * 0.72, fanR * 0.96, depth * 0.2, 2, 24);
      galvaAcc.addBeveledBox(
        add(boxCenter, add(scale(u, width * 0.34), scale(w, height * 0.28))),
        width * 0.34,
        depth * 0.44,
        height * 0.34,
        u,
        v,
        w,
        2.5,
      );
      darkAcc.addBeveledBox(add(center, scale(w, 12)), width * 0.7, depth * 0.7, 24, u, v, w, 1.5);
      break;
    }

    case 'radiator': {
      // Panneau acier RAL 7035 chanfreiné + grille alu supérieure + robinet laiton & tête accent
      ralAcc.addBeveledBox(boxCenter, width, depth * 0.38, height * 0.9, u, v, w, 2.5);
      galvaAcc.addBeveledBox(add(boxCenter, scale(v, depth * 0.24)), width * 0.94, depth * 0.36, height * 0.78, u, v, w, 1.5);
      aluAcc.addBeveledBox(add(boxCenter, scale(w, height * 0.46)), width, depth * 0.82, 12, u, v, w, 2);
      const valvePos = add(boxCenter, add(scale(u, -width * 0.48), scale(w, height * 0.34)));
      brassAcc.addSmoothCylinder(valvePos, add(valvePos, scale(u, -24)), 14, 16, true);
      accentAcc.addSmoothCylinder(add(valvePos, scale(u, -24)), add(valvePos, scale(u, -48)), 17, 16, true);
      break;
    }

    case 'meter': {
      // Corps laiton + raccords union 6 pans + cadran alu rehaussé + bague accent
      const pipeR = Math.min(depth, height) * 0.26;
      const m1 = add(boxCenter, scale(u, -width * 0.5));
      const m2 = add(boxCenter, scale(u, width * 0.5));
      brassAcc.addSmoothCylinder(m1, m2, pipeR, 20, true);
      brassAcc.addHexPrism(add(m1, scale(u, 14)), u, pipeR * 2.6, 22);
      brassAcc.addHexPrism(add(m2, scale(u, -14)), u, pipeR * 2.6, 22);
      const dialR = pipeR * 1.28;
      aluAcc.addSmoothCylinder(
        add(boxCenter, scale(w, pipeR * 0.4)),
        add(boxCenter, scale(w, height * 0.46)),
        dialR,
        24,
        true,
      );
      accentAcc.addFlangeProfile(add(boxCenter, scale(w, height * 0.46)), w, dialR * 0.85, dialR * 1.05, 8, 1, 24);
      break;
    }

    default: {
      ralAcc.addBeveledBox(boxCenter, width, depth, height, u, v, w, 3);
      break;
    }
  }

  appendEquipmentPortPads(hwAcc, eq.ports);

  pushPartIfNonEmpty(parts, ralAcc, eq.id, 'steel_ral7035');
  pushPartIfNonEmpty(parts, galvaAcc, eq.id, 'galvanized_steel');
  pushPartIfNonEmpty(parts, copperAcc, eq.id, 'copper_brushed');
  pushPartIfNonEmpty(parts, brassAcc, eq.id, 'brass_machined');
  pushPartIfNonEmpty(parts, darkAcc, eq.id, 'epdm_rubber');
  pushPartIfNonEmpty(parts, aluAcc, eq.id, 'anodized_alu');
  pushPartIfNonEmpty(parts, hwAcc, eq.id, 'zinc_hardware');
  pushPartIfNonEmpty(parts, accentAcc, eq.id, 'fluid_accent', fluidColor);

  return {
    elementId: eq.id,
    category: 'mepEquipment',
    systemType,
    domain,
    parts,
    instances,
  };
}
