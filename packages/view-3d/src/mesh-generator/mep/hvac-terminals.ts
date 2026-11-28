/**
 * mesh-generator/mep/hvac-terminals — Diffuseurs et grilles de soufflage CVC LOD 350
 *
 * Modélise `air_diffuser` :
 * - Cadre périmétrique biseauté à 45° (`anodized_alu`, bordure 30 mm, épaisseur 12 mm)
 * - Plénum arrière chanfreiné (`galvanized_steel`, profondeur 120 mm) + piquage circulaire
 * - Fond sombre mat anti-reflet (`epdm_rubber`)
 * - Rangée d'ailettes `diffuser_blade` instanciées inclinées à 30° au pas de 20 mm (LOD 350)
 */

import type { MepEquipmentGeometryParams } from '../types.js';
import { v3, add, scale } from './common.js';
import { composeMatrix4, type MepAssembly3D, type MepAssemblyPart, type MepInstanceAnchor } from './assembly-types.js';
import { UvMeshAccumulator } from './primitives.js';
import {
  appendEquipmentPortPads,
  pushPartIfNonEmpty,
  resolveEquipmentBasis,
  type MepAssemblyOptions,
} from './assembly-builder-helpers.js';

export function createAirDiffuserAssembly(
  eq: MepEquipmentGeometryParams,
  options?: MepAssemblyOptions,
): MepAssembly3D {
  const isLod350 = (options?.detailLevel ?? 'lod350') === 'lod350';
  const parts: MepAssemblyPart[] = [];
  const instances: MepInstanceAnchor[] = [];

  const center = v3(eq.position.x, eq.position.y, eq.position.z);
  const { u, v, w } = resolveEquipmentBasis(eq.rotation ?? 0);

  const width = Math.max(120, eq.width);
  const depth = Math.max(100, eq.depth);
  const height = Math.max(120, eq.height);
  const boxCenter = add(center, scale(w, height * 0.5));

  const frameBorder = Math.min(30, width * 0.14, height * 0.14);
  const frameThick = 12;
  const frontY = -depth * 0.5;
  const innerW = Math.max(40, width - 2 * frameBorder);
  const innerH = Math.max(40, height - 2 * frameBorder);

  // 1. Cadre périmétrique biseauté en aluminium anodisé (4 profilés)
  const frameAcc = new UvMeshAccumulator();
  const framePos = add(boxCenter, scale(v, frontY));
  // Montant bas & haut
  frameAcc.addBeveledBox(
    add(framePos, scale(w, -height * 0.5 + frameBorder * 0.5)),
    width,
    frameThick,
    frameBorder,
    u,
    v,
    w,
    2.5,
  );
  frameAcc.addBeveledBox(
    add(framePos, scale(w, height * 0.5 - frameBorder * 0.5)),
    width,
    frameThick,
    frameBorder,
    u,
    v,
    w,
    2.5,
  );
  // Montant gauche & droit
  frameAcc.addBeveledBox(
    add(framePos, scale(u, -width * 0.5 + frameBorder * 0.5)),
    frameBorder,
    frameThick,
    innerH,
    u,
    v,
    w,
    2.5,
  );
  frameAcc.addBeveledBox(
    add(framePos, scale(u, width * 0.5 - frameBorder * 0.5)),
    frameBorder,
    frameThick,
    innerH,
    u,
    v,
    w,
    2.5,
  );
  pushPartIfNonEmpty(parts, frameAcc, eq.id, 'anodized_alu');

  // 2. Plénum arrière chanfreiné + manchon de piquage circulaire en acier galvanisé
  const plenumAcc = new UvMeshAccumulator();
  const plenumDepth = Math.min(120, Math.max(60, depth - frameThick));
  const plenumCenter = add(framePos, scale(v, plenumDepth * 0.5 + frameThick * 0.5));
  plenumAcc.addBeveledBox(plenumCenter, width * 0.88, plenumDepth, height * 0.88, u, v, w, 3);

  const spigotR = Math.min(innerW, innerH) * 0.32;
  const spigotStart = add(plenumCenter, scale(v, plenumDepth * 0.5));
  const spigotEnd = add(spigotStart, scale(v, 38));
  plenumAcc.addSmoothCylinder(spigotStart, spigotEnd, spigotR, 20, true);
  plenumAcc.addFlangeProfile(spigotEnd, v, spigotR, spigotR * 1.12, 10, 1, 20);
  appendEquipmentPortPads(plenumAcc, eq.ports);
  pushPartIfNonEmpty(parts, plenumAcc, eq.id, 'galvanized_steel');

  // 3. Fond sombre mat derrière les ailettes pour profondeur visuelle
  const backingAcc = new UvMeshAccumulator();
  const backingCenter = add(framePos, scale(v, frameThick * 0.7));
  backingAcc.addBeveledBox(backingCenter, innerW, 4, innerH, u, v, w, 0.5);
  pushPartIfNonEmpty(parts, backingAcc, eq.id, 'epdm_rubber');

  // 4. Rangée d'ailettes profilées instanciées inclinées à 30° au pas de 20 mm (LOD 350)
  if (isLod350) {
    const pitch = 20;
    const count = Math.max(2, Math.floor((innerH - 12) / pitch));
    const step = (innerH - 12) / Math.max(1, count - 1);
    const zStart = -innerH * 0.5 + 6;
    for (let i = 0; i < count; i++) {
      const zOff = zStart + i * step;
      const bladeOrigin = add(framePos, scale(w, zOff));
      instances.push({
        prototypeKey: 'diffuser_blade',
        matrix: composeMatrix4(bladeOrigin, u, v, w, v3(innerW * 0.96, 1, 1)),
        materialRole: 'anodized_alu',
      });
    }
  }

  return {
    elementId: eq.id,
    category: 'mepEquipment',
    systemType: eq.ports?.[0]?.systemType,
    domain: eq.ports?.[0]?.domain ?? 'hvac',
    parts,
    instances,
  };
}
