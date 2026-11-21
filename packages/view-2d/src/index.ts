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
  DEFAULT_ROOM_RENDER_CONFIG,
  DEFAULT_DIMENSION_RENDER_CONFIG,
  DEFAULT_SLAB_RENDER_CONFIG,
  DEFAULT_STAIR_RENDER_CONFIG,
  DEFAULT_ROOF_RENDER_CONFIG,
  DEFAULT_UNDERLAY_RENDER_CONFIG,
  DEFAULT_MEP_RENDER_CONFIG,
  DEFAULT_VIEW2D_RENDER_CONFIG,
  MEP_2D_SYSTEM_COLORS,
  clearCanvas,
  drawGrid,
  drawWall,
  drawWalls,
  drawSlab,
  drawSlabs,
  drawStair,
  drawStairs,
  drawRoof,
  drawRoofs,
  drawMepElements,
  offsetPolygonSimple,
  drawUnderlay,
  drawRooms,
  drawRoomFills,
  drawRoomLabels,
  drawDimensions,
  drawOpeningDoor,
  drawOpeningWindow,
  drawOpenings,
  drawRoomDiagnostics,
  renderPlanView,
} from './renderer.js';
export {
  UnderlayCache,
  type UnderlayInput,
  type WallForUnderlay,
  type DoorForUnderlay,
  type WindowForUnderlay,
} from './underlay/UnderlayCache.js';
export { View2D } from './View2D.js';
export { generatePlanSvg, type PlanSvgOptions } from './svg-exporter.js';
export {
  isPointInsideOrNearFootprint,
  hitTestWall,
  findWallAtScreen,
  findOpeningAtScreen,
  findComponentAtScreen,
  findMepElementAtScreen,
  findMepPortAtScreen,
  type HitTestOptions,
  type HitOpeningResult,
  type HitMepElementResult,
  type HitMepPortResult,
} from './hit-test.js';
export {
  drawComponentSymbol,
  drawComponents,
  DEFAULT_COMPONENT_RENDER_CONFIG,
  type ComponentRenderConfig,
} from './components-2d.js';
export * from './spatial/index.js';

