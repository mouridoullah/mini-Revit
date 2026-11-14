/**
 * @mini-bim/view-3d
 * Moteur de rendu et gestionnaire de scène 3D Three.js pour Mini-BIM.
 *
 * Indépendant de React : API impérative pure pour affichage 3D,
 * contrôles orbitaux et conversion de maillages architecturaux.
 */

export { MeshAdapter } from './MeshAdapter.js';
export { Scene3D } from './Scene3D.js';
export { createDefaultMaterial } from './materials.js';
export {
  createWallMesh,
  type WallGeometryParams,
  type WallTypeGeometryParams,
} from './mesh-generator.js';
export { computeWallFootprint2d, extrudeWallPiece, type RawMeshData } from '@mini-bim/geometry';
export type { SceneOptions, MeshHandle } from './types.js';
