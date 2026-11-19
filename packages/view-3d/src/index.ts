/**
 * @mini-bim/view-3d
 * Moteur de rendu et gestionnaire de scène 3D Three.js pour Mini-BIM.
 *
 * Indépendant de React : API impérative pure pour affichage 3D,
 * contrôles orbitaux et conversion de maillages architecturaux.
 */

export { MeshAdapter } from './MeshAdapter.js';
export { Scene3D, type ComponentMeshFamily } from './Scene3D.js';
export {
  createDefaultMaterial,
  createHighlightMaterial,
  createDoorPlaceholderMaterial,
  createWindowPlaceholderMaterial,
  createSanitaryMaterial,
  createKitchenMaterial,
  createFurnitureMaterial,
  createGlazingMaterial,
  createMepMaterial,
} from './materials.js';
export {
  createComponentMesh,
  type ComponentMeshInput,
  type ComponentTypeMeshInput,
} from './components-3d.js';
export {
  createWallMesh,
  createWallMeshWithOpenings,
  createOpeningPlaceholder,
  createRoomFloorMesh,
  createSlabMesh,
  createStairMesh,
  createRoofMesh,
  generatePipeMesh,
  generateDuctMesh,
  generateCableTrayMesh,
  generateFittingMesh,
  generateEquipmentMesh,
  generateMepMeshes,
  getMepSystemColor,
  MEP_SYSTEM_COLORS,
  type WallGeometryParams,
  type WallTypeGeometryParams,
  type OpeningGeometryParams,
  type WallWithOpeningsParams,
  type RoomFloorMeshParams,
  type SlabGeometryParams,
  type SlabTypeGeometryParams,
  type StairGeometryParams,
  type StairTypeGeometryParams,
  type RoofGeometryParams,
  type RoofTypeGeometryParams,
  type FlatRoofTypeGeometryParams,
  type GableRoofTypeGeometryParams,
  type Point3DParams,
  type PipeGeometryParams,
  type DuctGeometryParams,
  type CableTrayGeometryParams,
  type MepFittingGeometryParams,
  type MepEquipmentGeometryParams,
  type MepPortGeometryParams,
} from './mesh-generator.js';
export {
  computeWallFootprint2d,
  extrudeWallPiece,
  solveWallJunctions,
  type RawMeshData,
  type WallInput,
  type ResolvedWall,
  type JunctionSolution,
} from '@mini-bim/geometry';
export type { SceneOptions, MeshHandle } from './types.js';
