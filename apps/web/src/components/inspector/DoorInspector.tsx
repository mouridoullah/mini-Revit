import {
  Commands,
  type Door,
  type BimState,
} from '@mini-bim/core';
import { DebouncedNumberInput } from './DebouncedInputs.js';

export interface DoorInspectorProps {
  readonly door: Door;
  readonly state: BimState;
  readonly onExecute: (cmd: Commands.Command) => void;
}

export function DoorInspector({ door, state, onExecute }: DoorInspectorProps) {
  return (
    <div data-testid="inspector-door-panel">
      <div
        style={{ fontSize: '13px', fontWeight: 600, color: '#f59e0b', marginBottom: '12px' }}
      >
        Porte
      </div>
      <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '8px' }}>
        ID : <span data-testid="door-id">{door.id}</span>
      </div>

      <div
        style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '10px' }}
      >
        <label style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 500 }}>
          Type de porte
        </label>
        <select
          data-testid="door-type-select"
          value={door.doorTypeId}
          onChange={(e) => {
            onExecute(new Commands.UpdateDoorCommand(door.id, { doorTypeId: e.target.value }));
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
          {Object.values(state.doorTypes ?? {}).map((dt) => (
            <option key={dt.id} value={dt.id}>
              {dt.name} ({dt.width}×{dt.height}mm)
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
        <button
          type="button"
          data-testid="door-swing-side-toggle"
          onClick={() => {
            onExecute(
              new Commands.UpdateDoorCommand(door.id, {
                swing: {
                  ...door.swing,
                  side: door.swing.side === 'left' ? 'right' : 'left',
                },
              }),
            );
          }}
          style={{
            flex: 1,
            padding: '5px',
            fontSize: '11px',
            borderRadius: '4px',
            backgroundColor: '#374151',
            color: '#f3f4f6',
            border: '1px solid #4b5563',
            cursor: 'pointer',
          }}
        >
          Côté : {door.swing.side === 'left' ? 'Gauche' : 'Droite'}
        </button>
        <button
          type="button"
          data-testid="door-swing-dir-toggle"
          onClick={() => {
            onExecute(
              new Commands.UpdateDoorCommand(door.id, {
                swing: {
                  ...door.swing,
                  direction: door.swing.direction === 'in' ? 'out' : 'in',
                },
              }),
            );
          }}
          style={{
            flex: 1,
            padding: '5px',
            fontSize: '11px',
            borderRadius: '4px',
            backgroundColor: '#374151',
            color: '#f3f4f6',
            border: '1px solid #4b5563',
            cursor: 'pointer',
          }}
        >
          Sens : {door.swing.direction === 'in' ? 'Intérieur' : 'Extérieur'}
        </button>
      </div>

      <DebouncedNumberInput
        testId="door-offset-input"
        label="Position le long du mur (offsetAlong)"
        value={door.offsetAlong}
        onChange={(off) => {
          onExecute(new Commands.UpdateDoorCommand(door.id, { offsetAlong: off }));
        }}
      />
    </div>
  );
}
