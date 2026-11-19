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
        style={{ fontSize: '13px', fontWeight: 600, color: '#34d399', marginBottom: '12px' }}
      >
        Dalle Structurelle
      </div>
      <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '8px' }}>
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
        <label style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 500 }}>
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
            backgroundColor: '#1f2937',
            color: '#f3f4f6',
            border: '1px solid #4b5563',
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
        style={{ fontSize: '12px', color: '#d1d5db', marginBottom: '10px' }}
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

      <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
        Réservations / Trémies : {(slab.holes?.length ?? 0) + (slab.openings?.length ?? 0)}
      </div>

      {currentSlabType && (
        <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #374151' }}>
          <div
            style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', marginBottom: '8px' }}
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
