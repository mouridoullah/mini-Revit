import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { SectionCapManager } from './SectionCapManager.js';

describe('SectionCapManager (ADR-063 & ADR-072)', () => {
  let scene: THREE.Scene;
  let manager: SectionCapManager;

  beforeEach(() => {
    scene = new THREE.Scene();
    manager = new SectionCapManager(scene);
  });

  it('crée un groupe __section_caps__ dans la scène', () => {
    const group = scene.children.find((c) => c.name === '__section_caps__');
    expect(group).toBeDefined();
    expect(group).toBeInstanceOf(THREE.Group);
  });

  it('enregistre un maillage et crée son cap jumeau stencil', () => {
    const geo = new THREE.BoxGeometry(1000, 200, 2500);
    const mat = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(geo, mat);

    manager.registerMesh(mesh, 'wall_1');

    const group = scene.children.find((c) => c.name === '__section_caps__') as THREE.Group;
    expect(group.children.length).toBe(1);
    expect(group.children[0]!.name).toBe('wall_1--cap');

    // Le cap partage la géométrie du mesh parent
    expect((group.children[0] as THREE.Mesh).geometry).toBe(geo);
  });

  it('propage le plan de coupe actif sur les caps (setClippingPlane)', () => {
    const geo = new THREE.BoxGeometry(1000, 200, 2500);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
    manager.registerMesh(mesh, 'wall_1');

    const plane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 1500);
    manager.setClippingPlane(plane);

    const group = scene.children.find((c) => c.name === '__section_caps__') as THREE.Group;
    const cap = group.children[0] as THREE.Mesh;
    expect(cap.visible).toBe(true);
    expect((cap.material as THREE.Material).clippingPlanes).toContain(plane);

    manager.setClippingPlane(null);
    expect(cap.visible).toBe(false);
  });

  it('supprime proprement les caps d un élément (unregisterMesh)', () => {
    const geo = new THREE.BoxGeometry(1000, 200, 2500);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
    manager.registerMesh(mesh, 'wall_1');

    const group = scene.children.find((c) => c.name === '__section_caps__') as THREE.Group;
    expect(group.children.length).toBe(1);

    manager.unregisterMesh('wall_1');
    expect(group.children.length).toBe(0);
  });

  it('libère le groupe et les matériaux au dispose()', () => {
    manager.dispose();
    const group = scene.children.find((c) => c.name === '__section_caps__');
    expect(group).toBeUndefined();
  });
});
