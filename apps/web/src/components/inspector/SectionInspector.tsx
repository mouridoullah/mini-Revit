import { Commands, type SectionCut, type BimState } from '@mini-bim/core';
import { ArrowLeftRight, Scissors } from 'lucide-react';
import { DebouncedNumberInput, DebouncedTextInput } from './DebouncedInputs.js';

export interface SectionInspectorProps {
  readonly sectionCut: SectionCut;
  readonly state: BimState;
  readonly onExecute: (cmd: Commands.Command) => void;
}

export function SectionInspector({ sectionCut, onExecute }: SectionInspectorProps) {
  const len = Math.round(
    Math.hypot(sectionCut.end.x - sectionCut.start.x, sectionCut.end.y - sectionCut.start.y),
  );

  return (
    <div data-testid="inspector-section-panel">
      <div
        style={{
          fontSize: '13px',
          fontWeight: 600,
          color: 'var(--accent-primary)',
          marginBottom: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        <Scissors size={14} />
        {sectionCut.kind === 'elevation' ? 'Élévation 2D' : 'Coupe 2D'}
      </div>

      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
        ID : <span data-testid="section-id">{sectionCut.id}</span>
      </div>

      {/* Nom de la coupe */}
      <div style={{ marginBottom: '10px' }}>
        <DebouncedTextInput
          label="Nom"
          testId="section-name-input"
          value={sectionCut.name}
          onChange={(name) => {
            if (name.trim()) {
              onExecute(new Commands.UpdateSectionCutCommand(sectionCut.id, { name }));
            }
          }}
        />
      </div>

      {/* Étiquette / Repère */}
      <div style={{ marginBottom: '10px' }}>
        <DebouncedTextInput
          label="Repère (Label)"
          testId="section-label-input"
          value={sectionCut.label}
          onChange={(label) => {
            if (label.trim()) {
              onExecute(new Commands.UpdateSectionCutCommand(sectionCut.id, { label }));
            }
          }}
        />
      </div>

      {/* Type : Coupe vs Élévation */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '10px' }}>
        <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500 }}>
          Nature de la vue
        </label>
        <select
          data-testid="section-kind-select"
          value={sectionCut.kind}
          onChange={(e) => {
            onExecute(
              new Commands.UpdateSectionCutCommand(sectionCut.id, {
                kind: e.target.value as 'section' | 'elevation',
              }),
            );
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
          <option value="section">Coupe transversale / longitudinale</option>
          <option value="elevation">Élévation de façade</option>
        </select>
      </div>

      {/* Profondeur d'observation */}
      <div style={{ marginBottom: '10px' }}>
        <DebouncedNumberInput
          label="Profondeur de champ"
          testId="section-depth-input"
          value={sectionCut.depth}
          min={100}
          step={500}
          unit="mm"
          onChange={(depth) => {
            onExecute(new Commands.UpdateSectionCutCommand(sectionCut.id, { depth }));
          }}
        />
      </div>

      {/* Direction de vue */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
        <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500 }}>
          Direction d&apos;observation
        </label>
        <button
          type="button"
          data-testid="section-flip-direction-btn"
          onClick={() => {
            onExecute(
              new Commands.UpdateSectionCutCommand(sectionCut.id, {
                viewDirection: sectionCut.viewDirection === 1 ? -1 : 1,
              }),
            );
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '6px 10px',
            fontSize: '11px',
            borderRadius: '4px',
            backgroundColor: 'var(--bg-card)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-subtle)',
            cursor: 'pointer',
          }}
        >
          <ArrowLeftRight size={13} />
          {sectionCut.viewDirection === 1 ? 'Sens normal (vers la gauche)' : 'Sens inversé (vers la droite)'}
        </button>
      </div>

      {/* Métriques géométriques passives */}
      <div
        style={{
          fontSize: '11px',
          color: 'var(--text-secondary)',
          backgroundColor: 'var(--bg-card)',
          padding: '8px',
          borderRadius: '4px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}
      >
        <div>
          Longueur : <strong>{len} mm</strong>
        </div>
        <div>
          Départ : ({Math.round(sectionCut.start.x)}, {Math.round(sectionCut.start.y)})
        </div>
        <div>
          Fin : ({Math.round(sectionCut.end.x)}, {Math.round(sectionCut.end.y)})
        </div>
      </div>
    </div>
  );
}
