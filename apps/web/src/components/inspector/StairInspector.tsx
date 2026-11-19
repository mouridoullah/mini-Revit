import {
  Commands,
  type Stair,
  type BimState,
  computeStairGeometry,
} from '@mini-bim/core';
import { DebouncedTextInput, DebouncedNumberInput } from './DebouncedInputs.js';

export interface StairInspectorProps {
  readonly stair: Stair;
  readonly state: BimState;
  readonly onExecute: (cmd: Commands.Command) => void;
}

export function StairInspector({ stair, state, onExecute }: StairInspectorProps) {
  const currentStairType = state.stairTypes?.[stair.stairTypeId];
  const bottomLevel = state.levels[stair.bottomLevelId];
  const topLevel = state.levels[stair.topLevelId];
  const geom = computeStairGeometry(stair, state);
  const blondel = 2 * geom.stepHeight + geom.stepDepth;

  // Blondel Badge (Vert / Jaune / Rouge selon D3)
  let badgeColor = '#10b981'; // Vert (confort)
  let badgeBg = 'rgba(16, 185, 129, 0.15)';
  let badgeLabel = 'Conforme (Confort)';

  if (blondel < 560 || blondel > 680) {
    badgeColor = '#ef4444'; // Rouge (sécurité)
    badgeBg = 'rgba(239, 68, 68, 0.15)';
    badgeLabel = 'Hors Sécurité';
  } else if (!geom.isCompliant) {
    badgeColor = '#f59e0b'; // Jaune (ergonomie)
    badgeBg = 'rgba(245, 158, 11, 0.15)';
    badgeLabel = 'Hors Confort';
  }

  return (
    <div data-testid="inspector-stair-panel">
      <div
        style={{ fontSize: '13px', fontWeight: 600, color: '#f59e0b', marginBottom: '12px' }}
      >
        Escalier Droit Paramétrique
      </div>
      <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '8px' }}>
        ID : <span data-testid="stair-id">{stair.id}</span>
      </div>

      <DebouncedTextInput
        testId="stair-name-input"
        label="Nom"
        value={stair.name ?? 'Escalier'}
        onChange={(name) => {
          onExecute(new Commands.UpdateStairCommand(stair.id, { name }));
        }}
      />

      <div
        style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '10px' }}
      >
        <label style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 500 }}>
          Type d'escalier
        </label>
        <select
          data-testid="stair-type-select"
          value={stair.stairTypeId}
          onChange={(e) => {
            onExecute(new Commands.UpdateStairCommand(stair.id, { stairTypeId: e.target.value }));
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
          {Object.values(state.stairTypes ?? {}).map((st) => (
            <option key={st.id} value={st.id}>
              {st.name} ({st.width}mm)
            </option>
          ))}
        </select>
      </div>

      <DebouncedNumberInput
        testId="stair-width-input"
        label="Largeur de volée"
        value={stair.widthOverride ?? currentStairType?.width ?? 900}
        min={500}
        max={2000}
        step={50}
        onChange={(widthOverride) => {
          onExecute(new Commands.UpdateStairCommand(stair.id, { widthOverride }));
        }}
      />

      <div style={{ fontSize: '12px', color: '#d1d5db', marginBottom: '6px' }}>
        Niveaux : {bottomLevel?.name ?? 'Niveau bas'} → {topLevel?.name ?? 'Niveau haut'}
      </div>

      <div
        data-testid="stair-rise-display"
        style={{ fontSize: '12px', color: '#d1d5db', marginBottom: '6px' }}
      >
        Dénivelée (ΔZ) : <strong>{Math.round(geom.totalRise)} mm</strong>
      </div>

      <div
        data-testid="stair-steps-display"
        style={{ fontSize: '12px', color: '#d1d5db', marginBottom: '6px' }}
      >
        Nombre de marches (N) : <strong>{geom.numberOfSteps}</strong>
      </div>

      <div
        data-testid="stair-riser-display"
        style={{ fontSize: '12px', color: '#d1d5db', marginBottom: '6px' }}
      >
        Contremarche (h) : <strong>{geom.stepHeight.toFixed(1)} mm</strong>
      </div>

      <div
        data-testid="stair-tread-display"
        style={{ fontSize: '12px', color: '#d1d5db', marginBottom: '10px' }}
      >
        Giron (g) : <strong>{geom.stepDepth.toFixed(1)} mm</strong>
      </div>

      {/* Badge Blondel */}
      <div
        data-testid="stair-blondel-badge"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 10px',
          borderRadius: '4px',
          backgroundColor: badgeBg,
          border: `1px solid ${badgeColor}`,
          color: badgeColor,
          fontSize: '11px',
          fontWeight: 600,
          marginBottom: '12px',
        }}
      >
        <span>2h + g = {Math.round(blondel)} mm</span>
        <span>{badgeLabel}</span>
      </div>

      {geom.warnings.length > 0 && (
        <div
          data-testid="stair-warnings"
          style={{
            fontSize: '10px',
            color: '#f87171',
            marginBottom: '12px',
            lineHeight: '1.4',
          }}
        >
          {geom.warnings.map((w, idx) => (
            <div key={idx}>• {w}</div>
          ))}
        </div>
      )}

      {/* Bouton Inverser le sens */}
      <button
        type="button"
        data-testid="stair-invert-direction-btn"
        onClick={() => {
          onExecute(new Commands.UpdateStairCommand(stair.id, { start: stair.end, end: stair.start }));
        }}
        style={{
          width: '100%',
          padding: '6px 10px',
          fontSize: '11px',
          fontWeight: 500,
          borderRadius: '4px',
          backgroundColor: '#374151',
          color: '#f3f4f6',
          border: '1px solid #4b5563',
          cursor: 'pointer',
          marginBottom: '10px',
        }}
      >
        ⇄ Inverser le sens de montée
      </button>
    </div>
  );
}
