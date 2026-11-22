/**
 * @tabax/core
 * Noyau métier, modèle documentaire et gestionnaire de commandes transactionnelles pour Mini-BIM.
 *
 * Indépendant de React, Three.js et du DOM.
 */

export { BimDocument } from './document.js';
export type {
  BimState,
  Wall,
  WallType,
  Slab,
  SlabType,
  Stair,
  StairType,
  Roof,
  RoofType,
  RoofOpening,
  RoofFamily,
  FlatRoofType,
  GableRoofType,
  ComponentFamily,
  ComponentSubType,
  ComponentType,
  ComponentPlacement,
  Component,
  DoorType,
  WindowType,
  TopConstraint,
  WallTopConstraint,
  Level,
  Layer,
  ElementId,
  CommandResult,
  DocumentListener,
  OpeningBase,
  Door,
  Window,
  Opening,
  DoorSwing,
  DoorSwingSide,
  DoorSwingDirection,
  Room,
  Dimension,
  DimensionType,
  V1BimState,
  V1Door,
  V1Window,
  SectionCut,
} from './types.js';
export * as Commands from './commands.js';
export {
  type Command,
  type UpdateLevelOptions,
  type MoveWallOptions,
  AddWallCommand,
  UpdateWallCommand,
  MoveWallCommand,
  DeleteWallCommand,
  AddWallTypeCommand,
  UpdateWallTypeCommand,
  DeleteWallTypeCommand,
  AddLevelCommand,
  UpdateLevelCommand,
  DeleteLevelCommand,
  AddDoorCommand,
  AddWindowCommand,
  UpdateDoorCommand,
  UpdateWindowCommand,
  DeleteOpeningCommand,
  MoveOpeningCommand,
  AddRoomCommand,
  UpdateRoomCommand,
  DeleteRoomCommand,
  AddDimensionCommand,
  UpdateDimensionCommand,
  DeleteDimensionCommand,
  AddSlabTypeCommand,
  UpdateSlabTypeCommand,
  DeleteSlabTypeCommand,
  AddSlabCommand,
  UpdateSlabCommand,
  DeleteSlabCommand,
  AddStairTypeCommand,
  UpdateStairTypeCommand,
  DeleteStairTypeCommand,
  AddStairCommand,
  UpdateStairCommand,
  DeleteStairCommand,
  AddRoofTypeCommand,
  UpdateRoofTypeCommand,
  DeleteRoofTypeCommand,
  AddRoofCommand,
  UpdateRoofCommand,
  DeleteRoofCommand,
  AddRoofOpeningCommand,
  UpdateRoofOpeningCommand,
  DeleteRoofOpeningCommand,
  AddComponentTypeCommand,
  UpdateComponentTypeCommand,
  DeleteComponentTypeCommand,
  AddComponentCommand,
  UpdateComponentCommand,
  DeleteComponentCommand,
  AddSectionCutCommand,
  UpdateSectionCutCommand,
  DeleteSectionCutCommand,
  AutoGenerateViewsCommand,
} from './commands.js';
export {
  BimValidationError,
  type RuleViolation,
  auditDocumentState,
  validateWall,
  validateWallType,
  validateLevel,
  validateDoor,
  validateWindow,
  validateSlab,
  validateSlabType,
  checkSlabViolations,
  checkSlabTypeViolations,
  validateStair,
  validateStairType,
  validateStairBlondel,
  checkStairViolations,
  checkStairTypeViolations,
  validateRoof,
  validateRoofType,
  validateRoofOpening,
  checkRoofViolations,
  checkRoofTypeViolations,
  checkRoofOpeningViolations,
  canDeleteRoof,
  canDeleteRoofType,
  validateComponent,
  validateComponentType,
  validateSectionCut,
  checkSectionCutViolations,
  checkComponentViolations,
  checkComponentTypeViolations,
  checkComponentCollisions,
  checkFunctionalClearance,
  getComponentObbVertices,
  getComponentClearanceVertices,
  doConvexPolygonsIntersect,
  canDeleteComponentType,
  validateRoom,
  validateDimension,
  canDeleteWall,
  canDeleteLevel,
  canDeleteWallType,
  collectViolationsForDirty,
  validateDirty,
} from './rules.js';
export {
  computeStairGeometry,
  computeStairShaft,
  computeHeadroom,
  computeHeadroomCutoffStep,
  type StairGeometry,
  type StairShaftOptions,
} from './stairs.js';
export { getSortedLevels, getLevelStoryHeight, setStoryHeight } from './levels.js';
export { generateId } from './ids.js';
export { toJSON, fromJSON } from './serialization.js';
export { HistoryStack, type HistoryEntry } from './history.js';
export * from './roofs/index.js';
export * from './components/catalog.js';
export * from './components/dimensions.js';
export * from './rooms/index.js';
export * from './metrics.js';
export { computeDimensionValue, computeAutoDimensionsForLevel } from './dimensions/index.js';
export {
  exportToIfc,
  escapeStepString,
  escapeIfcString,
  type IfcExportOptions,
} from './ifc/generator.js';
export {
  computeWallEffectiveHeight,
  computeWallVerticalBounds,
  computeWallSlabPenetration,
  type ComputeWallEffectiveHeightOptions,
  type WallEffectiveHeightResult,
} from './walls.js';
export {
  resolveWallGeometry,
  computeWallPolygonalSideArea,
  getWallLocalHeadroom,
  type ResolvedWall,
  type ResolvedOpening,
} from './walls/resolve.js';
export { DependencyGraph, type ReadonlyDependencyGraph } from './dag/DependencyGraph.js';
export { RELATIONS_REGISTRY } from './relations/registry.js';
export {
  ENTITY_CATEGORY_DESCRIPTORS,
  getCategoryDescriptor,
  type CategoryDescriptor,
} from './relations/descriptors.js';
export { resolveCascadeDeletions, type CascadeResult } from './relations/cascade.js';
export type { RelationDef, CascadeAction, EntityCategory } from './relations/types.js';
export {
  createComplexVillaState,
  createComplexVillaDocument,
} from './fixtures/complex-villa.js';
export {
  generateSyntheticBimModel,
  type SyntheticModelConfig,
  type SyntheticModelBreakdown,
  type SyntheticModelResult,
} from './perf/synthetic-generator.js';
export {
  runBenchmark,
  type BenchmarkMetrics,
  type BenchmarkOptions,
} from './perf/stats.js';
export * from './mep/index.js';
export * from './clash/index.js';
export * as Federation from './federation/index.js';
export * from './federation/types.js';
export * from './section/index.js';
