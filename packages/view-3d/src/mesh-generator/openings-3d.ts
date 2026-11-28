/**
 * openings-3d — Menuiseries architecturales paramétriques LOD 350 (portes & fenêtres hébergées)
 *
 * Génère des assemblages multi-matériaux haute fidélité (createWindowAssembly / createDoorAssembly)
 * alignés visuellement sur components/glazing.ts :
 * - Chambranles chanfreinés double face avec joint d'ombre de 3 mm
 * - Appui de fenêtre extérieur avec larmier / goutte d'eau
 * - Crémone / poignée sur fenêtres et béquille + rosace bilatérale sur portes
 * - Quincaillerie répétitive (béquilles, charnières) mutualisée via GPU InstancedMesh
 *
 * Conserve également createWindowGroup / createDoorGroup (THREE.Group) pour rétrocompatibilité.
 */

import * as THREE from 'three';
import type { OpeningGeometryParams, WallGeometryParams, WallTypeGeometryParams } from './types.js';
import type {
  ComponentAssembly3D,
  ComponentAssemblyPart,
  ComponentInstanceAnchor,
  ComponentMaterialRole,
} from '../components/types.js';
import { ArchitecturalMeshAccumulator, v3, type Vec3D } from '../components/architectural-primitives.js';
import { getArchitecturalPrototypeMesh } from '../components/architectural-prototypes.js';
import { composeMatrix4 } from './shared/primitives.js';
import { MeshAdapter } from '../MeshAdapter.js';

interface OpeningFrame {
  readonly cx: number;
  readonly cy: number;
  readonly cz: number;
  readonly u: Vec3D;
  readonly n: Vec3D;
  readonly w: Vec3D;
}

function computeOpeningFrame(
  opening: OpeningGeometryParams,
  wall: WallGeometryParams,
  elevation: number,
): OpeningFrame | null {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const wallLen = Math.hypot(dx, dy);
  if (wallLen < 1e-4) return null;

  const ux = dx / wallLen;
  const uy = dy / wallLen;
  const uCenter = opening.offsetAlong + opening.width / 2;
  const sill = opening.sillHeight ?? 0;

  return {
    cx: wall.start.x + ux * uCenter,
    cy: wall.start.y + uy * uCenter,
    cz: elevation + sill + opening.height / 2,
    u: { x: ux, y: uy, z: 0 },
    n: { x: -uy, y: ux, z: 0 },
    w: { x: 0, y: 0, z: 1 },
  };
}

function toWorld(frame: OpeningFrame, lx: number, ly: number, lz: number): Vec3D {
  return {
    x: frame.cx + frame.u.x * lx + frame.n.x * ly,
    y: frame.cy + frame.u.y * lx + frame.n.y * ly,
    z: frame.cz + lz,
  };
}

/**
 * Ajoute des chambranles périphériques chanfreinés double face avec joint d'ombre de 3 mm.
 */
function addDoubleSidedCasings(
  acc: ArchitecturalMeshAccumulator,
  frame: OpeningFrame,
  w: number,
  h: number,
  th: number,
  casingW: number,
  casingProj: number,
  withBottomSill: boolean,
): void {
  const shadowGap = 3;
  const innerHalfW = w / 2 + shadowGap;
  const topZ = h / 2 + shadowGap + casingW / 2;
  const botZ = -h / 2 - shadowGap - casingW / 2;
  const spanX = w + 2 * (shadowGap + casingW);
  const jambH = withBottomSill ? h + 2 * shadowGap : h + shadowGap;
  const jambCenterZ = withBottomSill ? 0 : shadowGap / 2;

  for (const faceSign of [-1, 1]) {
    const faceY = faceSign * (th / 2 + casingProj / 2);
    // Montants gauche / droit
    acc.addBeveledBox(
      toWorld(frame, -innerHalfW - casingW / 2, faceY, jambCenterZ),
      v3(casingW, casingProj, jambH),
      2,
      frame.u,
      frame.n,
      frame.w,
    );
    acc.addBeveledBox(
      toWorld(frame, innerHalfW + casingW / 2, faceY, jambCenterZ),
      v3(casingW, casingProj, jambH),
      2,
      frame.u,
      frame.n,
      frame.w,
    );
    // Traverse haute
    acc.addBeveledBox(
      toWorld(frame, 0, faceY, topZ),
      v3(spanX, casingProj, casingW),
      2,
      frame.u,
      frame.n,
      frame.w,
    );
    // Traverse basse (fenêtre uniquement)
    if (withBottomSill) {
      acc.addBeveledBox(
        toWorld(frame, 0, faceY, botZ),
        v3(spanX, casingProj, casingW),
        2,
        frame.u,
        frame.n,
        frame.w,
      );
    }
  }
}

/**
 * Génère l'assemblage 3D LOD 350 d'une fenêtre hébergée (dormant, chambranles double face,
 * joint d'ombre 3 mm, appui goutte d'eau, vitrage physique et crémone instanciée).
 */
export function createWindowAssembly(
  opening: OpeningGeometryParams,
  wall: WallGeometryParams,
  wallType: WallTypeGeometryParams,
  elevation: number = 0,
): ComponentAssembly3D {
  const id = opening.id;
  const w = opening.width;
  const h = opening.height;
  const th = wallType.thickness;
  const frame = computeOpeningFrame(opening, wall, elevation);
  if (!frame) {
    return { elementId: id, category: 'window', family: 'glazing', subType: 'window', parts: [] };
  }

  const parts: ComponentAssemblyPart[] = [];
  const instances: ComponentInstanceAnchor[] = [];
  const frameW = 50;
  const frameD = Math.max(60, Math.min(th, 110));

  // 1. Dormant aluminium anthracite chanfreiné + meneau/traverse + chambranles double face
  const accAlu = new ArchitecturalMeshAccumulator();
  accAlu.addBeveledBox(toWorld(frame, 0, 0, h / 2 - frameW / 2), v3(w, frameD, frameW), 2, frame.u, frame.n, frame.w);
  accAlu.addBeveledBox(toWorld(frame, 0, 0, -h / 2 + frameW / 2), v3(w, frameD, frameW), 2, frame.u, frame.n, frame.w);
  accAlu.addBeveledBox(toWorld(frame, -w / 2 + frameW / 2, 0, 0), v3(frameW, frameD, h - 2 * frameW), 2, frame.u, frame.n, frame.w);
  accAlu.addBeveledBox(toWorld(frame, w / 2 - frameW / 2, 0, 0), v3(frameW, frameD, h - 2 * frameW), 2, frame.u, frame.n, frame.w);

  if (w >= 700) {
    accAlu.addBeveledBox(toWorld(frame, 0, 0, 0), v3(frameW, frameD, h - 2 * frameW), 2, frame.u, frame.n, frame.w);
  }
  if (h >= 1200) {
    accAlu.addBeveledBox(toWorld(frame, 0, 0, h / 4), v3(w - 2 * frameW, frameD, frameW), 2, frame.u, frame.n, frame.w);
  }

  // Chambranles double face avec joint d'ombre 3 mm
  addDoubleSidedCasings(accAlu, frame, w, h, th, 45, 12, true);
  parts.push({ rawData: accAlu.toRawMeshData(`${id}_alu_frame`), materialRole: 'alu_anthracite' });

  // 2. Appui de fenêtre extérieur avec bavette et goutte d'eau (larmier)
  const accSill = new ArchitecturalMeshAccumulator();
  accSill.addBeveledBox(
    toWorld(frame, 0, th / 2 + 25, -h / 2 - 15),
    v3(w + 110, 70, 28),
    3,
    frame.u,
    frame.n,
    frame.w,
  );
  // Nez goutte d'eau en sous-face avant
  accSill.addBeveledBox(
    toWorld(frame, 0, th / 2 + 52, -h / 2 - 33),
    v3(w + 110, 14, 12),
    2,
    frame.u,
    frame.n,
    frame.w,
  );
  parts.push({ rawData: accSill.toRawMeshData(`${id}_sill`), materialRole: 'concrete_structural' });

  // 3. Vitrage physique haute clarté
  const glazW = w - 2 * frameW - 10;
  const glazH = h - 2 * frameW - 10;
  if (glazW > 0 && glazH > 0) {
    const accGlass = new ArchitecturalMeshAccumulator();
    const panes = w >= 700 ? 2 : 1;
    for (let p = 0; p < panes; p++) {
      const paneW = glazW / panes - (panes > 1 ? frameW / 2 : 0);
      const offsetX = panes > 1 ? (p === 0 ? -glazW / 4 : glazW / 4) : 0;
      accGlass.addBeveledBox(toWorld(frame, offsetX, 0, 0), v3(paneW, 10, glazH), 0, frame.u, frame.n, frame.w);
    }
    parts.push({ rawData: accGlass.toRawMeshData(`${id}_glazing`), materialRole: 'glass_clear' });
  }

  // 4. Crémone / poignée de fenêtre (GPU InstancedMesh) côté intérieur (-n)
  const negU = v3(-frame.u.x, -frame.u.y, 0);
  const negN = v3(-frame.n.x, -frame.n.y, 0);
  const cremoneX = w >= 700 ? -frameW * 0.45 : w / 2 - frameW * 0.7;
  instances.push({
    prototypeKey: 'door_handle',
    // Orientée verticalement vers le bas pour figurer la crémone sur montant
    matrix: composeMatrix4(
      toWorld(frame, cremoneX, -frameD / 2, -h * 0.05),
      frame.w,
      negN,
      frame.u,
      v3(0.85, 0.85, 0.85),
    ),
    materialRole: 'chrome_hardware',
  });
  // Seconde béquille/verrou côté meneau si double ouvrant
  if (w >= 700) {
    instances.push({
      prototypeKey: 'door_handle',
      matrix: composeMatrix4(
        toWorld(frame, frameW * 0.45, -frameD / 2, -h * 0.05),
        frame.w,
        negN,
        negU,
        v3(0.75, 0.75, 0.75),
      ),
      materialRole: 'chrome_hardware',
    });
  }

  return {
    elementId: id,
    category: 'window',
    family: 'glazing',
    subType: 'window',
    parts,
    instances,
  };
}

/**
 * Génère l'assemblage 3D LOD 350 d'une porte hébergée (huisserie alu, chambranles double face
 * avec joint d'ombre 3 mm, vantail bois mouluré double face, 3 charnières et béquille bilatérale GPU).
 */
export function createDoorAssembly(
  opening: OpeningGeometryParams,
  wall: WallGeometryParams,
  wallType: WallTypeGeometryParams,
  elevation: number = 0,
): ComponentAssembly3D {
  const id = opening.id;
  const w = opening.width;
  const h = opening.height;
  const th = wallType.thickness;
  const frame = computeOpeningFrame(opening, wall, elevation);
  if (!frame) {
    return { elementId: id, category: 'door', family: 'glazing', subType: 'door', parts: [] };
  }

  const parts: ComponentAssemblyPart[] = [];
  const instances: ComponentInstanceAnchor[] = [];
  const frameW = 55;
  const panelInset = 18;
  const leafThick = Math.max(40, th - panelInset * 2);

  // 1. Huisserie périphérique alu anthracite + chambranles double face avec joint d'ombre 3 mm
  const accFrame = new ArchitecturalMeshAccumulator();
  accFrame.addBeveledBox(toWorld(frame, -w / 2 + frameW / 2, 0, 0), v3(frameW, th, h), 2, frame.u, frame.n, frame.w);
  accFrame.addBeveledBox(toWorld(frame, w / 2 - frameW / 2, 0, 0), v3(frameW, th, h), 2, frame.u, frame.n, frame.w);
  accFrame.addBeveledBox(toWorld(frame, 0, 0, h / 2 - frameW / 2), v3(w, th, frameW), 2, frame.u, frame.n, frame.w);
  addDoubleSidedCasings(accFrame, frame, w, h, th, 60, 14, false);
  parts.push({ rawData: accFrame.toRawMeshData(`${id}_frame`), materialRole: 'alu_anthracite' });

  // 2. Vantail bois chêne avec panneaux moulurés en relief sur les 2 faces
  const vantailW = w - 2 * frameW - 6; // jeu périmétrique 3 mm
  const vantailH = h - frameW - 6;
  if (vantailW > 0 && vantailH > 0) {
    const accWood = new ArchitecturalMeshAccumulator();
    accWood.addBeveledBox(toWorld(frame, 0, 0, -frameW / 2), v3(vantailW, leafThick, vantailH), 3, frame.u, frame.n, frame.w);

    const panelW = vantailW * 0.62;
    const panelH = vantailH * 0.36;
    for (const sideSign of [-1, 1]) {
      const py = sideSign * (leafThick / 2 + 5);
      accWood.addBeveledBox(toWorld(frame, 0, py, vantailH * 0.16), v3(panelW, 10, panelH), 2, frame.u, frame.n, frame.w);
      accWood.addBeveledBox(toWorld(frame, 0, py, -vantailH * 0.22), v3(panelW, 10, panelH), 2, frame.u, frame.n, frame.w);
    }
    parts.push({ rawData: accWood.toRawMeshData(`${id}_leaf`), materialRole: 'wood_oak' });

    // 3. Béquille + rosace bilatérale (+n et -n) via GPU InstancedMesh
    const handleZ = 1050 - h / 2;
    const handleX = vantailW / 2 - 65;
    const negU = v3(-frame.u.x, -frame.u.y, 0);
    const negN = v3(-frame.n.x, -frame.n.y, 0);

    // Face +n (béquille vers l'intérieur du vantail donc -u : u = frame.u, v = frame.n)
    instances.push({
      prototypeKey: 'door_handle',
      matrix: composeMatrix4(
        toWorld(frame, handleX, leafThick / 2, handleZ),
        frame.u,
        frame.n,
        frame.w,
      ),
      materialRole: 'chrome_hardware',
    });
    // Face -n (tournée 180° autour de W pour pointer -n tout en gardant le levier vers le vantail)
    instances.push({
      prototypeKey: 'door_handle',
      matrix: composeMatrix4(
        toWorld(frame, handleX, -leafThick / 2, handleZ),
        negU,
        negN,
        frame.w,
      ),
      materialRole: 'chrome_hardware',
    });

    // 4. 3 paumelles / charnières côté opposé à la béquille (GPU InstancedMesh)
    const hingeX = -vantailW / 2 + 2;
    for (const zRatio of [-0.38, 0, 0.38]) {
      instances.push({
        prototypeKey: 'door_hinge',
        matrix: composeMatrix4(
          toWorld(frame, hingeX, leafThick / 2 + 2, vantailH * zRatio - frameW / 2),
          frame.u,
          frame.n,
          frame.w,
        ),
        materialRole: 'chrome_hardware',
      });
    }
  }

  return {
    elementId: id,
    category: 'door',
    family: 'glazing',
    subType: 'door',
    parts,
    instances,
  };
}

function createGroupMaterial(role: ComponentMaterialRole): THREE.Material {
  switch (role) {
    case 'glass_clear':
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
    case 'chrome_hardware':
      return new THREE.MeshStandardMaterial({
        color: 0xd4d4d4,
        roughness: 0.08,
        metalness: 0.92,
        side: THREE.FrontSide,
      });
    case 'wood_oak':
      return new THREE.MeshStandardMaterial({
        color: 0x8b5a2b,
        roughness: 0.65,
        metalness: 0.0,
        side: THREE.FrontSide,
      });
    case 'concrete_structural':
      return new THREE.MeshStandardMaterial({
        color: 0xe0ddd8,
        roughness: 0.9,
        metalness: 0.0,
        side: THREE.FrontSide,
      });
    default:
      return new THREE.MeshStandardMaterial({
        color: 0x2d3748,
        roughness: 0.3,
        metalness: 0.8,
        side: THREE.FrontSide,
      });
  }
}

function assemblyToThreeGroup(assembly: ComponentAssembly3D, groupName: string): THREE.Group {
  const group = new THREE.Group();
  group.name = groupName;
  group.userData.elementId = assembly.elementId;

  const matCache = new Map<ComponentMaterialRole, THREE.Material>();
  const getMat = (role: ComponentMaterialRole) => {
    let m = matCache.get(role);
    if (!m) {
      m = createGroupMaterial(role);
      matCache.set(role, m);
    }
    return m;
  };

  for (const part of assembly.parts) {
    const geom = MeshAdapter.fromRawMeshData(part.rawData);
    const mesh = new THREE.Mesh(geom, getMat(part.materialRole));
    mesh.userData.elementId = assembly.elementId;
    mesh.castShadow = part.materialRole !== 'glass_clear';
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  for (const inst of assembly.instances ?? []) {
    const protoRaw = getArchitecturalPrototypeMesh(inst.prototypeKey);
    const geom = MeshAdapter.fromRawMeshData(protoRaw);
    const mesh = new THREE.Mesh(geom, getMat(inst.materialRole));
    mesh.applyMatrix4(new THREE.Matrix4().fromArray(inst.matrix));
    mesh.userData.elementId = assembly.elementId;
    group.add(mesh);
  }

  return group;
}

export function createWindowGroup(
  opening: OpeningGeometryParams,
  wall: WallGeometryParams,
  wallType: WallTypeGeometryParams,
  elevation: number = 0,
): THREE.Group {
  return assemblyToThreeGroup(
    createWindowAssembly(opening, wall, wallType, elevation),
    `window-${opening.id}`,
  );
}

export function createDoorGroup(
  opening: OpeningGeometryParams,
  wall: WallGeometryParams,
  wallType: WallTypeGeometryParams,
  elevation: number = 0,
): THREE.Group {
  return assemblyToThreeGroup(
    createDoorAssembly(opening, wall, wallType, elevation),
    `door-${opening.id}`,
  );
}
