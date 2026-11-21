import {
  Commands,
  type Roof,
  type BimState,
} from '@mini-bim/core';
import { DebouncedTextInput, DebouncedNumberInput } from './DebouncedInputs.js';

export interface RoofInspectorProps {
  readonly roof: Roof;
  readonly state: BimState;
  readonly onExecute: (cmd: Commands.Command) => void;
}

export function RoofInspector({ roof, state, onExecute }: RoofInspectorProps) {
  const roofTypes = state.roofTypes ?? {};
  const currentRoofType = roofTypes[roof.roofTypeId];
  const isGable = currentRoofType?.family === 'gable';
  const level = state.levels[roof.levelId];

  return (
    <div data-testid="inspector-roof-panel">
      <div
        style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-warning)', marginBottom: '12px' }}
      >
        {isGable ? 'Toiture à 2 pans' : 'Toiture terrasse (Toit plat)'}
      </div>

      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
        ID : <span data-testid="roof-id">{roof.id}</span>
      </div>

      <DebouncedTextInput
        testId="roof-name-input"
        label="Nom"
        value={roof.name ?? 'Toiture'}
        onChange={(name) => {
          onExecute(new Commands.UpdateRoofCommand(roof.id, { name }));
        }}
      />

      <div
        style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '10px' }}
      >
        <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Type de toiture</label>
        <select
          data-testid="roof-type-select"
          value={roof.roofTypeId}
          onChange={(e) => {
            onExecute(new Commands.UpdateRoofCommand(roof.id, { roofTypeId: e.target.value }));
          }}
          style={{
            padding: '5px 8px',
            fontSize: '12px',
            borderRadius: '4px',
            backgroundColor: 'var(--bg-card)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          {Object.values(roofTypes).map((rt) => (
            <option key={rt.id} value={rt.id}>
              {rt.name} ({rt.family === 'gable' ? `${rt.slopeDeg}°` : `${rt.thickness}mm`})
            </option>
          ))}
        </select>
      </div>

      <div style={{ fontSize: '12px', color: 'var(--text-primary)', marginBottom: '6px' }}>
        Niveau d'assise : {level?.name ?? 'Niveau 0'}
      </div>

      <DebouncedNumberInput
        testId="roof-base-offset-input"
        label="Décalage vertical (baseOffset mm)"
        value={roof.baseOffset ?? 0}
        step={50}
        onChange={(baseOffset) => {
          onExecute(new Commands.UpdateRoofCommand(roof.id, { baseOffset }));
        }}
      />

      {isGable && (
        <>
          <DebouncedNumberInput
            testId="roof-slope-input"
            label="Pente (°)"
            value={roof.slopeOverrideDeg ?? (currentRoofType && currentRoofType.family === 'gable' ? currentRoofType.slopeDeg : 35)}
            min={5}
            max={60}
            step={1}
            onChange={(slopeOverrideDeg) => {
              onExecute(new Commands.UpdateRoofCommand(roof.id, { slopeOverrideDeg }));
            }}
          />

          <DebouncedNumberInput
            testId="roof-overhang-input"
            label="Débord de toiture (mm)"
            value={roof.overhangOverrideMm ?? (currentRoofType && currentRoofType.family === 'gable' ? (currentRoofType.overhangMm ?? 0) : 0)}
            min={0}
            max={2000}
            step={50}
            onChange={(overhangOverrideMm) => {
              onExecute(new Commands.UpdateRoofCommand(roof.id, { overhangOverrideMm }));
            }}
          />
        </>
      )}

      <button
        type="button"
        data-testid="delete-roof-btn"
        onClick={() => {
          onExecute(new Commands.DeleteRoofCommand(roof.id));
        }}
        style={{
          width: '100%',
          padding: '6px 10px',
          fontSize: '11px',
          fontWeight: 500,
          borderRadius: '4px',
          backgroundColor: '#dc2626',
          color: '#ffffff',
          border: 'none',
          cursor: 'pointer',
          marginTop: '12px',
        }}
      >
        Supprimer la toiture
      </button>
    </div>
  );
}
