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

/**
 * Crée le matériau PBR de surbrillance pour les éléments architecturaux sélectionnés.
 * Émet une composante bleutée (#2563eb) visible sous tous les angles d'éclairage.
 */
export function createHighlightMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x60a5fa,
    emissive: new THREE.Color(0x2563eb),
    emissiveIntensity: 0.5,
    roughness: 0.6,
    metalness: 0.1,
    side: THREE.FrontSide,
  });
}

/**
 * Matériau pour les placeholders de portes (bois architectural chaud #8b5a2b).
 */
export function createDoorPlaceholderMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x8b5a2b,
    roughness: 0.7,
    metalness: 0.0,
    side: THREE.FrontSide,
  });
}

/**
 * Matériau pour les placeholders de fenêtres (vitrage translucide bleu ciel #90caf9).
 */
export function createWindowPlaceholderMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x90caf9,
    transparent: true,
    opacity: 0.5,
    roughness: 0.1,
    metalness: 0.1,
    side: THREE.DoubleSide,
  });
}
