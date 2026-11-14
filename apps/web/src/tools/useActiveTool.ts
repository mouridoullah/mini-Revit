import { useState, useRef, useMemo } from 'react';
import { type Tool, type ToolKind } from './types.js';
import { SelectTool } from './SelectTool.js';
import { WallTool } from './WallTool.js';
import { DoorTool } from './DoorTool.js';
import { WindowTool } from './WindowTool.js';
import { MoveWallTool } from './MoveWallTool.js';
import { MoveOpeningTool } from './MoveOpeningTool.js';

export interface UseActiveToolResult {
  readonly activeToolKind: ToolKind;
  readonly setActiveToolKind: (kind: ToolKind) => void;
  readonly activeTool: Tool;
}

/**
 * Hook React orchestrant la gestion et l'activation exclusive des outils 2D.
 *
 * Maintient les 6 instances impératives des Tools (Select, Wall, Door, Window, MoveWall, MoveOpening)
 * et garantit la réinitialisation (.reset()) de l'outil sortant lors de tout basculement.
 */
export function useActiveTool(initialKind: ToolKind = 'select'): UseActiveToolResult {
  const [activeToolKind, setActiveToolKindState] = useState<ToolKind>(initialKind);

  const selectToolRef = useRef<SelectTool | null>(null);
  const wallToolRef = useRef<WallTool | null>(null);
  const doorToolRef = useRef<DoorTool | null>(null);
  const windowToolRef = useRef<WindowTool | null>(null);
  const moveWallToolRef = useRef<MoveWallTool | null>(null);
  const moveOpeningToolRef = useRef<MoveOpeningTool | null>(null);

  if (!selectToolRef.current) selectToolRef.current = new SelectTool();
  if (!wallToolRef.current) wallToolRef.current = new WallTool();
  if (!doorToolRef.current) doorToolRef.current = new DoorTool();
  if (!windowToolRef.current) windowToolRef.current = new WindowTool();
  if (!moveWallToolRef.current) moveWallToolRef.current = new MoveWallTool();
  if (!moveOpeningToolRef.current) moveOpeningToolRef.current = new MoveOpeningTool();

  const selectTool = selectToolRef.current;
  const wallTool = wallToolRef.current;
  const doorTool = doorToolRef.current;
  const windowTool = windowToolRef.current;
  const moveWallTool = moveWallToolRef.current;
  const moveOpeningTool = moveOpeningToolRef.current;

  const setActiveToolKind = (nextKind: ToolKind) => {
    // Réinitialisation de l'outil sortant pour nettoyer les états transitoires (rubber-band, drag)
    switch (activeToolKind) {
      case 'select':
        selectTool.reset();
        break;
      case 'wall':
        wallTool.reset();
        break;
      case 'door':
        doorTool.reset();
        break;
      case 'window':
        windowTool.reset();
        break;
      case 'moveWall':
        moveWallTool.reset();
        break;
      case 'moveOpening':
        moveOpeningTool.reset();
        break;
    }
    setActiveToolKindState(nextKind);
  };

  const activeTool: Tool = useMemo(() => {
    switch (activeToolKind) {
      case 'wall':
        return wallTool;
      case 'door':
        return doorTool;
      case 'window':
        return windowTool;
      case 'moveWall':
        return moveWallTool;
      case 'moveOpening':
        return moveOpeningTool;
      case 'select':
      default:
        return selectTool;
    }
  }, [activeToolKind, selectTool, wallTool, doorTool, windowTool, moveWallTool, moveOpeningTool]);

  return {
    activeToolKind,
    setActiveToolKind,
    activeTool,
  };
}
