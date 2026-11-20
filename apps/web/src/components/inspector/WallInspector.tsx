import {
  Commands,
  type Wall,
  type BimState,
  computeWallEffectiveHeight,
  computeWallSlabPenetration,
} from '@mini-bim/core';
import { DebouncedNumberInput } from './DebouncedInputs.js';

export interface WallInspectorProps {
  readonly wall: Wall;
  readonly state: BimState;
  readonly onExecute: (cmd: Commands.Command) => void;
}

export function WallInspector({ wall, state, onExecute }: WallInspectorProps) {
  const isAuto = wall.heightOverride === undefined;
  const effectiveH = computeWallEffectiveHeight(wall, state);
  const wallType = state.wallTypes[wall.typeId];

  // Calcul de pénétration de dalle si mode Fixe (sans faux positif horizontal)
  const penetrationMm = computeWallSlabPenetration(wall, state);

  return (
    <div data-testid="inspector-wall-panel">
      <div
        style={{ fontSize: '13px', fontWeight: 600, color: '#60a5fa', marginBottom: '12px' }}
      >
        Mur
      </div>
      <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '8px' }}>
        ID : <span data-testid="wall-id">{wall.id}</span>
      </div>

      <div
        style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '10px' }}
      >
        <label style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 500 }}>
          Type de mur
        </label>
        <select
          data-testid="wall-type-select"
          value={wall.typeId}
          onChange={(e) => {
            onExecute(new Commands.UpdateWallCommand(wall.id, { typeId: e.target.value }));
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
          {Object.values(state.wallTypes).map((wt) => (
            <option key={wt.id} value={wt.id}>
              {wt.name} ({wt.thickness}mm)
            </option>
          ))}
        </select>
      </div>

      {/* Mode Hauteur : Auto vs Fixe */}
      <div
        style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '10px' }}
      >
        <label style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 500 }}>
          Mode de hauteur
        </label>
        <div data-testid="wall-height-mode-toggle" style={{ display: 'flex', gap: '4px' }}>
          <button
            type="button"
            data-testid="wall-height-mode-auto"
            onClick={() => {
              if (!isAuto) {
                onExecute(new Commands.UpdateWallCommand(wall.id, { heightOverride: undefined }));
              }
            }}
            style={{
              flex: 1,
              padding: '5px',
              fontSize: '11px',
              borderRadius: '4px',
              backgroundColor: isAuto ? '#2563eb' : '#374151',
              color: isAuto ? '#ffffff' : '#9ca3af',
              border: isAuto ? '1px solid #3b82f6' : '1px solid #4b5563',
              cursor: 'pointer',
            }}
          >
            Auto (Niveau/Dalle)
          </button>
          <button
            type="button"
            data-testid="wall-height-mode-fixe"
            onClick={() => {
              if (isAuto) {
                const fallbackH = effectiveH;
                onExecute(new Commands.UpdateWallCommand(wall.id, { heightOverride: fallbackH }));
              }
            }}
            style={{
              flex: 1,
              padding: '5px',
              fontSize: '11px',
              borderRadius: '4px',
              backgroundColor: !isAuto ? '#2563eb' : '#374151',
              color: !isAuto ? '#ffffff' : '#9ca3af',
              border: !isAuto ? '1px solid #3b82f6' : '1px solid #4b5563',
              cursor: 'pointer',
            }}
          >
            Fixe (Libre)
          </button>
        </div>
      </div>

      {!isAuto ? (
        <DebouncedNumberInput
          testId="wall-height-input"
          label="Hauteur libre (heightOverride)"
          min={100}
          max={20000}
          value={wall.heightOverride}
          onChange={(h) => {
            onExecute(new Commands.UpdateWallCommand(wall.id, { heightOverride: h }));
          }}
        />
      ) : (
        <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '10px' }}>
          Hauteur effective : <strong>{effectiveH} mm</strong>
        </div>
      )}

      {penetrationMm > 0 && (
        <div
          data-testid="wall-penetration-warning"
          style={{
            backgroundColor: '#78350f',
            color: '#fef3c7',
            padding: '6px 10px',
            borderRadius: '4px',
            fontSize: '11px',
            marginBottom: '10px',
            border: '1px solid #d97706',
          }}
        >
          Pénétration dans la dalle supérieure (+{Math.round(penetrationMm)} mm)
        </div>
      )}

      <DebouncedNumberInput
        testId="wall-base-offset-input"
        label="Décalage inférieur (baseOffset)"
        value={wall.baseOffset ?? 0}
        onChange={(bo) => {
          onExecute(new Commands.UpdateWallCommand(wall.id, { baseOffset: bo }));
        }}
      />

      <div style={{ marginTop: '12px', borderTop: '1px solid #374151', paddingTop: '10px' }}>
        <div style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 600, marginBottom: '8px' }}>
          Sémantique BIM (IFC Pset_WallCommon)
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <label style={{ fontSize: '11px', color: '#9ca3af' }}>Fonction porteuse (LoadBearing)</label>
            <select
              data-testid="wall-load-bearing-select"
              value={wall.loadBearing === undefined ? 'inherit' : wall.loadBearing ? 'true' : 'false'}
              onChange={(e) => {
                const val = e.target.value;
                onExecute(
                  new Commands.UpdateWallCommand(wall.id, {
                    loadBearing: val === 'inherit' ? undefined : val === 'true',
                  }),
                );
              }}
              style={{
                padding: '4px 6px',
                fontSize: '11px',
                borderRadius: '4px',
                backgroundColor: '#1f2937',
                color: '#f3f4f6',
                border: '1px solid #4b5563',
              }}
            >
              <option value="inherit">
                Hérité du type (
                {wallType?.loadBearing !== undefined
                  ? wallType.loadBearing
                    ? 'Porteur'
                    : 'Non porteur'
                  : 'Non spécifié'}
                )
              </option>
              <option value="true">Oui (Porteur)</option>
              <option value="false">Non (Non porteur)</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <label style={{ fontSize: '11px', color: '#9ca3af' }}>Position de façade (IsExternal)</label>
            <select
              data-testid="wall-is-external-select"
              value={wall.isExternal === undefined ? 'inherit' : wall.isExternal ? 'true' : 'false'}
              onChange={(e) => {
                const val = e.target.value;
                onExecute(
                  new Commands.UpdateWallCommand(wall.id, {
                    isExternal: val === 'inherit' ? undefined : val === 'true',
                  }),
                );
              }}
              style={{
                padding: '4px 6px',
                fontSize: '11px',
                borderRadius: '4px',
                backgroundColor: '#1f2937',
                color: '#f3f4f6',
                border: '1px solid #4b5563',
              }}
            >
              <option value="inherit">
                Hérité du type (
                {wallType?.isExternal !== undefined
                  ? wallType.isExternal
                    ? 'Extérieur'
                    : 'Intérieur'
                  : 'Non spécifié'}
                )
              </option>
              <option value="true">Oui (Extérieur)</option>
              <option value="false">Non (Intérieur)</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
