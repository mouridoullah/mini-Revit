import { type BimState, type ElementId, type Level, type CommandResult } from './types.js';
import { BimDocument } from './document.js';
import { UpdateLevelCommand } from './commands.js';
import { BimValidationError } from './rules.js';

/**
 * Retourne la liste des niveaux d'un état ou d'une collection triée par ordre d'élévation croissante.
 * Source unique de vérité : l'élévation altimétrique (ADR-036 / MULTI_LEVEL_SPEC).
 */
export function getSortedLevels(levels: Record<ElementId, Level> | readonly Level[]): Level[] {
  const list = Array.isArray(levels) ? [...levels] : Object.values(levels);
  return list.sort((a, b) => a.elevation - b.elevation);
}

/**
 * Calcule la hauteur libre d'un étage (entre le niveau spécifié et le niveau immédiatement supérieur).
 * Retourne undefined si le niveau est le plus haut (niveau sommital).
 */
export function getLevelStoryHeight(
  state: BimState,
  levelOrId: Level | ElementId,
): number | undefined {
  const levelId = typeof levelOrId === 'string' ? levelOrId : levelOrId.id;
  const sorted = getSortedLevels(state.levels);
  const idx = sorted.findIndex((l) => l.id === levelId);
  if (idx === -1 || idx >= sorted.length - 1) {
    return undefined;
  }
  return sorted[idx + 1]!.elevation - sorted[idx]!.elevation;
}

/**
 * Helper métier pour définir la hauteur d'un étage (entre levelIndex et levelIndex + 1).
 * Calcule l'élévation absolue requise pour le niveau supérieur et émet ou retourne UpdateLevelCommand.
 */
export function setStoryHeight(doc: BimDocument, levelIndex: number, height: number): CommandResult;
export function setStoryHeight(
  state: BimState,
  levelIndex: number,
  height: number,
): UpdateLevelCommand;
export function setStoryHeight(
  docOrState: BimDocument | BimState,
  levelIndex: number,
  height: number,
): CommandResult | UpdateLevelCommand {
  const state = docOrState instanceof BimDocument ? docOrState.getState() : docOrState;
  const sorted = getSortedLevels(state.levels);

  if (levelIndex < 0 || levelIndex >= sorted.length - 1) {
    throw new BimValidationError(
      'LEVEL_INDEX_OUT_OF_BOUNDS',
      `Cannot set story height for level index ${levelIndex}: no superior level exists (total levels: ${sorted.length}).`,
      { offendingIds: sorted[levelIndex] ? [sorted[levelIndex]!.id] : [] },
    );
  }

  if (!Number.isFinite(height) || height <= 0) {
    throw new BimValidationError(
      'INVALID_STORY_HEIGHT',
      `Story height must be a positive finite number (got ${height} mm).`,
      { offendingIds: [sorted[levelIndex]!.id, sorted[levelIndex + 1]!.id] },
    );
  }

  const currentLevel = sorted[levelIndex]!;
  const nextLevel = sorted[levelIndex + 1]!;
  const newElevation = currentLevel.elevation + height;
  const cmd = new UpdateLevelCommand(nextLevel.id, { elevation: newElevation });

  if (docOrState instanceof BimDocument) {
    return docOrState.execute(cmd);
  }
  return cmd;
}
