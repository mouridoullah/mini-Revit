import { describe, it, expect } from 'vitest';
import {
  line2,
  lineFromPoints,
  isParallelLines,
  isCollinearLines,
  intersectLines,
  projectPointOnLine,
} from './line.js';
import { vec2, equals } from './vec2.js';

describe('Géométrie des Droites Infinies (Line2)', () => {
  describe('Intersections de droites selon différents angles', () => {
    it('intersection orthogonale à 90°', () => {
      const l1 = line2(vec2(0, 0), vec2(1, 0)); // Axe X
      const l2 = line2(vec2(100, -50), vec2(0, 1)); // Droite verticale X = 100

      const res = intersectLines(l1, l2);
      expect(res.type).toBe('point');
      if (res.type === 'point') {
        expect(equals(res.point, vec2(100, 0))).toBe(true);
        expect(res.t).toBe(100);
        expect(res.u).toBe(50);
      }
    });

    it('intersection à 45°', () => {
      const l1 = line2(vec2(0, 0), vec2(1, 0)); // y = 0
      const l2 = line2(vec2(0, 100), vec2(1, -1)); // y = 100 - x

      const res = intersectLines(l1, l2);
      expect(res.type).toBe('point');
      if (res.type === 'point') {
        expect(equals(res.point, vec2(100, 0))).toBe(true);
      }
    });

    it('intersection à 135°', () => {
      const l1 = line2(vec2(0, 0), vec2(1, 0)); // y = 0
      const l2 = line2(vec2(200, 0), vec2(-1, 1)); // angle 135°

      const res = intersectLines(l1, l2);
      expect(res.type).toBe('point');
      if (res.type === 'point') {
        expect(equals(res.point, vec2(200, 0))).toBe(true);
      }
    });

    it('détecte le parallélisme strict à 0° (parallèles distinctes)', () => {
      const l1 = line2(vec2(0, 0), vec2(1, 0));
      const l2 = line2(vec2(0, 50), vec2(2, 0));

      expect(isParallelLines(l1, l2)).toBe(true);
      expect(isCollinearLines(l1, l2)).toBe(false);

      const res = intersectLines(l1, l2);
      expect(res.type).toBe('parallel');
    });

    it('détecte le parallélisme à 180° (directions opposées distinctes)', () => {
      const l1 = line2(vec2(0, 0), vec2(1, 0));
      const l2 = line2(vec2(0, 50), vec2(-1, 0));

      expect(isParallelLines(l1, l2)).toBe(true);
      expect(isCollinearLines(l1, l2)).toBe(false);

      const res = intersectLines(l1, l2);
      expect(res.type).toBe('parallel');
    });

    it('détecte des droites colinéaires (confondues)', () => {
      const l1 = line2(vec2(0, 0), vec2(2, 4));
      const l2 = line2(vec2(10, 20), vec2(-1, -2)); // Même droite, sens inverse, origine décalée

      expect(isParallelLines(l1, l2)).toBe(true);
      expect(isCollinearLines(l1, l2)).toBe(true);

      const res = intersectLines(l1, l2);
      expect(res.type).toBe('collinear');
    });
  });

  describe('Cas limites et dégénérescences', () => {
    it('gère une droite avec vecteur nul', () => {
      const lValid = line2(vec2(0, 0), vec2(1, 1));
      const lZero = line2(vec2(10, 10), vec2(0, 0));

      const res1 = intersectLines(lZero, lValid);
      expect(res1.type).toBe('degenerate');
      if (res1.type === 'degenerate') {
        expect(res1.reason).toBe('line1_zero');
      }

      const res2 = intersectLines(lValid, lZero);
      expect(res2.type).toBe('degenerate');
      if (res2.type === 'degenerate') {
        expect(res2.reason).toBe('line2_zero');
      }

      const resBoth = intersectLines(lZero, lZero);
      expect(resBoth.type).toBe('degenerate');
      if (resBoth.type === 'degenerate') {
        expect(resBoth.reason).toBe('both_zero');
      }
    });

    it('gère des droites presque parallèles sous la tolérance colinéaire', () => {
      const l1 = line2(vec2(0, 0), vec2(1, 0));
      // Pente infinitésimale inférieure à EPSILON_COLLINEAR (1e-6)
      const l2 = line2(vec2(0, 10), vec2(1, 1e-8));

      expect(isParallelLines(l1, l2)).toBe(true);
      const res = intersectLines(l1, l2);
      expect(res.type).toBe('parallel');
    });
  });

  describe('Projection orthogonale sur une droite', () => {
    it('projette un point perpendiculairement sur une droite horizontale', () => {
      const line = lineFromPoints(vec2(0, 100), vec2(500, 100));
      const p = vec2(250, 450);

      const proj = projectPointOnLine(p, line);
      expect(proj.point.x).toBe(250);
      expect(proj.point.y).toBe(100);
      expect(proj.t).toBeCloseTo(0.5, 6);
    });

    it('projette un point sur une droite inclinée à 45°', () => {
      const line = lineFromPoints(vec2(0, 0), vec2(100, 100));
      const p = vec2(0, 100);

      const proj = projectPointOnLine(p, line);
      expect(proj.point.x).toBeCloseTo(50, 6);
      expect(proj.point.y).toBeCloseTo(50, 6);
    });
  });
});
