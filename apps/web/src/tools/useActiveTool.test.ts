import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useActiveTool } from './useActiveTool.js';

describe('useActiveTool Hook', () => {
  it('s’initialise avec l’outil select par défaut', () => {
    const { result } = renderHook(() => useActiveTool());
    expect(result.current.activeToolKind).toBe('select');
    expect(result.current.activeTool.kind).toBe('select');
  });

  it('bascule vers l’outil wall et réinitialise l’ancien outil', () => {
    const { result } = renderHook(() => useActiveTool());

    act(() => {
      result.current.setActiveToolKind('wall');
    });

    expect(result.current.activeToolKind).toBe('wall');
    expect(result.current.activeTool.kind).toBe('wall');

    act(() => {
      result.current.setActiveToolKind('select');
    });

    expect(result.current.activeToolKind).toBe('select');
    expect(result.current.activeTool.kind).toBe('select');
  });
});
