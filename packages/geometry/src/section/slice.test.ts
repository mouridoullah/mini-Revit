import { describe, it, expect } from 'vitest';
import {
  createSectionFrame2D,
  projectPointToSectionFrame,
  unprojectPointFromSectionFrame,
  sliceSegmentWithPolygon,
  sliceSegmentWithPolygonWithHoles,
} from './index.js';
import { vec2 } from '../vec2.js';

describe('Saison 3 — Lot 2.A : Géométrie de coupe analytique (@mini-bim/geometry)', () => {
  describe('SectionFrame2D', () => {
    it('initialise un repère horizontal avec direction 1 (regard vers le haut/Y+)', () => {
      const frame = createSectionFrame2D(vec2(0, 0), vec2(10000, 0), 1, 5000);
      expect(frame.length).toBe(10000);
      expect(frame.u.x).toBe(1);
      expect(frame.u.y).toBe(0);
      // n = 1 * (-uy, ux) = (0, 1) -> Y+
      expect(frame.n.x).toBe(0);
      expect(frame.n.y).toBe(1);

      const proj = projectPointToSectionFrame(vec2(2500, 1000), frame);
      expect(proj.s).toBeCloseTo(2500);
      expect(proj.d).toBeCloseTo(1000);

      const unproj = unprojectPointFromSectionFrame(proj.s, proj.d, frame);
      expect(unproj.x).toBeCloseTo(2500);
      expect(unproj.y).toBeCloseTo(1000);
    });

    it('initialise un repère oblique à 45° avec direction -1', () => {
      const start = vec2(0, 0);
      const end = vec2(1000, 1000);
      const frame = createSectionFrame2D(start, end, -1, 2000);
      expect(frame.length).toBeCloseTo(Math.hypot(1000, 1000));

      const mid = vec2(500, 500);
      const projMid = projectPointToSectionFrame(mid, frame);
      expect(projMid.s).toBeCloseTo(frame.length / 2);
      expect(projMid.d).toBeCloseTo(0);
    });
  });

  describe('sliceSegmentWithPolygon', () => {
    it('calcule la traversée complète d’un polygone rectangulaire', () => {
      // Rectangle [1000, 4000] x [1000, 3000]
      const poly = [vec2(1000, 1000), vec2(4000, 1000), vec2(4000, 3000), vec2(1000, 3000)];
      // Segment traversant de (0, 2000) à (5000, 2000) (L = 5000)
      const slices = sliceSegmentWithPolygon(vec2(0, 2000), vec2(5000, 2000), poly);

      expect(slices).toHaveLength(1);
      expect(slices[0]?.startS).toBeCloseTo(1000);
      expect(slices[0]?.endS).toBeCloseTo(4000);
      expect(slices[0]?.startPt.x).toBeCloseTo(1000);
      expect(slices[0]?.startPt.y).toBeCloseTo(2000);
      expect(slices[0]?.endPt.x).toBeCloseTo(4000);
      expect(slices[0]?.endPt.y).toBeCloseTo(2000);
    });

    it('retourne une liste vide si le segment ne touche pas le polygone', () => {
      const poly = [vec2(1000, 1000), vec2(4000, 1000), vec2(4000, 3000), vec2(1000, 3000)];
      const slices = sliceSegmentWithPolygon(vec2(0, 5000), vec2(5000, 5000), poly);
      expect(slices).toHaveLength(0);
    });

    it('gère un polygone en U traversé deux fois par la ligne de coupe', () => {
      // Polygone en U : [0,0]->[6000,0]->[6000,4000]->[4000,4000]->[4000,2000]->[2000,2000]->[2000,4000]->[0,4000]
      const uPoly = [
        vec2(0, 0),
        vec2(6000, 0),
        vec2(6000, 4000),
        vec2(4000, 4000),
        vec2(4000, 2000),
        vec2(2000, 2000),
        vec2(2000, 4000),
        vec2(0, 4000),
      ];

      // Segment à y = 3000 de x = -1000 à x = 7000 (L = 8000)
      // Branche gauche : x ∈ [0, 2000], creux x ∈ [2000, 4000], branche droite : x ∈ [4000, 6000]
      const slices = sliceSegmentWithPolygon(vec2(-1000, 3000), vec2(7000, 3000), uPoly);

      expect(slices).toHaveLength(2);
      // Branche gauche : de x=0 (s=1000) à x=2000 (s=3000)
      expect(slices[0]?.startS).toBeCloseTo(1000);
      expect(slices[0]?.endS).toBeCloseTo(3000);
      // Branche droite : de x=4000 (s=5000) à x=6000 (s=7000)
      expect(slices[1]?.startS).toBeCloseTo(5000);
      expect(slices[1]?.endS).toBeCloseTo(7000);
    });

    it('gère un polygone avec un trou (ex. trémie de dalle)', () => {
      const outer = [vec2(0, 0), vec2(6000, 0), vec2(6000, 6000), vec2(0, 6000)];
      const hole = [vec2(2000, 2000), vec2(4000, 2000), vec2(4000, 4000), vec2(2000, 4000)];

      // Segment traversant le trou à y = 3000
      const slices = sliceSegmentWithPolygonWithHoles(
        vec2(0, 3000),
        vec2(6000, 3000),
        outer,
        [hole],
      );

      expect(slices).toHaveLength(2);
      expect(slices[0]?.startS).toBeCloseTo(0);
      expect(slices[0]?.endS).toBeCloseTo(2000);
      expect(slices[1]?.startS).toBeCloseTo(4000);
      expect(slices[1]?.endS).toBeCloseTo(6000);
    });
  });
});
