import { useState, useEffect } from 'react';
import { Trash2, ChevronLeft } from 'lucide-react';
import type { Commands, BimDocument } from '@mini-bim/core';
import {
  WallInspector,
  SlabInspector,
  DoorInspector,
  WindowInspector,
  LevelInspector,
  StairInspector,
  RoofInspector,
  ComponentInspector,
  MepInspector,
} from './inspector/index.js';

export interface PropertyInspectorProps {
  readonly doc: BimDocument;
  readonly selectedIds: readonly string[];
  readonly isCollapsed?: boolean;
  readonly onToggleCollapse?: () => void;
  readonly onDeleteSelected?: () => void;
  readonly embedded?: boolean;
}

/**
 * Inspecteur de Propriétés BIM latéral droit (Milestone 6.1b-2 / ADR-046 / Phase 8.6).
 *
 * Orchestre les sous-inspecteurs modulaires dédiés par catégorie d'élément architectural.
 * Supporte l'édition bidirectionnelle temps-réel avec debouncing ergonomique de 200ms.
 */
export function PropertyInspector({
  doc,
  selectedIds,
  isCollapsed: controlledCollapsed,
  onToggleCollapse,
  onDeleteSelected,
  embedded = false,
}: PropertyInspectorProps) {
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const [, setTick] = useState(0);
  const forceUpdate = () => setTick((t) => t + 1);

  // Abonnement réactif aux mutations documentaires (undo, redo, modifications externes)
  useEffect(() => {
    const unsubscribe = doc.subscribe(() => {
      forceUpdate();
    });
    return unsubscribe;
  }, [doc]);

  const isCollapsed = controlledCollapsed !== undefined ? controlledCollapsed : internalCollapsed;

  const toggle = () => {
    if (onToggleCollapse) {
      onToggleCollapse();
    } else {
      setInternalCollapsed((prev) => !prev);
    }
  };

  const execute = (cmd: Commands.Command) => {
    doc.execute(cmd);
    forceUpdate();
  };

  if (isCollapsed) {
    return (
      <aside
        data-testid="property-inspector-collapsed"
        style={{
          width: '36px',
          height: '100%',
          backgroundColor: 'var(--bg-canvas-chrome)',
          borderLeft: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: '12px',
          userSelect: 'none',
        }}
      >
        <button
          type="button"
          data-testid="toggle-inspector-btn"
          onClick={toggle}
          title="Ouvrir l'inspecteur de propriétés"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            padding: '6px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ChevronLeft size={16} />
        </button>
      </aside>
    );
  }

  const state = doc.getState();

  const renderContent = () => {
    if (selectedIds.length === 0) {
      return (
        <div
          data-testid="inspector-no-selection"
          style={{ color: 'var(--text-secondary)', fontSize: '12px', textAlign: 'center', marginTop: '20px' }}
        >
          Aucune sélection
        </div>
      );
    }

    if (selectedIds.length > 1) {
      return (
        <div
          data-testid="inspector-multi-selection"
          style={{ color: 'var(--text-secondary)', fontSize: '12px', textAlign: 'center', marginTop: '20px' }}
        >
          {selectedIds.length} éléments sélectionnés
        </div>
      );
    }

    const id = selectedIds[0];
    if (!id) return null;

    // 1. Mur
    const wall = state.walls[id];
    if (wall) {
      return <WallInspector wall={wall} state={state} onExecute={execute} />;
    }

    // 2. Dalle
    const slab = state.slabs?.[id];
    if (slab) {
      return <SlabInspector slab={slab} state={state} onExecute={execute} />;
    }

    // 3. Porte
    const door = state.doors?.[id];
    if (door) {
      return <DoorInspector door={door} state={state} onExecute={execute} />;
    }

    // 4. Fenêtre
    const window = state.windows?.[id];
    if (window) {
      return <WindowInspector window={window} state={state} onExecute={execute} />;
    }

    // 5. Niveau
    const level = state.levels[id];
    if (level) {
      return (
        <LevelInspector
          level={level}
          state={state}
          doc={doc}
          onExecute={execute}
          onForceUpdate={forceUpdate}
        />
      );
    }

    // 6. Escalier
    const stair = state.stairs?.[id];
    if (stair) {
      return <StairInspector stair={stair} state={state} onExecute={execute} />;
    }

    // 7. Toiture
    const roof = state.roofs?.[id];
    if (roof) {
      return <RoofInspector roof={roof} state={state} onExecute={execute} />;
    }

    // 8. Composant
    const comp = state.components?.[id];
    if (comp) {
      return <ComponentInspector comp={comp} state={state} onExecute={execute} />;
    }

    // 9. Réseaux techniques MEP (Tuyauteries, Gaines, Chemins de câbles, Raccords, Équipements)
    const isMep =
      Boolean(state.pipes?.[id]) ||
      Boolean(state.ducts?.[id]) ||
      Boolean(state.cableTrays?.[id]) ||
      Boolean(state.mepFittings?.[id]) ||
      Boolean(state.mepEquipments?.[id]);
    if (isMep) {
      return <MepInspector elementId={id} state={state} onExecute={execute} />;
    }

    return <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>Élément sélectionné : {id}</div>;
  };

  const showHeader = !embedded || (selectedIds.length === 1 && Boolean(onDeleteSelected));
  const showTitle = !embedded;

  return (
    <aside
      data-testid="property-inspector"
      style={{
        width: embedded ? '100%' : '280px',
        height: '100%',
        backgroundColor: 'var(--bg-canvas-chrome)',
        borderLeft: embedded ? 'none' : '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none',
        overflowY: 'auto',
      }}
    >
      {showHeader && (
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: showTitle ? 'space-between' : 'flex-end',
            padding: embedded ? '8px 14px' : '10px 14px',
            borderBottom: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--bg-card)',
          }}
        >
          {showTitle && (
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Propriétés
            </span>
          )}
          {selectedIds.length === 1 && onDeleteSelected && (
            <button
              type="button"
              data-testid="delete-selected-btn"
              aria-label="Supprimer l’élément sélectionné"
              title="Supprimer l’élément sélectionné"
              onClick={onDeleteSelected}
              style={{ background: 'transparent', border: 0, color: 'var(--accent-danger)', cursor: 'pointer' }}
            >
              <Trash2 size={16} strokeWidth={1.75} />
            </button>
          )}
        </header>
      )}

      <div style={{ padding: '14px', flex: 1 }}>{renderContent()}</div>
    </aside>
  );
}
