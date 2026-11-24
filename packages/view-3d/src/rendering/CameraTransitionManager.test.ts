import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CameraTransitionManager } from './CameraTransitionManager.js';

describe('CameraTransitionManager', () => {
  it('centre la caméra perspective et controls sur un point spécifique', () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 10, 100000);
    camera.position.set(0, 0, 1000);
    const domElement = document.createElement('div');
    const controls = new OrbitControls(camera, domElement);

    CameraTransitionManager.focusOnPoint(camera, controls, { x: 100, y: 200, z: 300 }, 5000);

    expect(controls.target.x).toBe(100);
    expect(controls.target.y).toBe(200);
    expect(controls.target.z).toBe(300);
    expect(camera.position.distanceTo(controls.target)).toBeCloseTo(5000, 0);

    controls.dispose();
  });

  it('cadre les limites englobantes avec zoomToFit', () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 10, 100000);
    camera.position.set(0, 0, 5000);
    const domElement = document.createElement('div');
    const controls = new OrbitControls(camera, domElement);

    const emptyBox = new THREE.Box3();
    const resultEmpty = CameraTransitionManager.zoomToFit(camera, controls, emptyBox);
    expect(resultEmpty).toBe(false);

    const validBox = new THREE.Box3(
      new THREE.Vector3(-1000, -1000, 0),
      new THREE.Vector3(1000, 1000, 3000),
    );
    const resultValid = CameraTransitionManager.zoomToFit(camera, controls, validBox);
    expect(resultValid).toBe(true);
    expect(controls.target.z).toBeCloseTo(1500, 0);

    controls.dispose();
  });
});
