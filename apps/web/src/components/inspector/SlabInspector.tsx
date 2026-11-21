import {
  Commands,
  type Slab,
  type BimState,
} from '@mini-bim/core';
import { DebouncedTextInput, DebouncedNumberInput } from './DebouncedInputs.js';

export interface SlabInspectorProps {
  readonly slab: Slab;
  readonly state: BimState;
  readonly onExecute: (cmd: Commands.Command) => void;
}

export function SlabInspector({ slab, state, onExecute }: SlabInspectorProps) {
  const currentSlabType = state.slabTypes?.[slab.slabTypeId];

  return (
    <div data-testid="inspector-slab-panel">
      <div
        style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-success)', marginBottom: '12px' }}
      >
        Dalle Structurelle
      </div>
      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
        ID : <span data-testid="slab-id">{slab.id}</span>
      </div>

      <DebouncedTextInput
        testId="slab-name-input"
        label="Nom"
        value={slab.name ?? 'Dalle'}
        onChange={(name) => {
          onExecute(new Commands.UpdateSlabCommand(slab.id, { name }));
        }}
      />

      <div
        style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '10px' }}
      >
        <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500 }}>
          Type de dalle
        </label>
        <select
          data-testid="slab-type-select"
          value={slab.slabTypeId}
          onChange={(e) => {
            onExecute(new Commands.UpdateSlabCommand(slab.id, { slabTypeId: e.target.value }));
          }}
          style={{
            padding: '5px 8px',
            fontSize: '12px',
            borderRadius: '4px',
            backgroundColor: 'var(--bg-card)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-subtle)',
            outline: 'none',
          }}
        >
          {Object.values(state.slabTypes ?? {}).map((st) => (
            <option key={st.id} value={st.id}>
              {st.name} ({st.thickness}mm)
            </option>
          ))}
        </select>
      </div>

      <div
        data-testid="slab-thickness-display"
        style={{ fontSize: '12px', color: 'var(--text-primary)', marginBottom: '10px' }}
      >
        Épaisseur : <strong>{currentSlabType?.thickness ?? 200} mm</strong>
      </div>

      <DebouncedNumberInput
        testId="slab-base-offset-input"
        label="Décalage vertical (baseOffset)"
        value={slab.baseOffset ?? 0}
        onChange={(bo) => {
          onExecute(new Commands.UpdateSlabCommand(slab.id, { baseOffset: bo }));
        }}
      />

      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
        Réservations / Trémies : {(slab.holes?.length ?? 0) + (slab.openings?.length ?? 0)}
      </div>

      {currentSlabType && (
        <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)' }}>
          <div
            style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}
          >
            Édition du Type ({currentSlabType.name})
          </div>
          <DebouncedNumberInput
            testId="slab-type-thickness-input"
            label="Épaisseur du type"
            min={50}
            max={500}
            value={currentSlabType.thickness}
            onChange={(th) => {
              onExecute(
                new Commands.UpdateSlabTypeCommand(currentSlabType.id, { thickness: th }),
              );
            }}
          />
        </div>
      )}
    </div>
  );
}
