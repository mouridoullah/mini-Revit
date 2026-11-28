/**
 * mesh-generator/mep/electrical — Boîtes de dérivation (`junction_box`) & armoires (`electrical_panel`) LOD 350
 *
 * - `junction_box` : boîtier IP55 chanfreiné (`steel_ral7035`), couvercle débordant + joint `epdm_rubber` 2 mm,
 *   4 vis quart-de-tour et `cable_gland` instanciés sur chaque port.
 * - `electrical_panel` : caisson `steel_ral7035` chanfreiné, socle `epdm_rubber` 100 mm, porte battante
 *   affleurante séparée par un joint d'ombre réel de 3 mm, `cabinet_hinge` instanciés et poignée chromée.
 */

import type { MepEquipmentGeometryParams } from '../types.js';
import { v3, add, scale, normalize } from './common.js';
import { composeMatrix4, type MepAssembly3D, type MepAssemblyPart, type MepInstanceAnchor } from './assembly-types.js';
import { UvMeshAccumulator } from './primitives.js';
import {
  buildSafeFrame,
  pushPartIfNonEmpty,
  resolveEquipmentBasis,
  type MepAssemblyOptions,
} from './assembly-builder-helpers.js';

export function createJunctionBoxAssembly(
  eq: MepEquipmentGeometryParams,
  options?: MepAssemblyOptions,
): MepAssembly3D {
  const isLod350 = (options?.detailLevel ?? 'lod350') === 'lod350';
  const parts: MepAssemblyPart[] = [];
  const instances: MepInstanceAnchor[] = [];

  const center = v3(eq.position.x, eq.position.y, eq.position.z);
  const { u, v, w } = resolveEquipmentBasis(eq.rotation ?? 0);

  const width = Math.max(80, eq.width);
  const depth = Math.max(60, eq.depth);
  const height = Math.max(80, eq.height);
  const boxCenter = add(center, scale(w, height * 0.5));

  const bodyAcc = new UvMeshAccumulator();
  const gasketAcc = new UvMeshAccumulator();
  const hwAcc = new UvMeshAccumulator();

  // Boîtier principal + couvercle avant chanfreiné
  const lidThick = Math.min(12, depth * 0.14);
  const bodyDepth = Math.max(20, depth - lidThick - 2);
  bodyAcc.addBeveledBox(boxCenter, width, bodyDepth, height, u, v, w, 3);

  const gasketPos = add(boxCenter, scale(v, -bodyDepth * 0.5 - 1));
  gasketAcc.addBeveledBox(gasketPos, width * 0.98, 2, height * 0.98, u, v, w, 0.5);

  const lidPos = add(boxCenter, scale(v, -bodyDepth * 0.5 - 2 - lidThick * 0.5));
  bodyAcc.addBeveledBox(lidPos, width * 1.03, lidThick, height * 1.03, u, v, w, 2.5);

  // 4 vis quart-de-tour aux angles du couvercle
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const screwPos = add(
        lidPos,
        add(scale(u, sx * (width * 0.4)), add(scale(v, -lidThick * 0.5 - 1), scale(w, sz * (height * 0.4)))),
      );
      hwAcc.addHexPrism(screwPos, v, 8, 4);
    }
  }

  // Presse-étoupes ISO instanciés sur chaque port
  if (isLod350 && eq.ports && eq.ports.length > 0) {
    for (const port of eq.ports) {
      const pPos = v3(port.position.x, port.position.y, port.position.z);
      const pDir = normalize(v3(port.direction.x, port.direction.y, port.direction.z));
      const frame = buildSafeFrame(pDir);
      instances.push({
        prototypeKey: 'cable_gland',
        matrix: composeMatrix4(pPos, frame.u, frame.v, frame.axis),
        materialRole: 'zinc_hardware',
      });
    }
  }

  pushPartIfNonEmpty(parts, bodyAcc, eq.id, 'steel_ral7035');
  pushPartIfNonEmpty(parts, gasketAcc, eq.id, 'epdm_rubber');
  pushPartIfNonEmpty(parts, hwAcc, eq.id, 'zinc_hardware');

  return {
    elementId: eq.id,
    category: 'mepEquipment',
    systemType: eq.ports?.[0]?.systemType ?? 'power',
    domain: 'electrical',
    parts,
    instances,
  };
}

export function createElectricalPanelAssembly(
  eq: MepEquipmentGeometryParams,
  options?: MepAssemblyOptions,
): MepAssembly3D {
  const isLod350 = (options?.detailLevel ?? 'lod350') === 'lod350';
  const parts: MepAssemblyPart[] = [];
  const instances: MepInstanceAnchor[] = [];

  const center = v3(eq.position.x, eq.position.y, eq.position.z);
  const { u, v, w } = resolveEquipmentBasis(eq.rotation ?? 0);

  const width = Math.max(200, eq.width);
  const depth = Math.max(120, eq.depth);
  const height = Math.max(300, eq.height);

  const bodyAcc = new UvMeshAccumulator();
  const darkAcc = new UvMeshAccumulator();
  const chromeAcc = new UvMeshAccumulator();
  const hwAcc = new UvMeshAccumulator();

  // 1. Socle noir EPDM 100 mm pour armoires hautes (ou proportionnel si coffret compact)
  const plinthH = height >= 900 ? 100 : Math.min(40, height * 0.08);
  const bodyH = height - plinthH;
  const plinthCenter = add(center, scale(w, plinthH * 0.5));
  darkAcc.addBeveledBox(plinthCenter, width * 0.96, depth * 0.94, plinthH, u, v, w, 2);

  // 2. Caisson principal RAL 7035 chanfreiné (c = 3 mm)
  const cabinetCenter = add(center, scale(w, plinthH + bodyH * 0.5));
  const doorThick = Math.min(22, depth * 0.08);
  const shadowGap = 3; // Joint d'ombre réel de 3 mm
  const rearDepth = depth - doorThick - shadowGap;
  bodyAcc.addBeveledBox(
    add(cabinetCenter, scale(v, (doorThick + shadowGap) * 0.5)),
    width,
    rearDepth,
    bodyH,
    u,
    v,
    w,
    3,
  );

  // Joint d'ombre intermédiaire mat de 3 mm en retrait
  const shadowCenter = add(cabinetCenter, scale(v, -depth * 0.5 + doorThick + shadowGap * 0.5));
  darkAcc.addBeveledBox(shadowCenter, width * 0.97, shadowGap, bodyH * 0.97, u, v, w, 0.5);

  // 3. Porte affleurante chanfreinée devant le joint d'ombre
  const doorCenter = add(cabinetCenter, scale(v, -depth * 0.5 + doorThick * 0.5));
  bodyAcc.addBeveledBox(doorCenter, width * 0.96, doorThick, bodyH * 0.96, u, v, w, 2.5);

  // 4. Poignée chromée anodisée + serrure + voyant de tension
  const handleCenter = add(
    doorCenter,
    add(scale(u, width * 0.39), scale(v, -doorThick * 0.5 - 8)),
  );
  chromeAcc.addBeveledBox(handleCenter, 22, 16, Math.min(110, bodyH * 0.16), u, v, w, 2);

  // Bandeau / plastron passe-câbles supérieur
  const glandPlate = add(cabinetCenter, scale(w, bodyH * 0.5 + 3));
  hwAcc.addBeveledBox(glandPlate, width * 0.72, depth * 0.55, 6, u, v, w, 1);

  // 5. Charnières cylindriques instanciées le long du chant gauche de la porte + presse-étoupes sur ports
  if (isLod350) {
    const numHinges = bodyH >= 1000 ? 3 : 2;
    for (let i = 0; i < numHinges; i++) {
      const frac = -0.36 + (i / (numHinges - 1)) * 0.72;
      const hingePos = add(
        doorCenter,
        add(scale(u, -width * 0.48), add(scale(v, -doorThick * 0.35), scale(w, bodyH * frac))),
      );
      instances.push({
        prototypeKey: 'cabinet_hinge',
        matrix: composeMatrix4(hingePos, u, v, w),
        materialRole: 'zinc_hardware',
      });
    }

    if (eq.ports) {
      for (const port of eq.ports) {
        const pPos = v3(port.position.x, port.position.y, port.position.z);
        const pDir = normalize(v3(port.direction.x, port.direction.y, port.direction.z));
        const frame = buildSafeFrame(pDir);
        instances.push({
          prototypeKey: 'cable_gland',
          matrix: composeMatrix4(pPos, frame.u, frame.v, frame.axis),
          materialRole: 'zinc_hardware',
        });
      }
    }
  }

  pushPartIfNonEmpty(parts, bodyAcc, eq.id, 'steel_ral7035');
  pushPartIfNonEmpty(parts, darkAcc, eq.id, 'epdm_rubber');
  pushPartIfNonEmpty(parts, chromeAcc, eq.id, 'anodized_alu');
  pushPartIfNonEmpty(parts, hwAcc, eq.id, 'zinc_hardware');

  return {
    elementId: eq.id,
    category: 'mepEquipment',
    systemType: eq.ports?.[0]?.systemType ?? 'power',
    domain: 'electrical',
    parts,
    instances,
  };
}
