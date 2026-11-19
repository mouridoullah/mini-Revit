/**
 * @mini-bim/view-3d/mesh-generator/mep
 *
 * Générateur de maillage 3D pour les entités du génie technique du bâtiment (MEP) :
 * Tuyauteries, gaines aérauliques, chemins de câbles, raccords et équipements.
 *
 * Conforme à l'ADR-009, l'ADR-017 (Backface Culling) et aux spécifications buildingSMART IFC4.
 */

import { type RawMeshData } from '@mini-bim/geometry';
import type {
  PipeGeometryParams,
  DuctGeometryParams,
  CableTrayGeometryParams,
  MepFittingGeometryParams,
  MepEquipmentGeometryParams,
} from './types.js';

// ============================================================================
// Couleurs Normalisées par Domaine et Système MEP
// ============================================================================

export const MEP_SYSTEM_COLORS: Record<string, string> = {
  // Plomberie sanitaire
  domestic_cold_water: '#2563eb', // Bleu cobalt (EF)
  domestic_hot_water: '#dc2626', // Rouge vif (ECS)
  drainage_waste: '#78716c', // Gris chaud (EU)
  drainage_soil: '#44403c', // Brun sombre (EV)
  // Génie climatique / Ventilation
  supply_air: '#0284c7', // Cyan azur
  return_air: '#ea580c', // Orange vif
  exhaust_air: '#65a30d', // Vert chartreuse
  // Chauffage / Hydronique
  hydronic_supply: '#0891b2', // Turquoise soutenu
  hydronic_return: '#be185d', // Rose carmin
  // Électricité / Courants faibles
  power: '#f59e0b', // Ambre soutenu
  telecom: '#8b5cf6', // Violet
};

export const MEP_DOMAIN_FALLBACK_COLORS: Record<string, string> = {
  plumbing: '#2563eb',
  hvac: '#0284c7',
  hydronic: '#0891b2',
  electrical: '#f59e0b',
};

export const DEFAULT_MEP_COLOR = '#64748b';

export function getMepSystemColor(systemType?: string, domain?: string): string {
  if (systemType && MEP_SYSTEM_COLORS[systemType]) {
    return MEP_SYSTEM_COLORS[systemType];
  }
  if (domain && MEP_DOMAIN_FALLBACK_COLORS[domain]) {
    return MEP_DOMAIN_FALLBACK_COLORS[domain];
  }
  return DEFAULT_MEP_COLOR;
}

// ============================================================================
// Algèbre Linéaire 3D Locale
// ============================================================================

interface Vec3D {
  x: number;
  y: number;
  z: number;
}

function v3(x: number, y: number, z: number): Vec3D {
  return { x, y, z };
}

function add(a: Vec3D, b: Vec3D): Vec3D {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub(a: Vec3D, b: Vec3D): Vec3D {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(v: Vec3D, s: number): Vec3D {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function cross(a: Vec3D, b: Vec3D): Vec3D {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function len(v: Vec3D): number {
  return Math.hypot(v.x, v.y, v.z);
}

function normalize(v: Vec3D): Vec3D {
  const l = len(v);
  if (l < 1e-7) return { x: 0, y: 0, z: 1 };
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

/**
 * Construit une base orthonormée (u, v, axis) où axis est le vecteur directeur normalisé.
 */
function computeOrthonormalBasis(axis: Vec3D): { u: Vec3D; v: Vec3D } {
  const ref = Math.abs(axis.z) > 0.9 ? v3(0, 1, 0) : v3(0, 0, 1);
  const u = normalize(cross(axis, ref));
  const v = cross(axis, u);
  return { u, v };
}

// ============================================================================
// Constructeur Dynamique de RawMeshData
// ============================================================================

class RawMeshAccumulator {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly indices: number[] = [];
  private minX = Infinity;
  private minY = Infinity;
  private minZ = Infinity;
  private maxX = -Infinity;
  private maxY = -Infinity;
  private maxZ = -Infinity;

  public addVertex(p: Vec3D, n: Vec3D): number {
    this.positions.push(p.x, p.y, p.z);
    this.normals.push(n.x, n.y, n.z);
    if (p.x < this.minX) this.minX = p.x;
    if (p.x > this.maxX) this.maxX = p.x;
    if (p.y < this.minY) this.minY = p.y;
    if (p.y > this.maxY) this.maxY = p.y;
    if (p.z < this.minZ) this.minZ = p.z;
    if (p.z > this.maxZ) this.maxZ = p.z;
    return this.positions.length / 3 - 1;
  }

  public addTriangle(i0: number, i1: number, i2: number): void {
    this.indices.push(i0, i1, i2);
  }

  public addQuad(i0: number, i1: number, i2: number, i3: number): void {
    this.indices.push(i0, i1, i2, i0, i2, i3);
  }

  public addCylinder(
    p1: Vec3D,
    p2: Vec3D,
    radius: number,
    segments = 16,
    caps = true,
  ): void {
    const dir = sub(p2, p1);
    const l = len(dir);
    if (l < 1e-4 || radius <= 0) return;

    const axis = normalize(dir);
    const { u, v } = computeOrthonormalBasis(axis);

    // Sommets de la paroi latérale (dupliqués pour les normales lisses)
    const baseIndices: number[] = [];
    const topIndices: number[] = [];

    for (let i = 0; i < segments; i++) {
      const angle = (2 * Math.PI * i) / segments;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const rad = add(scale(u, cos), scale(v, sin));

      const vBase = add(p1, scale(rad, radius));
      const vTop = add(p2, scale(rad, radius));

      baseIndices.push(this.addVertex(vBase, rad));
      topIndices.push(this.addVertex(vTop, rad));
    }

    // Triangles de la paroi latérale
    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      const b0 = baseIndices[i] ?? 0;
      const b1 = baseIndices[next] ?? 0;
      const t0 = topIndices[i] ?? 0;
      const t1 = topIndices[next] ?? 0;

      this.addTriangle(b0, b1, t0);
      this.addTriangle(t0, b1, t1);
    }

    // Embouts circulaires de fermeture
    if (caps) {
      const nBottom = scale(axis, -1);
      const nTop = axis;

      const cBottom = this.addVertex(p1, nBottom);
      const cTop = this.addVertex(p2, nTop);

      const capBaseIndices: number[] = [];
      const capTopIndices: number[] = [];

      for (let i = 0; i < segments; i++) {
        const angle = (2 * Math.PI * i) / segments;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const rad = add(scale(u, cos), scale(v, sin));

        capBaseIndices.push(this.addVertex(add(p1, scale(rad, radius)), nBottom));
        capTopIndices.push(this.addVertex(add(p2, scale(rad, radius)), nTop));
      }

      for (let i = 0; i < segments; i++) {
        const next = (i + 1) % segments;
        // Face inférieure (normale vers l'arrière)
        this.addTriangle(cBottom, capBaseIndices[next] ?? 0, capBaseIndices[i] ?? 0);
        // Face supérieure (normale vers l'avant)
        this.addTriangle(cTop, capTopIndices[i] ?? 0, capTopIndices[next] ?? 0);
      }
    }
  }

  public addBoxAlongAxis(
    p1: Vec3D,
    p2: Vec3D,
    width: number,
    height: number,
    caps = true,
  ): void {
    const dir = sub(p2, p1);
    const l = len(dir);
    if (l < 1e-4 || width <= 0 || height <= 0) return;

    const axis = normalize(dir);
    // Alignement architectural : u dans le plan horizontal XY si possible
    let u: Vec3D;
    let v: Vec3D;
    if (Math.abs(axis.z) > 0.99) {
      u = v3(1, 0, 0);
      v = v3(0, 1, 0);
    } else {
      u = normalize(cross(axis, v3(0, 0, 1)));
      v = cross(axis, u);
    }

    const halfW = width / 2;
    const halfH = height / 2;

    const getCorner = (origin: Vec3D, su: number, sv: number): Vec3D => {
      return add(origin, add(scale(u, su * halfW), scale(v, sv * halfH)));
    };

    // 4 faces latérales (face par face pour normales plates rigoureuses)
    const sides: {
      du: number;
      dv: number;
      n: Vec3D;
      p1a: Vec3D;
      p1b: Vec3D;
      p2b: Vec3D;
      p2a: Vec3D;
    }[] = [
      // Face +U
      {
        du: 1,
        dv: 0,
        n: u,
        p1a: getCorner(p1, 1, -1),
        p1b: getCorner(p1, 1, 1),
        p2b: getCorner(p2, 1, 1),
        p2a: getCorner(p2, 1, -1),
      },
      // Face +V
      {
        du: 0,
        dv: 1,
        n: v,
        p1a: getCorner(p1, 1, 1),
        p1b: getCorner(p1, -1, 1),
        p2b: getCorner(p2, -1, 1),
        p2a: getCorner(p2, 1, 1),
      },
      // Face -U
      {
        du: -1,
        dv: 0,
        n: scale(u, -1),
        p1a: getCorner(p1, -1, 1),
        p1b: getCorner(p1, -1, -1),
        p2b: getCorner(p2, -1, -1),
        p2a: getCorner(p2, -1, 1),
      },
      // Face -V
      {
        du: 0,
        dv: -1,
        n: scale(v, -1),
        p1a: getCorner(p1, -1, -1),
        p1b: getCorner(p1, 1, -1),
        p2b: getCorner(p2, 1, -1),
        p2a: getCorner(p2, -1, -1),
      },
    ];

    for (const s of sides) {
      const i0 = this.addVertex(s.p1a, s.n);
      const i1 = this.addVertex(s.p1b, s.n);
      const i2 = this.addVertex(s.p2b, s.n);
      const i3 = this.addVertex(s.p2a, s.n);
      this.addQuad(i0, i1, i2, i3);
    }

    if (caps) {
      // Embout P1 (normale -axis)
      const n1 = scale(axis, -1);
      const c10 = this.addVertex(getCorner(p1, -1, -1), n1);
      const c11 = this.addVertex(getCorner(p1, -1, 1), n1);
      const c12 = this.addVertex(getCorner(p1, 1, 1), n1);
      const c13 = this.addVertex(getCorner(p1, 1, -1), n1);
      this.addQuad(c10, c11, c12, c13);

      // Embout P2 (normale +axis)
      const n2 = axis;
      const c20 = this.addVertex(getCorner(p2, -1, -1), n2);
      const c21 = this.addVertex(getCorner(p2, 1, -1), n2);
      const c22 = this.addVertex(getCorner(p2, 1, 1), n2);
      const c23 = this.addVertex(getCorner(p2, -1, 1), n2);
      this.addQuad(c20, c21, c22, c23);
    }
  }

  public addTruncatedCone(
    p1: Vec3D,
    p2: Vec3D,
    r1: number,
    r2: number,
    segments = 16,
  ): void {
    const dir = sub(p2, p1);
    const l = len(dir);
    if (l < 1e-4) return;

    const axis = normalize(dir);
    const { u, v } = computeOrthonormalBasis(axis);

    const baseIndices: number[] = [];
    const topIndices: number[] = [];

    // Pente du cône pour les normales
    const dr = r1 - r2;
    const slantNormalFactor = Math.hypot(l, dr);
    const nz = dr / slantNormalFactor;
    const nrad = l / slantNormalFactor;

    for (let i = 0; i < segments; i++) {
      const angle = (2 * Math.PI * i) / segments;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const rad = add(scale(u, cos), scale(v, sin));

      const norm = add(scale(rad, nrad), scale(axis, nz));

      const vBase = add(p1, scale(rad, r1));
      const vTop = add(p2, scale(rad, r2));

      baseIndices.push(this.addVertex(vBase, norm));
      topIndices.push(this.addVertex(vTop, norm));
    }

    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      const b0 = baseIndices[i] ?? 0;
      const b1 = baseIndices[next] ?? 0;
      const t0 = topIndices[i] ?? 0;
      const t1 = topIndices[next] ?? 0;

      this.addTriangle(b0, b1, t0);
      this.addTriangle(t0, b1, t1);
    }
  }

  public toRawMeshData(
    elementId: string,
    userData?: Record<string, unknown>,
  ): RawMeshData {
    const safeMinX = this.minX === Infinity ? 0 : this.minX;
    const safeMinY = this.minY === Infinity ? 0 : this.minY;
    const safeMinZ = this.minZ === Infinity ? 0 : this.minZ;
    const safeMaxX = this.maxX === -Infinity ? 0 : this.maxX;
    const safeMaxY = this.maxY === -Infinity ? 0 : this.maxY;
    const safeMaxZ = this.maxZ === -Infinity ? 0 : this.maxZ;

    return {
      positions: new Float32Array(this.positions),
      normals: new Float32Array(this.normals),
      indices: new Uint32Array(this.indices),
      elementId,
      role: 'full',
      boundingBox: {
        min: { x: safeMinX, y: safeMinY, z: safeMinZ },
        max: { x: safeMaxX, y: safeMaxY, z: safeMaxZ },
      },
      userData,
    };
  }
}

// ============================================================================
// 1. Génération Géométrique 3D de Tuyauterie (Pipe)
// ============================================================================

export function generatePipeMesh(pipe: PipeGeometryParams): RawMeshData {
  const acc = new RawMeshAccumulator();
  const radius = Math.max(1, pipe.diameter / 2);
  const p1 = v3(pipe.start.x, pipe.start.y, pipe.start.z);
  const p2 = v3(pipe.end.x, pipe.end.y, pipe.end.z);

  acc.addCylinder(p1, p2, radius, 16, true);

  const color = pipe.color ?? getMepSystemColor(pipe.systemType, pipe.domain);

  return acc.toRawMeshData(pipe.id, {
    elementId: pipe.id,
    category: 'pipe',
    levelId: pipe.levelId,
    systemId: pipe.systemId,
    systemType: pipe.systemType,
    domain: pipe.domain,
    color,
  });
}

// ============================================================================
// 2. Génération Géométrique 3D de Gaine (Duct)
// ============================================================================

export function generateDuctMesh(duct: DuctGeometryParams): RawMeshData {
  const acc = new RawMeshAccumulator();
  const p1 = v3(duct.start.x, duct.start.y, duct.start.z);
  const p2 = v3(duct.end.x, duct.end.y, duct.end.z);

  if (duct.shape === 'round') {
    const radius = Math.max(1, (duct.diameter ?? 200) / 2);
    acc.addCylinder(p1, p2, radius, 16, true);
  } else {
    const width = Math.max(1, duct.width ?? 300);
    const height = Math.max(1, duct.height ?? 200);
    acc.addBoxAlongAxis(p1, p2, width, height, true);
  }

  const color = duct.color ?? getMepSystemColor(duct.systemType, duct.domain);

  return acc.toRawMeshData(duct.id, {
    elementId: duct.id,
    category: 'duct',
    shape: duct.shape,
    levelId: duct.levelId,
    systemId: duct.systemId,
    systemType: duct.systemType,
    domain: duct.domain,
    color,
  });
}

// ============================================================================
// 3. Génération Géométrique 3D de Chemin de Câbles (CableTray)
// ============================================================================

export function generateCableTrayMesh(tray: CableTrayGeometryParams): RawMeshData {
  const acc = new RawMeshAccumulator();
  const p1 = v3(tray.start.x, tray.start.y, tray.start.z);
  const p2 = v3(tray.end.x, tray.end.y, tray.end.z);
  const dir = sub(p2, p1);
  const l = len(dir);

  if (l > 1e-4) {
    const axis = normalize(dir);
    let u: Vec3D;
    let v: Vec3D;
    if (Math.abs(axis.z) > 0.99) {
      u = v3(1, 0, 0);
      v = v3(0, 1, 0);
    } else {
      u = normalize(cross(axis, v3(0, 0, 1)));
      v = cross(axis, u);
    }

    const width = Math.max(20, tray.width);
    const height = Math.max(10, tray.height);
    const wallThick = 4; // Épaisseur de paroi métallique du profilé en U

    // 1. Semelle de fondation (fond horizontal du U)
    const baseCenter1 = add(p1, scale(v, wallThick / 2));
    const baseCenter2 = add(p2, scale(v, wallThick / 2));
    acc.addBoxAlongAxis(baseCenter1, baseCenter2, width, wallThick, true);

    // 2. Aile gauche (flange verticale)
    const leftOffset = scale(u, -width / 2 + wallThick / 2);
    const leftP1 = add(add(p1, leftOffset), scale(v, height / 2));
    const leftP2 = add(add(p2, leftOffset), scale(v, height / 2));
    acc.addBoxAlongAxis(leftP1, leftP2, wallThick, height, true);

    // 3. Aile droite (flange verticale)
    const rightOffset = scale(u, width / 2 - wallThick / 2);
    const rightP1 = add(add(p1, rightOffset), scale(v, height / 2));
    const rightP2 = add(add(p2, rightOffset), scale(v, height / 2));
    acc.addBoxAlongAxis(rightP1, rightP2, wallThick, height, true);

    // 4. Barreaux transversaux (échelons de l'échelle à câbles tous les 300 mm)
    const rungSpacing = 300;
    const numRungs = Math.max(1, Math.floor(l / rungSpacing));
    const rungStep = l / (numRungs + 1);

    for (let i = 1; i <= numRungs; i++) {
      const dist = i * rungStep;
      const rungCenter = add(p1, scale(axis, dist));
      const rungP1 = add(add(rungCenter, scale(u, -width / 2 + wallThick)), scale(v, wallThick + 3));
      const rungP2 = add(add(rungCenter, scale(u, width / 2 - wallThick)), scale(v, wallThick + 3));
      acc.addBoxAlongAxis(rungP1, rungP2, 8, 8, true);
    }
  }

  const color = tray.color ?? MEP_SYSTEM_COLORS['power'] ?? '#f59e0b';

  return acc.toRawMeshData(tray.id, {
    elementId: tray.id,
    category: 'cableTray',
    levelId: tray.levelId,
    systemId: tray.systemId,
    color,
  });
}

// ============================================================================
// 4. Génération Géométrique 3D de Raccord (MepFitting)
// ============================================================================

export function generateFittingMesh(fitting: MepFittingGeometryParams): RawMeshData {
  const acc = new RawMeshAccumulator();
  const center = v3(fitting.position.x, fitting.position.y, fitting.position.z);
  const ports = fitting.ports;

  const color =
    fitting.color ?? getMepSystemColor(fitting.systemType, fitting.domain);

  switch (fitting.fittingType) {
    case 'elbow': {
      // Coude : mitered bend raccordant les 2 ports au centre
      const port0 = ports[0];
      const port1 = ports[1];
      if (port0 && port1) {
        const p0 = v3(port0.position.x, port0.position.y, port0.position.z);
        const p1 = v3(port1.position.x, port1.position.y, port1.position.z);
        const r0 = Math.max(1, (port0.diameter ?? 32) / 2);
        const r1 = Math.max(1, (port1.diameter ?? 32) / 2);

        acc.addCylinder(p0, center, r0, 16, true);
        acc.addCylinder(center, p1, r1, 16, true);
      } else {
        // Fallback sphéroïde ou cylindre court
        acc.addCylinder(
          sub(center, v3(0, 0, 20)),
          add(center, v3(0, 0, 20)),
          20,
          16,
          true,
        );
      }
      break;
    }

    case 'tee': {
      // Té : tuyau droit entre port 0 et port 1 + branche vers port 2
      const port0 = ports[0];
      const port1 = ports[1];
      const port2 = ports[2];
      if (port0 && port1 && port2) {
        const p0 = v3(port0.position.x, port0.position.y, port0.position.z);
        const p1 = v3(port1.position.x, port1.position.y, port1.position.z);
        const p2 = v3(port2.position.x, port2.position.y, port2.position.z);
        const rMain = Math.max(1, (port0.diameter ?? 32) / 2);
        const rBranch = Math.max(1, (port2.diameter ?? 32) / 2);

        acc.addCylinder(p0, p1, rMain, 16, true);
        acc.addCylinder(center, p2, rBranch, 16, true);
      } else {
        acc.addCylinder(
          sub(center, v3(30, 0, 0)),
          add(center, v3(30, 0, 0)),
          20,
          16,
          true,
        );
      }
      break;
    }

    case 'cross': {
      // Croix : axe principal (port 0 -> 1) + 2 branches (center -> 2, center -> 3)
      const port0 = ports[0];
      const port1 = ports[1];
      const port2 = ports[2];
      const port3 = ports[3];
      if (port0 && port1 && port2 && port3) {
        const p0 = v3(port0.position.x, port0.position.y, port0.position.z);
        const p1 = v3(port1.position.x, port1.position.y, port1.position.z);
        const p2 = v3(port2.position.x, port2.position.y, port2.position.z);
        const p3 = v3(port3.position.x, port3.position.y, port3.position.z);
        const r0 = Math.max(1, (port0.diameter ?? 32) / 2);
        const r2 = Math.max(1, (port2.diameter ?? 32) / 2);

        acc.addCylinder(p0, p1, r0, 16, true);
        acc.addCylinder(center, p2, r2, 16, true);
        acc.addCylinder(center, p3, r2, 16, true);
      } else {
        acc.addCylinder(
          sub(center, v3(30, 0, 0)),
          add(center, v3(30, 0, 0)),
          20,
          16,
          true,
        );
      }
      break;
    }

    case 'transition': {
      // Réduction : cône tronqué entre port 0 et port 1
      const port0 = ports[0];
      const port1 = ports[1];
      if (port0 && port1) {
        const p0 = v3(port0.position.x, port0.position.y, port0.position.z);
        const p1 = v3(port1.position.x, port1.position.y, port1.position.z);
        const r0 = Math.max(1, (port0.diameter ?? 40) / 2);
        const r1 = Math.max(1, (port1.diameter ?? 25) / 2);

        acc.addTruncatedCone(p0, p1, r0, r1, 16);
      } else {
        acc.addCylinder(
          sub(center, v3(0, 0, 20)),
          add(center, v3(0, 0, 20)),
          20,
          16,
          true,
        );
      }
      break;
    }

    case 'cap': {
      // Bouchon : disque / chapeau court à l'extrémité du port
      const port0 = ports[0];
      if (port0) {
        const p0 = v3(port0.position.x, port0.position.y, port0.position.z);
        const dir = v3(port0.direction.x, port0.direction.y, port0.direction.z);
        const normal = normalize(dir);
        const r0 = Math.max(1, (port0.diameter ?? 32) / 2);
        const capThickness = 20;
        const pEnd = add(p0, scale(normal, capThickness));

        acc.addCylinder(p0, pEnd, r0 * 1.05, 16, true);
      } else {
        acc.addCylinder(
          sub(center, v3(0, 0, 10)),
          add(center, v3(0, 0, 10)),
          20,
          16,
          true,
        );
      }
      break;
    }
  }

  return acc.toRawMeshData(fitting.id, {
    elementId: fitting.id,
    category: 'mepFitting',
    fittingType: fitting.fittingType,
    levelId: fitting.levelId,
    systemId: fitting.systemId,
    systemType: fitting.systemType,
    domain: fitting.domain,
    color,
  });
}

// ============================================================================
// 5. Génération Géométrique 3D d'Équipement (MepEquipment)
// ============================================================================

export function generateEquipmentMesh(eq: MepEquipmentGeometryParams): RawMeshData {
  const acc = new RawMeshAccumulator();
  const center = v3(eq.position.x, eq.position.y, eq.position.z);
  const rot = eq.rotation ?? 0;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);

  const u = v3(cos, sin, 0); // Axe local X tourné
  const v = v3(-sin, cos, 0); // Axe local Y tourné
  const w = v3(0, 0, 1); // Axe vertical Z

  const halfW = Math.max(10, eq.width) / 2;
  const halfD = Math.max(10, eq.depth) / 2;
  const height = Math.max(10, eq.height);

  const getPt = (su: number, sv: number, zRel: number): Vec3D => {
    return add(
      center,
      add(scale(u, su * halfW), add(scale(v, sv * halfD), scale(w, zRel))),
    );
  };

  // 6 faces de la boîte d'enveloppe de l'équipement
  // 1. Face bas (Z = 0)
  {
    const n = scale(w, -1);
    const c0 = acc.addVertex(getPt(-1, -1, 0), n);
    const c1 = acc.addVertex(getPt(1, -1, 0), n);
    const c2 = acc.addVertex(getPt(1, 1, 0), n);
    const c3 = acc.addVertex(getPt(-1, 1, 0), n);
    acc.addQuad(c0, c1, c2, c3);
  }
  // 2. Face haut (Z = height)
  {
    const n = w;
    const c0 = acc.addVertex(getPt(-1, -1, height), n);
    const c1 = acc.addVertex(getPt(-1, 1, height), n);
    const c2 = acc.addVertex(getPt(1, 1, height), n);
    const c3 = acc.addVertex(getPt(1, -1, height), n);
    acc.addQuad(c0, c1, c2, c3);
  }
  // 3. Face avant (-V)
  {
    const n = scale(v, -1);
    const c0 = acc.addVertex(getPt(-1, -1, 0), n);
    const c1 = acc.addVertex(getPt(-1, -1, height), n);
    const c2 = acc.addVertex(getPt(1, -1, height), n);
    const c3 = acc.addVertex(getPt(1, -1, 0), n);
    acc.addQuad(c0, c1, c2, c3);
  }
  // 4. Face arrière (+V)
  {
    const n = v;
    const c0 = acc.addVertex(getPt(1, 1, 0), n);
    const c1 = acc.addVertex(getPt(1, 1, height), n);
    const c2 = acc.addVertex(getPt(-1, 1, height), n);
    const c3 = acc.addVertex(getPt(-1, 1, 0), n);
    acc.addQuad(c0, c1, c2, c3);
  }
  // 5. Face droite (+U)
  {
    const n = u;
    const c0 = acc.addVertex(getPt(1, -1, 0), n);
    const c1 = acc.addVertex(getPt(1, -1, height), n);
    const c2 = acc.addVertex(getPt(1, 1, height), n);
    const c3 = acc.addVertex(getPt(1, 1, 0), n);
    acc.addQuad(c0, c1, c2, c3);
  }
  // 6. Face gauche (-U)
  {
    const n = scale(u, -1);
    const c0 = acc.addVertex(getPt(-1, 1, 0), n);
    const c1 = acc.addVertex(getPt(-1, 1, height), n);
    const c2 = acc.addVertex(getPt(-1, -1, height), n);
    const c3 = acc.addVertex(getPt(-1, -1, 0), n);
    acc.addQuad(c0, c1, c2, c3);
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

// ============================================================================
// 6. Génération par Lot (Batch Mep Mesh Generator)
// ============================================================================

export interface MepStateForMesh {
  readonly pipes?: Record<string, PipeGeometryParams> | undefined;
  readonly ducts?: Record<string, DuctGeometryParams> | undefined;
  readonly cableTrays?: Record<string, CableTrayGeometryParams> | undefined;
  readonly mepFittings?: Record<string, MepFittingGeometryParams> | undefined;
  readonly mepEquipments?: Record<string, MepEquipmentGeometryParams> | undefined;
}

export function generateMepMeshes(state: MepStateForMesh): RawMeshData[] {
  const result: RawMeshData[] = [];

  if (state.pipes) {
    for (const pipe of Object.values(state.pipes)) {
      result.push(generatePipeMesh(pipe));
    }
  }

  if (state.ducts) {
    for (const duct of Object.values(state.ducts)) {
      result.push(generateDuctMesh(duct));
    }
  }

  if (state.cableTrays) {
    for (const tray of Object.values(state.cableTrays)) {
      result.push(generateCableTrayMesh(tray));
    }
  }

  if (state.mepFittings) {
    for (const fitting of Object.values(state.mepFittings)) {
      result.push(generateFittingMesh(fitting));
    }
  }

  if (state.mepEquipments) {
    for (const eq of Object.values(state.mepEquipments)) {
      result.push(generateEquipmentMesh(eq));
    }
  }

  return result;
}
