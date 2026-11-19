import {
  Commands,
  type Window,
  type BimState,
} from '@mini-bim/core';
import { DebouncedNumberInput } from './DebouncedInputs.js';

export interface WindowInspectorProps {
  readonly window: Window;
  readonly state: BimState;
  readonly onExecute: (cmd: Commands.Command) => void;
}

export function WindowInspector({ window, state, onExecute }: WindowInspectorProps) {
  return (
    <div data-testid="inspector-window-panel">
      <div
        style={{ fontSize: '13px', fontWeight: 600, color: '#38bdf8', marginBottom: '12px' }}
      >
        Fenêtre
      </div>
      <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '8px' }}>
        ID : <span data-testid="window-id">{window.id}</span>
      </div>

      <div
        style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '10px' }}
      >
        <label style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 500 }}>
          Type de fenêtre
        </label>
        <select
          data-testid="window-type-select"
          value={window.windowTypeId}
          onChange={(e) => {
            onExecute(
              new Commands.UpdateWindowCommand(window.id, { windowTypeId: e.target.value }),
            );
          }}
          style={{
            padding: '5px 8px',
            fontSize: '12px',
            borderRadius: '4px',
            backgroundColor: '#1f2937',
            color: '#f3f4f6',
            border: '1px solid #4b5563',
            outline: 'none',
          }}
        >
          {Object.values(state.windowTypes ?? {}).map((wt) => (
            <option key={wt.id} value={wt.id}>
              {wt.name} ({wt.width}×{wt.height}mm)
            </option>
          ))}
        </select>
      </div>

      <DebouncedNumberInput
        testId="window-sill-height-input"
        label="Hauteur d’allège (sillHeight)"
        value={window.sillHeight}
        onChange={(sh) => {
          onExecute(new Commands.UpdateWindowCommand(window.id, { sillHeight: sh }));
        }}
      />

      <DebouncedNumberInput
        testId="window-offset-input"
        label="Position le long du mur (offsetAlong)"
        value={window.offsetAlong}
        onChange={(off) => {
          onExecute(new Commands.UpdateWindowCommand(window.id, { offsetAlong: off }));
        }}
      />
    </div>
  );
}
