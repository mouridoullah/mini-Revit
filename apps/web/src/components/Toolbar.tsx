import { useEffect, useRef, type ChangeEvent } from 'react';
import { type ToolKind } from '../tools/types.js';

export interface ToolbarProps {
  readonly activeToolKind: ToolKind;
  readonly onSelectTool: (kind: ToolKind) => void;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onSave: () => void;
  readonly onLoadFile: (file: File) => void;
}

/**
 * Barre d'outils supérieure de l'application Mini-BIM.
 * Intègre les outils interactifs, l'historique transactionnel (Undo/Redo)
 * et la persistance JSON (Sauvegarder/Charger).
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
}: ToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
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
        justifyContent: 'space-between',
        padding: '0 16px',
        height: '48px',
        backgroundColor: '#1f2937',
        color: '#ffffff',
        borderBottom: '1px solid #374151',
        userSelect: 'none',
      }}
    >
      {/* 1. Logo & Badge de Phase */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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
          Phase 3.3 — Outils & Déplacement
        </span>
      </div>

      {/* 2. Boutons d'Action Centraux */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
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
            💾 Sauvegarder
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
            📂 Charger
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.mbim.json"
            data-testid="file-input"
            onChange={handleFileInputChange}
            style={{ display: 'none' }}
          />
        </div>
      </div>
    </header>
  );
}
