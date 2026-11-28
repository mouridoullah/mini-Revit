import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { ArchitecturalMaterialLibrary } from './ArchitecturalMaterialLibrary.js';
import type { ComponentMaterialRole } from '../components/types.js';

describe('ArchitecturalMaterialLibrary (ADR-050 / ADR-072)', () => {
  let lib: ArchitecturalMaterialLibrary;

  beforeEach(() => {
    lib = new ArchitecturalMaterialLibrary();
  });

  afterEach(() => {
    lib.dispose();
  });

  it('fournit des matériaux partagés protégés avec isSharedMaterial: true', () => {
    const mat = lib.getMaterial('porcelain_white') as THREE.MeshStandardMaterial;
    expect(mat).toBeDefined();
    expect((mat as any).isSharedMaterial).toBe(true);
    expect(mat.userData.isSharedMaterial).toBe(true);
  });

  it('recycle les instances de matériaux pour un même rôle sans couleur personnalisée', () => {
    const mat1 = lib.getMaterial('wood_oak');
    const mat2 = lib.getMaterial('wood_oak');
    expect(mat1).toBe(mat2);
  });

  it('génère un matériau physique transparent pour le verre clear', () => {
    const mat = lib.getMaterial('glass_clear') as THREE.MeshPhysicalMaterial;
    expect(mat.isMeshPhysicalMaterial).toBe(true);
    expect(mat.transparent).toBe(true);
    expect(mat.transmission).toBeGreaterThan(0.8);
    expect(mat.roughness).toBeLessThan(0.1);
  });

  it('supporte toutes les variantes de rôles architecturaux sans exception', () => {
    const roles: ComponentMaterialRole[] = [
      'porcelain_white',
      'chrome_hardware',
      'stainless_brushed',
      'wood_oak',
      'wood_dark',
      'fabric_upholstery',
      'fabric_cushion',
      'leather_black',
      'glass_clear',
      'glass_tinted',
      'quartz_white',
      'granite_dark',
      'alu_anthracite',
      'brass_gold',
      'mirror',
      'appliance_display',
      'plastic_matte',
      'concrete_structural',
      'roof_tile',
      'roof_gravel',
      'zinc_metal',
      'plaster_interior',
      'skirting_wood',
    ];

    for (const r of roles) {
      const m = lib.getMaterial(r);
      expect(m).toBeDefined();
    }
  });

  it('bascule proprement entre les modes technique, ecorche et realiste', () => {
    const wood = lib.getMaterial('wood_oak') as THREE.MeshStandardMaterial;
    const initialRoughness = wood.roughness;

    lib.setRenderMode('technique');
    expect(wood.roughness).toBeDefined();

    lib.setRenderMode('realiste');
    expect(wood.roughness).toBe(initialRoughness);
  });

  it('gère les teintes personnalisées hexadécimales', () => {
    const mCustom = lib.getMaterial('fabric_upholstery', '#ff0000') as THREE.MeshStandardMaterial;
    expect(mCustom.color.getHexString()).toBe('ff0000');
  });

  it('préserve le parsing role::customColor sur les rôles à underscore lors de setRenderMode', () => {
    const wood = lib.getMaterial('wood_oak') as THREE.MeshStandardMaterial;
    const alu = lib.getMaterial('alu_anthracite') as THREE.MeshStandardMaterial;
    const customWood = lib.getMaterial('wood_oak', '#123456') as THREE.MeshStandardMaterial;

    lib.setRenderMode('technique');
    expect(wood.color.getHex()).toBe(0xb45309);
    expect(alu.color.getHex()).toBe(0x334155);
    expect(customWood.color.getHex()).toBe(0x123456);

    lib.setRenderMode('realiste');
    expect(wood.color.getHex()).toBe(0xc99a65);
    expect(alu.color.getHex()).toBe(0x2d3748);
    expect(customWood.color.getHex()).toBe(0x123456);
  });
});
