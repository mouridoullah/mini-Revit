import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useActiveTool } from './useActiveTool.js';
import { SelectTool } from './SelectTool.js';
import { WallTool } from './WallTool.js';
import { BimDocument } from '@mini-bim/core';
import { Transform2D } from '@mini-bim/view-2d';
import { type ToolContext } from './types.js';

describe('useActiveTool Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('s’initialise avec l’outil select par défaut', () => {
    const { result } = renderHook(() => useActiveTool());
    expect(result.current.activeToolKind).toBe('select');
    expect(result.current.activeTool.kind).toBe('select');
  });

  it('bascule select -> wall : SelectTool.reset() est appelé et WallTool devient actif', () => {
    const selectResetSpy = vi.spyOn(SelectTool.prototype, 'reset');
    const { result } = renderHook(() => useActiveTool('select'));

    expect(result.current.activeToolKind).toBe('select');

    act(() => {
      result.current.setActiveToolKind('wall');
    });

    expect(selectResetSpy).toHaveBeenCalledTimes(1);
    expect(result.current.activeToolKind).toBe('wall');
    expect(result.current.activeTool).toBeInstanceOf(WallTool);
  });

  it('bascule wall -> select pendant drawing : WallTool.reset() est appelé et remet l’état à idle sans émettre de commande', () => {
    const wallResetSpy = vi.spyOn(WallTool.prototype, 'reset');
    const { result } = renderHook(() => useActiveTool('wall'));

    const wallTool = result.current.activeTool as WallTool;
    const doc = BimDocument.createDefaultProject();
    const transform = new Transform2D();
    const ctx: ToolContext = {
      doc,
      transform,
      activeLevelId: Object.keys(doc.getState().levels)[0] ?? '',
      activeWallTypeId: Object.keys(doc.getState().wallTypes)[0] ?? '',
    };

    // Simulation d'un début de tracé
    const outputDown = wallTool.handle(
      {
        type: 'pointerdown',
        screen: { x: 100, y: 100 },
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );
    expect(outputDown.kind).toBe('preview');
    expect(wallTool.getState().kind).toBe('drawing');

    // Bascule d'outil pendant le tracé
    act(() => {
      result.current.setActiveToolKind('select');
    });

    // Reset a été appelé, l'état est redevenu idle, aucune commande n'a été émise
    expect(wallResetSpy).toHaveBeenCalledTimes(1);
    expect(wallTool.getState().kind).toBe('idle');
    expect(result.current.activeToolKind).toBe('select');
    expect(result.current.activeTool).toBeInstanceOf(SelectTool);
  });

  it('re-render du hook avec le même activeTool ne recrée PAS les instances de Tool (stabilité référentielle)', () => {
    const { result, rerender } = renderHook(() => useActiveTool('select'));

    const initialSelectTool = result.current.activeTool;

    // Déclenchement de 3 re-renders successifs
    rerender();
    rerender();
    rerender();

    // L'instance de Tool est strictement identique (référence mémoire préservée)
    expect(result.current.activeTool).toBe(initialSelectTool);

    // Bascule vers wall
    act(() => {
      result.current.setActiveToolKind('wall');
    });
    const initialWallTool = result.current.activeTool;

    // Re-renders sur wall
    rerender();
    rerender();

    expect(result.current.activeTool).toBe(initialWallTool);
  });

  it('supporte des bascules multiples sans corruption d’état', () => {
    const { result } = renderHook(() => useActiveTool('select'));

    act(() => {
      result.current.setActiveToolKind('wall');
    });
    expect(result.current.activeToolKind).toBe('wall');

    act(() => {
      result.current.setActiveToolKind('select');
    });
    expect(result.current.activeToolKind).toBe('select');

    act(() => {
      result.current.setActiveToolKind('wall');
    });
    expect(result.current.activeToolKind).toBe('wall');
  });
});
