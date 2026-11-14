import { useState, useRef, useMemo } from 'react';
import { type Tool, type ToolKind } from './types.js';
import { SelectTool } from './SelectTool.js';
import { WallTool } from './WallTool.js';

export interface UseActiveToolResult {
  readonly activeToolKind: ToolKind;
  readonly setActiveToolKind: (kind: ToolKind) => void;
  readonly activeTool: Tool;
}

/**
 * Hook React orchestrant la gestion et l'activation exclusive des outils 2D.
 *
 * Maintient les instances impératives des Tools et réinitialise l'état de l'ancien
 * outil lors du basculement vers le nouveau.
 */
export function useActiveTool(initialKind: ToolKind = 'select'): UseActiveToolResult {
  const [activeToolKind, setActiveToolKindState] = useState<ToolKind>(initialKind);
  const selectToolRef = useRef<SelectTool | null>(null);
  const wallToolRef = useRef<WallTool | null>(null);

  if (!selectToolRef.current) {
    selectToolRef.current = new SelectTool();
  }
  if (!wallToolRef.current) {
    wallToolRef.current = new WallTool();
  }

  const selectTool = selectToolRef.current;
  const wallTool = wallToolRef.current;

  const setActiveToolKind = (kind: ToolKind) => {
    if (activeToolKind === 'select') {
      selectTool.reset();
    } else {
      wallTool.reset();
    }
    setActiveToolKindState(kind);
  };

  const activeTool: Tool = useMemo(() => {
    if (activeToolKind === 'wall') {
      return wallTool;
    }
    return selectTool;
  }, [activeToolKind, wallTool, selectTool]);

  return {
    activeToolKind,
    setActiveToolKind,
    activeTool,
  };
}
