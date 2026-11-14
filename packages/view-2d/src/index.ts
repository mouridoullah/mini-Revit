/**
 * @mini-bim/view-2d
 * Visualiseur et gestionnaire impératif de vue en plan 2D pour Mini-BIM.
 *
 * Utilise la Canvas 2D API pure. Indépendant de React et de Three.js.
 */

export * from './types.js';
export { Transform2D } from './transform.js';
export {
  DEFAULT_GRID_CONFIG,
  DEFAULT_WALL_RENDER_CONFIG,
  DEFAULT_VIEW2D_RENDER_CONFIG,
  clearCanvas,
  drawGrid,
  drawWall,
  drawWalls,
  drawOpeningDoor,
  drawOpeningWindow,
  drawOpenings,
  renderPlanView,
} from './renderer.js';
export { View2D } from './View2D.js';
export {
  isPointInsideOrNearFootprint,
  hitTestWall,
  findWallAtScreen,
  findOpeningAtScreen,
  type HitTestOptions,
  type HitOpeningResult,
} from './hit-test.js';
