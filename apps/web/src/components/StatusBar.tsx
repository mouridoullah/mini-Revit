import { useBimDocument } from '../hooks/useBimDocument.js';
import { type ToolKind } from '../tools/types.js';

export interface StatusBarProps {
  readonly activeToolKind?: ToolKind;
  readonly drawingLength?: number | null;
}

/**
 * Barre d'état inférieure affichant les métriques du projet architectural
 * et les instructions contextuelles de l'outil actif.
 */
export function StatusBar({ activeToolKind = 'select', drawingLength }: StatusBarProps) {
  const { state } = useBimDocument();

  const wallCount = Object.keys(state.walls).length;
  const levelCount = Object.keys(state.levels).length;
  const activeLevel = Object.values(state.levels)[0]?.name ?? 'Aucun niveau';

  let toolMessage = 'Outil : Sélectionner (S)';
  if (activeToolKind === 'wall') {
    if (typeof drawingLength === 'number' && Number.isFinite(drawingLength) && drawingLength > 0) {
      toolMessage = `Outil : Tracer Mur (W) — Longueur : ${Math.round(drawingLength)} mm (Shift = snap 45°)`;
    } else {
      toolMessage = 'Outil : Tracer Mur (W) — Clic-glisser pour tracer (Shift = snap 45°)';
    }
  }

  return (
    <footer
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        height: '28px',
        backgroundColor: '#111827',
        color: '#9ca3af',
        fontSize: '12px',
        borderTop: '1px solid #374151',
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
        <span data-testid="status-tool-info" style={{ color: '#60a5fa', fontWeight: 500 }}>
          {toolMessage}
        </span>
        <span style={{ color: '#4b5563' }}>|</span>
        <span>
          Niveau actif : <strong style={{ color: '#e5e7eb' }}>{activeLevel}</strong>
        </span>
        <span>
          Niveaux : <strong style={{ color: '#e5e7eb' }}>{levelCount}</strong>
        </span>
        <span>
          Murs : <strong style={{ color: '#e5e7eb' }}>{wallCount}</strong>
        </span>
      </div>
      <div>
        <span>
          Unités : <strong>mm (Z-up)</strong>
        </span>
      </div>
    </footer>
  );
}
