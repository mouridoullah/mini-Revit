/**
 * @mini-bim/core
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
  DoorType,
  WindowType,
  TopConstraint,
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
} from './commands.js';
export {
  BimValidationError,
  type RuleViolation,
  validateWall,
  validateWallType,
  validateLevel,
  validateDoor,
  validateWindow,
  validateSlab,
  validateSlabType,
  checkSlabViolations,
  checkSlabTypeViolations,
  validateRoom,
  validateDimension,
  canDeleteWall,
  canDeleteLevel,
  canDeleteWallType,
  collectViolationsForDirty,
  validateDirty,
} from './rules.js';
export { getSortedLevels, getLevelStoryHeight, setStoryHeight } from './levels.js';
export { generateId } from './ids.js';
export { toJSON, fromJSON } from './serialization.js';
export { HistoryStack, type HistoryEntry } from './history.js';
export * from './rooms/index.js';
export * from './metrics.js';
export { computeDimensionValue } from './dimensions/index.js';
export { exportToIfc, type IfcExportOptions } from './ifc/generator.js';
export { DependencyGraph } from './dag/DependencyGraph.js';
export { RELATIONS_REGISTRY } from './relations/registry.js';
export { resolveCascadeDeletions, type CascadeResult } from './relations/cascade.js';
export type { RelationDef, CascadeAction, EntityCategory } from './relations/types.js';
