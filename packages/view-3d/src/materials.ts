import * as THREE from 'three';

/**
 * Crée le matériau PBR standard par défaut pour les solides architecturaux.
 *
 * Conforme à l'ADR-017 :
 * - `side: THREE.FrontSide` active rigoureusement le Backface Culling GPU,
 *   éliminant tout phénomène de z-fighting sur les faces de contact internes
 *   entre sous-volumes adjacents (ex. allège vs tranche pleine).
 */
export function createDefaultMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0xc8c4bc,
    roughness: 0.8,
    metalness: 0.0,
    side: THREE.FrontSide,
  });
}
