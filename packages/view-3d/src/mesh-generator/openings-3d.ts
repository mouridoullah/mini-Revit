/**
 * openings-3d
 *
 * Génère des menuiseries 3D paramétriques riches (cadre alu, vitrage MeshPhysical,
 * huisserie bois, béquille chromée) sous forme de THREE.Group.
 *
 * Ces groupes sont utilisés directement par Scene3D.addOpeningMesh() en complément
 * du placeholder géométrique RawMeshData existant.
 *
 * Règles :
 * - userData.elementId sur chaque sous-maillage (ADR-026)
 * - Matériaux marqués isSharedMaterial: false (chaque ouverture possède les siens)
 * - Enroulement CCW, FrontSide sauf vitrage (DoubleSide) et BackSide stencil
 * - Repère local : X = long du mur, Y = épaisseur mur, Z = vertical
 */

import * as THREE from 'three';
import type { OpeningGeometryParams, WallGeometryParams, WallTypeGeometryParams } from './types.js';

// Couleurs matériaux
const COLOR_ALU_FRAME = 0x2d3748;   // Aluminium anthracite
const COLOR_WOOD_DOOR = 0x8b5a2b;   // Bois chaud
const COLOR_CHROME = 0xd4d4d4;      // Chrome

function aluFrameMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: COLOR_ALU_FRAME,
    roughness: 0.3,
    metalness: 0.8,
    side: THREE.FrontSide,
  });
}

function glazingMaterial(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: 0xa8d4f0,
    roughness: 0.04,
    metalness: 0.1,
    transmission: 0.85,
    transparent: true,
    opacity: 0.35,
    envMapIntensity: 1.6,
    side: THREE.DoubleSide,
  });
}

function woodMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: COLOR_WOOD_DOOR,
    roughness: 0.65,
    metalness: 0.0,
    side: THREE.FrontSide,
  });
}

function chromeMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: COLOR_CHROME,
    roughness: 0.08,
    metalness: 0.92,
    side: THREE.FrontSide,
  });
}

function box(
  w: number,
  h: number,
  d: number,
  material: THREE.Material,
  id: string,
): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geo, material);
  mesh.userData.elementId = id;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function cylinder(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  material: THREE.Material,
  id: string,
  segments = 8,
): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments);
  const mesh = new THREE.Mesh(geo, material);
  mesh.userData.elementId = id;
  return mesh;
}

/**
 * Calcule la position et rotation du groupe dans le repère monde,
 * en fonction des paramètres de mur et d'ouverture.
 */
function placeGroup(
  group: THREE.Group,
  wall: WallGeometryParams,
  opening: OpeningGeometryParams,
  _wallType: WallTypeGeometryParams,
  elevation: number,
): void {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-4) return;

  const ux = dx / len;
  const uy = dy / len;

  const uCenter = opening.offsetAlong + opening.width / 2;
  const cx = wall.start.x + ux * uCenter;
  const cy = wall.start.y + uy * uCenter;

  const sill = opening.sillHeight ?? 0;
  const cz = elevation + sill + opening.height / 2;

  group.position.set(cx, cy, cz);

  // La rotation du groupe aligne X local sur le vecteur directeur du mur
  const wallAngle = Math.atan2(uy, ux);
  group.rotation.set(0, 0, wallAngle);
}

// ============================================================================
// Fenêtre parametrique
// ============================================================================

export function createWindowGroup(
  opening: OpeningGeometryParams,
  wall: WallGeometryParams,
  wallType: WallTypeGeometryParams,
  elevation: number = 0,
): THREE.Group {
  const id = opening.id;
  const w = opening.width;
  const h = opening.height;
  const th = wallType.thickness;

  const group = new THREE.Group();
  group.name = `window-${id}`;
  group.userData.elementId = id;

  const aluMat = aluFrameMaterial();
  const glazMat = glazingMaterial();

  const frameW = 50;  // épaisseur du cadre en mm
  const frameD = th;  // profondeur = épaisseur du mur

  // Dormant : 4 baguettes (haut, bas, gauche, droite)
  // Haut
  const topFrame = box(w, frameW, frameD, aluMat, id);
  topFrame.position.set(0, 0, h / 2 - frameW / 2);
  group.add(topFrame);

  // Bas
  const botFrame = box(w, frameW, frameD, aluMat, id);
  botFrame.position.set(0, 0, -h / 2 + frameW / 2);
  group.add(botFrame);

  // Gauche
  const leftFrame = box(frameW, frameD, h - 2 * frameW, aluMat, id);
  leftFrame.position.set(-w / 2 + frameW / 2, 0, 0);
  group.add(leftFrame);

  // Droite
  const rightFrame = box(frameW, frameD, h - 2 * frameW, aluMat, id);
  rightFrame.position.set(w / 2 - frameW / 2, 0, 0);
  group.add(rightFrame);

  // Meneau vertical si fenêtre large
  if (w >= 700) {
    const transom = box(frameW, frameD, h - 2 * frameW, aluMat, id);
    transom.position.set(0, 0, 0);
    group.add(transom);
  }

  // Traverse horizontale si fenêtre haute
  if (h >= 1200) {
    const crossbar = box(w - 2 * frameW, frameD, frameW, aluMat, id);
    crossbar.position.set(0, 0, h / 4);
    group.add(crossbar);
  }

  // Vitrage (légèrement en retrait du plan du dormant)
  const glazW = w - 2 * frameW - 10;
  const glazH = h - 2 * frameW - 10;
  if (glazW > 0 && glazH > 0) {
    const panes = w >= 700 ? 2 : 1;
    for (let p = 0; p < panes; p++) {
      const paneW = glazW / panes - (panes > 1 ? frameW / 2 : 0);
      const offsetX = panes > 1 ? (p === 0 ? -glazW / 4 : glazW / 4) : 0;
      const pane = box(paneW, 8, glazH, glazMat, id);
      pane.position.set(offsetX, 0, 0);
      group.add(pane);
    }
  }

  // Appui de fenêtre extérieur (seuil de calcaire en saillie)
  const sill = box(w + 100, 60, 30, new THREE.MeshStandardMaterial({
    color: 0xe0ddd8, roughness: 0.9, metalness: 0, side: THREE.FrontSide,
  }), id);
  sill.position.set(0, th / 2 + 20, -h / 2 - 15);
  group.add(sill);

  placeGroup(group, wall, opening, wallType, elevation);
  return group;
}

// ============================================================================
// Porte parametrique
// ============================================================================

export function createDoorGroup(
  opening: OpeningGeometryParams,
  wall: WallGeometryParams,
  wallType: WallTypeGeometryParams,
  elevation: number = 0,
): THREE.Group {
  const id = opening.id;
  const w = opening.width;
  const h = opening.height;
  const th = wallType.thickness;

  const group = new THREE.Group();
  group.name = `door-${id}`;
  group.userData.elementId = id;

  const woodMat = woodMaterial();
  const aluMat = aluFrameMaterial();
  const chrMat = chromeMaterial();

  const frameW = 60;   // épaisseur huisserie mm
  const panelInset = 15; // vantail légèrement en retrait

  // Huisserie périphérique
  // Montants gauche/droit
  const leftJamb = box(frameW, th, h, aluMat, id);
  leftJamb.position.set(-w / 2 + frameW / 2, 0, 0);
  group.add(leftJamb);

  const rightJamb = box(frameW, th, h, aluMat, id);
  rightJamb.position.set(w / 2 - frameW / 2, 0, 0);
  group.add(rightJamb);

  // Linteau
  const linteau = box(w, th, frameW, aluMat, id);
  linteau.position.set(0, 0, h / 2 - frameW / 2);
  group.add(linteau);

  // Vantail en bois (légèrement en retrait)
  const vantailW = w - 2 * frameW - 5;
  const vantailH = h - frameW - 5;
  if (vantailW > 0 && vantailH > 0) {
    const vantail = box(vantailW, th - panelInset * 2, vantailH, woodMat, id);
    vantail.position.set(0, 0, -frameW / 2);
    group.add(vantail);

    // Panneau de décor en relief
    const panelW = vantailW * 0.6;
    const panelH = vantailH * 0.4;
    const panelTop = box(panelW, 12, panelH, woodMat, id);
    panelTop.position.set(0, (th - panelInset * 2) / 2 + 6, vantailH * 0.15);
    vantail.add(panelTop);

    const panelBot = box(panelW, 12, panelH, woodMat, id);
    panelBot.position.set(0, (th - panelInset * 2) / 2 + 6, -vantailH * 0.2);
    vantail.add(panelBot);

    // Béquille chromée a +1050 mm du sol
    const handleZ = 1050 - h / 2 + frameW / 2;
    const handleX = vantailW / 2 - 60;

    // Corps béquille
    const handleBody = cylinder(8, 8, 120, chrMat, id, 8);
    handleBody.rotation.x = Math.PI / 2;
    handleBody.position.set(handleX, (th - panelInset * 2) / 2 + 20, handleZ);
    vantail.add(handleBody);

    // Rosace
    const rosace = cylinder(18, 18, 8, chrMat, id, 12);
    rosace.rotation.x = Math.PI / 2;
    rosace.position.set(handleX, (th - panelInset * 2) / 2 + 10, handleZ);
    vantail.add(rosace);
  }

  placeGroup(group, wall, opening, wallType, elevation);
  return group;
}
