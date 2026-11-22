import {
  Commands,
  type Level,
  type BimState,
  type BimDocument,
  getSortedLevels,
  getLevelStoryHeight,
  setStoryHeight,
} from '@tabax/core';
import { DebouncedTextInput, DebouncedNumberInput } from './DebouncedInputs.js';

export interface LevelInspectorProps {
  readonly level: Level;
  readonly state: BimState;
  readonly doc: BimDocument;
  readonly onExecute: (cmd: Commands.Command) => void;
  readonly onForceUpdate: () => void;
}

export function LevelInspector({
  level,
  state,
  doc,
  onExecute,
  onForceUpdate,
}: LevelInspectorProps) {
  const sortedLevels = getSortedLevels(state.levels);
  const levelIndex = sortedLevels.findIndex((l) => l.id === level.id);
  const storyH = getLevelStoryHeight(state, level.id);

  return (
    <div data-testid="inspector-level-panel">
      <div
        style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-primary)', marginBottom: '12px' }}
      >
        Niveau
      </div>
      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
        ID : <span data-testid="level-id">{level.id}</span>
      </div>

      <DebouncedTextInput
        testId="level-name-input"
        label="Nom"
        value={level.name}
        onChange={(name) => {
          onExecute(new Commands.UpdateLevelCommand(level.id, { name }));
        }}
      />

      <DebouncedNumberInput
        testId="level-elevation-input"
        label="Élévation"
        value={level.elevation}
        onChange={(elevation) => {
          onExecute(new Commands.UpdateLevelCommand(level.id, { elevation }));
        }}
      />

      {storyH !== undefined && (
        <DebouncedNumberInput
          testId="level-story-height-input"
          label="Hauteur sous plafond (storyHeight)"
          min={100}
          max={10000}
          value={storyH}
          onChange={(sh) => {
            if (levelIndex >= 0) {
              setStoryHeight(doc, levelIndex, sh);
              onForceUpdate();
            }
          }}
        />
      )}
    </div>
  );
}
