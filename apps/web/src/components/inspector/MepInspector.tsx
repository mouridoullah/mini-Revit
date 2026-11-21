/**
 * @mini-bim/web/components/inspector/MepInspector
 *
 * Inspecteur de propriétés pour les éléments et réseaux techniques MEP (Sous-phase 9.3.2).
 * Tuyauteries, gaines aérauliques, chemins de câbles, raccords et équipements.
 */

import {
  Commands,
  type BimState,
  UpdateMepElementCommand,
  DeleteMepElementCommand,
  type Pipe,
  type Duct,
  type CableTray,
  type MepFitting,
  type MepEquipment,
} from '@mini-bim/core';
import { DebouncedTextInput, DebouncedNumberInput } from './DebouncedInputs.js';

export interface MepInspectorProps {
  readonly elementId: string;
  readonly state: BimState;
  readonly onExecute: (cmd: Commands.Command) => void;
}

const CATEGORY_NAMES: Record<string, string> = {
  pipe: 'Tuyauterie',
  duct: 'Gaine Aéraulique',
  cableTray: 'Chemin de Câbles',
  mepFitting: 'Raccord Technique',
  mepEquipment: 'Équipement Technique',
};

export function MepInspector({ elementId, state, onExecute }: MepInspectorProps) {
  const pipe = state.pipes?.[elementId];
  const duct = state.ducts?.[elementId];
  const cableTray = state.cableTrays?.[elementId];
  const fitting = state.mepFittings?.[elementId];
  const equipment = state.mepEquipments?.[elementId];

  const elem: (Pipe | Duct | CableTray | MepFitting | MepEquipment) | undefined =
    pipe ?? duct ?? cableTray ?? fitting ?? equipment;

  if (!elem) {
    return (
      <div data-testid="inspector-mep-not-found" style={{ color: '#9ca3af', fontSize: '12px' }}>
        Élément MEP introuvable.
      </div>
    );
  }

  const category = elem.category;
  const level = elem.levelId ? state.levels[elem.levelId] : undefined;

  // Calcul de longueur pour les éléments linéaires
  let lengthMm: number | null = null;
  if ('start' in elem && 'end' in elem) {
    const dx = elem.end.x - elem.start.x;
    const dy = elem.end.y - elem.start.y;
    const dz = elem.end.z - elem.start.z;
    lengthMm = Math.round(Math.hypot(dx, dy, dz));
  }

  // Vérification de connexion des ports
  const connectors = Object.values(state.mepConnectors ?? {});
  const portStatuses = (elem.ports ?? []).map((port) => {
    const isConnected = connectors.some(
      (c) => c && (c.portAId === port.id || c.portBId === port.id),
    );
    return {
      port,
      isConnected,
    };
  });

  return (
    <div data-testid="inspector-mep-panel">
      {/* 1. Titre et Catégorie */}
      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-primary)', marginBottom: '8px' }}>
        {CATEGORY_NAMES[category] ?? category}
      </div>

      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
        ID : <span data-testid="mep-id">{elem.id}</span>
      </div>

      {/* 2. Nom de l'élément */}
      <DebouncedTextInput
        testId="mep-name-input"
        label="Désignation"
        value={elem.name ?? `${CATEGORY_NAMES[category]} ${elem.id.slice(0, 6)}`}
        onChange={(name) => {
          onExecute(new UpdateMepElementCommand(elem.id, { name }));
        }}
      />

      {/* 3. Niveau de référence */}
      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
        Niveau : <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{level?.name ?? 'Non assigné'}</span>
      </div>

      {/* 4. Dimensions selon la catégorie */}
      {category === 'pipe' && (
        <DebouncedNumberInput
          testId="mep-diameter-input"
          label="Diamètre nominal (mm)"
          value={(elem as Pipe).diameter}
          min={10}
          max={1000}
          step={10}
          onChange={(diameter) => {
            onExecute(new UpdateMepElementCommand(elem.id, { diameter }));
          }}
        />
      )}

      {category === 'duct' && (
        <>
          {(elem as Duct).shape === 'round' ? (
            <DebouncedNumberInput
              testId="mep-diameter-input"
              label="Diamètre nominal (mm)"
              value={(elem as Duct).diameter ?? 200}
              min={50}
              max={1500}
              step={10}
              onChange={(diameter) => {
                onExecute(new UpdateMepElementCommand(elem.id, { diameter }));
              }}
            />
          ) : (
            <>
              <DebouncedNumberInput
                testId="mep-width-input"
                label="Largeur (mm)"
                value={(elem as Duct).width ?? 300}
                min={50}
                max={2000}
                step={25}
                onChange={(width) => {
                  onExecute(new UpdateMepElementCommand(elem.id, { width }));
                }}
              />
              <DebouncedNumberInput
                testId="mep-height-input"
                label="Hauteur (mm)"
                value={(elem as Duct).height ?? 200}
                min={30}
                max={1500}
                step={25}
                onChange={(height) => {
                  onExecute(new UpdateMepElementCommand(elem.id, { height }));
                }}
              />
            </>
          )}
        </>
      )}

      {category === 'cableTray' && (
        <>
          <DebouncedNumberInput
            testId="mep-width-input"
            label="Largeur (mm)"
            value={(elem as CableTray).width}
            min={50}
            max={1200}
            step={25}
            onChange={(width) => {
              onExecute(new UpdateMepElementCommand(elem.id, { width }));
            }}
          />
          <DebouncedNumberInput
            testId="mep-height-input"
            label="Hauteur d'aile (mm)"
            value={(elem as CableTray).height}
            min={20}
            max={300}
            step={10}
            onChange={(height) => {
              onExecute(new UpdateMepElementCommand(elem.id, { height }));
            }}
          />
        </>
      )}

      {/* 5. Longueur mesurée */}
      {lengthMm !== null && (
        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
          Longueur développée :{' '}
          <span data-testid="mep-length" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
            {lengthMm} mm
          </span>
        </div>
      )}

      {/* 6. Ports et statut topologique */}
      <div style={{ marginTop: '12px', marginBottom: '12px' }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
          Connecteurs physiques ({portStatuses.length}) :
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {portStatuses.map((ps, idx) => (
            <div
              key={ps.port.id}
              data-testid={`mep-port-status-${idx}`}
              style={{
                fontSize: '11px',
                padding: '4px 8px',
                borderRadius: '4px',
                backgroundColor: 'var(--bg-canvas-chrome)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ color: 'var(--text-primary)' }}>
                Port {idx + 1} ({ps.port.shape})
              </span>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  color: ps.isConnected ? 'var(--accent-success)' : 'var(--accent-warning)',
                }}
              >
                {ps.isConnected ? 'Connecté' : 'Libre (ouvert)'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 7. Action Supprimer */}
      <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
        <button
          type="button"
          data-testid="mep-delete-btn"
          onClick={() => {
            onExecute(new DeleteMepElementCommand(elem.id));
          }}
          style={{
            width: '100%',
            padding: '6px 12px',
            backgroundColor: '#7f1d1d',
            color: '#fecaca',
            border: '1px solid #991b1b',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Supprimer l'élément MEP
        </button>
      </div>
    </div>
  );
}
