import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import { type ToolKind } from '../tools/types.js';
import { type Level } from '@mini-bim/core';
import { LevelSelector } from './LevelSelector.js';

export interface ToolbarProps {
  readonly activeToolKind: ToolKind;
  readonly onSelectTool: (kind: ToolKind) => void;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onSave: () => void;
  readonly onLoadFile: (file: File) => void;
  readonly onExportIfc?: () => void;
  readonly onExportSvg?: (scale: 50 | 100 | 200) => void;
  readonly levels?: readonly Level[];
  readonly activeLevelId?: string;
  readonly onSelectLevel?: (levelId: string) => void;
  readonly onAddLevel?: () => void;
  readonly underlayEnabled?: boolean;
  readonly onToggleUnderlay?: (enabled: boolean) => void;
  readonly hasUnderlayLevel?: boolean;
  readonly onLoadR4Demo?: () => void;
}

/**
 * Barre d'outils supérieure de l'application Mini-BIM.
 * Intègre les outils interactifs, l'historique transactionnel (Undo/Redo),
 * la persistance JSON, et les exports BIM (IFC4 & Plans vectoriels SVG).
 */
export function Toolbar({
  activeToolKind,
  onSelectTool,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onSave,
  onLoadFile,
  onExportIfc,
  onExportSvg,
  levels,
  activeLevelId,
  onSelectLevel,
  onAddLevel,
  underlayEnabled = true,
  onToggleUnderlay,
  hasUnderlayLevel = false,
  onLoadR4Demo,
}: ToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [planScale, setPlanScale] = useState<50 | 100 | 200>(100);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }
      if (e.key === 's' || e.key === 'S') {
        onSelectTool('select');
      } else if (e.key === 'w' || e.key === 'W') {
        onSelectTool('wall');
      } else if (e.key === 'd' || e.key === 'D') {
        onSelectTool('door');
      } else if (e.key === 'f' || e.key === 'F') {
        onSelectTool('window');
      } else if (e.key === 'm' || e.key === 'M') {
        onSelectTool('moveWall');
      } else if (e.key === 'o' || e.key === 'O') {
        onSelectTool('moveOpening');
      } else if (e.key === 'l' || e.key === 'L') {
        onSelectTool('slab');
      } else if (e.key === 'e' || e.key === 'E') {
        onSelectTool('stair');
      } else if (e.key === 'r' || e.key === 'R') {
        onSelectTool('roof');
      } else if (e.key === 'c' || e.key === 'C') {
        onSelectTool('component');
      } else if (e.key === 'p' || e.key === 'P') {
        onSelectTool('mep');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onSelectTool]);

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onLoadFile(file);
      // Réinitialiser la valeur pour permettre de ré-importer le même fichier
      e.target.value = '';
    }
  };

  const handleLoadClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: '12px',
        padding: '0 16px',
        height: '48px',
        minWidth: 0,
        flexShrink: 0,
        overflowX: 'auto',
        overflowY: 'hidden',
        backgroundColor: '#1f2937',
        color: '#ffffff',
        borderBottom: '1px solid #374151',
        userSelect: 'none',
      }}
    >
      {/* 1. Logo & Badge de Phase */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
        <span style={{ fontWeight: 700, fontSize: '16px', letterSpacing: '0.5px' }}>MINI-BIM</span>
        <span
          style={{
            fontSize: '11px',
            backgroundColor: '#374151',
            padding: '2px 8px',
            borderRadius: '4px',
            color: '#9ca3af',
          }}
        >
          Phase 8 — Composants & Mobilier Paramétrique
        </span>
      </div>

      {/* 2. Boutons d'Action Centraux */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0 }}>
        {/* Groupe Outils de Modélisation */}
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            type="button"
            data-testid="tool-select-btn"
            onClick={() => onSelectTool('select')}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: activeToolKind === 'select' ? 600 : 400,
              borderRadius: '4px',
              backgroundColor: activeToolKind === 'select' ? '#2563eb' : '#374151',
              color: activeToolKind === 'select' ? '#ffffff' : '#d1d5db',
              border: activeToolKind === 'select' ? '1px solid #3b82f6' : '1px solid #4b5563',
              cursor: 'pointer',
              transition: 'all 0.15s ease-in-out',
            }}
          >
            Sélectionner (S)
          </button>
          <button
            type="button"
            data-testid="tool-wall-btn"
            onClick={() => onSelectTool('wall')}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: activeToolKind === 'wall' ? 600 : 400,
              borderRadius: '4px',
              backgroundColor: activeToolKind === 'wall' ? '#2563eb' : '#374151',
              color: activeToolKind === 'wall' ? '#ffffff' : '#d1d5db',
              border: activeToolKind === 'wall' ? '1px solid #3b82f6' : '1px solid #4b5563',
              cursor: 'pointer',
              transition: 'all 0.15s ease-in-out',
            }}
          >
            Tracer Mur (W)
          </button>
          <button
            type="button"
            data-testid="tool-slab-btn"
            onClick={() => onSelectTool('slab')}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: activeToolKind === 'slab' ? 600 : 400,
              borderRadius: '4px',
              backgroundColor: activeToolKind === 'slab' ? '#2563eb' : '#374151',
              color: activeToolKind === 'slab' ? '#ffffff' : '#d1d5db',
              border: activeToolKind === 'slab' ? '1px solid #3b82f6' : '1px solid #4b5563',
              cursor: 'pointer',
              transition: 'all 0.15s ease-in-out',
            }}
          >
            Dalle (L)
          </button>
          <button
            type="button"
            data-testid="tool-stair-btn"
            onClick={() => onSelectTool('stair')}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: activeToolKind === 'stair' ? 600 : 400,
              borderRadius: '4px',
              backgroundColor: activeToolKind === 'stair' ? '#2563eb' : '#374151',
              color: activeToolKind === 'stair' ? '#ffffff' : '#d1d5db',
              border: activeToolKind === 'stair' ? '1px solid #3b82f6' : '1px solid #4b5563',
              cursor: 'pointer',
              transition: 'all 0.15s ease-in-out',
            }}
          >
            Escalier (E)
          </button>
          <button
            type="button"
            data-testid="tool-roof-btn"
            onClick={() => onSelectTool('roof')}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: activeToolKind === 'roof' ? 600 : 400,
              borderRadius: '4px',
              backgroundColor: activeToolKind === 'roof' ? '#2563eb' : '#374151',
              color: activeToolKind === 'roof' ? '#ffffff' : '#d1d5db',
              border: activeToolKind === 'roof' ? '1px solid #3b82f6' : '1px solid #4b5563',
              cursor: 'pointer',
              transition: 'all 0.15s ease-in-out',
            }}
          >
            Toiture (R)
          </button>
          <button
            type="button"
            data-testid="tool-component-btn"
            onClick={() => onSelectTool('component')}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: activeToolKind === 'component' ? 600 : 400,
              borderRadius: '4px',
              backgroundColor: activeToolKind === 'component' ? '#2563eb' : '#374151',
              color: activeToolKind === 'component' ? '#ffffff' : '#d1d5db',
              border: activeToolKind === 'component' ? '1px solid #3b82f6' : '1px solid #4b5563',
              cursor: 'pointer',
              transition: 'all 0.15s ease-in-out',
            }}
          >
            Composant (C)
          </button>
          <button
            type="button"
            data-testid="tool-mep-btn"
            onClick={() => onSelectTool('mep')}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: activeToolKind === 'mep' ? 600 : 400,
              borderRadius: '4px',
              backgroundColor: activeToolKind === 'mep' ? '#0284c7' : '#374151',
              color: activeToolKind === 'mep' ? '#ffffff' : '#d1d5db',
              border: activeToolKind === 'mep' ? '1px solid #38bdf8' : '1px solid #4b5563',
              cursor: 'pointer',
              transition: 'all 0.15s ease-in-out',
            }}
          >
            Réseaux MEP (P)
          </button>
          <button
            type="button"
            data-testid="tool-door-btn"
            onClick={() => onSelectTool('door')}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: activeToolKind === 'door' ? 600 : 400,
              borderRadius: '4px',
              backgroundColor: activeToolKind === 'door' ? '#2563eb' : '#374151',
              color: activeToolKind === 'door' ? '#ffffff' : '#d1d5db',
              border: activeToolKind === 'door' ? '1px solid #3b82f6' : '1px solid #4b5563',
              cursor: 'pointer',
              transition: 'all 0.15s ease-in-out',
            }}
          >
            Porte (D)
          </button>
          <button
            type="button"
            data-testid="tool-window-btn"
            onClick={() => onSelectTool('window')}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: activeToolKind === 'window' ? 600 : 400,
              borderRadius: '4px',
              backgroundColor: activeToolKind === 'window' ? '#2563eb' : '#374151',
              color: activeToolKind === 'window' ? '#ffffff' : '#d1d5db',
              border: activeToolKind === 'window' ? '1px solid #3b82f6' : '1px solid #4b5563',
              cursor: 'pointer',
              transition: 'all 0.15s ease-in-out',
            }}
          >
            Fenêtre (F)
          </button>
          <button
            type="button"
            data-testid="tool-move-wall-btn"
            onClick={() => onSelectTool('moveWall')}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: activeToolKind === 'moveWall' ? 600 : 400,
              borderRadius: '4px',
              backgroundColor: activeToolKind === 'moveWall' ? '#2563eb' : '#374151',
              color: activeToolKind === 'moveWall' ? '#ffffff' : '#d1d5db',
              border: activeToolKind === 'moveWall' ? '1px solid #3b82f6' : '1px solid #4b5563',
              cursor: 'pointer',
              transition: 'all 0.15s ease-in-out',
            }}
          >
            Déplacer Mur (M)
          </button>
          <button
            type="button"
            data-testid="tool-move-opening-btn"
            onClick={() => onSelectTool('moveOpening')}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: activeToolKind === 'moveOpening' ? 600 : 400,
              borderRadius: '4px',
              backgroundColor: activeToolKind === 'moveOpening' ? '#2563eb' : '#374151',
              color: activeToolKind === 'moveOpening' ? '#ffffff' : '#d1d5db',
              border: activeToolKind === 'moveOpening' ? '1px solid #3b82f6' : '1px solid #4b5563',
              cursor: 'pointer',
              transition: 'all 0.15s ease-in-out',
            }}
          >
            Déplacer Ouverture (O)
          </button>
        </div>

        {/* Sélecteur d'étage actif et vue fantôme Underlay (ADR-046 / Phase 6.2) */}
        {levels && activeLevelId && onSelectLevel && (
          <>
            <div style={{ width: '1px', height: '24px', backgroundColor: '#4b5563' }} />
            <LevelSelector
              levels={levels}
              activeLevelId={activeLevelId}
              onSelectLevel={onSelectLevel}
            />
            {onAddLevel && (
              <button
                type="button"
                data-testid="add-level-btn"
                onClick={onAddLevel}
                title="Ajouter un étage supérieur (R+1, R+2...)"
                style={{
                  padding: '4px 8px',
                  fontSize: '12px',
                  borderRadius: '4px',
                  backgroundColor: '#374151',
                  color: '#e5e7eb',
                  border: '1px solid #4b5563',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease-in-out',
                }}
              >
                + Étage
              </button>
            )}
            {onToggleUnderlay && (
              <button
                type="button"
                data-testid="underlay-toggle-btn"
                onClick={() => onToggleUnderlay(!underlayEnabled)}
                disabled={!hasUnderlayLevel}
                title={
                  hasUnderlayLevel
                    ? 'Afficher la vue fantôme du niveau inférieur (N-1)'
                    : 'Aucun niveau inférieur disponible pour l’étage actif'
                }
                style={{
                  padding: '6px 10px',
                  fontSize: '12px',
                  fontWeight: underlayEnabled && hasUnderlayLevel ? 600 : 400,
                  borderRadius: '4px',
                  backgroundColor:
                    underlayEnabled && hasUnderlayLevel ? '#374151' : '#1f2937',
                  color: !hasUnderlayLevel
                    ? '#6b7280'
                    : underlayEnabled
                      ? '#60a5fa'
                      : '#9ca3af',
                  border:
                    underlayEnabled && hasUnderlayLevel
                      ? '1px solid #3b82f6'
                      : '1px solid #4b5563',
                  cursor: hasUnderlayLevel ? 'pointer' : 'not-allowed',
                  opacity: hasUnderlayLevel ? 1 : 0.5,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.15s ease-in-out',
                }}
              >
                <span>Underlay (N-1)</span>
                <span
                  style={{
                    fontSize: '10px',
                    padding: '1px 4px',
                    borderRadius: '2px',
                    backgroundColor:
                      underlayEnabled && hasUnderlayLevel ? '#1e3a8a' : '#374151',
                    color:
                      underlayEnabled && hasUnderlayLevel ? '#93c5fd' : '#9ca3af',
                  }}
                >
                  {underlayEnabled && hasUnderlayLevel ? 'ON' : 'OFF'}
                </span>
              </button>
            )}
          </>
        )}

        <div style={{ width: '1px', height: '24px', backgroundColor: '#4b5563' }} />

        {/* Groupe Historique Undo / Redo */}
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            type="button"
            data-testid="undo-btn"
            onClick={onUndo}
            disabled={!canUndo}
            title="Annuler la dernière action (Ctrl+Z)"
            style={{
              padding: '6px 10px',
              fontSize: '12px',
              borderRadius: '4px',
              backgroundColor: canUndo ? '#374151' : '#1f2937',
              color: canUndo ? '#e5e7eb' : '#6b7280',
              border: '1px solid #4b5563',
              cursor: canUndo ? 'pointer' : 'not-allowed',
              opacity: canUndo ? 1 : 0.5,
              transition: 'all 0.15s ease-in-out',
            }}
          >
            ↶ Annuler
          </button>
          <button
            type="button"
            data-testid="redo-btn"
            onClick={onRedo}
            disabled={!canRedo}
            title="Rétablir la dernière action (Ctrl+Shift+Z)"
            style={{
              padding: '6px 10px',
              fontSize: '12px',
              borderRadius: '4px',
              backgroundColor: canRedo ? '#374151' : '#1f2937',
              color: canRedo ? '#e5e7eb' : '#6b7280',
              border: '1px solid #4b5563',
              cursor: canRedo ? 'pointer' : 'not-allowed',
              opacity: canRedo ? 1 : 0.5,
              transition: 'all 0.15s ease-in-out',
            }}
          >
            ↷ Rétablir
          </button>
        </div>

        <div style={{ width: '1px', height: '24px', backgroundColor: '#4b5563' }} />

        {/* Groupe Persistance JSON */}
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            type="button"
            data-testid="save-btn"
            onClick={onSave}
            title="Sauvegarder le modèle architectural au format JSON"
            style={{
              padding: '6px 10px',
              fontSize: '12px',
              borderRadius: '4px',
              backgroundColor: '#059669',
              color: '#ffffff',
              border: '1px solid #10b981',
              cursor: 'pointer',
              fontWeight: 500,
              transition: 'all 0.15s ease-in-out',
            }}
          >
            Sauvegarder
          </button>
          <button
            type="button"
            data-testid="load-btn"
            onClick={handleLoadClick}
            title="Charger un modèle architectural JSON"
            style={{
              padding: '6px 10px',
              fontSize: '12px',
              borderRadius: '4px',
              backgroundColor: '#374151',
              color: '#e5e7eb',
              border: '1px solid #4b5563',
              cursor: 'pointer',
              transition: 'all 0.15s ease-in-out',
            }}
          >
            Charger
          </button>
          {onLoadR4Demo && (
            <button
              type="button"
              data-testid="load-demo-r4-btn"
              onClick={onLoadR4Demo}
              title="Charger l'Immeuble R+4 complet avec tous les composants et réseaux MEP"
              style={{
                padding: '6px 10px',
                fontSize: '12px',
                borderRadius: '4px',
                backgroundColor: '#0284c7',
                color: '#ffffff',
                border: '1px solid #0ea5e9',
                cursor: 'pointer',
                fontWeight: 600,
                transition: 'all 0.15s ease-in-out',
              }}
            >
              🏢 Immeuble R+4
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.mbim.json"
            data-testid="file-input"
            onChange={handleFileInputChange}
            style={{ display: 'none' }}
          />
        </div>

        <div style={{ width: '1px', height: '24px', backgroundColor: '#4b5563' }} />

        {/* Groupe Exports BIM & Plans (Phase 5) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            type="button"
            data-testid="export-ifc-btn"
            onClick={onExportIfc}
            title="Exporter la maquette numérique au standard IFC4 (ISO 10303-21)"
            style={{
              padding: '6px 10px',
              fontSize: '12px',
              borderRadius: '4px',
              backgroundColor: '#4f46e5',
              color: '#ffffff',
              border: '1px solid #6366f1',
              cursor: 'pointer',
              fontWeight: 500,
              transition: 'all 0.15s ease-in-out',
            }}
          >
            Exporter IFC
          </button>

          <div style={{ display: 'flex', alignItems: 'center' }}>
            <button
              type="button"
              data-testid="export-svg-btn"
              onClick={() => onExportSvg?.(planScale)}
              title="Exporter le plan d'étage vectoriel imprimable (SVG)"
              style={{
                padding: '6px 10px',
                fontSize: '12px',
                borderTopLeftRadius: '4px',
                borderBottomLeftRadius: '4px',
                borderTopRightRadius: 0,
                borderBottomRightRadius: 0,
                backgroundColor: '#2563eb',
                color: '#ffffff',
                border: '1px solid #3b82f6',
                borderRight: 'none',
                cursor: 'pointer',
                fontWeight: 500,
                transition: 'all 0.15s ease-in-out',
              }}
            >
              Plan (SVG)
            </button>
            <select
              data-testid="export-svg-scale-select"
              value={planScale}
              onChange={(e) => setPlanScale(Number(e.target.value) as 50 | 100 | 200)}
              style={{
                padding: '5px 4px',
                fontSize: '11px',
                borderTopRightRadius: '4px',
                borderBottomRightRadius: '4px',
                backgroundColor: '#1d4ed8',
                color: '#ffffff',
                border: '1px solid #3b82f6',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value={50}>1:50</option>
              <option value={100}>1:100</option>
              <option value={200}>1:200</option>
            </select>
          </div>
        </div>
      </div>
    </header>
  );
}
