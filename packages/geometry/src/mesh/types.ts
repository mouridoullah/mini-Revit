import { type WallPieceRole } from '../openings/types.js';

/**
 * Vecteur 3D cartésien immuable (coordonnées en millimètres, Z-up).
 */
export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Boîte englobante 3D alignée sur les axes (AABB en mm).
 */
export interface BoundingBox3D {
  readonly min: Vec3;
  readonly max: Vec3;
}

/**
 * Structure de maillage brut typé et neutre, prête pour instanciation directe
 * en THREE.BufferGeometry dans le package @tabax/view-3d.
 *
 * Indépendante de Three.js, React et du DOM.
 */
export interface RawMeshData {
  /**
   * Coordonnées des sommets (x, y, z entrelacés en Float32Array, en mm).
   */
  readonly positions: Float32Array;
  /**
   * Vecteurs normaux unitaires (nx, ny, nz entrelacés en Float32Array, |n| = 1.0).
   */
  readonly normals: Float32Array;
  /**
   * Indices des triangles (triplets de sommets CCW vus de l'extérieur).
   */
  readonly indices: Uint32Array;
  /**
   * Coordonnées de texture UV optionnelles (u, v entrelacés).
   */
  readonly uvs?: Float32Array | undefined;
  /**
   * Identifiant de l'élément pour le raycasting et le picking architectural.
   */
  readonly elementId: string;
  /**
   * Rôle sémantique de la pièce de mur (pleine, allège, linteau).
   */
  readonly role: WallPieceRole;
  /**
   * Boîte englobante AABB 3D.
   */
  readonly boundingBox: BoundingBox3D;
  /**
   * Métadonnées architecturales libres attachées au maillage (ex. category: 'slab').
   */
  readonly userData?: Record<string, unknown> | undefined;
}

/**
 * Options de configuration du constructeur de maillage.
 */
export interface MeshBuildOptions {
  /**
   * Si true, calcule également les coordonnées UV cartésiennes.
   * Par défaut : true.
   */
  readonly generateUVs?: boolean | undefined;
  /**
   * Tolérance minimale sous laquelle une aire polygonale 2D est ignorée (en mm²).
   * Par défaut : 1e-4 mm².
   */
  readonly minArea?: number | undefined;
}
