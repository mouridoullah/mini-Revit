import { useState, useMemo, useEffect } from 'react';
import type { BimDocument, SectionCut } from '@tabax/core';

export interface UseSectionCutsResult {
  readonly activeSectionCutId: string | null;
  readonly setActiveSectionCutId: (id: string | null) => void;
  readonly is3dSynchroEnabled: boolean;
  readonly setIs3dSynchroEnabled: (enabled: boolean) => void;
  readonly toggle3dSynchro: () => void;
  readonly activeSectionCut: SectionCut | null;
  readonly activeSectionCutFor3D: {
    readonly start: { readonly x: number; readonly y: number };
    readonly end: { readonly x: number; readonly y: number };
    readonly viewDirection: 1 | -1;
  } | null;
}

/**
 * Hook gérant la coupe active du projet et sa synchronisation 3D (ADR-063).
 */
export function useSectionCuts(doc: BimDocument): UseSectionCutsResult {
  const [activeSectionCutId, setActiveSectionCutId] = useState<string | null>(null);
  const [is3dSynchroEnabled, setIs3dSynchroEnabled] = useState<boolean>(false);
  const [cuts, setCuts] = useState<Record<string, SectionCut> | undefined>(
    () => doc.getState().sectionCuts,
  );

  useEffect(() => {
    const unsub = doc.subscribe(() => {
      setCuts(doc.getState().sectionCuts);
    });
    return unsub;
  }, [doc]);

  // Si la coupe active a été supprimée, désélectionner
  useEffect(() => {
    if (activeSectionCutId && cuts && !cuts[activeSectionCutId]) {
      setActiveSectionCutId(null);
    }
  }, [activeSectionCutId, cuts]);

  const activeSectionCut = useMemo(() => {
    if (!activeSectionCutId || !cuts) return null;
    return cuts[activeSectionCutId] ?? null;
  }, [activeSectionCutId, cuts]);

  const toggle3dSynchro = () => {
    setIs3dSynchroEnabled((prev) => !prev);
  };

  const activeSectionCutFor3D = useMemo(() => {
    if (!is3dSynchroEnabled || !activeSectionCut) return null;
    return {
      start: activeSectionCut.start,
      end: activeSectionCut.end,
      viewDirection: activeSectionCut.viewDirection,
    };
  }, [is3dSynchroEnabled, activeSectionCut]);

  return {
    activeSectionCutId,
    setActiveSectionCutId,
    is3dSynchroEnabled,
    setIs3dSynchroEnabled,
    toggle3dSynchro,
    activeSectionCut,
    activeSectionCutFor3D,
  };
}
