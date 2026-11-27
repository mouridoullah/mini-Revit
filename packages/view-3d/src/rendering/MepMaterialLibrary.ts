/**
 * MepMaterialLibrary
 *
 * Bibliothèque partagée de matériaux PBR procéduraux pour les composants MEP LOD 350 (ADR-050, ADR-072).
 * - Mode 'realiste' : textures procédurales Canvas 2D (galva brossé, cuivre, laiton, PVC mat, RAL 7035)
 * - Modes 'technique' / 'ecorche' : coloration fluide normalisée tout en conservant le relief PBR
 * - Tous les matériaux portent `isSharedMaterial = true` (protégés contre dispose prématuré).
 */

import * as THREE from 'three';
import type { MepMaterialRole } from '../mesh-generator/mep/assembly-types.js';
import type { RenderMode } from './PostProcessingManager.js';

type SharedStandardMaterial = THREE.MeshStandardMaterial & { isSharedMaterial?: boolean };

const TEX_SIZE = 256;

interface RoleMaterialSpec {
  readonly realisticColor: number;
  readonly technicalColor: number;
  readonly metalness: number;
  readonly roughness: number;
  readonly technicalRoughness?: number | undefined;
  readonly textureKind?: 'galva' | 'copper' | 'brass' | 'perforated' | undefined;
}

const ROLE_SPECS: Readonly<Record<MepMaterialRole, RoleMaterialSpec>> = {
  galvanized_steel: {
    realisticColor: 0xc2c9d1,
    technicalColor: 0x0284c7,
    metalness: 0.82,
    roughness: 0.35,
    technicalRoughness: 0.42,
    textureKind: 'galva',
  },
  copper_brushed: {
    realisticColor: 0xc8744b,
    technicalColor: 0x2563eb,
    metalness: 0.86,
    roughness: 0.28,
    technicalRoughness: 0.4,
    textureKind: 'copper',
  },
  pvc_matte: {
    realisticColor: 0x78716c,
    technicalColor: 0x78716c,
    metalness: 0.05,
    roughness: 0.55,
  },
  brass_machined: {
    realisticColor: 0xc9a23f,
    technicalColor: 0xd97706,
    metalness: 0.88,
    roughness: 0.26,
    textureKind: 'brass',
  },
  steel_ral7035: {
    realisticColor: 0xd7dbd8,
    technicalColor: 0xcbd5e1,
    metalness: 0.28,
    roughness: 0.42,
  },
  zinc_hardware: {
    realisticColor: 0xbcc3cb,
    technicalColor: 0x94a3b8,
    metalness: 0.9,
    roughness: 0.24,
  },
  epdm_rubber: {
    realisticColor: 0x1f242b,
    technicalColor: 0x1e293b,
    metalness: 0.04,
    roughness: 0.84,
  },
  anodized_alu: {
    realisticColor: 0xd9dee4,
    technicalColor: 0xe2e8f0,
    metalness: 0.84,
    roughness: 0.3,
    textureKind: 'galva',
  },
  fluid_accent: {
    realisticColor: 0x2563eb,
    technicalColor: 0x2563eb,
    metalness: 0.15,
    roughness: 0.42,
  },
  cable_cfo: {
    realisticColor: 0x1e293b,
    technicalColor: 0xd97706,
    metalness: 0.08,
    roughness: 0.45,
  },
  cable_cfa: {
    realisticColor: 0x2563eb,
    technicalColor: 0x3b82f6,
    metalness: 0.08,
    roughness: 0.45,
  },
  cable_earth: {
    realisticColor: 0x65a30d,
    technicalColor: 0x84cc16,
    metalness: 0.08,
    roughness: 0.48,
  },
};

function createCanvas2D(size: number): {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
} | null {
  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(size, size);
      const ctx = canvas.getContext('2d');
      return ctx ? { canvas, ctx } : null;
    }
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      return ctx ? { canvas, ctx } : null;
    }
    return null;
  } catch {
    return null;
  }
}

function makeBrushedMetalTexture(
  baseHex: string,
  streakDelta: number,
  anisotropy: number,
): THREE.CanvasTexture | null {
  const created = createCanvas2D(TEX_SIZE);
  if (!created) return null;
  const { canvas, ctx } = created;
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);

  // Stries de brossage déterministes (sans Math.random pour reproductibilité tests/snapshots)
  for (let y = 0; y < TEX_SIZE; y += 2) {
    const wave = Math.sin(y * 0.45) * streakDelta + Math.cos(y * 1.13) * (streakDelta * 0.5);
    const alpha = Math.abs(wave) / 255;
    ctx.fillStyle = wave >= 0 ? `rgba(255,255,255,${alpha.toFixed(3)})` : `rgba(20,24,30,${alpha.toFixed(3)})`;
    ctx.fillRect(0, y, TEX_SIZE, 1);
  }

  const tex = new THREE.CanvasTexture(canvas as HTMLCanvasElement);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

interface OverrideMaterialEntry {
  readonly mat: SharedStandardMaterial;
  readonly role: MepMaterialRole;
  readonly overrideHex: string;
}

export class MepMaterialLibrary {
  private readonly roleMaterials = new Map<MepMaterialRole, SharedStandardMaterial>();
  private readonly customOverrideMaterials = new Map<string, OverrideMaterialEntry>();
  private readonly textures: THREE.CanvasTexture[] = [];
  private readonly textureByKind: Readonly<Record<'galva' | 'copper' | 'brass' | 'perforated', THREE.CanvasTexture | null>>;
  private renderMode: RenderMode = 'technique';
  private clippingPlanes: THREE.Plane[] = [];

  public constructor(renderer?: THREE.WebGLRenderer) {
    const anisotropy = renderer?.capabilities?.getMaxAnisotropy?.() ?? 1;
    let galvaTex: THREE.CanvasTexture | null = null;
    let copperTex: THREE.CanvasTexture | null = null;
    let brassTex: THREE.CanvasTexture | null = null;

    if (typeof window !== 'undefined' && renderer) {
      galvaTex = makeBrushedMetalTexture('#d4dae0', 18, anisotropy);
      copperTex = makeBrushedMetalTexture('#d98862', 16, anisotropy);
      brassTex = makeBrushedMetalTexture('#d8b454', 14, anisotropy);
      for (const tex of [galvaTex, copperTex, brassTex]) {
        if (tex) this.textures.push(tex);
      }
    }

    this.textureByKind = {
      galva: galvaTex,
      copper: copperTex,
      brass: brassTex,
      perforated: galvaTex,
    };

    (Object.keys(ROLE_SPECS) as MepMaterialRole[]).forEach((role) => {
      const spec = ROLE_SPECS[role];
      const mat = new THREE.MeshStandardMaterial({
        color: spec.technicalColor,
        metalness: spec.metalness * 0.7,
        roughness: spec.technicalRoughness ?? spec.roughness,
        side: THREE.FrontSide,
      }) as SharedStandardMaterial;
      mat.isSharedMaterial = true;
      this.roleMaterials.set(role, mat);
    });
  }

  private syncMaterialAppearance(
    mat: SharedStandardMaterial,
    role: MepMaterialRole,
    overrideHex?: string,
  ): void {
    const spec = ROLE_SPECS[role];
    const isReal = this.renderMode === 'realiste';

    if (role === 'fluid_accent' && overrideHex) {
      mat.color.set(overrideHex);
      mat.metalness = 0.18;
      mat.roughness = 0.42;
      mat.map = null;
      mat.needsUpdate = true;
      return;
    }

    if (isReal) {
      mat.color.setHex(spec.realisticColor);
      mat.roughness = spec.roughness;
      mat.metalness = spec.metalness;
      mat.map = spec.textureKind ? this.textureByKind[spec.textureKind] : null;
    } else {
      if (overrideHex) {
        mat.color.set(overrideHex);
      } else {
        mat.color.setHex(spec.technicalColor);
      }
      mat.roughness = spec.technicalRoughness ?? spec.roughness;
      mat.metalness = spec.metalness * 0.7;
      mat.map = null;
    }
    mat.needsUpdate = true;
  }

  public getMaterial(role: MepMaterialRole, colorOverride?: string): THREE.MeshStandardMaterial {
    if (colorOverride) {
      const normalized = colorOverride.trim().toLowerCase();
      const cacheKey = `${role}::${normalized}`;
      const cached = this.customOverrideMaterials.get(cacheKey);
      if (cached) return cached.mat;

      const mat = new THREE.MeshStandardMaterial({
        side: THREE.FrontSide,
        ...(this.clippingPlanes.length > 0
          ? { clippingPlanes: this.clippingPlanes, clipShadows: true }
          : {}),
      }) as SharedStandardMaterial;
      mat.isSharedMaterial = true;
      this.syncMaterialAppearance(mat, role, colorOverride);
      this.customOverrideMaterials.set(cacheKey, { mat, role, overrideHex: colorOverride });
      return mat;
    }

    const base = this.roleMaterials.get(role);
    if (base) return base;
    return this.roleMaterials.get('galvanized_steel') as THREE.MeshStandardMaterial;
  }

  public setRenderMode(mode: RenderMode): void {
    this.renderMode = mode;

    for (const [role, mat] of this.roleMaterials.entries()) {
      this.syncMaterialAppearance(mat, role);
    }
    for (const entry of this.customOverrideMaterials.values()) {
      this.syncMaterialAppearance(entry.mat, entry.role, entry.overrideHex);
    }
  }

  public getRenderMode(): RenderMode {
    return this.renderMode;
  }

  public applyClippingPlanes(planes: THREE.Plane[]): void {
    this.clippingPlanes = planes;
    for (const mat of this.getSharedMaterials()) {
      mat.clippingPlanes = planes;
      if (mat instanceof THREE.MeshStandardMaterial) {
        mat.clipShadows = true;
      }
      mat.needsUpdate = true;
    }
  }

  public getSharedMaterials(): THREE.Material[] {
    return [
      ...this.roleMaterials.values(),
      ...Array.from(this.customOverrideMaterials.values(), (entry) => entry.mat),
    ];
  }

  public dispose(): void {
    for (const mat of this.roleMaterials.values()) {
      mat.dispose();
    }
    for (const entry of this.customOverrideMaterials.values()) {
      entry.mat.dispose();
    }
    this.roleMaterials.clear();
    this.customOverrideMaterials.clear();

    for (const tex of this.textures) {
      tex.dispose();
    }
    this.textures.length = 0;
  }
}
