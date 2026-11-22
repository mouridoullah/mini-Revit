import { describe, it, expect } from 'vitest';
import { renderSectionView, generateSectionSvg } from './index.js';
import { createMockCanvas } from './test-utils.js';
import { vec2 } from '@tabax/geometry';
import type { SectionScene } from '@tabax/core';

describe('Saison 3 — Lot 2.A : Rendu Canvas 2D & Export SVG de Coupe (ADR-063)', () => {
  const sampleScene: SectionScene = {
    cutId: 'cut_sample_01',
    cutName: "Coupe transversale A-A'",
    cutLabel: 'A',
    kind: 'section',
    cutLength: 10000,
    depth: 6000,
    bounds: {
      sMin: 0,
      sMax: 10000,
      zMin: -500,
      zMax: 6500,
    },
    levels: [
      { id: 'lvl_0', name: 'RDC', elevation: 0 },
      { id: 'lvl_1', name: 'R+1', elevation: 2800 },
      { id: 'lvl_2', name: 'R+2', elevation: 5600 },
    ],
    cutItems: [
      {
        id: 'wall_cut_left',
        category: 'wall',
        polygon: [vec2(1000, 0), vec2(1250, 0), vec2(1250, 2800), vec2(1000, 2800)],
        style: { fill: '#d1d5db', stroke: '#0f172a', strokeWidth: 2, hatch: 'masonry' },
      },
      {
        id: 'slab_cut_r1',
        category: 'slab',
        polygon: [vec2(1000, 2600), vec2(9000, 2600), vec2(9000, 2800), vec2(1000, 2800)],
        style: { fill: '#cbd5e1', stroke: '#0f172a', strokeWidth: 2, hatch: 'concrete' },
      },
      {
        id: 'pipe_cut_plumb',
        category: 'pipe',
        polygon: [
          vec2(4000, 2500),
          vec2(4050, 2500),
          vec2(4050, 2550),
          vec2(4000, 2550),
        ],
        style: { fill: '#2563eb', stroke: '#0f172a', strokeWidth: 2, hatch: 'solid' },
      },
    ],
    projectedItems: [
      {
        id: 'wall_proj_back',
        category: 'wall',
        depth: 3000,
        polygon: [vec2(1250, 0), vec2(8750, 0), vec2(8750, 2800), vec2(1250, 2800)],
        style: { stroke: '#94a3b8', strokeWidth: 1, fill: 'rgba(241, 245, 249, 0.4)' },
      },
      {
        id: 'door_proj_back',
        category: 'door',
        depth: 3001,
        polygon: [vec2(3000, 0), vec2(3900, 0), vec2(3900, 2100), vec2(3000, 2100)],
        style: { stroke: '#92400e', strokeWidth: 1.2, fill: 'rgba(254, 243, 199, 0.6)' },
      },
    ],
  };

  describe('renderSectionView (Canvas 2D API)', () => {
    it('rend la scène de coupe sans exception et avec des coordonnées strictement finies', () => {
      const { mock } = createMockCanvas(1000, 700);

      expect(() => {
        renderSectionView(mock.ctx, sampleScene, {
          width: 1000,
          height: 700,
          showLevels: true,
          showHatch: true,
        });
      }).not.toThrow();

      // Vérifie les tracés Canvas
      const fills = mock.filterCalls('fill');
      expect(fills.length).toBeGreaterThan(0);

      const strokes = mock.filterCalls('stroke');
      expect(strokes.length).toBeGreaterThan(0);

      // Vérifie que les libellés de niveaux et le titre ont été dessinés
      const texts = mock.filterCalls('fillText');
      expect(texts.length).toBeGreaterThanOrEqual(4); // Titre + 3 niveaux

      const levelLabels = texts.map((t) => t.args[0]);
      expect(levelLabels.some((txt) => String(txt).includes('RDC'))).toBe(true);
      expect(levelLabels.some((txt) => String(txt).includes('R+1'))).toBe(true);
      expect(levelLabels.some((txt) => String(txt).includes('R+2'))).toBe(true);
    });
  });

  describe('generateSectionSvg (Vectoriel SVG)', () => {
    it('génère un document SVG vectoriel valide et conforme aux normes d’architecture', () => {
      const svg = generateSectionSvg(sampleScene, {
        scale: 100,
        paperSize: 'A4',
        title: "Coupe transversale A-A'",
        project: 'Résidence Mini-BIM',
      });

      expect(svg).toContain('<svg');
      expect(svg).toContain('viewBox="0 0 297 210"');
      expect(svg).toContain('<pattern id="hatch-masonry"');
      expect(svg).toContain('<pattern id="hatch-concrete"');
      expect(svg).toContain('id="cut-items"');
      expect(svg).toContain('id="projected-items"');
      expect(svg).toContain('id="levels"');
      expect(svg).toContain('id="cartouche"');

      // Vérifie les libellés altimétriques
      expect(svg).toContain('RDC +0.00 m');
      expect(svg).toContain('R+1 +2.80 m');
      expect(svg).toContain('R+2 +5.60 m');

      // Vérifie le cartouche (avec apostrophe échappée en XML)
      expect(svg).toContain("COUPE A-A' : Coupe transversale A-A&apos;");
      expect(svg).toContain('Échelle 1:100');
    });
  });
});
