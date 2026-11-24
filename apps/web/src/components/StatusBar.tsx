import { useMemo } from 'react';
import { useBimDocument } from '../hooks/useBimDocument.js';
import { type ToolKind } from '../tools/types.js';
import { detectRooms, auditDocumentState } from '@tabax/core';

export interface StatusBarProps {
  readonly activeToolKind?: ToolKind;
  readonly drawingLength?: number | null;
  readonly activeLevelId?: string | null;
}

/**
 * Barre d'état inférieure affichant les métriques du projet architectural
 * et les instructions contextuelles de l'outil actif.
 */
export function StatusBar({
  activeToolKind = 'select',
  drawingLength,
  activeLevelId: activeLevelIdProp,
}: StatusBarProps) {
  const { state } = useBimDocument();

  const wallCount = Object.keys(state.walls).length;
  const slabCount = Object.keys(state.slabs ?? {}).length;
  const roofCount = Object.keys(state.roofs ?? {}).length;
  const doorCount = Object.keys(state.doors ?? {}).length;
  const windowCount = Object.keys(state.windows ?? {}).length;
  const componentCount = Object.keys(state.components ?? {}).length;
  const dimensionCount = Object.keys(state.dimensions ?? {}).length;
  const levelCount = Object.keys(state.levels).length;
  const activeLevelId =
    activeLevelIdProp && state.levels[activeLevelIdProp]
      ? activeLevelIdProp
      : Object.keys(state.levels)[0] ?? '';
  const activeLevel =
    (activeLevelId && state.levels[activeLevelId]?.name) || 'Aucun niveau';

  const detectedRooms = useMemo(
    () => (activeLevelId ? detectRooms(state, activeLevelId) : []),
    [state, activeLevelId],
  );
  const totalRoomAreaM2 = useMemo(
    () => (detectedRooms.reduce((acc, r) => acc + r.areaMm2, 0) / 1e6).toFixed(2),
    [detectedRooms],
  );
  const issues = useMemo(() => auditDocumentState(state), [state]);

  let toolMessage = 'Outil : Sélectionner (S)';
  if (activeToolKind === 'wall') {
    if (typeof drawingLength === 'number' && Number.isFinite(drawingLength) && drawingLength > 0) {
      toolMessage = `Outil : Tracer Mur (W) — Longueur : ${Math.round(drawingLength)} mm (Shift = snap 45°)`;
    } else {
      toolMessage = 'Outil : Tracer Mur (W) — Clic-glisser pour tracer (Shift = snap 45°)';
    }
  } else if (activeToolKind === 'door') {
    toolMessage =
      'Outil : Porte (D) — Survoler et cliquer sur un mur (snap 50 mm, Échap = annuler)';
  } else if (activeToolKind === 'window') {
    toolMessage =
      'Outil : Fenêtre (F) — Survoler et cliquer sur un mur (snap 50 mm, Échap = annuler)';
  } else if (activeToolKind === 'moveWall') {
    toolMessage = 'Outil : Déplacer Mur (M) — Clic-glisser un mur pour le déplacer (snap 10 mm)';
  } else if (activeToolKind === 'moveOpening') {
    toolMessage =
      'Outil : Déplacer Ouverture (O) — Clic-glisser une ouverture le long de son mur (snap 50 mm)';
  } else if (activeToolKind === 'slab') {
    toolMessage =
      'Outil : Dalle (L) — Cliquer pour tracer les sommets, Entrée ou double-clic pour clore (Shift = ortho, Échap = annuler)';
  } else if (activeToolKind === 'stair') {
    toolMessage = 'Outil : Escalier (E) — Clic départ puis clic arrivée de la volée (Échap = annuler)';
  } else if (activeToolKind === 'roof') {
    toolMessage =
      'Outil : Toiture (R) — Sommets d\'empreinte, Entrée pour clore, puis faîtage si 2 pans (Échap = annuler)';
  } else if (activeToolKind === 'component') {
    toolMessage =
      'Outil : Composant (C) — Survoler et cliquer pour implanter (Espace = pivoter 90°, Échap = annuler)';
  } else if (activeToolKind === 'mep') {
    toolMessage =
      'Outil : Réseau MEP (P) — Cliquer pour démarrer le tracé, cliquer pour valider (Échap = annuler)';
  } else if (activeToolKind === 'section') {
    toolMessage =
      'Outil : Coupe (X) — Clic départ puis clic arrivée (Espace = inverser direction, Échap = annuler)';
  } else if (activeToolKind === 'dimension') {
    toolMessage =
      'Outil : Cotation (T) — Clic 1er point, clic 2e point, clic déport (Espace = inverser déport, Échap = annuler)';
  }

  return (
    <footer
      data-testid="status-bar"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        height: '28px',
        backgroundColor: 'var(--bg-canvas-chrome)',
        color: 'var(--text-secondary)',
        fontSize: '12px',
        borderTop: '1px solid var(--border-subtle)',
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
        <span data-testid="status-tool-info" style={{ color: 'var(--accent-primary)', fontWeight: 500 }}>
          {toolMessage}
        </span>
        <span style={{ color: 'var(--border-subtle)' }}>|</span>
        <span>
          Niveau actif : <strong style={{ color: 'var(--text-primary)' }}>{activeLevel}</strong>
        </span>
        <span data-testid="status-surface-info">
          Surface : <strong style={{ color: 'var(--text-primary)' }}>{totalRoomAreaM2} m²</strong>
        </span>
        <span>
          Niveaux : <strong style={{ color: 'var(--text-primary)' }}>{levelCount}</strong>
        </span>
        <span>
          Murs : <strong style={{ color: 'var(--text-primary)' }}>{wallCount}</strong>
        </span>
        {slabCount > 0 && (
          <span>
            Dalles : <strong style={{ color: 'var(--text-primary)' }}>{slabCount}</strong>
          </span>
        )}
        {roofCount > 0 && (
          <span>
            Toitures : <strong style={{ color: 'var(--text-primary)' }}>{roofCount}</strong>
          </span>
        )}
        {doorCount > 0 && (
          <span>
            Portes : <strong style={{ color: 'var(--text-primary)' }}>{doorCount}</strong>
          </span>
        )}
        {windowCount > 0 && (
          <span>
            Fenêtres : <strong style={{ color: 'var(--text-primary)' }}>{windowCount}</strong>
          </span>
        )}
        {componentCount > 0 && (
          <span>
            Composants : <strong style={{ color: 'var(--text-primary)' }}>{componentCount}</strong>
          </span>
        )}
        {dimensionCount > 0 && (
          <span>
            Cotes : <strong style={{ color: 'var(--text-primary)' }}>{dimensionCount}</strong>
          </span>
        )}
        {issues.length > 0 && (
          <span
            data-testid="status-issues-indicator"
            title={issues.map((i) => `[${i.code}] ${i.message}`).join('\n')}
            style={{ color: '#d97706', cursor: 'help' }}
          >
            Issues : <strong style={{ color: '#d97706' }}>{issues.length}</strong>
          </span>
        )}
      </div>
      <div>
        <span>
          Unités : <strong>mm (Z-up)</strong>
        </span>
      </div>
    </footer>
  );
}
