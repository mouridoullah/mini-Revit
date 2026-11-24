/**
 * CameraTransitionManager
 *
 * Gère le centrage orbital et le cadrage automatique (zoomToFit, focusOnPoint)
 * de la caméra perspective Three.js et des OrbitControls.
 */

import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class CameraTransitionManager {
  /**
   * Centre la caméra et l'orbite sur un point de coordonnées 3D spécifique.
   */
  public static focusOnPoint(
    camera: THREE.PerspectiveCamera,
    controls: OrbitControls,
    point: { readonly x: number; readonly y: number; readonly z: number },
    distance = 6500,
  ): void {
    controls.target.set(point.x, point.y, point.z);

    const dir = new THREE.Vector3()
      .subVectors(camera.position, controls.target)
      .normalize();

    if (dir.lengthSq() < 0.001) {
      dir.set(1, 1, 0.75).normalize();
    }

    camera.position.set(
      point.x + dir.x * distance,
      point.y + dir.y * distance,
      point.z + dir.z * distance,
    );

    controls.update();
  }

  /**
   * Cadre un ensemble de maillages (via leur boîte englobante Box3) dans le viewport.
   * Retourne false si la boîte est vide.
   */
  public static zoomToFit(
    camera: THREE.PerspectiveCamera,
    controls: OrbitControls,
    bounds: THREE.Box3,
  ): boolean {
    if (bounds.isEmpty()) return false;

    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    const center = sphere.center;
    const verticalFov = THREE.MathUtils.degToRad(camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
    const limitingFov = Math.min(verticalFov, horizontalFov);
    const distance = (Math.max(sphere.radius, 500) * 1.15) / Math.sin(limitingFov / 2);

    const direction = new THREE.Vector3()
      .subVectors(camera.position, controls.target)
      .normalize();
    if (direction.lengthSq() < 0.001) {
      direction.set(1, 1, 0.75).normalize();
    }

    controls.target.copy(center);
    camera.position.copy(center).addScaledVector(direction, distance);
    camera.far = Math.max(camera.far, distance * 10);
    camera.updateProjectionMatrix();
    controls.update();
    return true;
  }
}
