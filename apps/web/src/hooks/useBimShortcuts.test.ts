import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useBimShortcuts } from './useBimShortcuts.js';

describe('Hook useBimShortcuts', () => {
  it('déclenche undo sur Ctrl+Z et redo sur Ctrl+Y / Ctrl+Shift+Z', () => {
    const undo = vi.fn();
    const redo = vi.fn();
    const canUndo = vi.fn().mockReturnValue(true);
    const canRedo = vi.fn().mockReturnValue(true);
    const onClearSelection = vi.fn();

    renderHook(() =>
      useBimShortcuts({
        undo,
        redo,
        canUndo,
        canRedo,
        selectedIds: [],
        onClearSelection,
      }),
    );

    // Ctrl+Z
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));
    expect(undo).toHaveBeenCalledTimes(1);

    // Ctrl+Y (Redo)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true }));
    expect(redo).toHaveBeenCalledTimes(1);

    // Ctrl+Shift+Z (Redo)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true }));
    expect(redo).toHaveBeenCalledTimes(2);
  });

  it('déclenche onClearSelection sur appui de Escape si des éléments sont sélectionnés', () => {
    const onClearSelection = vi.fn();

    renderHook(() =>
      useBimShortcuts({
        undo: vi.fn(),
        redo: vi.fn(),
        canUndo: vi.fn().mockReturnValue(false),
        canRedo: vi.fn().mockReturnValue(false),
        selectedIds: ['wall_1'],
        onClearSelection,
      }),
    );

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onClearSelection).toHaveBeenCalledTimes(1);
  });
});
