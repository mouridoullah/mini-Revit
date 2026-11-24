/**
 * mesh-generator/mep/equipment — Équipements techniques MEP 3D haute fidélité
 *
 * Implémente une modélisation multi-volumes réaliste et distincte pour chacune
 * des 10 familles d'équipements techniques du bâtiment (ADR-072) :
 * - boiler (Chaudière gaz/fioul : corps, brûleur, bandeau de régulation, buse de fumée)
 * - heat_pump (PAC : caisson, grille de ventilateur circulaire, échangeur à ailettes, plots)
 * - water_heater (Ballon ECS : cuve cylindrique calorifugée, dôme supérieur, socle, thermostat)
 * - pump (Circulateur/pompe : volute hydraulique, brides, moteur à ailettes, boîte à bornes)
 * - ahu (CTA modulaire : sections filtres/batterie/ventilation, portes d'accès, cadre profilé)
 * - fan (Extracteur/tourelle : volute centrifuge, pavillon d'aspiration, moteur)
 * - radiator (Radiateur à eau : panneau nervuré, ailettes arrière, robinet thermostatique)
 * - valve (Vanne : corps sphérique à brides, tige verticale, volant de manœuvre)
 * - meter (Compteur : corps laiton, raccords union, cadran de lecture rehaussé)
 * - electrical_panel (Armoire TGBT : coffret métallique, porte avec serrure, plastron disjoncteurs)
 */

import type { RawMeshData } from '@tabax/geometry';
import type { MepEquipmentGeometryParams } from '../types.js';
import { RawMeshAccumulator, v3, add, scale, normalize } from './common.js';
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

  const width = Math.max(10, eq.width);
  const depth = Math.max(10, eq.depth);
  const height = Math.max(10, eq.height);

  // Position du centre géométrique de l'enveloppe à mi-hauteur Z
  const boxCenter = add(center, scale(w, height / 2));

  switch (eq.family) {
    case 'boiler': {
      // 1. Corps principal jaquette
      acc.addBox(boxCenter, width, depth, height * 0.92, u, v, w);
      // 2. Pieds de socle (4 plots aux coins)
      const footH = height * 0.08;
      const footW = width * 0.15;
      const footD = depth * 0.15;
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          const footPos = add(
            center,
            add(scale(u, sx * (width * 0.4)), add(scale(v, sy * (depth * 0.4)), scale(w, footH / 2))),
          );
          acc.addBox(footPos, footW, footD, footH, u, v, w);
        }
      }
      // 3. Bandeau de commande en façade (écran et boutons)
      const fasciaCenter = add(
        center,
        add(scale(v, -depth * 0.51), scale(w, height * 0.75)),
      );
      acc.addBox(fasciaCenter, width * 0.7, depth * 0.04, height * 0.2, u, v, w);
      // 4. Buse de fumée verticale sur le dessus (cheminée)
      const flueR = Math.min(width, depth) * 0.15;
      const flueBottom = add(center, scale(w, height * 0.92));
      const flueTop = add(center, scale(w, height * 1.12));
      acc.addCylinder(flueBottom, flueTop, flueR, 16, true);
      break;
    }

    case 'heat_pump': {
      // 1. Châssis principal
      acc.addBox(boxCenter, width, depth, height * 0.94, u, v, w);
      // 2. Grille de ventilateur ronde en façade avant (-V)
      const fanR = Math.min(width, height) * 0.38;
      const fanCenter = add(
        center,
        add(scale(v, -depth * 0.5), scale(w, height * 0.5)),
      );
      const fanOut = add(fanCenter, scale(v, -15));
      acc.addCylinder(fanCenter, fanOut, fanR, 20, true);
      // Moyeu central du ventilateur
      acc.addCylinder(fanCenter, add(fanCenter, scale(v, -22)), fanR * 0.25, 16, true);
      // 3. Rails de supportage / patins anti-vibratiles au sol
      const skidH = height * 0.06;
      for (const sx of [-1, 1]) {
        const skidPos = add(
          center,
          add(scale(u, sx * (width * 0.38)), scale(w, skidH / 2)),
        );
        acc.addBox(skidPos, width * 0.15, depth * 1.05, skidH, u, v, w);
      }
      break;
    }

    case 'water_heater': {
      // 1. Cuve cylindrique verticale
      const tankR = Math.min(width, depth) * 0.48;
      const tankBottom = add(center, scale(w, height * 0.12));
      const tankTop = add(center, scale(w, height * 0.92));
      acc.addCylinder(tankBottom, tankTop, tankR, 24, true);
      // 2. Calotte supérieure bombée
      const domePeak = add(center, scale(w, height));
      acc.addTruncatedCone(tankTop, domePeak, tankR, tankR * 0.4, 24);
      // 3. Socle tripode / piètement inférieur
      acc.addCylinder(center, tankBottom, tankR * 0.88, 16, true);
      // 4. Boîtier de thermostat et capot électrique sur le bas
      const boxPos = add(
        center,
        add(scale(v, -tankR * 0.95), scale(w, height * 0.25)),
      );
      acc.addBox(boxPos, width * 0.35, depth * 0.15, height * 0.22, u, v, w);
      break;
    }

    case 'pump': {
      // 1. Corps de pompe spiralé (volute centrale)
      const voluteR = Math.min(width, height) * 0.35;
      const volute1 = add(boxCenter, scale(v, -depth * 0.2));
      const volute2 = add(boxCenter, scale(v, depth * 0.2));
      acc.addCylinder(volute1, volute2, voluteR, 20, true);
      // 2. Brides d'aspiration et de refoulement alignées sur l'axe X
      const pipeR = voluteR * 0.55;
      const pLeft = add(boxCenter, scale(u, -width * 0.5));
      const pRight = add(boxCenter, scale(u, width * 0.5));
      acc.addCylinder(pLeft, pRight, pipeR, 16, true);
      // Collerettes de brides aux extrémités
      acc.addCylinder(pLeft, add(pLeft, scale(u, 15)), pipeR * 1.3, 16, true);
      acc.addCylinder(add(pRight, scale(u, -15)), pRight, pipeR * 1.3, 16, true);
      // 3. Moteur électrique à ailettes perpendiculaire (axe Z ou Y)
      const motorR = voluteR * 0.75;
      const motorBottom = add(boxCenter, scale(w, voluteR * 0.6));
      const motorTop = add(boxCenter, scale(w, height * 0.48));
      acc.addCylinder(motorBottom, motorTop, motorR, 16, true);
      // 4. Boîte à bornes sur le dessus du moteur
      const termBox = add(motorTop, scale(w, 15));
      acc.addBox(termBox, width * 0.3, depth * 0.3, 25, u, v, w);
      break;
    }

    case 'ahu': {
      // 1. Caisson modulaire divisé en 3 sections
      acc.addBox(boxCenter, width, depth, height, u, v, w);
      // 2. Cadres et profilés d'angle en relief
      const ribThick = Math.min(width, depth, height) * 0.04;
      for (const su of [-0.33, 0.33]) {
        const dividerPos = add(boxCenter, scale(u, su * width));
        acc.addBox(dividerPos, ribThick, depth * 1.02, height * 1.02, u, v, w);
      }
      // 3. Portes d'inspection avec poignées en façade avant
      for (const su of [-0.33, 0.33]) {
        const handlePos = add(
          boxCenter,
          add(scale(u, su * width + width * 0.12), add(scale(v, -depth * 0.52), scale(w, 0))),
        );
        acc.addBox(handlePos, 20, 15, 60, u, v, w);
      }
      break;
    }

    case 'fan': {
      // 1. Volute d'extraction spiralée
      const fanR = Math.min(width, height) * 0.42;
      const f1 = add(boxCenter, scale(v, -depth * 0.25));
      const f2 = add(boxCenter, scale(v, depth * 0.25));
      acc.addCylinder(f1, f2, fanR, 20, true);
      // 2. Pavillon d'aspiration conique
      acc.addTruncatedCone(f1, add(f1, scale(v, -depth * 0.25)), fanR * 0.75, fanR * 0.95, 16);
      // 3. Cadre de rejet rectangulaire tangentiel
      const dischargeCenter = add(
        boxCenter,
        add(scale(u, width * 0.35), scale(w, height * 0.3)),
      );
      acc.addBox(dischargeCenter, width * 0.35, depth * 0.45, height * 0.35, u, v, w);
      break;
    }

    case 'radiator': {
      // 1. Panneau principal nervuré en tôle
      const panelThick = depth * 0.35;
      acc.addBox(boxCenter, width, panelThick, height * 0.9, u, v, w);
      // 2. Ailettes de convection arrière
      const finCenter = add(boxCenter, scale(v, depth * 0.25));
      acc.addBox(finCenter, width * 0.94, depth * 0.4, height * 0.8, u, v, w);
      // 3. Grille perforée supérieure
      const grillePos = add(boxCenter, scale(w, height * 0.46));
      acc.addBox(grillePos, width, depth * 0.8, 12, u, v, w);
      // 4. Robinet thermostatique en tête haute
      const valvePos = add(
        boxCenter,
        add(scale(u, -width * 0.48), scale(w, height * 0.35)),
      );
      acc.addCylinder(valvePos, add(valvePos, scale(u, -35)), 18, 12, true);
      break;
    }

    case 'valve': {
      // 1. Corps de vanne biconique / sphérique
      const valveR = Math.min(width, depth, height) * 0.35;
      const v1 = add(boxCenter, scale(u, -width * 0.3));
      const v2 = add(boxCenter, scale(u, width * 0.3));
      acc.addCylinder(v1, v2, valveR, 16, true);
      // Brides de raccordement
      acc.addCylinder(v1, add(v1, scale(u, -15)), valveR * 1.3, 16, true);
      acc.addCylinder(v2, add(v2, scale(u, 15)), valveR * 1.3, 16, true);
      // 2. Chapeau et tige de commande verticale
      const bonnetBottom = add(boxCenter, scale(w, valveR * 0.7));
      const bonnetTop = add(boxCenter, scale(w, height * 0.42));
      acc.addCylinder(bonnetBottom, bonnetTop, valveR * 0.4, 12, true);
      // 3. Volant de manœuvre circulaire horizontal
      const wheelCenter = add(bonnetTop, scale(w, 8));
      acc.addCylinder(wheelCenter, add(wheelCenter, scale(w, 12)), valveR * 1.1, 16, true);
      break;
    }

    case 'meter': {
      // 1. Corps tubulaire horizontal en laiton
      const pipeR = Math.min(depth, height) * 0.28;
      const m1 = add(boxCenter, scale(u, -width * 0.5));
      const m2 = add(boxCenter, scale(u, width * 0.5));
      acc.addCylinder(m1, m2, pipeR, 16, true);
      // Écrous et raccords union
      acc.addCylinder(m1, add(m1, scale(u, 25)), pipeR * 1.35, 12, true);
      acc.addCylinder(add(m2, scale(u, -25)), m2, pipeR * 1.35, 12, true);
      // 2. Capsule de comptage cylindrique rehaussée
      const dialR = pipeR * 1.25;
      const dialBottom = add(boxCenter, scale(w, pipeR * 0.4));
      const dialTop = add(boxCenter, scale(w, height * 0.48));
      acc.addCylinder(dialBottom, dialTop, dialR, 20, true);
      break;
    }

    case 'electrical_panel': {
      // 1. Coffret métallique mural / armoire
      acc.addBox(boxCenter, width, depth, height, u, v, w);
      // 2. Porte battante en légère saillie
      const doorCenter = add(boxCenter, scale(v, -depth * 0.51));
      acc.addBox(doorCenter, width * 0.94, depth * 0.04, height * 0.94, u, v, w);
      // 3. Serrure / poignée à clé
      const lockCenter = add(
        boxCenter,
        add(scale(u, width * 0.38), add(scale(v, -depth * 0.53), scale(w, 0))),
      );
      acc.addBox(lockCenter, 15, 10, 45, u, v, w);
      // 4. Plaques passe-câbles supérieures et inférieures
      const topPlate = add(boxCenter, scale(w, height * 0.51));
      const botPlate = add(boxCenter, scale(w, -height * 0.51));
      acc.addBox(topPlate, width * 0.7, depth * 0.6, 8, u, v, w);
      acc.addBox(botPlate, width * 0.7, depth * 0.6, 8, u, v, w);
      break;
    }

    default: {
      // Fallback enveloppe cubique standard
      acc.addBox(boxCenter, width, depth, height, u, v, w);
      break;
    }
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
