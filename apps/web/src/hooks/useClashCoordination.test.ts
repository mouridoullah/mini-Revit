import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { BimDocument, type ClashResult } from '@tabax/core';
import { useClashCoordination } from './useClashCoordination.js';

describe('useClashCoordination (Hook de coordination spatiale)', () => {
  it('initialise l état par défaut sans conflits ni points focaux', () => {
    const doc = new BimDocument();
    const setSelectedIds = vi.fn();
    const setActiveLevelId = vi.fn();
    const setViewMode = vi.fn();

    const { result } = renderHook(() =>
      useClashCoordination({
        doc,
        setSelectedIds,
        setActiveLevelId,
        setViewMode,
      }),
    );

    expect(result.current.activeClashes).toEqual([]);
    expect(result.current.clashFocusPoint).toBeNull();
    expect(result.current.focus2DPoint).toBeNull();
  });

  it('handleSelectClash sélectionne les éléments en collision et bascule en mode clashes', () => {
    const doc = new BimDocument();
    const setSelectedIds = vi.fn();
    const setActiveLevelId = vi.fn();
    const setViewMode = vi.fn();

    const { result } = renderHook(() =>
      useClashCoordination({
        doc,
        setSelectedIds,
        setActiveLevelId,
        setViewMode,
      }),
    );

    const mockClash: ClashResult = {
      id: 'c1',
      elementA: 'w1',
      elementB: 'p1',
      categoryA: 'wall',
      categoryB: 'pipe',
      disciplineA: 'architecture',
      disciplineB: 'mep',
      severity: 'hard',
      penetrationDepthMm: 20,
      intersectionBox: { min: { x: 990, y: 1990, z: 2490 }, max: { x: 1010, y: 2010, z: 2510 } },
      point: { x: 1000, y: 2000, z: 2500 },
      description: 'Collision wall pipe',
    };

    act(() => {
      result.current.handleSelectClash(mockClash);
    });

    expect(setSelectedIds).toHaveBeenCalledWith(['w1', 'p1']);
    expect(setViewMode).toHaveBeenCalledWith('clashes');
    expect(result.current.clashFocusPoint?.x).toBe(1000);
    expect(result.current.clashFocusPoint?.y).toBe(2000);
    expect(result.current.clashFocusPoint?.z).toBe(2500);
  });

  it('handleFocusPoint3D met à jour le point focal 3D', () => {
    const doc = new BimDocument();
    const setSelectedIds = vi.fn();
    const setActiveLevelId = vi.fn();
    const setViewMode = vi.fn();

    const { result } = renderHook(() =>
      useClashCoordination({
        doc,
        setSelectedIds,
        setActiveLevelId,
        setViewMode,
      }),
    );

    act(() => {
      result.current.handleFocusPoint3D({ x: 500, y: 600, z: 700 });
    });

    expect(result.current.clashFocusPoint?.x).toBe(500);
    expect(result.current.clashFocusPoint?.y).toBe(600);
    expect(result.current.clashFocusPoint?.z).toBe(700);
  });

  it('handleLocate2D met à jour le point focal 2D et le niveau actif', () => {
    const doc = new BimDocument();
    const setSelectedIds = vi.fn();
    const setActiveLevelId = vi.fn();
    const setViewMode = vi.fn();

    const { result } = renderHook(() =>
      useClashCoordination({
        doc,
        setSelectedIds,
        setActiveLevelId,
        setViewMode,
      }),
    );

    act(() => {
      result.current.handleLocate2D({ x: 1200, y: 3400 }, 'level_rdc');
    });

    expect(setActiveLevelId).toHaveBeenCalledWith('level_rdc');
    expect(result.current.focus2DPoint?.x).toBe(1200);
    expect(result.current.focus2DPoint?.y).toBe(3400);
  });
});
