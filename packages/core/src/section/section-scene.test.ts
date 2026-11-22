import { describe, it, expect } from 'vitest';
import {
  createComplexVillaDocument,
  computeSectionScene,
  type SectionCut,
} from '../index.js';
import { vec2 } from '@tabax/geometry';

describe('Saison 3 — Lot 2.A : Scène de coupe analytique computeSectionScene (ADR-063)', () => {
  it('calcule la coupe transversale de la Villa Contemporaine Complexe (toiture 2 pans, mur pignon & dalle)', () => {
    const doc = createComplexVillaDocument();
    const state = doc.getState();

    // Coupe à travers la villa à Y = 4000 de X = -1000 à X = 15000 (L = 16000)
    const cut: SectionCut = {
      id: 'cut_villa_transversale',
      category: 'sectionCut',
      name: "Coupe transversale A-A'",
      label: 'A',
      kind: 'section',
      start: vec2(-1000, 4000),
      end: vec2(15000, 4000),
      viewDirection: 1,
      depth: 8000,
    };

    const scene = computeSectionScene(state, cut);

    expect(scene.cutId).toBe(cut.id);
    expect(scene.cutLength).toBe(16000);
    expect(scene.levels.length).toBeGreaterThanOrEqual(2);

    // Murs coupés
    const wallCuts = scene.cutItems.filter((i) => i.category === 'wall');
    expect(wallCuts.length).toBeGreaterThan(0);

    // Dalles coupées
    const slabCuts = scene.cutItems.filter((i) => i.category === 'slab');
    expect(slabCuts.length).toBeGreaterThan(0);

    // Toitures coupées
    const roofCuts = scene.cutItems.filter((i) => i.category === 'roof');
    expect(roofCuts.length).toBeGreaterThan(0);

    // Éléments projetés en arrière-plan
    expect(scene.projectedItems.length).toBeGreaterThan(0);
    // Vérifie que les éléments projetés sont triés par profondeur décroissante
    for (let i = 0; i < scene.projectedItems.length - 1; i++) {
      expect(scene.projectedItems[i]!.depth).toBeGreaterThanOrEqual(
        scene.projectedItems[i + 1]!.depth,
      );
    }
  });

  it('calcule une élévation de façade avec 100% de projection en arrière-plan', () => {
    const doc = createComplexVillaDocument();
    const state = doc.getState();

    // Élévation Façade Sud positionnée en avant de la villa (Y = -2000) regardant vers Y+
    const elevationSud: SectionCut = {
      id: 'elev_facade_sud',
      category: 'sectionCut',
      name: 'Élévation Façade Sud',
      label: 'S',
      kind: 'elevation',
      start: vec2(-2000, -2000),
      end: vec2(16000, -2000),
      viewDirection: 1, // Regard vers Y+
      depth: 25000,
    };

    const scene = computeSectionScene(state, elevationSud);

    // Comme la ligne de coupe est à l'extérieur de l'emprise, aucun mur n'est coupé
    const wallCuts = scene.cutItems.filter((i) => i.category === 'wall');
    expect(wallCuts).toHaveLength(0);

    // En revanche, les murs et ouvertures sont tous projetés en arrière-plan
    expect(scene.projectedItems.length).toBeGreaterThan(0);
    const projectedWalls = scene.projectedItems.filter((i) => i.category === 'wall');
    expect(projectedWalls.length).toBeGreaterThan(0);
  });
});
