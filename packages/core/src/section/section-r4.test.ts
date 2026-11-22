import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { BimDocument, computeSectionScene, type SectionCut } from '../index.js';
import { vec2 } from '@mini-bim/geometry';

describe('Saison 3 — Lot 2.A : Coupe Immeuble R+4 avec 6 Niveaux, Trémies et MEP', () => {
  it('calcule la coupe axiale traversant la cage d’escalier et les gaines MEP', () => {
    const r4JsonPath = path.resolve(__dirname, '../../../../apps/web/public/demo-immeuble-r4.json');
    if (!fs.existsSync(r4JsonPath)) {
      console.warn('Fichier demo-immeuble-r4.json non trouvé, test ignoré.');
      return;
    }

    const r4Json = fs.readFileSync(r4JsonPath, 'utf-8');
    const doc = BimDocument.fromJSON(r4Json);
    const state = doc.getState();

    // Coupe transversale traversant la distribution MEP et la cage d'escalier
    // Ligne à Y = -2000 de X = -6000 à X = 6000 (L = 12000), regard vers le Nord (Y+)
    const cut: SectionCut = {
      id: 'cut_r4_longitudinale',
      category: 'sectionCut',
      name: "Coupe Longitudinale B-B'",
      label: 'B',
      kind: 'section',
      start: vec2(-6000, -2000),
      end: vec2(6000, -2000),
      viewDirection: 1,
      depth: 8000,
    };

    const scene = computeSectionScene(state, cut);

    expect(scene.levels).toHaveLength(6); // RDC, R+1, R+2, R+3, R+4, Toiture
    expect(scene.cutItems.length).toBeGreaterThan(0);

    // Murs coupés sur les 5 étages
    const wallCuts = scene.cutItems.filter((i) => i.category === 'wall');
    expect(wallCuts.length).toBeGreaterThanOrEqual(10);

    // Dalles coupées
    const slabCuts = scene.cutItems.filter((i) => i.category === 'slab');
    expect(slabCuts.length).toBeGreaterThanOrEqual(5);

    // Conduits / Chemins de câbles MEP coupés ou projetés
    const mepCuts = scene.cutItems.filter(
      (i) => i.category === 'pipe' || i.category === 'duct' || i.category === 'cableTray',
    );
    const mepProjected = scene.projectedItems.filter(
      (i) => i.category === 'pipe' || i.category === 'duct' || i.category === 'cableTray',
    );
    expect(mepCuts.length + mepProjected.length).toBeGreaterThan(0);
  });
});
