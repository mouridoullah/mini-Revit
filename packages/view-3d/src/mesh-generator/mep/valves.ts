/**
 * mesh-generator/mep/valves — Vannes d'arrêt (`valve`) et clapets anti-retour (`check_valve`) LOD 350
 *
 * - `valve` DN <= 50 : corps sphérique renflé laiton (1.5 D), 2 écrous 6 pans, presse-étoupe et
 *   levier plat 1/4 de tour gainé (L = 95 mm) en teinte fluide.
 * - `valve` DN > 50 : corps à brides PN16 boulonnées (`bolt_m10`), chapeau et volant à 4 rayons.
 * - `check_valve` : corps octogonal chanfreiné `brass_machined`, chapeau hexagonal et flèche directionnelle.
 */

import type { MepEquipmentGeometryParams } from '../types.js';
import { v3, add, scale } from './common.js';
import { getMepSystemColor } from './colors.js';
import { composeMatrix4, type MepAssembly3D, type MepAssemblyPart, type MepInstanceAnchor } from './assembly-types.js';
import { UvMeshAccumulator } from './primitives.js';
import {
  appendEquipmentPortPads,
  buildSafeFrame,
  pushPartIfNonEmpty,
  resolveEquipmentBasis,
  type MepAssemblyOptions,
} from './assembly-builder-helpers.js';

export function createValveAssembly(
  eq: MepEquipmentGeometryParams,
  options?: MepAssemblyOptions,
): MepAssembly3D {
  const isLod350 = (options?.detailLevel ?? 'lod350') === 'lod350';
  const parts: MepAssemblyPart[] = [];
  const instances: MepInstanceAnchor[] = [];

  const center = v3(eq.position.x, eq.position.y, eq.position.z);
  const { u, v, w } = resolveEquipmentBasis(eq.rotation ?? 0);

  const width = Math.max(40, eq.width);
  const depth = Math.max(30, eq.depth);
  const height = Math.max(40, eq.height);
  const boxCenter = add(center, scale(w, height * 0.5));

  const nominalDn = Math.max(eq.ports?.[0]?.diameter ?? 32, Math.min(width, depth) * 0.45);
  const pipeR = Math.max(10, nominalDn * 0.5);
  const systemType = eq.ports?.[0]?.systemType;
  const domain = eq.ports?.[0]?.domain ?? 'plumbing';
  const fluidColor = eq.color ?? getMepSystemColor(systemType, domain);

  const brassAcc = new UvMeshAccumulator();
  const hardwareAcc = new UvMeshAccumulator();
  const accentAcc = new UvMeshAccumulator();

  const pLeft = add(boxCenter, scale(u, -width * 0.5));
  const pRight = add(boxCenter, scale(u, width * 0.5));

  if (nominalDn <= 50) {
    // Vanne DN <= 50 : corps sphérique renflé laiton (1.5 D) + 2 écrous hexagonaux
    brassAcc.addSmoothCylinder(pLeft, pRight, pipeR, 20, true);
    brassAcc.addSmoothCylinder(
      add(boxCenter, scale(u, -pipeR * 0.9)),
      add(boxCenter, scale(u, pipeR * 0.9)),
      pipeR * 1.5,
      20,
      true,
    );
    brassAcc.addHexPrism(add(pLeft, scale(u, 14)), u, pipeR * 2.5, 22);
    brassAcc.addHexPrism(add(pRight, scale(u, -14)), u, pipeR * 2.5, 22);

    // Collerette presse-étoupe verticale
    const stemBase = add(boxCenter, scale(w, pipeR * 1.2));
    const stemMid = add(boxCenter, scale(w, Math.max(pipeR * 2.2, height * 0.35)));
    brassAcc.addHexPrism(stemBase, w, pipeR * 1.6, 14);
    hardwareAcc.addSmoothCylinder(stemBase, stemMid, Math.max(4, pipeR * 0.32), 12, true);

    // Levier plat quart-de-tour gainé (L = 95 mm)
    const leverCenter = add(stemMid, add(scale(u, 38), scale(w, 6)));
    accentAcc.addBeveledBox(leverCenter, 95, 16, 10, u, v, w, 2);
    hardwareAcc.addHexPrism(add(stemMid, scale(w, 12)), w, 12, 5);
  } else {
    // Vanne DN > 50 : corps à brides PN16 boulonnées + chapeau + volant à 4 rayons
    const flangeOuterR = pipeR + 35;
    const flangeThick = 14;
    brassAcc.addSmoothCylinder(pLeft, pRight, pipeR, 24, true);
    brassAcc.addSmoothCylinder(
      add(boxCenter, scale(u, -pipeR * 0.8)),
      add(boxCenter, scale(u, pipeR * 0.8)),
      pipeR * 1.38,
      24,
      true,
    );

    const fLeft = add(pLeft, scale(u, flangeThick * 0.5));
    const fRight = add(pRight, scale(u, -flangeThick * 0.5));
    hardwareAcc.addFlangeProfile(fLeft, u, pipeR, flangeOuterR, flangeThick, 1.5, 24);
    hardwareAcc.addFlangeProfile(fRight, u, pipeR, flangeOuterR, flangeThick, 1.5, 24);

    const bonnetBase = add(boxCenter, scale(w, pipeR * 1.2));
    const stemTop = add(boxCenter, scale(w, Math.max(height * 0.45, pipeR * 2.6)));
    brassAcc.addSmoothCylinder(bonnetBase, add(bonnetBase, scale(w, pipeR * 0.7)), pipeR * 0.85, 16, true);
    hardwareAcc.addSmoothCylinder(bonnetBase, stemTop, Math.max(6, pipeR * 0.28), 12, true);

    // Volant circulaire à 4 rayons
    const wheelR = Math.max(70, nominalDn * 0.7);
    accentAcc.addHandwheel(add(stemTop, scale(w, 6)), w, wheelR, 7, 4, 24, 8);

    // Couronne de 6 boulons M10 par bride
    if (isLod350) {
      const boltCircleR = pipeR + 21;
      const boltFrame = buildSafeFrame(u);
      const numBolts = nominalDn >= 100 ? 8 : 4;
      for (let b = 0; b < numBolts; b++) {
        const ang = (2 * Math.PI * b) / numBolts;
        const offset = add(
          scale(boltFrame.u, Math.cos(ang) * boltCircleR),
          scale(boltFrame.v, Math.sin(ang) * boltCircleR),
        );
        instances.push({
          prototypeKey: 'bolt_m10',
          matrix: composeMatrix4(add(fLeft, offset), boltFrame.u, boltFrame.v, boltFrame.axis),
          materialRole: 'zinc_hardware',
        });
        instances.push({
          prototypeKey: 'bolt_m10',
          matrix: composeMatrix4(add(fRight, offset), boltFrame.u, boltFrame.v, boltFrame.axis),
          materialRole: 'zinc_hardware',
        });
      }
    }
  }

  appendEquipmentPortPads(brassAcc, eq.ports);
  pushPartIfNonEmpty(parts, brassAcc, eq.id, 'brass_machined');
  pushPartIfNonEmpty(parts, hardwareAcc, eq.id, 'zinc_hardware');
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

export function createCheckValveAssembly(
  eq: MepEquipmentGeometryParams,
): MepAssembly3D {
  const parts: MepAssemblyPart[] = [];
  const center = v3(eq.position.x, eq.position.y, eq.position.z);
  const { u, v, w } = resolveEquipmentBasis(eq.rotation ?? 0);

  const width = Math.max(50, eq.width);
  const depth = Math.max(36, eq.depth);
  const height = Math.max(40, eq.height);
  const boxCenter = add(center, scale(w, height * 0.5));
  const pipeR = Math.max(12, Math.min(depth, height) * 0.34);

  const brassAcc = new UvMeshAccumulator();
  const hardwareAcc = new UvMeshAccumulator();
  const accentAcc = new UvMeshAccumulator();

  // Corps tubulaire + chambre octogonale chanfreinée + chapeau 6 pans
  brassAcc.addSmoothCylinder(
    add(boxCenter, scale(u, -width * 0.5)),
    add(boxCenter, scale(u, width * 0.5)),
    pipeR,
    20,
    true,
  );
  brassAcc.addBeveledBox(boxCenter, width * 0.48, pipeR * 2.4, pipeR * 2.3, u, v, w, 3);
  brassAcc.addHexPrism(add(boxCenter, scale(u, -width * 0.42)), u, pipeR * 2.4, 18);
  brassAcc.addHexPrism(add(boxCenter, scale(u, width * 0.42)), u, pipeR * 2.4, 18);
  hardwareAcc.addHexPrism(
    add(boxCenter, scale(w, pipeR * 1.45)),
    w,
    pipeR * 1.8,
    Math.max(16, pipeR * 0.9),
  );

  // Flèche directionnelle en relief sur la face avant (-V)
  const arrowCenter = add(boxCenter, scale(v, -pipeR * 1.24));
  accentAcc.addBeveledBox(arrowCenter, width * 0.24, 5, 6, u, v, w, 1);
  accentAcc.addBeveledBox(
    add(arrowCenter, scale(u, width * 0.12)),
    10,
    5,
    14,
    u,
    v,
    w,
    1.5,
  );

  appendEquipmentPortPads(brassAcc, eq.ports);
  pushPartIfNonEmpty(parts, brassAcc, eq.id, 'brass_machined');
  pushPartIfNonEmpty(parts, hardwareAcc, eq.id, 'zinc_hardware');
  pushPartIfNonEmpty(
    parts,
    accentAcc,
    eq.id,
    'fluid_accent',
    eq.color ?? getMepSystemColor(eq.ports?.[0]?.systemType, eq.ports?.[0]?.domain ?? 'plumbing'),
  );

  return {
    elementId: eq.id,
    category: 'mepEquipment',
    systemType: eq.ports?.[0]?.systemType,
    domain: eq.ports?.[0]?.domain ?? 'plumbing',
    parts,
    instances: [],
  };
}
