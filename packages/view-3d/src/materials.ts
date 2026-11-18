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

/**
 * Matériau pour les équipements sanitaires (céramique blanche brillante #f8fafc).
 */
export function createSanitaryMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.25,
    metalness: 0.05,
    side: THREE.FrontSide,
  });
}

/**
 * Matériau pour les meubles de cuisine et électroménager (mélaminé/inox ardoise #64748b).
 */
export function createKitchenMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x64748b,
    roughness: 0.6,
    metalness: 0.2,
    side: THREE.FrontSide,
  });
}

/**
 * Matériau pour le mobilier d'aménagement intérieur (bois chaud ambré #b45309).
 */
export function createFurnitureMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0xb45309,
    roughness: 0.7,
    metalness: 0.0,
    side: THREE.FrontSide,
  });
}

/**
 * Matériau pour les menuiseries vitrées enrichies (alu et vitrage #38bdf8).
 */
export function createGlazingMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.6,
    roughness: 0.15,
    metalness: 0.1,
    side: THREE.DoubleSide,
  });
}
