import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useActiveTool } from './useActiveTool.js';
import { SelectTool } from './SelectTool.js';
import { WallTool } from './WallTool.js';
import { DoorTool } from './DoorTool.js';
import { WindowTool } from './WindowTool.js';
import { MoveWallTool } from './MoveWallTool.js';
import { MoveOpeningTool } from './MoveOpeningTool.js';
import { SlabTool } from './SlabTool.js';
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

  it('setActiveToolKind("moveWall") appelle SelectTool.reset() et active MoveWallTool', () => {
    const selectResetSpy = vi.spyOn(SelectTool.prototype, 'reset');
    const { result } = renderHook(() => useActiveTool('select'));

    act(() => {
      result.current.setActiveToolKind('moveWall');
    });

    expect(selectResetSpy).toHaveBeenCalledTimes(1);
    expect(result.current.activeToolKind).toBe('moveWall');
    expect(result.current.activeTool).toBeInstanceOf(MoveWallTool);
  });

  it('supporte l’activation de chacun des 6 outils avec réinitialisation de l’outil sortant', () => {
    const moveWallResetSpy = vi.spyOn(MoveWallTool.prototype, 'reset');
    const doorResetSpy = vi.spyOn(DoorTool.prototype, 'reset');
    const winResetSpy = vi.spyOn(WindowTool.prototype, 'reset');
    const moveOpResetSpy = vi.spyOn(MoveOpeningTool.prototype, 'reset');

    const { result } = renderHook(() => useActiveTool('select'));

    // 1. door
    act(() => {
      result.current.setActiveToolKind('door');
    });
    expect(result.current.activeTool).toBeInstanceOf(DoorTool);

    // 2. window (door.reset appelé)
    act(() => {
      result.current.setActiveToolKind('window');
    });
    expect(doorResetSpy).toHaveBeenCalledTimes(1);
    expect(result.current.activeTool).toBeInstanceOf(WindowTool);

    // 3. moveWall (window.reset appelé)
    act(() => {
      result.current.setActiveToolKind('moveWall');
    });
    expect(winResetSpy).toHaveBeenCalledTimes(1);
    expect(result.current.activeTool).toBeInstanceOf(MoveWallTool);

    // 4. moveOpening (moveWall.reset appelé)
    act(() => {
      result.current.setActiveToolKind('moveOpening');
    });
    expect(moveWallResetSpy).toHaveBeenCalledTimes(1);
    expect(result.current.activeTool).toBeInstanceOf(MoveOpeningTool);

    // 5. select (moveOpening.reset appelé)
    act(() => {
      result.current.setActiveToolKind('select');
    });
    expect(moveOpResetSpy).toHaveBeenCalledTimes(1);
    expect(result.current.activeTool).toBeInstanceOf(SelectTool);
  });

  it('bascule successive select -> wall -> door réinitialise WallTool.reset() et purge tout état résiduel de tracé', () => {
    const wallResetSpy = vi.spyOn(WallTool.prototype, 'reset');
    const { result } = renderHook(() => useActiveTool('select'));

    // 1. Activer wall
    act(() => {
      result.current.setActiveToolKind('wall');
    });
    expect(result.current.activeTool).toBeInstanceOf(WallTool);
    const wallTool = result.current.activeTool as WallTool;

    // Simuler un tracé en cours dans wallTool
    const doc = BimDocument.createDefaultProject();
    const transform = new Transform2D();
    const ctx: ToolContext = {
      doc,
      transform,
      activeLevelId: Object.keys(doc.getState().levels)[0] ?? '',
      activeWallTypeId: Object.keys(doc.getState().wallTypes)[0] ?? '',
    };
    wallTool.handle(
      { type: 'pointerdown', screen: { x: 100, y: 100 }, button: 0, shift: false, alt: false },
      ctx,
    );
    expect(wallTool.getState().kind).toBe('drawing');

    // 2. Basculer directement de wall vers door
    act(() => {
      result.current.setActiveToolKind('door');
    });

    // 3. WallTool.reset() a été appelé, l'état résiduel de tracé a disparu et DoorTool est actif
    expect(wallResetSpy).toHaveBeenCalledTimes(1);
    expect(wallTool.getState().kind).toBe('idle');
    expect(result.current.activeToolKind).toBe('door');
    expect(result.current.activeTool).toBeInstanceOf(DoorTool);
  });

  it('bascule vers slab : SlabTool devient actif et est correctement instancié', () => {
    const { result } = renderHook(() => useActiveTool('select'));

    act(() => {
      result.current.setActiveToolKind('slab');
    });

    expect(result.current.activeToolKind).toBe('slab');
    expect(result.current.activeTool).toBeInstanceOf(SlabTool);
  });
});
