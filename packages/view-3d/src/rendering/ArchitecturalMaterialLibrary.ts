/**
 * ArchitecturalMaterialLibrary
 *
 * Bibliothèque partagée de matériaux PBR procéduraux pour les composants architecturaux,
 * le mobilier et les équipements intérieurs LOD 350 (ADR-050, ADR-072).
 * - Mode 'realiste' : textures PBR réalistes (céramique, chrome, inox brossé, bois, tissu, verre physique)
 * - Modes 'technique' / 'ecorche' : coloration harmonieuse avec contraste visuel
 * - Tous les matériaux portent `isSharedMaterial = true` (protégés contre dispose prématuré).
 */

import * as THREE from 'three';
import type { ComponentMaterialRole } from '../components/types.js';
import type { RenderMode } from './PostProcessingManager.js';

type SharedStandardMaterial = (THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial) & {
  isSharedMaterial?: boolean;
};

const TEX_SIZE = 256;

interface RoleMaterialSpec {
  readonly realisticColor: number;
  readonly technicalColor: number;
  readonly metalness: number;
  readonly roughness: number;
  readonly technicalRoughness?: number | undefined;
  readonly isPhysical?: boolean | undefined;
  readonly transmission?: number | undefined;
  readonly opacity?: number | undefined;
  readonly transparent?: boolean | undefined;
  readonly envMapIntensity?: number | undefined;
  readonly textureKind?: 'stainless' | 'wood' | 'fabric' | 'quartz' | undefined;
}

const ROLE_SPECS: Readonly<Record<ComponentMaterialRole, RoleMaterialSpec>> = {
  porcelain_white: {
    realisticColor: 0xf8fafc,
    technicalColor: 0xffffff,
    metalness: 0.02,
    roughness: 0.08,
    technicalRoughness: 0.2,
    envMapIntensity: 1.4,
  },
  chrome_hardware: {
    realisticColor: 0xe2e8f0,
    technicalColor: 0x94a3b8,
    metalness: 0.96,
    roughness: 0.05,
    technicalRoughness: 0.15,
    envMapIntensity: 2.0,
  },
  stainless_brushed: {
    realisticColor: 0xcbd5e1,
    technicalColor: 0x94a3b8,
    metalness: 0.88,
    roughness: 0.32,
    technicalRoughness: 0.35,
    textureKind: 'stainless',
    envMapIntensity: 1.2,
  },
  wood_oak: {
    realisticColor: 0xc99a65,
    technicalColor: 0xb45309,
    metalness: 0.0,
    roughness: 0.6,
    technicalRoughness: 0.5,
    textureKind: 'wood',
  },
  wood_dark: {
    realisticColor: 0x4a2e18,
    technicalColor: 0x78350f,
    metalness: 0.0,
    roughness: 0.62,
    technicalRoughness: 0.5,
    textureKind: 'wood',
  },
  fabric_upholstery: {
    realisticColor: 0x475569,
    technicalColor: 0x64748b,
    metalness: 0.0,
    roughness: 0.88,
    technicalRoughness: 0.8,
    textureKind: 'fabric',
  },
  fabric_cushion: {
    realisticColor: 0xf1f5f9,
    technicalColor: 0xe2e8f0,
    metalness: 0.0,
    roughness: 0.92,
    technicalRoughness: 0.85,
    textureKind: 'fabric',
  },
  leather_black: {
    realisticColor: 0x1e293b,
    technicalColor: 0x334155,
    metalness: 0.05,
    roughness: 0.42,
    technicalRoughness: 0.5,
  },
  glass_clear: {
    realisticColor: 0xdbeafe,
    technicalColor: 0x93c5fd,
    metalness: 0.05,
    roughness: 0.04,
    technicalRoughness: 0.1,
    isPhysical: true,
    transmission: 0.92,
    opacity: 0.3,
    transparent: true,
    envMapIntensity: 1.8,
  },
  glass_tinted: {
    realisticColor: 0x0f172a,
    technicalColor: 0x1e293b,
    metalness: 0.1,
    roughness: 0.12,
    technicalRoughness: 0.2,
    isPhysical: true,
    transmission: 0.55,
    opacity: 0.65,
    transparent: true,
    envMapIntensity: 1.5,
  },
  quartz_white: {
    realisticColor: 0xf8fafc,
    technicalColor: 0xf1f5f9,
    metalness: 0.04,
    roughness: 0.22,
    technicalRoughness: 0.3,
    textureKind: 'quartz',
    envMapIntensity: 1.2,
  },
  granite_dark: {
    realisticColor: 0x334155,
    technicalColor: 0x1e293b,
    metalness: 0.06,
    roughness: 0.35,
    technicalRoughness: 0.4,
  },
  alu_anthracite: {
    realisticColor: 0x2d3748,
    technicalColor: 0x334155,
    metalness: 0.8,
    roughness: 0.35,
    technicalRoughness: 0.38,
  },
  brass_gold: {
    realisticColor: 0xd4af37,
    technicalColor: 0xb45309,
    metalness: 0.92,
    roughness: 0.25,
    technicalRoughness: 0.3,
    envMapIntensity: 1.6,
  },
  mirror: {
    realisticColor: 0xffffff,
    technicalColor: 0xf1f5f9,
    metalness: 0.99,
    roughness: 0.01,
    technicalRoughness: 0.05,
    envMapIntensity: 2.5,
  },
  appliance_display: {
    realisticColor: 0x020617,
    technicalColor: 0x0f172a,
    metalness: 0.1,
    roughness: 0.1,
    technicalRoughness: 0.2,
  },
  plastic_matte: {
    realisticColor: 0xe2e8f0,
    technicalColor: 0xcbd5e1,
    metalness: 0.02,
    roughness: 0.65,
    technicalRoughness: 0.6,
  },
  concrete_structural: {
    realisticColor: 0xc8cdd5,
    technicalColor: 0xd1d5db,
    metalness: 0.04,
    roughness: 0.85,
    technicalRoughness: 0.8,
  },
  roof_tile: {
    realisticColor: 0x9b3a20,
    technicalColor: 0xb45309,
    metalness: 0.02,
    roughness: 0.72,
    technicalRoughness: 0.65,
  },
  roof_gravel: {
    realisticColor: 0x64748b,
    technicalColor: 0x475569,
    metalness: 0.05,
    roughness: 0.9,
    technicalRoughness: 0.85,
  },
  zinc_metal: {
    realisticColor: 0xa1a9b5,
    technicalColor: 0x94a3b8,
    metalness: 0.82,
    roughness: 0.32,
    technicalRoughness: 0.38,
    envMapIntensity: 1.2,
  },
  plaster_interior: {
    realisticColor: 0xf8fafc,
    technicalColor: 0xffffff,
    metalness: 0.0,
    roughness: 0.95,
    technicalRoughness: 0.9,
  },
  skirting_wood: {
    realisticColor: 0xd4a373,
    technicalColor: 0xb45309,
    metalness: 0.0,
    roughness: 0.55,
    technicalRoughness: 0.5,
    textureKind: 'wood',
  },
};

function createOffscreenCanvas(width: number, height: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export class ArchitecturalMaterialLibrary {
  private readonly materials = new Map<string, SharedStandardMaterial>();
  private readonly textures = new Map<string, THREE.CanvasTexture>();
  private currentMode: RenderMode = 'realiste';

  public constructor() {
    this.initTextures();
  }

  private initTextures(): void {
    if (typeof document === 'undefined') return;

    // Inox brossé
    const stainlessCanvas = createOffscreenCanvas(TEX_SIZE, TEX_SIZE);
    if (stainlessCanvas) {
      const ctx = stainlessCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
        for (let y = 0; y < TEX_SIZE; y += 2) {
          const v = Math.sin(y * 0.25) * 8 + (Math.random() - 0.5) * 12;
          ctx.fillStyle = `rgba(0, 0, 0, ${Math.max(0, 0.03 + v / 255)})`;
          ctx.fillRect(0, y, TEX_SIZE, 1);
        }
        const tex = new THREE.CanvasTexture(stainlessCanvas);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(4, 4);
        tex.needsUpdate = true;
        this.textures.set('stainless', tex);
      }
    }

    // Bois chêne
    const woodCanvas = createOffscreenCanvas(TEX_SIZE, TEX_SIZE);
    if (woodCanvas) {
      const ctx = woodCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#c99a65';
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
        for (let x = 0; x < TEX_SIZE; x += 3) {
          const wave = Math.sin(x * 0.08) * 12 + (Math.random() - 0.5) * 6;
          ctx.fillStyle = `rgba(120, 60, 20, ${Math.max(0, 0.05 + wave / 255)})`;
          ctx.fillRect(x, 0, 2, TEX_SIZE);
        }
        const tex = new THREE.CanvasTexture(woodCanvas);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(2, 2);
        tex.needsUpdate = true;
        this.textures.set('wood', tex);
      }
    }

    // Tissu chiné
    const fabricCanvas = createOffscreenCanvas(TEX_SIZE, TEX_SIZE);
    if (fabricCanvas) {
      const ctx = fabricCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#475569';
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
        for (let i = 0; i < 3000; i++) {
          const px = Math.random() * TEX_SIZE;
          const py = Math.random() * TEX_SIZE;
          ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
          ctx.fillRect(px, py, 2, 2);
        }
        const tex = new THREE.CanvasTexture(fabricCanvas);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(6, 6);
        tex.needsUpdate = true;
        this.textures.set('fabric', tex);
      }
    }

    // Quartz moucheté
    const quartzCanvas = createOffscreenCanvas(TEX_SIZE, TEX_SIZE);
    if (quartzCanvas) {
      const ctx = quartzCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
        for (let i = 0; i < 2000; i++) {
          const px = Math.random() * TEX_SIZE;
          const py = Math.random() * TEX_SIZE;
          ctx.fillStyle = Math.random() > 0.7 ? 'rgba(100,116,139,0.12)' : 'rgba(148,163,184,0.08)';
          ctx.fillRect(px, py, 1.5, 1.5);
        }
        const tex = new THREE.CanvasTexture(quartzCanvas);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(4, 4);
        tex.needsUpdate = true;
        this.textures.set('quartz', tex);
      }
    }
  }

  public getMaterial(role: ComponentMaterialRole, customColor?: string): THREE.Material {
    const key = `${role}::${customColor ?? 'default'}`;
    const cached = this.materials.get(key);
    if (cached) return cached;

    const spec = ROLE_SPECS[role];
    const isRealistic = this.currentMode === 'realiste';

    let colorVal = isRealistic ? spec.realisticColor : spec.technicalColor;
    if (customColor) {
      const parsed = parseInt(customColor.replace('#', ''), 16);
      if (!Number.isNaN(parsed)) colorVal = parsed;
    }

    const roughness =
      !isRealistic && spec.technicalRoughness !== undefined
        ? spec.technicalRoughness
        : spec.roughness;

    let mat: SharedStandardMaterial;
    if (spec.isPhysical) {
      mat = new THREE.MeshPhysicalMaterial({
        color: colorVal,
        roughness,
        metalness: spec.metalness,
        transmission: spec.transmission ?? 0.9,
        transparent: spec.transparent ?? false,
        opacity: spec.opacity ?? 1.0,
        envMapIntensity: spec.envMapIntensity ?? 1.0,
        side: THREE.DoubleSide,
      });
    } else {
      mat = new THREE.MeshStandardMaterial({
        color: colorVal,
        roughness,
        metalness: spec.metalness,
        envMapIntensity: spec.envMapIntensity ?? 1.0,
        side: THREE.FrontSide,
      });
    }

    if (isRealistic && spec.textureKind) {
      const tex = this.textures.get(spec.textureKind);
      if (tex) mat.map = tex;
    }

    mat.isSharedMaterial = true;
    mat.userData = { isSharedMaterial: true, role, customColor };
    this.materials.set(key, mat);
    return mat;
  }

  public getSharedMaterials(): THREE.Material[] {
    return Array.from(this.materials.values());
  }

  public applyClippingPlanes(planes: THREE.Plane[]): void {
    for (const mat of this.materials.values()) {
      mat.clippingPlanes = planes;
      mat.clipShadows = true;
    }
  }

  public setRenderMode(mode: RenderMode): void {
    if (this.currentMode === mode) return;
    this.currentMode = mode;
    const isRealistic = mode === 'realiste';

    for (const [key, mat] of this.materials.entries()) {
      const sep = key.lastIndexOf('::');
      const role = (sep >= 0 ? key.slice(0, sep) : key) as ComponentMaterialRole;
      const customColor = sep >= 0 ? key.slice(sep + 2) : undefined;
      const spec = ROLE_SPECS[role];
      if (!spec) continue;

      let colorVal = isRealistic ? spec.realisticColor : spec.technicalColor;
      if (customColor && customColor !== 'default') {
        const parsed = parseInt(customColor.replace('#', ''), 16);
        if (!Number.isNaN(parsed)) colorVal = parsed;
      }
      mat.color.setHex(colorVal);
      mat.roughness =
        !isRealistic && spec.technicalRoughness !== undefined
          ? spec.technicalRoughness
          : spec.roughness;

      if (spec.textureKind) {
        mat.map = isRealistic ? (this.textures.get(spec.textureKind) ?? null) : null;
      }
      mat.needsUpdate = true;
    }
  }

  public dispose(): void {
    for (const mat of this.materials.values()) {
      mat.dispose();
    }
    this.materials.clear();
    for (const tex of this.textures.values()) {
      tex.dispose();
    }
    this.textures.clear();
  }
}
