/**
 * useClashCoordination — Hook d'orchestration de la coordination spatiale des conflits BIM
 *
 * Encapsule l'état des conflits actifs, les points focaux 3D / 2D et la navigation
 * automatique vers les niveaux et éléments en collision.
 */

import { useState, useCallback, type Dispatch, type SetStateAction } from 'react';
import type { BimDocument, ClashResult } from '@tabax/core';
import type { ViewMode } from '../components/SplitViewport.js';

export interface UseClashCoordinationProps {
  readonly doc: BimDocument;
  readonly setSelectedIds: Dispatch<SetStateAction<readonly string[]>>;
  readonly setActiveLevelId: Dispatch<SetStateAction<string>>;
  readonly setViewMode: Dispatch<SetStateAction<ViewMode>>;
}

export function useClashCoordination({
  doc,
  setSelectedIds,
  setActiveLevelId,
  setViewMode,
}: UseClashCoordinationProps) {
  const [activeClashes, setActiveClashes] = useState<readonly ClashResult[]>([]);
  const [clashFocusPoint, setClashFocusPoint] = useState<{
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly triggerId?: number;
  } | null>(null);
  const [focus2DPoint, setFocus2DPoint] = useState<{
    readonly x: number;
    readonly y: number;
    readonly triggerId?: number;
  } | null>(null);

  const handleSelectClash = useCallback(
    (clash: ClashResult) => {
      setSelectedIds([clash.elementA, clash.elementB]);
      const state = doc.getState();
      const levelId =
        state.walls[clash.elementA]?.levelId ??
        state.pipes?.[clash.elementA]?.levelId ??
        state.ducts?.[clash.elementA]?.levelId ??
        state.cableTrays?.[clash.elementA]?.levelId ??
        state.slabs?.[clash.elementA]?.levelId ??
        state.walls[clash.elementB]?.levelId ??
        state.pipes?.[clash.elementB]?.levelId ??
        state.ducts?.[clash.elementB]?.levelId ??
        state.cableTrays?.[clash.elementB]?.levelId ??
        state.slabs?.[clash.elementB]?.levelId;

      if (levelId) {
        setActiveLevelId(levelId);
      }
      setClashFocusPoint({
        x: clash.point.x,
        y: clash.point.y,
        z: clash.point.z,
        triggerId: Date.now() + Math.random(),
      });
      setViewMode('clashes');
    },
    [doc, setSelectedIds, setActiveLevelId, setViewMode],
  );

  const handleFocusPoint3D = useCallback(
    (point: { readonly x: number; readonly y: number; readonly z: number }) => {
      setClashFocusPoint({
        x: point.x,
        y: point.y,
        z: point.z,
        triggerId: Date.now() + Math.random(),
      });
      setViewMode((current) => (current === '2d' || current === 'section' ? 'split' : current));
    },
    [setViewMode],
  );

  const handleLocate2D = useCallback(
    (point: { readonly x: number; readonly y: number }, levelId?: string) => {
      if (levelId) {
        setActiveLevelId(levelId);
      }
      setFocus2DPoint({
        x: point.x,
        y: point.y,
        triggerId: Date.now() + Math.random(),
      });
      setViewMode((current) => (current === '3d' || current === 'section' ? 'split' : current));
    },
    [setActiveLevelId, setViewMode],
  );

  return {
    activeClashes,
    setActiveClashes,
    clashFocusPoint,
    setClashFocusPoint,
    focus2DPoint,
    handleSelectClash,
    handleFocusPoint3D,
    handleLocate2D,
  };
}
