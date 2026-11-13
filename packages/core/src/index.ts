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
} from './types.js';
export * as Commands from './commands.js';
export type { Command } from './commands.js';
export {
  BimValidationError,
  validateWall,
  validateWallType,
  validateLevel,
  canDeleteLevel,
  canDeleteWallType,
} from './rules.js';
export { generateId } from './ids.js';
export { toJSON, fromJSON } from './serialization.js';
export { HistoryStack, type HistoryEntry } from './history.js';
