import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ClashOverlayManager } from './ClashOverlayManager.js';
import type { ClashOverlayItem } from '../types.js';

describe('ClashOverlayManager (ADR-059, ADR-071, ADR-072)', () => {
  it('instancie le groupe de collision et le nettoie proprement', () => {
    const scene = new THREE.Scene();
    const manager = new ClashOverlayManager(scene);

    const group = manager.getGroup();
    expect(group.name).toBe('__clash_overlays__');
    expect(scene.children).toContain(group);

    const dummyClashes: ClashOverlayItem[] = [
      {
        id: 'c1',
        severity: 'hard',
        intersectionBox: {
          min: { x: 0, y: 0, z: 0 },
          max: { x: 100, y: 100, z: 100 },
        },
        point: { x: 50, y: 50, z: 50 },
      },
      {
        id: 'c2',
        severity: 'clearance',
        intersectionBox: {
          min: { x: 200, y: 200, z: 200 },
          max: { x: 300, y: 300, z: 300 },
        },
      },
    ];

    manager.setClashOverlays(dummyClashes);
    // c1 génère 3 objets (box, edges, sphere), c2 génère 2 objets (box, edges) = 5 objets
    expect(group.children.length).toBe(5);

    manager.clear();
    expect(group.children.length).toBe(0);

    manager.dispose();
    expect(scene.children).not.toContain(group);
  });
});
