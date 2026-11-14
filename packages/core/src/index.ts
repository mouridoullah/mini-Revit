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
} from './types.js';
export * as Commands from './commands.js';
export {
  type Command,
  AddWallCommand,
  UpdateWallCommand,
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
} from './commands.js';
export {
  BimValidationError,
  validateWall,
  validateWallType,
  validateLevel,
  validateDoor,
  validateWindow,
  validateRoom,
  validateDimension,
  canDeleteWall,
  canDeleteLevel,
  canDeleteWallType,
} from './rules.js';
export { generateId } from './ids.js';
export { toJSON, fromJSON } from './serialization.js';
export { HistoryStack, type HistoryEntry } from './history.js';
export * from './rooms/index.js';
export * from './metrics.js';
export { computeDimensionValue } from './dimensions/index.js';
export { exportToIfc, type IfcExportOptions } from './ifc/generator.js';
