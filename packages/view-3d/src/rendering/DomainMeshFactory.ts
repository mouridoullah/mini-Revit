/**
 * DomainMeshFactory
 *
 * Gère les matériaux standard de domaine (dalles, toitures, escaliers, mobilier, MEP)
 * et formate les données géométriques RawMeshData associées pour l'affichage 3D (ADR-050, ADR-072).
 */

import * as THREE from 'three';
import { type RawMeshData } from '@tabax/geometry';
import {
  createSanitaryMaterial,
  createKitchenMaterial,
  createFurnitureMaterial,
  createGlazingMaterial,
  createMepMaterial,
} from '../materials.js';
import { getProceduralTextures, disposeProceduralTextures } from './ProceduralTextures.js';
import { MepMaterialLibrary } from './MepMaterialLibrary.js';
import { ArchitecturalMaterialLibrary } from './ArchitecturalMaterialLibrary.js';
import type { RenderMode } from './PostProcessingManager.js';

export type ComponentMeshFamily = 'sanitary' | 'kitchen' | 'furniture' | 'glazing' | (string & {});

function getRoomColorHex(roomId: string): number {
  let hash = 0;
  for (let i = 0; i < roomId.length; i++) {
    hash = roomId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  const color = new THREE.Color();
  color.setHSL(hue / 360, 0.45, 0.72);
  return color.getHex();
}

export class DomainMeshFactory {
  public readonly slabMaterial: THREE.MeshStandardMaterial;
  public readonly stairMaterial: THREE.MeshStandardMaterial;
  public readonly roofMaterial: THREE.MeshStandardMaterial;
  public readonly sanitaryMaterial: THREE.MeshStandardMaterial;
  public readonly kitchenMaterial: THREE.MeshStandardMaterial;
  public readonly furnitureMaterial: THREE.MeshStandardMaterial;
  public readonly glazingMaterial: THREE.MeshStandardMaterial;
  public parquetFloorMaterial: THREE.MeshStandardMaterial | null = null;
  public carrelageFloorMaterial: THREE.MeshStandardMaterial | null = null;
  private readonly mepMaterialLibrary: MepMaterialLibrary;
  private readonly architecturalMaterialLibrary: ArchitecturalMaterialLibrary;

  public constructor(renderer?: THREE.WebGLRenderer) {
    this.mepMaterialLibrary = new MepMaterialLibrary(renderer);
    this.architecturalMaterialLibrary = new ArchitecturalMaterialLibrary();
    this.slabMaterial = new THREE.MeshStandardMaterial({
      color: 0xd1d5db,
      roughness: 0.85,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });
    this.stairMaterial = new THREE.MeshStandardMaterial({
      color: 0xa0825a,
      roughness: 0.7,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });
    this.roofMaterial = new THREE.MeshStandardMaterial({
      color: 0x92400e,
      roughness: 0.65,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });
    this.sanitaryMaterial = createSanitaryMaterial();
    this.kitchenMaterial = createKitchenMaterial();
    this.furnitureMaterial = createFurnitureMaterial();
    this.glazingMaterial = createGlazingMaterial();

    if (typeof window !== 'undefined' && renderer) {
      try {
        const textures = getProceduralTextures(renderer);
        this.parquetFloorMaterial = new THREE.MeshStandardMaterial({
          map: textures.parquet,
          roughness: 0.45,
          metalness: 0.05,
          side: THREE.DoubleSide,
        });
        this.carrelageFloorMaterial = new THREE.MeshStandardMaterial({
          map: textures.carrelage,
          roughness: 0.55,
          metalness: 0.08,
          side: THREE.DoubleSide,
        });
      } catch {
        // Dégradation gracieuse en environnement test / headless
      }
    }
  }

  public getRoomMaterial(roomId: string, rawMesh: RawMeshData, isRealistic: boolean): THREE.Material {
    if (isRealistic) {
      const finish = rawMesh.userData?.finish as string | undefined;
      if (finish === 'carrelage' && this.carrelageFloorMaterial) {
        return this.carrelageFloorMaterial;
      }
      if (finish === 'parquet' && this.parquetFloorMaterial) {
        return this.parquetFloorMaterial;
      }
    }
    return new THREE.MeshStandardMaterial({
      color: getRoomColorHex(roomId),
      roughness: 0.8,
      metalness: 0.1,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
    });
  }

  public getComponentMaterial(family: ComponentMeshFamily): THREE.MeshStandardMaterial {
    switch (family) {
      case 'sanitary': return this.sanitaryMaterial;
      case 'kitchen': return this.kitchenMaterial;
      case 'glazing': return this.glazingMaterial;
      case 'furniture':
      default: return this.furnitureMaterial;
    }
  }

  public getMepMaterialLibrary(): MepMaterialLibrary {
    return this.mepMaterialLibrary;
  }

  public getArchitecturalMaterialLibrary(): ArchitecturalMaterialLibrary {
    return this.architecturalMaterialLibrary;
  }

  public setMepRenderMode(mode: RenderMode): void {
    this.mepMaterialLibrary.setRenderMode(mode);
    this.architecturalMaterialLibrary.setRenderMode(mode);
  }

  public getMepMaterial(rawMesh: RawMeshData, colorOrMaterial?: string | number | THREE.Material): THREE.Material {
    if (colorOrMaterial instanceof THREE.Material) {
      return colorOrMaterial;
    }
    const hex = colorOrMaterial ?? (rawMesh.userData?.color as string | undefined) ?? '#64748b';
    return createMepMaterial(hex);
  }

  public formatSlab(slabId: string, rawMesh: RawMeshData): RawMeshData {
    return {
      ...rawMesh,
      elementId: slabId,
      userData: {
        elementId: slabId,
        category: 'slab',
        ...(rawMesh.userData ?? {}),
      },
    };
  }

  public formatStair(stairId: string, rawMesh: RawMeshData): RawMeshData {
    return {
      ...rawMesh,
      elementId: stairId,
      userData: {
        elementId: stairId,
        category: 'stair',
        ...(rawMesh.userData ?? {}),
      },
    };
  }

  public formatRoof(roofId: string, rawMesh: RawMeshData): RawMeshData {
    return {
      ...rawMesh,
      elementId: roofId,
      userData: {
        elementId: roofId,
        category: 'roof',
        ...(rawMesh.userData ?? {}),
      },
    };
  }

  public formatComponent(componentId: string, rawMesh: RawMeshData, family: ComponentMeshFamily): RawMeshData {
    return {
      ...rawMesh,
      elementId: componentId,
      userData: {
        elementId: componentId,
        category: 'component',
        family,
        ...(rawMesh.userData ?? {}),
      },
    };
  }

  public formatMep(elementId: string, rawMesh: RawMeshData): RawMeshData {
    return {
      ...rawMesh,
      elementId,
      userData: {
        elementId,
        category: 'mep',
        ...(rawMesh.userData ?? {}),
      },
    };
  }

  public isInternalMaterial(mat: THREE.Material): boolean {
    return (
      mat === this.slabMaterial ||
      mat === this.stairMaterial ||
      mat === this.roofMaterial ||
      mat === this.sanitaryMaterial ||
      mat === this.kitchenMaterial ||
      mat === this.furnitureMaterial ||
      mat === this.glazingMaterial ||
      mat === this.parquetFloorMaterial ||
      mat === this.carrelageFloorMaterial ||
      this.mepMaterialLibrary.getSharedMaterials().includes(mat) ||
      this.architecturalMaterialLibrary.getSharedMaterials().includes(mat)
    );
  }

  public getSharedMaterials(): THREE.Material[] {
    const list: THREE.Material[] = [
      this.slabMaterial,
      this.stairMaterial,
      this.roofMaterial,
      this.sanitaryMaterial,
      this.kitchenMaterial,
      this.furnitureMaterial,
      this.glazingMaterial,
      ...this.mepMaterialLibrary.getSharedMaterials(),
      ...this.architecturalMaterialLibrary.getSharedMaterials(),
    ];
    if (this.parquetFloorMaterial) list.push(this.parquetFloorMaterial);
    if (this.carrelageFloorMaterial) list.push(this.carrelageFloorMaterial);
    return list;
  }

  public dispose(): void {
    disposeProceduralTextures();
    this.mepMaterialLibrary.dispose();
    this.architecturalMaterialLibrary.dispose();
    this.slabMaterial.dispose();
    this.stairMaterial.dispose();
    this.roofMaterial.dispose();
    this.sanitaryMaterial.dispose();
    this.kitchenMaterial.dispose();
    this.furnitureMaterial.dispose();
    this.glazingMaterial.dispose();
    this.parquetFloorMaterial?.dispose();
    this.carrelageFloorMaterial?.dispose();
  }
}
