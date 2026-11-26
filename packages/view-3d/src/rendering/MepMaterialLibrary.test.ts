import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { MepMaterialLibrary } from './MepMaterialLibrary.js';
import type { MepMaterialRole } from '../mesh-generator/mep/assembly-types.js';

describe('MepMaterialLibrary (Lot 1 PBR LOD 350)', () => {
  it('fournit tous les matériaux partagés isSharedMaterial et bascule entre Réaliste et Technique', () => {
    const lib = new MepMaterialLibrary();
    const roles: readonly MepMaterialRole[] = [
      'galvanized_steel',
      'copper_brushed',
      'pvc_matte',
      'brass_machined',
      'steel_ral7035',
      'zinc_hardware',
      'epdm_rubber',
      'anodized_alu',
      'fluid_accent',
      'cable_cfo',
      'cable_cfa',
      'cable_earth',
    ];

    for (const role of roles) {
      const mat = lib.getMaterial(role);
      expect((mat as THREE.MeshStandardMaterial & { isSharedMaterial?: boolean }).isSharedMaterial).toBe(true);
    }

    lib.setRenderMode('realiste');
    expect(lib.getRenderMode()).toBe('realiste');

    const galva = lib.getMaterial('galvanized_steel');
    expect(galva.metalness).toBeCloseTo(0.82, 2);
    expect(galva.roughness).toBeCloseTo(0.35, 2);

    const pvc = lib.getMaterial('pvc_matte');
    expect(pvc.metalness).toBeCloseTo(0.05, 2);
    expect(pvc.roughness).toBeCloseTo(0.55, 2);

    const ral = lib.getMaterial('steel_ral7035');
    expect(ral.color.getHex()).toBe(0xd7dbd8);

    // En mode technique, la gaine adopte la teinte fluide technique
    lib.setRenderMode('technique');
    expect(galva.color.getHex()).toBe(0x0284c7);

    // Accents couleur partagés et réutilisés depuis le cache
    const accentA = lib.getMaterial('fluid_accent', '#dc2626');
    const accentB = lib.getMaterial('fluid_accent', '#DC2626');
    expect(accentA).toBe(accentB);

    // Propagation plan de coupe et dispose propre
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -500);
    lib.applyClippingPlanes([plane]);
    expect(galva.clippingPlanes).toEqual([plane]);
    expect(accentA.clippingPlanes).toEqual([plane]);

    const spy = vi.spyOn(galva, 'dispose');
    lib.dispose();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(lib.getSharedMaterials()).toHaveLength(0);
  });
});
