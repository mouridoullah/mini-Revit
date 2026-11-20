import type * as THREE from 'three';
import type { WallPieceRole } from '@mini-bim/geometry';

/**
 * Options de configuration pour la scène 3D impérative Mini-BIM.
 */
export interface SceneOptions {
  /**
   * Élément canvas HTML fourni par l'hôte (Three.js ne crée pas le canvas).
   */
  readonly canvas: HTMLCanvasElement;

  /**
   * Largeur initiale du viewport en pixels.
   */
  readonly width: number;

  /**
   * Hauteur initiale du viewport en pixels.
   */
  readonly height: number;

  /**
   * Couleur d'arrière-plan de la scène (défaut : 0xf4f3ef, beige/gris architectural).
   */
  readonly background?: THREE.ColorRepresentation;

  /**
   * Dimension de la grille de sol en mm (défaut : 20 000 mm = 20 m).
   */
  readonly gridSize?: number;

  /**
   * Nombre de subdivisions de la grille (défaut : 20).
   */
  readonly gridDivisions?: number;

  /**
   * Position initiale de la caméra en mm (défaut : { x: 8000, y: 8000, z: 8000 }).
   */
  readonly cameraPosition?: { readonly x: number; readonly y: number; readonly z: number };

  /**
   * Point ciblé par la caméra et les contrôles orbitaux (défaut : { x: 0, y: 0, z: 0 }).
   */
  readonly cameraTarget?: { readonly x: number; readonly y: number; readonly z: number };
}

/**
 * Poignée de gestion d'un maillage instancié dans la scène 3D.
 */
export interface MeshHandle {
  /**
   * Identifiant de l'élément architectural hôte (ex: mur ou pièce de mur).
   */
  readonly elementId: string;

  /**
   * Rôle architectural de la pièce (ex: 'full', 'sill', 'lintel').
   */
  readonly role?: WallPieceRole;

  /**
   * Instance du maillage Three.js.
   */
  readonly mesh: THREE.Mesh;

  /**
   * Géométrie tampon associée au maillage.
   */
  readonly geometry: THREE.BufferGeometry;

  /**
   * Matériau appliqué au maillage.
   */
  readonly material: THREE.Material;
}

/**
 * Données d'un conflit géométrique ou d'un dégagement pour superposition 3D.
 */
export interface ClashOverlayItem {
  readonly id?: string;
  readonly severity: 'hard' | 'clearance';
  readonly intersectionBox: {
    readonly min: { readonly x: number; readonly y: number; readonly z: number };
    readonly max: { readonly x: number; readonly y: number; readonly z: number };
  };
  readonly point?: { readonly x: number; readonly y: number; readonly z: number };
}

/**
 * Entité maillée d'une maquette IFC externe fédérée.
 */
export interface FederatedMeshItem {
  readonly expressId: number;
  readonly positions: Float32Array;
  readonly normals?: Float32Array;
  readonly indices?: Uint32Array;
  readonly color?: { readonly r: number; readonly g: number; readonly b: number; readonly a?: number };
}

/**
 * Représentation visuelle 3D complète d'une maquette IFC fédérée.
 */
export interface FederatedModelVisual {
  readonly id: string;
  readonly name: string;
  readonly items: readonly FederatedMeshItem[];
  readonly opacity?: number;
  readonly wireframe?: boolean;
  readonly offset?: { readonly x: number; readonly y: number; readonly z: number };
  readonly visible?: boolean;
}


