import { useEffect } from 'react';

export interface UseBimShortcutsOptions {
  readonly undo: () => void;
  readonly redo: () => void;
  readonly canUndo: () => boolean;
  readonly canRedo: () => boolean;
  readonly selectedIds: readonly string[];
  readonly onClearSelection: () => void;
}

/**
 * Hook centralisant les raccourcis clavier applicatifs :
 * - Ctrl+Z / Cmd+Z : Annuler (Undo)
 * - Ctrl+Shift+Z / Cmd+Shift+Z / Ctrl+Y : Rétablir (Redo)
 * - Escape : Désélection globale
 */
export function useBimShortcuts({
  undo,
  redo,
  canUndo,
  canRedo,
  selectedIds,
  onClearSelection,
}: UseBimShortcutsOptions): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
        return;
      }

      const isMac =
        typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
      const isCtrlOrCmd = isMac ? e.metaKey : e.ctrlKey;

      // 1. Annulation (Undo : Ctrl+Z / Cmd+Z sans Shift)
      if (isCtrlOrCmd && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        e.preventDefault();
        if (canUndo()) {
          undo();
        }
        return;
      }

      // 2. Rétablissement (Redo : Ctrl+Shift+Z / Cmd+Shift+Z ou Ctrl+Y sous Windows)
      const isRedoShortcut =
        (isCtrlOrCmd && (e.key === 'z' || e.key === 'Z') && e.shiftKey) ||
        (!isMac && e.ctrlKey && (e.key === 'y' || e.key === 'Y'));

      if (isRedoShortcut) {
        e.preventDefault();
        if (canRedo()) {
          redo();
        }
        return;
      }

      // 3. Désélection globale (Escape)
      if (e.key === 'Escape' && selectedIds.length > 0) {
        onClearSelection();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [undo, redo, canUndo, canRedo, selectedIds, onClearSelection]);
}
