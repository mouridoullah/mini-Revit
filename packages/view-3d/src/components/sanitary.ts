/**
 * components/sanitary — Équipements sanitaires LOD 350 multi-matériaux
 *
 * Gère : toilet, sink, shower, bath
 * Fournit à la fois createSanitaryAssembly (LOD 350) et createSanitaryMesh (compatibilité ascendante).
 */

import type { RawMeshData } from '@tabax/geometry';
import type {
  ComponentMeshInput,
  ComponentTypeMeshInput,
  ComponentAssembly3D,
  ComponentAssemblyPart,
  CreateComponentAssemblyOptions,
} from './types.js';
import {
  ArchitecturalMeshAccumulator,
  v3,
  add,
  type Vec3D,
} from './architectural-primitives.js';
import { createAssemblyPart, mergeAssemblyParts } from './assembly-helper.js';

export const SANITARY_SUBTYPES = ['toilet', 'sink', 'shower', 'bath'] as const;
export type SanitarySubType = (typeof SANITARY_SUBTYPES)[number];

export function createSanitaryAssembly(
  comp: ComponentMeshInput,
  compType: ComponentTypeMeshInput,
  levelElevation = 0,
  _options?: CreateComponentAssemblyOptions,
): ComponentAssembly3D | null {
  const width = comp.widthOverride ?? compType.width;
  const depth = comp.depthOverride ?? compType.depth;
  const height = comp.heightOverride ?? compType.height;
  if (width <= 0 || depth <= 0 || height <= 0) return null;

  const elevationOffset = comp.placement.elevationOffset ?? compType.defaultElevationOffset ?? 0;
  const zBase = levelElevation + elevationOffset;
  const rotation = comp.placement.rotation ?? 0;
  const cx = comp.placement.x;
  const cy = comp.placement.y;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const uAxis: Vec3D = { x: cos, y: sin, z: 0 };
  const vAxis: Vec3D = { x: -sin, y: cos, z: 0 };
  const wAxis: Vec3D = { x: 0, y: 0, z: 1 };

  const pt = (lx: number, ly: number, lz: number): Vec3D => {
    return {
      x: cx + uAxis.x * lx + vAxis.x * ly,
      y: cy + uAxis.y * lx + vAxis.y * ly,
      z: zBase + lz,
    };
  };

  const parts: ComponentAssemblyPart[] = [];
  const id = comp.id;

  switch (compType.subType) {
    case 'toilet': {
      // 1. Porcelaine blanche : cuvette suspendue / posée galbée
      const accPorcelain = new ArchitecturalMeshAccumulator();
      const tankD = Math.min(180, depth * 0.32);
      const bowlD = depth - tankD;

      // Réservoir / caisson d'appui arrière
      accPorcelain.addBeveledBox(
        pt(0, depth / 2 - tankD / 2, height / 2),
        v3(width * 0.9, tankD, height),
        15,
        uAxis,
        vAxis,
        wAxis,
      );

      // Cuvette galbée en porte-à-faux avant
      const bowlH = height * 0.85;
      accPorcelain.addBeveledBox(
        pt(0, -tankD / 2, bowlH / 2),
        v3(width * 0.85, bowlD * 0.95, bowlH),
        25,
        uAxis,
        vAxis,
        wAxis,
      );

      // Abattant profilé
      accPorcelain.addBeveledBox(
        pt(0, -tankD / 2, height * 0.88),
        v3(width * 0.88, bowlD * 0.98, 25),
        8,
        uAxis,
        vAxis,
        wAxis,
      );
      parts.push(createAssemblyPart(accPorcelain.toRawMeshData(`${id}_porcelain`), 'porcelain_white'));

      // 2. Charnières et plaque de commande double touche en chrome
      const accChrome = new ArchitecturalMeshAccumulator();
      // Charnières abattant
      accChrome.addSmoothCylinder(
        pt(-width * 0.25, depth / 2 - tankD, height * 0.88),
        pt(-width * 0.25, depth / 2 - tankD + 25, height * 0.88),
        10,
        12,
        true,
      );
      accChrome.addSmoothCylinder(
        pt(width * 0.25, depth / 2 - tankD, height * 0.88),
        pt(width * 0.25, depth / 2 - tankD + 25, height * 0.88),
        10,
        12,
        true,
      );

      // Plaque de commande murale
      accChrome.addBeveledBox(
        pt(0, depth / 2 - 5, height * 0.8),
        v3(220, 15, 140),
        4,
        uAxis,
        vAxis,
        wAxis,
      );
      parts.push(createAssemblyPart(accChrome.toRawMeshData(`${id}_chrome`), 'chrome_hardware'));
      break;
    }

    case 'sink': {
      // 1. Meuble vasque suspendu / sur pied en bois chêne ou foncé
      const accWood = new ArchitecturalMeshAccumulator();
      const vanityH = Math.min(height - 100, height * 0.8);
      accWood.addBeveledBox(
        pt(0, 0, vanityH / 2),
        v3(width * 0.95, depth * 0.95, vanityH),
        8,
        uAxis,
        vAxis,
        wAxis,
      );
      parts.push(createAssemblyPart(accWood.toRawMeshData(`${id}_vanity`), 'wood_oak'));

      // 2. Plan vasque en quartz / porcelaine avec cuve évidée
      const accCeramic = new ArchitecturalMeshAccumulator();
      const basinH = height - vanityH;
      accCeramic.addBeveledBox(
        pt(0, 0, height - basinH / 2),
        v3(width, depth, basinH),
        10,
        uAxis,
        vAxis,
        wAxis,
      );
      // Évidement de la cuve
      accCeramic.addBasin(
        pt(0, 0, height),
        v3(width * 0.75, depth * 0.7, basinH * 0.9),
        30,
        basinH * 0.8,
        uAxis,
        vAxis,
      );
      parts.push(createAssemblyPart(accCeramic.toRawMeshData(`${id}_basin`), 'porcelain_white'));

      // 3. Robinetterie mitigeur col-de-cygne chromé & bonde
      const accChrome = new ArchitecturalMeshAccumulator();
      const faucetBase = pt(0, depth * 0.32, height);
      accChrome.addSmoothCylinder(faucetBase, add(faucetBase, { x: 0, y: 0, z: 40 }), 18, 16, true);
      accChrome.addCurvedSpout(add(faucetBase, { x: 0, y: 0, z: 35 }), 160, 120, 10, 16);
      // Manette de commande
      accChrome.addSmoothCylinder(
        add(faucetBase, { x: 20, y: 0, z: 40 }),
        add(faucetBase, { x: 50, y: 0, z: 45 }),
        6,
        12,
        true,
      );
      // Bonde au fond de la vasque
      accChrome.addSmoothCylinder(
        pt(0, 0, height - basinH * 0.75),
        pt(0, 0, height - basinH * 0.75 + 10),
        25,
        16,
        true,
      );
      // Poignées de tiroir meuble vasque
      accChrome.addSmoothCylinder(
        pt(-width * 0.35, -depth / 2 - 5, vanityH * 0.7),
        pt(width * 0.35, -depth / 2 - 5, vanityH * 0.7),
        6,
        12,
        true,
      );
      parts.push(createAssemblyPart(accChrome.toRawMeshData(`${id}_faucet`), 'chrome_hardware'));

      // 4. Miroir mural au-dessus de la vasque
      const accMirror = new ArchitecturalMeshAccumulator();
      const mirrorW = width * 0.85;
      const mirrorH = 750;
      const mirrorCenter = pt(0, depth / 2 - 5, height + 150 + mirrorH / 2);
      accMirror.addBeveledBox(mirrorCenter, v3(mirrorW, 10, mirrorH), 4, uAxis, vAxis, wAxis);
      parts.push(createAssemblyPart(accMirror.toRawMeshData(`${id}_mirror`), 'mirror'));
      break;
    }

    case 'shower': {
      // 1. Receveur extra-plat pierre / ardoise
      const accTray = new ArchitecturalMeshAccumulator();
      const trayH = Math.min(height, 50);
      accTray.addBeveledBox(
        pt(0, 0, trayH / 2),
        v3(width, depth, trayH),
        5,
        uAxis,
        vAxis,
        wAxis,
      );
      parts.push(createAssemblyPart(accTray.toRawMeshData(`${id}_tray`), 'granite_dark'));

      // 2. Paroi de douche vitrée trempée transparente
      const accGlass = new ArchitecturalMeshAccumulator();
      const glassH = 2000;
      const glassThick = 10;
      // Paroi fixe latérale
      accGlass.addBeveledBox(
        pt(width / 2 - glassThick / 2, 0, trayH + glassH / 2),
        v3(glassThick, depth * 0.85, glassH),
        2,
        uAxis,
        vAxis,
        wAxis,
      );
      parts.push(createAssemblyPart(accGlass.toRawMeshData(`${id}_glass`), 'glass_clear'));

      // 3. Profilés et colonne de douche alu / chrome
      const accMetal = new ArchitecturalMeshAccumulator();
      // Profilé mural de fixation
      accMetal.addBeveledBox(
        pt(width / 2 - 15, depth / 2 - 10, trayH + glassH / 2),
        v3(30, 20, glassH),
        2,
        uAxis,
        vAxis,
        wAxis,
      );
      // Colonne de douche murale thermostatique
      const colBase = pt(0, depth / 2 - 20, trayH + 900);
      accMetal.addSmoothCylinder(colBase, add(colBase, { x: 0, y: 0, z: 1100 }), 14, 16, true);
      // Pommeau de tête carré en porte-à-faux
      accMetal.addBeveledBox(
        add(colBase, { x: 0, y: -250, z: 1100 }),
        v3(250, 250, 15),
        4,
        uAxis,
        vAxis,
        wAxis,
      );
      // Mitigeur thermostatique mural
      accMetal.addSmoothCylinder(
        add(colBase, { x: -120, y: 0, z: 0 }),
        add(colBase, { x: 120, y: 0, z: 0 }),
        20,
        16,
        true,
      );
      // Grille de bonde de receveur
      accMetal.addBeveledBox(pt(0, 0, trayH), v3(120, 120, 4), 2, uAxis, vAxis, wAxis);
      parts.push(createAssemblyPart(accMetal.toRawMeshData(`${id}_metal`), 'chrome_hardware'));
      break;
    }

    case 'bath': {
      // 1. Coque baignoire îlot / encastrée en acrylique blanc
      const accBath = new ArchitecturalMeshAccumulator();
      accBath.addBeveledBox(
        pt(0, 0, height / 2),
        v3(width, depth, height),
        30,
        uAxis,
        vAxis,
        wAxis,
      );
      // Évidement de cuve intérieure
      accBath.addBasin(
        pt(0, 0, height),
        v3(width * 0.88, depth * 0.82, height * 0.9),
        60,
        height * 0.85,
        uAxis,
        vAxis,
      );
      parts.push(createAssemblyPart(accBath.toRawMeshData(`${id}_tub`), 'porcelain_white'));

      // 2. Robinetterie mitigeur sur gorge / cascade chromée
      const accTap = new ArchitecturalMeshAccumulator();
      const tapBase = pt(width / 2 - 80, 0, height);
      accTap.addCurvedSpout(tapBase, 180, -90, 14, 16);
      accTap.addSmoothCylinder(
        add(tapBase, { x: 0, y: -60, z: 20 }),
        add(tapBase, { x: 0, y: -60, z: 70 }),
        18,
        16,
        true,
      );
      accTap.addSmoothCylinder(
        add(tapBase, { x: 0, y: 60, z: 20 }),
        add(tapBase, { x: 0, y: 60, z: 70 }),
        18,
        16,
        true,
      );
      // Bonde centrale
      accTap.addSmoothCylinder(pt(0, 0, 30), pt(0, 0, 40), 30, 16, true);
      parts.push(createAssemblyPart(accTap.toRawMeshData(`${id}_tap`), 'chrome_hardware'));
      break;
    }

    default:
      return null;
  }

  return {
    elementId: id,
    category: 'component',
    family: 'sanitary',
    subType: compType.subType,
    parts,
  };
}

/**
 * Génère le maillage unifié compatible avec l'ancienne signature mono-matériau.
 */
export function createSanitaryMesh(
  comp: ComponentMeshInput,
  compType: ComponentTypeMeshInput,
  levelElevation = 0,
): RawMeshData | null {
  const assembly = createSanitaryAssembly(comp, compType, levelElevation);
  if (!assembly) return null;
  return mergeAssemblyParts(assembly.parts, comp.id);
}
