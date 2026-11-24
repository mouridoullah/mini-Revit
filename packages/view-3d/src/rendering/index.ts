/**
 * @tabax/view-3d/rendering — re-exports publics
 */

export { EnvironmentManager } from './EnvironmentManager.js';
export type { EnvironmentManagerOptions, ShadowQuality } from './EnvironmentManager.js';
export { PostProcessingManager } from './PostProcessingManager.js';
export type { RenderMode } from './PostProcessingManager.js';
export { SectionCapManager } from './SectionCapManager.js';
export { ArchitecturalMeshManager } from './ArchitecturalMeshManager.js';
export { ArchitecturalGridManager } from './ArchitecturalGridManager.js';
export { DomainMeshFactory } from './DomainMeshFactory.js';
export type { ComponentMeshFamily } from './DomainMeshFactory.js';
export { ClashOverlayManager } from './ClashOverlayManager.js';
export { SelectionHighlightManager } from './SelectionHighlightManager.js';
export { CameraTransitionManager } from './CameraTransitionManager.js';
export {
  getProceduralTextures,
  disposeProceduralTextures,
} from './ProceduralTextures.js';
export type { ProceduralTextureSet } from './ProceduralTextures.js';
