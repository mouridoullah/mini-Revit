import {
  Commands,
  type Component,
  type BimState,
} from '@mini-bim/core';
import { DebouncedTextInput, DebouncedNumberInput } from './DebouncedInputs.js';

export interface ComponentInspectorProps {
  readonly comp: Component;
  readonly state: BimState;
  readonly onExecute: (cmd: Commands.Command) => void;
}

export function ComponentInspector({ comp, state, onExecute }: ComponentInspectorProps) {
  const compTypes = state.componentTypes ?? {};
  const compType = compTypes[comp.typeId];
  const level = state.levels[comp.levelId];
  const rotationDeg = Math.round(((comp.placement.rotation ?? 0) * 180) / Math.PI);

  const familyLabels: Record<string, string> = {
    sanitary: 'Sanitaire',
    kitchen: 'Cuisine',
    furniture: 'Mobilier',
    glazing: 'Menuiserie',
  };
  const familyColor: Record<string, string> = {
    sanitary: '#38bdf8',
    kitchen: '#f59e0b',
    furniture: '#a855f7',
    glazing: '#10b981',
  };
  const famName = compType ? (familyLabels[compType.family] ?? compType.family) : 'Composant';
  const famColor = compType ? (familyColor[compType.family] ?? '#60a5fa') : '#60a5fa';

  return (
    <div data-testid="inspector-component-panel">
      <div
        style={{ fontSize: '13px', fontWeight: 600, color: famColor, marginBottom: '12px' }}
      >
        {compType ? `${famName} — ${compType.name}` : 'Composant'}
      </div>

      <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '8px' }}>
        ID : <span data-testid="component-id">{comp.id}</span>
      </div>

      <DebouncedTextInput
        testId="component-name-input"
        label="Nom"
        value={comp.name ?? compType?.name ?? 'Composant'}
        onChange={(name) => {
          onExecute(new Commands.UpdateComponentCommand(comp.id, { name }));
        }}
      />

      <div
        style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '10px' }}
      >
        <label style={{ fontSize: '11px', color: '#9ca3af' }}>Type de composant</label>
        <select
          data-testid="component-type-select"
          value={comp.typeId}
          onChange={(e) => {
            onExecute(new Commands.UpdateComponentCommand(comp.id, { typeId: e.target.value }));
          }}
          style={{
            padding: '5px 8px',
            fontSize: '12px',
            borderRadius: '4px',
            backgroundColor: '#1f2937',
            color: '#f9fafb',
            border: '1px solid #4b5563',
          }}
        >
          {Object.values(compTypes).map((ct) => (
            <option key={ct.id} value={ct.id}>
              {ct.name} ({ct.width}×{ct.depth}×{ct.height})
            </option>
          ))}
        </select>
      </div>

      {compType && (
        <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '8px' }}>
          Dimensions nominales : <b>{compType.width} × {compType.depth} × {compType.height} mm</b>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          marginBottom: '12px',
          padding: '8px',
          backgroundColor: '#111827',
          borderRadius: '4px',
          border: '1px solid #374151',
        }}
      >
        <div style={{ fontSize: '11px', fontWeight: 600, color: '#60a5fa' }}>
          Paramétrie Dimensionnelle (Instance)
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <div style={{ flex: 1 }}>
            <DebouncedNumberInput
              testId="component-width-override-input"
              label="Largeur (mm)"
              value={comp.widthOverride ?? compType?.width ?? 600}
              min={compType?.minWidth ?? 100}
              max={compType?.maxWidth ?? 5000}
              step={50}
              onChange={(widthOverride) => {
                onExecute(new Commands.UpdateComponentCommand(comp.id, { widthOverride }));
              }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <DebouncedNumberInput
              testId="component-depth-override-input"
              label="Profondeur (mm)"
              value={comp.depthOverride ?? compType?.depth ?? 600}
              min={compType?.minDepth ?? 100}
              max={compType?.maxDepth ?? 3000}
              step={50}
              onChange={(depthOverride) => {
                onExecute(new Commands.UpdateComponentCommand(comp.id, { depthOverride }));
              }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <DebouncedNumberInput
              testId="component-height-override-input"
              label="Hauteur (mm)"
              value={comp.heightOverride ?? compType?.height ?? 600}
              min={compType?.minHeight ?? 100}
              max={compType?.maxHeight ?? 4000}
              step={50}
              onChange={(heightOverride) => {
                onExecute(new Commands.UpdateComponentCommand(comp.id, { heightOverride }));
              }}
            />
          </div>
        </div>
        {compType?.allowedWidths && compType.allowedWidths.length > 0 && (
          <div style={{ fontSize: '10px', color: '#9ca3af' }}>
            Largeurs standards : {compType.allowedWidths.join(', ')} mm
          </div>
        )}
      </div>

      <div style={{ fontSize: '12px', color: '#d1d5db', marginBottom: '6px' }}>
        Niveau : {level?.name ?? 'Niveau 0'}
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
        <div style={{ flex: 1 }}>
          <DebouncedNumberInput
            testId="component-pos-x-input"
            label="Position X (mm)"
            value={comp.placement.x}
            step={50}
            onChange={(x) => {
              onExecute(
                new Commands.UpdateComponentCommand(comp.id, {
                  placement: { ...comp.placement, x },
                }),
              );
            }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <DebouncedNumberInput
            testId="component-pos-y-input"
            label="Position Y (mm)"
            value={comp.placement.y}
            step={50}
            onChange={(y) => {
              onExecute(
                new Commands.UpdateComponentCommand(comp.id, {
                  placement: { ...comp.placement, y },
                }),
              );
            }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <DebouncedNumberInput
          testId="component-rotation-input"
          label="Rotation (°)"
          value={rotationDeg}
          min={0}
          max={360}
          step={15}
          unit="°"
          onChange={(deg) => {
            const rad = ((deg % 360) * Math.PI) / 180;
            onExecute(
              new Commands.UpdateComponentCommand(comp.id, {
                placement: { ...comp.placement, rotation: rad },
              }),
            );
          }}
        />
        <button
          type="button"
          data-testid="component-rotate-90-btn"
          onClick={() => {
            const curRot = comp.placement.rotation ?? 0;
            const nextRot = (curRot + Math.PI / 2) % (2 * Math.PI);
            onExecute(
              new Commands.UpdateComponentCommand(comp.id, {
                placement: { ...comp.placement, rotation: nextRot },
              }),
            );
          }}
          style={{
            padding: '4px 8px',
            fontSize: '11px',
            borderRadius: '4px',
            backgroundColor: '#374151',
            color: '#ffffff',
            border: '1px solid #4b5563',
            cursor: 'pointer',
            marginTop: '12px',
          }}
        >
          ↻ +90°
        </button>
      </div>

      <DebouncedNumberInput
        testId="component-elevation-offset-input"
        label="Décalage vertical (elevationOffset mm)"
        value={comp.placement.elevationOffset ?? 0}
        step={50}
        onChange={(elevationOffset) => {
          onExecute(
            new Commands.UpdateComponentCommand(comp.id, {
              placement: { ...comp.placement, elevationOffset },
            }),
          );
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <label style={{ fontSize: '11px', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <input
            type="checkbox"
            data-testid="component-flipped-checkbox"
            checked={comp.placement.flipped ?? false}
            onChange={(e) => {
              onExecute(
                new Commands.UpdateComponentCommand(comp.id, {
                  placement: { ...comp.placement, flipped: e.target.checked },
                }),
              );
            }}
          />
          Inversion miroir (flipped)
        </label>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <label style={{ fontSize: '11px', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <input
            type="checkbox"
            data-testid="component-clearance-checkbox"
            checked={comp.showClearanceZone ?? false}
            onChange={(e) => {
              onExecute(
                new Commands.UpdateComponentCommand(comp.id, {
                  showClearanceZone: e.target.checked,
                }),
              );
            }}
          />
          Zone de dégagement ({compType?.clearanceDepth ?? 0} mm)
        </label>
      </div>

      {comp.placement.hostWallId && (
        <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '10px' }}>
          Mur adossé : <code>{comp.placement.hostWallId}</code>
        </div>
      )}

      <button
        type="button"
        data-testid="delete-component-btn"
        onClick={() => {
          onExecute(new Commands.DeleteComponentCommand(comp.id));
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
        Supprimer le composant
      </button>
    </div>
  );
}
