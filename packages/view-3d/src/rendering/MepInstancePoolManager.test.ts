import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { ArchitecturalMeshManager } from './ArchitecturalMeshManager.js';
import { MepMaterialLibrary } from './MepMaterialLibrary.js';
import { MepInstancePoolManager } from './MepInstancePoolManager.js';
import { SelectionHighlightManager } from './SelectionHighlightManager.js';
import { composeMatrix4, type MepAssembly3D } from '../mesh-generator/mep/assembly-types.js';
import { UvMeshAccumulator } from '../mesh-generator/mep/primitives.js';
import { v3 } from '../mesh-generator/mep/common.js';

function makeBoxAssembly(elementId: string, originX: number): MepAssembly3D {
  const bodyAcc = new UvMeshAccumulator();
  bodyAcc.addBeveledBox(v3(originX, 0, 0), 200, 100, 100, v3(1, 0, 0), v3(0, 1, 0), v3(0, 0, 1), 2);

  const handleAcc = new UvMeshAccumulator();
  handleAcc.addBeveledBox(v3(originX, 60, 0), 40, 20, 20, v3(1, 0, 0), v3(0, 1, 0), v3(0, 0, 1), 1);

  return {
    elementId,
    category: 'mepEquipment',
    parts: [
      { rawData: bodyAcc.toRawMeshData(elementId), materialRole: 'steel_ral7035' },
      { rawData: handleAcc.toRawMeshData(elementId), materialRole: 'anodized_alu' },
    ],
    instances: [
      {
        prototypeKey: 'bolt_m10',
        matrix: composeMatrix4(v3(originX, 0, 100), v3(1, 0, 0), v3(0, 1, 0), v3(0, 0, 1)),
        materialRole: 'zinc_hardware',
      },
      {
        prototypeKey: 'cabinet_hinge',
        matrix: composeMatrix4(v3(originX - 100, -50, 0), v3(1, 0, 0), v3(0, 1, 0), v3(0, 0, 1)),
        materialRole: 'zinc_hardware',
      },
    ],
  };
}

describe('MepInstancePoolManager & assemblage multi-matériaux (Lot 1 LOD 350)', () => {
  it('regroupe les instances par prototype, résout raycast instanceId -> elementId et supporte clipping + dispose', () => {
    const scene = new THREE.Scene();
    const lib = new MepMaterialLibrary();
    const poolMgr = new MepInstancePoolManager(scene, lib);

    poolMgr.registerElementInstances('eq_1', [
      {
        prototypeKey: 'bolt_m10',
        matrix: composeMatrix4(v3(0, 0, 0), v3(1, 0, 0), v3(0, 1, 0), v3(0, 0, 1)),
        materialRole: 'zinc_hardware',
      },
      {
        prototypeKey: 'bolt_m10',
        matrix: composeMatrix4(v3(500, 0, 0), v3(1, 0, 0), v3(0, 1, 0), v3(0, 0, 1)),
        materialRole: 'zinc_hardware',
      },
    ]);
    poolMgr.registerElementInstances('eq_2', [
      {
        prototypeKey: 'bolt_m10',
        matrix: composeMatrix4(v3(1000, 0, 0), v3(1, 0, 0), v3(0, 1, 0), v3(0, 0, 1)),
        materialRole: 'zinc_hardware',
      },
    ]);

    expect(poolMgr.getPoolCount()).toBe(1);
    expect(poolMgr.getTotalInstanceCount()).toBe(3);

    // Raycast sur l'instance de eq_2 à x = 1000
    const camera = new THREE.PerspectiveCamera(45, 1, 1, 10000);
    camera.position.set(1000, 0, 200);
    camera.lookAt(1000, 0, 0);
    camera.updateMatrixWorld();
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

    const hit = poolMgr.raycast(raycaster);
    expect(hit?.elementId).toBe('eq_2');

    // Le plan de coupe exclut les instances derrière z < 50
    const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -50);
    poolMgr.applyClippingPlanes([clipPlane]);
    expect(poolMgr.raycast(raycaster, clipPlane)).toBeNull();
    expect(lib.getMaterial('zinc_hardware').clippingPlanes).toEqual([clipPlane]);

    // Surbrillance via instanceColor puis restauration neutre à la désélection
    poolMgr.setHighlight(['eq_1']);
    const instMesh = poolMgr.getAllInstancedMeshes()[0];
    expect(instMesh?.instanceColor).not.toBeNull();
    const selColor = new THREE.Color();
    instMesh?.getColorAt(0, selColor);
    expect(selColor.getHex()).toBe(0x3b82f6);

    poolMgr.setHighlight([]);
    const clearedColor = new THREE.Color();
    poolMgr.getAllInstancedMeshes()[0]?.getColorAt(0, clearedColor);
    expect(clearedColor.getHex()).toBe(0xffffff);

    // Mode batch : un seul rebuild final
    poolMgr.beginBatch();
    poolMgr.registerElementInstances('eq_3', [
      {
        prototypeKey: 'pipe_clamp',
        matrix: composeMatrix4(v3(2000, 0, 0), v3(1, 0, 0), v3(0, 1, 0), v3(0, 0, 1)),
        materialRole: 'zinc_hardware',
      },
    ]);
    expect(poolMgr.getPoolCount()).toBe(2);
    poolMgr.endBatch();
    expect(poolMgr.getAllInstancedMeshes()).toHaveLength(2);
    poolMgr.removeElementInstances('eq_3');

    // Suppression incrémentale d'un élément
    poolMgr.removeElementInstances('eq_1');
    expect(poolMgr.getTotalInstanceCount()).toBe(1);
    expect(poolMgr.getPoolCount()).toBe(1);

    poolMgr.removeElementInstances('eq_2');
    expect(poolMgr.getTotalInstanceCount()).toBe(0);
    expect(poolMgr.getPoolCount()).toBe(0);

    // Dispose sans fuite (ne dispose pas les matériaux partagés)
    const matSpy = vi.spyOn(lib.getMaterial('zinc_hardware'), 'dispose');
    poolMgr.dispose();
    expect(matSpy).not.toHaveBeenCalled();
    lib.dispose();
  });

  it('préserve chaque baseMaterial sur assemblage multi-matériaux lors de la surbrillance et respecte isSharedMaterial', () => {
    const scene = new THREE.Scene();
    const lib = new MepMaterialLibrary();
    const manager = new ArchitecturalMeshManager(scene, lib);
    const highlight = new SelectionHighlightManager();
    const defaultMat = new THREE.MeshStandardMaterial();

    const assembly = makeBoxAssembly('panel_1', 0);
    const meshes = manager.addMepAssembly(assembly);
    expect(meshes).toHaveLength(2);
    expect(manager.getMepInstancePoolManager().getTotalInstanceCount()).toBe(2);

    const ralMat = lib.getMaterial('steel_ral7035');
    const aluMat = lib.getMaterial('anodized_alu');
    expect(meshes[0]?.material).toBe(ralMat);
    expect(meshes[1]?.material).toBe(aluMat);

    // Sélection -> highlightMaterial sur les 2 sous-maillages, désélection -> restauration exacte de chaque baseMaterial
    highlight.setHighlight(['panel_1'], manager.getMeshesMap(), defaultMat);
    expect(meshes[0]?.material).toBe(highlight.getHighlightMaterial());
    expect(meshes[1]?.material).toBe(highlight.getHighlightMaterial());

    highlight.setHighlight([], manager.getMeshesMap(), defaultMat);
    expect(meshes[0]?.material).toBe(ralMat);
    expect(meshes[1]?.material).toBe(aluMat);

    // removeMesh nettoie géométries + instances GPU sans détruire les matériaux partagés de MepMaterialLibrary
    const ralSpy = vi.spyOn(ralMat, 'dispose');
    manager.removeMesh('panel_1');
    expect(manager.getMeshCount()).toBe(0);
    expect(manager.getMepInstancePoolManager().getTotalInstanceCount()).toBe(0);
    expect(ralSpy).not.toHaveBeenCalled();

    manager.dispose();
    highlight.dispose();
    defaultMat.dispose();
    lib.dispose();
  });
});
