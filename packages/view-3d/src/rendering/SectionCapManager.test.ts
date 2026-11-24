import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { SectionCapManager } from './SectionCapManager.js';

describe('SectionCapManager — Pipeline Bouchons Stencil 2 Passes (ADR-063 & ADR-072)', () => {
  let scene: THREE.Scene;
  let manager: SectionCapManager;

  beforeEach(() => {
    scene = new THREE.Scene();
    manager = new SectionCapManager(scene);
  });

  it('crée un groupe __section_caps__ et un plan bouchon __section_cap_plane__ dans la scène', () => {
    const group = scene.children.find((c) => c.name === '__section_caps__');
    expect(group).toBeDefined();
    expect(group).toBeInstanceOf(THREE.Group);

    const planeMesh = scene.children.find((c) => c.name === '__section_cap_plane__');
    expect(planeMesh).toBeDefined();
    expect(planeMesh).toBeInstanceOf(THREE.Mesh);
    expect((planeMesh as THREE.Mesh).renderOrder).toBe(2);
  });

  it('enregistre un maillage et crée sa paire de passes stencil (BackSide / FrontSide)', () => {
    const geo = new THREE.BoxGeometry(1000, 200, 2500);
    const mat = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(geo, mat);

    manager.registerMesh(mesh, 'wall_1');

    const group = scene.children.find((c) => c.name === '__section_caps__') as THREE.Group;
    expect(group.children.length).toBe(2);
    expect(group.children[0]!.name).toBe('wall_1--cap');
    expect(group.children[1]!.name).toBe('wall_1--cap-front');

    // Les deux passes partagent la géométrie source
    expect((group.children[0] as THREE.Mesh).geometry).toBe(geo);
    expect((group.children[1] as THREE.Mesh).geometry).toBe(geo);

    // Stencil ops exacts
    const backMat = (group.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
    const frontMat = (group.children[1] as THREE.Mesh).material as THREE.MeshBasicMaterial;

    expect(backMat.side).toBe(THREE.BackSide);
    expect(backMat.stencilZPass).toBe(THREE.IncrementWrapStencilOp);
    expect(backMat.depthWrite).toBe(false);

    expect(frontMat.side).toBe(THREE.FrontSide);
    expect(frontMat.stencilZPass).toBe(THREE.DecrementWrapStencilOp);
    expect(frontMat.depthWrite).toBe(false);
  });

  it('positionne et oriente le plan bouchon selon le THREE.Plane actif', () => {
    const geo = new THREE.BoxGeometry(1000, 200, 2500);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
    manager.registerMesh(mesh, 'wall_1');

    const plane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 1500);
    manager.setClippingPlane(plane);

    const capPlane = manager.getCapPlaneMesh();
    expect(capPlane.visible).toBe(true);
    expect(capPlane.position.z).toBeCloseTo(1500);

    const group = scene.children.find((c) => c.name === '__section_caps__') as THREE.Group;
    expect(group.visible).toBe(true);
    const backCap = group.children[0] as THREE.Mesh;
    expect(backCap.visible).toBe(true);
    expect((backCap.material as THREE.Material).clippingPlanes).toContain(plane);

    // Désactivation
    manager.setClippingPlane(null);
    expect(capPlane.visible).toBe(false);
    expect(group.visible).toBe(false);
  });

  it('supprime proprement les maillages stencil d un élément (unregisterMesh)', () => {
    const geo = new THREE.BoxGeometry(1000, 200, 2500);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
    manager.registerMesh(mesh, 'wall_1');

    const group = scene.children.find((c) => c.name === '__section_caps__') as THREE.Group;
    expect(group.children.length).toBe(2);

    manager.unregisterMesh('wall_1');
    expect(group.children.length).toBe(0);
  });

  it('libère les groupes, géométries et matériaux au dispose()', () => {
    manager.dispose();
    expect(scene.children.find((c) => c.name === '__section_caps__')).toBeUndefined();
    expect(scene.children.find((c) => c.name === '__section_cap_plane__')).toBeUndefined();
  });
});
