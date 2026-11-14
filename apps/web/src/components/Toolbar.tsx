import { useEffect } from 'react';
import { type ToolKind } from '../tools/types.js';

export interface ToolbarProps {
  readonly activeToolKind: ToolKind;
  readonly onSelectTool: (kind: ToolKind) => void;
}

/**
 * Barre d'outils supérieure de l'application Mini-BIM.
 * Fournit la sélection d'outils (Sélectionner, Tracer Mur) et supporte les raccourcis clavier (S, W).
 */
export function Toolbar({ activeToolKind, onSelectTool }: ToolbarProps) {
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
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onSelectTool]);

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
          Phase 2.3 — Outils Interactifs
        </span>
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
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
      </div>
    </header>
  );
}
