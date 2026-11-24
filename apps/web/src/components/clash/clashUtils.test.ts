import { describe, it, expect, vi } from 'vitest';
import { BimDocument, type ClashResult } from '@tabax/core';
import { getElementInfo, filterClashes, exportClashesToCsv } from './clashUtils.js';

describe('clashUtils (Utilitaires partagés de détection des conflits)', () => {
  it('extrait les métadonnées d affichage des éléments (mur, dalle, tuyau, etc.)', () => {
    const doc = new BimDocument();
    const state = doc.getState();

    // ID inconnu
    const unknownInfo = getElementInfo(state, 'unknown_id');
    expect(unknownInfo.name).toBe('unknown_id');
    expect(unknownInfo.discipline).toBe('Autre');

    // Mur existant dans le doc par défaut
    const wallId = Object.keys(state.walls)[0];
    if (wallId) {
      const wallInfo = getElementInfo(state, wallId);
      expect(wallInfo.category).toBe('Mur architectural');
      expect(wallInfo.discipline).toContain('Architecture');
    }
  });

  it('filtre les conflits par sévérité, discipline et recherche textuelle', () => {
    const doc = new BimDocument();
    const state = doc.getState();

    const mockClashes: ClashResult[] = [
      {
        id: 'clash_1',
        elementA: 'pipe_1',
        elementB: 'wall_1',
        categoryA: 'pipe',
        categoryB: 'wall',
        disciplineA: 'mep',
        disciplineB: 'architecture',
        severity: 'hard',
        penetrationDepthMm: 25,
        intersectionBox: { min: { x: 990, y: 1990, z: 2490 }, max: { x: 1010, y: 2010, z: 2510 } },
        point: { x: 1000, y: 2000, z: 2500 },
        description: 'Collision pipe wall',
      },
      {
        id: 'clash_2',
        elementA: 'duct_1',
        elementB: 'slab_1',
        categoryA: 'duct',
        categoryB: 'slab',
        disciplineA: 'mep',
        disciplineB: 'structure',
        severity: 'clearance',
        penetrationDepthMm: 10,
        intersectionBox: { min: { x: 2990, y: 3990, z: 2790 }, max: { x: 3010, y: 4010, z: 2810 } },
        point: { x: 3000, y: 4000, z: 2800 },
        description: 'Clearance duct slab',
      },
    ];

    // Filtre sévérité hard
    const hardOnly = filterClashes(mockClashes, 'hard', 'all', state);
    expect(hardOnly.length).toBe(1);
    expect(hardOnly[0]!.id).toBe('clash_1');

    // Filtre sévérité clearance
    const clearanceOnly = filterClashes(mockClashes, 'clearance', 'all', state);
    expect(clearanceOnly.length).toBe(1);
    expect(clearanceOnly[0]!.id).toBe('clash_2');

    // Recherche textuelle
    const queryResult = filterClashes(mockClashes, 'all', 'all', state, 'pipe_1');
    expect(queryResult.length).toBe(1);
    expect(queryResult[0]!.id).toBe('clash_1');
  });

  it('génère un fichier CSV téléchargeable', () => {
    const doc = new BimDocument();
    const state = doc.getState();
    const mockClashes: ClashResult[] = [
      {
        id: 'clash_1',
        elementA: 'pipe_1',
        elementB: 'wall_1',
        categoryA: 'pipe',
        categoryB: 'wall',
        disciplineA: 'mep',
        disciplineB: 'architecture',
        severity: 'hard',
        penetrationDepthMm: 25,
        intersectionBox: { min: { x: 990, y: 1990, z: 2490 }, max: { x: 1010, y: 2010, z: 2510 } },
        point: { x: 1000, y: 2000, z: 2500 },
        description: 'Collision pipe wall',
      },
    ];

    const clickSpy = vi.fn();
    const mockAnchor = {
      href: '',
      download: '',
      click: clickSpy,
    };
    vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as never);
    vi.spyOn(document.body, 'appendChild').mockImplementation(vi.fn());
    vi.spyOn(document.body, 'removeChild').mockImplementation(vi.fn());
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://localhost/mock-csv');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(vi.fn());

    exportClashesToCsv(mockClashes, state);
    expect(clickSpy).toHaveBeenCalled();
    expect(mockAnchor.download).toContain('rapport-conflits-bim-');
  });
});
