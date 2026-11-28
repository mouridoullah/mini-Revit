import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { BimDocument, exportToIfc, DependencyGraph, MepNetworkGraph } from '@tabax/core';
import { Scene3D } from '@tabax/view-3d';
import { BimDocumentProvider } from './context/BimDocumentContext.js';
import { Viewport2D } from './components/Viewport2D.js';
import { Viewport3D } from './components/Viewport3D.js';
import { MetricsPanel } from './components/MetricsPanel.js';
import { syncMepElements } from './components/viewport-3d/syncMepElements.js';
import { syncArchitecturalStructure } from './components/viewport-3d/syncArchitecturalStructure.js';
import { syncArchitecturalOpenings } from './components/viewport-3d/syncArchitecturalOpenings.js';
import { syncArchitecturalComponents } from './components/viewport-3d/syncArchitecturalComponents.js';

describe('Intégration UI & Double Rendu 2D/3D — « Immeuble R+4 Complet » (Test Global)', () => {
  let doc: BimDocument;

  beforeEach(() => {
    vi.clearAllMocks();
    HTMLCanvasElement.prototype.setPointerCapture = vi.fn();
    HTMLCanvasElement.prototype.releasePointerCapture = vi.fn();

    const jsonPath = path.resolve(__dirname, '../public/demo-immeuble-r4.json');
    const jsonStr = fs.readFileSync(jsonPath, 'utf8');
    doc = BimDocument.fromJSON(jsonStr);
  });

  it('valide l’intégrité documentaire et la présence de 100% des composantes BIM & MEP', () => {
    const state = doc.getState();

    // Architecture
    expect(Object.keys(state.levels)).toHaveLength(6);
    expect(Object.keys(state.walls)).toHaveLength(78);
    expect(Object.keys(state.slabs)).toHaveLength(6);
    expect(Object.keys(state.doors)).toHaveLength(31);
    expect(Object.keys(state.windows)).toHaveLength(36);
    expect(Object.keys(state.rooms)).toHaveLength(36);
    expect(Object.keys(state.stairs ?? {})).toHaveLength(5);
    expect(Object.keys(state.roofs ?? {})).toHaveLength(1);
    expect(Object.keys(state.roofOpenings ?? {})).toHaveLength(1);
    expect(Object.keys(state.dimensions)).toHaveLength(5);
    expect(Object.keys(state.components ?? {})).toHaveLength(108);

    // MEP (Réseaux Techniques)
    expect(Object.keys(state.pipes ?? {})).toHaveLength(285);
    expect(Object.keys(state.ducts ?? {})).toHaveLength(12);
    expect(Object.keys(state.cableTrays ?? {})).toHaveLength(12);
    expect(Object.keys(state.mepFittings ?? {})).toHaveLength(284);
    expect(Object.keys(state.mepEquipments ?? {})).toHaveLength(41);
    expect(Object.keys(state.mepSystems ?? {})).toHaveLength(7);
    expect(Object.keys(state.mepConnectors ?? {})).toHaveLength(624);

    // Graphs
    const dag = DependencyGraph.build(state);
    expect(dag.hasCycle()).toBe(false);

    const mepGraph = MepNetworkGraph.build(state);
    expect(mepGraph.getElementCount()).toBeGreaterThanOrEqual(600);
    expect(mepGraph.getConnectorCount()).toBeGreaterThanOrEqual(600);
  });

  it('monte Viewport2D et Viewport3D avec l’Immeuble R+4 sans aucune exception graphique', () => {
    const { getByTestId } = render(
      <BimDocumentProvider initialDoc={doc}>
        <div style={{ display: 'flex', width: 1400, height: 900 }}>
          <Viewport2D />
          <Viewport3D />
        </div>
      </BimDocumentProvider>,
    );

    const canvas2D = getByTestId('viewport-2d-canvas');
    const canvas3D = getByTestId('viewport-3d-canvas');

    expect(canvas2D).toBeDefined();
    expect(canvas3D).toBeDefined();

    cleanup();
  }, 15000);

  it('MetricsPanel affiche les quantitatifs exacts du niveau RDC', () => {
    const { container } = render(
      <BimDocumentProvider initialDoc={doc}>
        <MetricsPanel doc={doc} activeLevelId="level_r0" />
      </BimDocumentProvider>,
    );

    const textContent = container.textContent ?? '';

    expect(textContent).toContain('Métrés');
    expect(textContent).toContain('74.70m');
    expect(textContent).toContain('Portes6');
    expect(textContent).toContain('Fenêtres6');
    expect(textContent).toContain('Surface utile totale95.77m²');

    cleanup();
  }, 15000);

  it('exporte l’Immeuble R+4 au format IFC4 avec toutes les classes architecturales et mobiliers requises', () => {
    const ifc = exportToIfc(doc.getState());

    expect(ifc).toContain('IFCWALL');
    expect(ifc).toContain('IFCSLAB');
    expect(ifc).toContain('IFCDOOR');
    expect(ifc).toContain('IFCWINDOW');
    expect(ifc).toContain('IFCSPACE');
    expect(ifc).toContain('IFCSTAIR');
    expect(ifc).toContain('IFCROOF');
    expect(ifc).toContain('IFCFURNITURE');
    expect(ifc).toContain('IFCSANITARYTERMINAL');
    expect(ifc.length).toBeGreaterThan(100000);
  });

  it('T-MEP-R4-METROLOGY : génère les 634 assemblages MEP LOD 350 avec <= 8 pools InstancedMesh, géométrie 100% finie, parité modes et coupe 3D', () => {
    const state = doc.getState();
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 800;
    const scene = new Scene3D(canvas, { width: 1280, height: 800 });

    const t0 = performance.now();
    const syncRes = scene.batchUpdate(() => syncMepElements(scene, state, new Set(), false));
    const buildMs = performance.now() - t0;

    expect(syncRes.totalMepCount).toBe(634);
    expect(syncRes.syncedCount).toBe(634);
    expect(syncRes.detailLevel).toBe('lod350');

    const stats = scene.getMepPoolStats();
    expect(stats.pools).toBeGreaterThan(0);
    expect(stats.pools).toBeLessThanOrEqual(8);
    expect(stats.instances).toBeGreaterThan(0);

    // Vérification stricte de finitude de tous les buffers GPU et matrices InstancedMesh
    let instancedMeshCount = 0;
    let totalSubMeshes = 0;
    let nonFiniteFloats = 0;
    let nonFiniteMatrices = 0;
    scene.getScene().traverse((obj) => {
      if (obj instanceof THREE.InstancedMesh) {
        instancedMeshCount++;
        const arr = obj.instanceMatrix.array;
        for (let i = 0; i < obj.count * 16; i++) {
          if (!Number.isFinite(arr[i])) nonFiniteMatrices++;
        }
      } else if (obj instanceof THREE.Mesh) {
        totalSubMeshes++;
        for (const attrName of ['position', 'normal', 'uv'] as const) {
          const attr = obj.geometry.getAttribute(attrName);
          if (!attr) continue;
          const arr = attr.array;
          for (let i = 0; i < arr.length; i++) {
            if (!Number.isFinite(arr[i])) nonFiniteFloats++;
          }
        }
      }
    });
    expect(nonFiniteFloats).toBe(0);
    expect(nonFiniteMatrices).toBe(0);
    expect(instancedMeshCount).toBe(stats.pools);
    expect(instancedMeshCount).toBeLessThanOrEqual(8);

    // Parité bascule de mode sans re-maillage
    const meshCountBeforeModeSwitch = scene.getMeshCount();
    scene.setRenderMode('ecorche');
    scene.setRenderMode('realiste');
    scene.setRenderMode('technique');
    expect(scene.getMeshCount()).toBe(meshCountBeforeModeSwitch);

    // Propagation plan de coupe 3D (ADR-063) vers pools InstancedMesh et matériaux
    const cutPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 4500);
    scene.setSectionCutPlane(cutPlane);
    scene.getScene().traverse((obj) => {
      if (obj instanceof THREE.InstancedMesh && obj.material instanceof THREE.Material) {
        expect(obj.material.clippingPlanes).toEqual([cutPlane]);
      }
    });
    scene.setSectionCutPlane(null);

    // Sélection multi-matériaux et restauration exacte du baseMaterial à la désélection
    const firstPipeId = Object.keys(state.pipes ?? {})[0]!;
    const pipeMeshes = scene.getMeshes(firstPipeId);
    expect(pipeMeshes.length).toBeGreaterThan(0);
    const originalMaterials = pipeMeshes.map((m) => m.material);
    scene.setHighlight([firstPipeId]);
    for (const m of pipeMeshes) {
      expect(m.material).not.toBe(m.userData.baseMaterial);
    }
    scene.setHighlight([]);
    pipeMeshes.forEach((m, idx) => {
      expect(m.material).toBe(originalMaterials[idx]);
    });

    console.info(
      `[MEP-R4-METROLOGY] assemblies=${syncRes.syncedCount} subMeshes=${totalSubMeshes} instancedObjects=${stats.instances} activePools=${stats.pools} buildTimeMs=${buildMs.toFixed(1)}`,
    );

    scene.dispose();
  }, 15000);

  it('T-FULL-R4-METROLOGY : synchronise 100% de l’immeuble R+4 en LOD 350 Réaliste (structure + menuiseries + 108 composants + 634 MEP) avec pools GPU et géométrie finie', () => {
    const state = doc.getState();
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 800;
    const scene = new Scene3D(canvas, { width: 1280, height: 800 });

    const t0 = performance.now();
    scene.batchUpdate(() => {
      syncArchitecturalStructure(scene, state, new Set(), false, {
        renderMode: 'realiste',
        detailLevel: 'lod350',
      });
      syncArchitecturalOpenings(scene, state, new Set(), false, {
        detailLevel: 'lod350',
      });
      syncArchitecturalComponents(scene, state, new Set(), false);
      syncMepElements(scene, state, new Set(), false);
    });
    const buildMs = performance.now() - t0;

    const archStats = scene.getArchitecturalPoolStats();
    const mepStats = scene.getMepPoolStats();
    expect(archStats.pools).toBeGreaterThan(0);
    expect(archStats.instances).toBeGreaterThan(0);
    expect(mepStats.pools).toBeGreaterThan(0);
    expect(mepStats.pools).toBeLessThanOrEqual(8);

    let instancedMeshCount = 0;
    let totalSubMeshes = 0;
    let nonFiniteFloats = 0;
    let nonFiniteMatrices = 0;
    scene.getScene().traverse((obj) => {
      if (obj instanceof THREE.InstancedMesh) {
        instancedMeshCount++;
        const arr = obj.instanceMatrix.array;
        for (let i = 0; i < obj.count * 16; i++) {
          if (!Number.isFinite(arr[i])) nonFiniteMatrices++;
        }
      } else if (obj instanceof THREE.Mesh) {
        totalSubMeshes++;
        const pos = obj.geometry.getAttribute('position');
        if (pos) {
          for (let i = 0; i < pos.array.length; i++) {
            if (!Number.isFinite(pos.array[i])) nonFiniteFloats++;
          }
        }
      }
    });

    expect(nonFiniteFloats).toBe(0);
    expect(nonFiniteMatrices).toBe(0);
    expect(instancedMeshCount).toBe(archStats.pools + mepStats.pools);
    expect(totalSubMeshes).toBeGreaterThan(300);

    // Highlight / restauration sur une porte LOD 350 et un escalier LOD 350
    const firstDoorId = Object.keys(state.doors)[0]!;
    const doorMeshes = scene.getMeshes(firstDoorId);
    expect(doorMeshes.length).toBeGreaterThanOrEqual(2);
    const origDoorMats = doorMeshes.map((m) => m.material);
    scene.setHighlight([firstDoorId]);
    for (const m of doorMeshes) expect(m.material).not.toBe(m.userData.baseMaterial);
    scene.setHighlight([]);
    doorMeshes.forEach((m, idx) => expect(m.material).toBe(origDoorMats[idx]));

    console.info(
      `[FULL-R4-METROLOGY] subMeshes=${totalSubMeshes} archPools=${archStats.pools} archInstances=${archStats.instances} mepPools=${mepStats.pools} mepInstances=${mepStats.instances} buildTimeMs=${buildMs.toFixed(1)}`,
    );

    scene.dispose();
  }, 20000);
});
