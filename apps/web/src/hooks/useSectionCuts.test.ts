import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { Commands } from '@tabax/core';
import { useSectionCuts } from './useSectionCuts.js';
import { createDemoDocument } from '../demo/demoDocument.js';

describe('Hook useSectionCuts (ADR-063)', () => {
  it('gère la sélection de coupe et la bascule de synchronisation 3D', () => {
    const doc = createDemoDocument();
    doc.execute(
      new Commands.AddSectionCutCommand({
        id: 'sec_test',
        name: "Coupe Test",
        label: 'A',
        category: 'sectionCut',
        kind: 'section',
        start: { x: 0, y: 0 },
        end: { x: 4000, y: 0 },
        viewDirection: 1,
        depth: 2000,
      }),
    );

    const { result } = renderHook(() => useSectionCuts(doc));

    expect(result.current.activeSectionCutId).toBeNull();
    expect(result.current.activeSectionCut).toBeNull();
    expect(result.current.is3dSynchroEnabled).toBe(false);

    // Sélectionner la coupe
    act(() => {
      result.current.setActiveSectionCutId('sec_test');
    });

    expect(result.current.activeSectionCutId).toBe('sec_test');
    expect(result.current.activeSectionCut?.name).toBe("Coupe Test");
    expect(result.current.activeSectionCutFor3D).toBeNull();

    // Activer la synchronisation 3D
    act(() => {
      result.current.toggle3dSynchro();
    });

    expect(result.current.is3dSynchroEnabled).toBe(true);
    expect(result.current.activeSectionCutFor3D).toEqual({
      start: { x: 0, y: 0 },
      end: { x: 4000, y: 0 },
      viewDirection: 1,
    });
  });

  it('désélectionne automatiquement si la coupe active est supprimée', () => {
    const doc = createDemoDocument();
    doc.execute(
      new Commands.AddSectionCutCommand({
        id: 'sec_del',
        name: "Coupe A Supprimer",
        label: 'B',
        category: 'sectionCut',
        kind: 'section',
        start: { x: 0, y: 0 },
        end: { x: 4000, y: 0 },
        viewDirection: 1,
        depth: 2000,
      }),
    );

    const { result } = renderHook(() => useSectionCuts(doc));

    act(() => {
      result.current.setActiveSectionCutId('sec_del');
    });
    expect(result.current.activeSectionCutId).toBe('sec_del');

    // Supprimer la coupe du document
    act(() => {
      doc.execute(new Commands.DeleteSectionCutCommand('sec_del'));
    });

    expect(result.current.activeSectionCutId).toBeNull();
  });
});
