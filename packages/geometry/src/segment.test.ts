import { describe, it, expect } from 'vitest';
import {
  segment2,
  intersectSegments,
  projectPointOnSegment,
  distancePointToSegment,
  isParallelSegments,
  isCollinearSegments,
} from './segment.js';
import { vec2, equals, add } from './vec2.js';

describe('Géométrie des Segments Finis (Segment2)', () => {
  describe('Segments sécants (Intersection ponctuelle)', () => {
    it('croisement intérieur franc en croix à 90°', () => {
      const s1 = segment2(vec2(0, 100), vec2(200, 100)); // horizontal
      const s2 = segment2(vec2(100, 0), vec2(100, 200)); // vertical

      const res = intersectSegments(s1, s2);
      expect(res.type).toBe('point');
      if (res.type === 'point') {
        expect(equals(res.point, vec2(100, 100))).toBe(true);
        expect(res.t).toBeCloseTo(0.5, 6);
        expect(res.u).toBeCloseTo(0.5, 6);
      }
    });

    it('croisement à 45°', () => {
      const s1 = segment2(vec2(0, 0), vec2(200, 200));
      const s2 = segment2(vec2(0, 200), vec2(200, 0));

      const res = intersectSegments(s1, s2);
      expect(res.type).toBe('point');
      if (res.type === 'point') {
        expect(equals(res.point, vec2(100, 100))).toBe(true);
        expect(res.t).toBeCloseTo(0.5, 6);
        expect(res.u).toBeCloseTo(0.5, 6);
      }
    });

    it('croisement à 135°', () => {
      const s1 = segment2(vec2(0, 0), vec2(200, 0));
      const s2 = segment2(vec2(50, -50), vec2(150, 50));

      const res = intersectSegments(s1, s2);
      expect(res.type).toBe('point');
      if (res.type === 'point') {
        expect(equals(res.point, vec2(100, 0))).toBe(true);
      }
    });

    it('segments sécants dont le point d intersection est hors bornes (disjoints)', () => {
      // Les droites se coupent en (100, 100), mais les segments s'arrêtent avant
      const s1 = segment2(vec2(0, 100), vec2(50, 100));
      const s2 = segment2(vec2(100, 0), vec2(100, 50));

      const res = intersectSegments(s1, s2);
      expect(res.type).toBe('none');
    });
  });

  describe('Contact sur les extrémités', () => {
    it('jonction en L : deux segments se touchent exactement sur une extrémité', () => {
      const s1 = segment2(vec2(0, 0), vec2(100, 0));
      const s2 = segment2(vec2(100, 0), vec2(100, 100)); // Départ de S2 = Fin de S1

      const res = intersectSegments(s1, s2);
      expect(res.type).toBe('point');
      if (res.type === 'point') {
        expect(equals(res.point, vec2(100, 0))).toBe(true);
        expect(res.t).toBeCloseTo(1, 6);
        expect(res.u).toBeCloseTo(0, 6);
      }
    });

    it('jonction en T : l extrémité d un segment touche l intérieur d un autre', () => {
      const s1 = segment2(vec2(0, 100), vec2(200, 100));
      const s2 = segment2(vec2(100, 0), vec2(100, 100)); // S2 se termine sur S1

      const res = intersectSegments(s1, s2);
      expect(res.type).toBe('point');
      if (res.type === 'point') {
        expect(equals(res.point, vec2(100, 100))).toBe(true);
        expect(res.t).toBeCloseTo(0.5, 6);
        expect(res.u).toBeCloseTo(1.0, 6);
      }
    });
  });

  describe('Segments colinéaires et chevauchements', () => {
    it('segments colinéaires disjoints', () => {
      const s1 = segment2(vec2(0, 0), vec2(100, 0));
      const s2 = segment2(vec2(150, 0), vec2(250, 0));

      expect(isCollinearSegments(s1, s2)).toBe(true);
      const res = intersectSegments(s1, s2);
      expect(res.type).toBe('none');
    });

    it('segments colinéaires en contact par une seule extrémité', () => {
      const s1 = segment2(vec2(0, 0), vec2(100, 0));
      const s2 = segment2(vec2(100, 0), vec2(200, 0)); // Contact en (100, 0)

      expect(isCollinearSegments(s1, s2)).toBe(true);
      const res = intersectSegments(s1, s2);
      expect(res.type).toBe('point');
      if (res.type === 'point') {
        expect(equals(res.point, vec2(100, 0))).toBe(true);
        expect(res.t).toBeCloseTo(1.0, 5);
        expect(res.u).toBeCloseTo(0.0, 5);
      }
    });

    it('segments colinéaires se chevauchant partiellement (sens direct)', () => {
      const s1 = segment2(vec2(0, 0), vec2(200, 0));
      const s2 = segment2(vec2(100, 0), vec2(300, 0)); // Chevauchement sur [100, 200]

      expect(isCollinearSegments(s1, s2)).toBe(true);
      const res = intersectSegments(s1, s2);
      expect(res.type).toBe('overlap');
      if (res.type === 'overlap') {
        expect(equals(res.segment[0], vec2(100, 0))).toBe(true);
        expect(equals(res.segment[1], vec2(200, 0))).toBe(true);
        expect(res.tRange[0]).toBeCloseTo(0.5, 5);
        expect(res.tRange[1]).toBeCloseTo(1.0, 5);
      }
    });

    it('segments colinéaires se chevauchant en sens inverse (180°)', () => {
      const s1 = segment2(vec2(0, 0), vec2(200, 0));
      const s2 = segment2(vec2(300, 0), vec2(100, 0)); // Orienté de droite à gauche

      expect(isCollinearSegments(s1, s2)).toBe(true);
      const res = intersectSegments(s1, s2);
      expect(res.type).toBe('overlap');
      if (res.type === 'overlap') {
        expect(equals(res.segment[0], vec2(100, 0))).toBe(true);
        expect(equals(res.segment[1], vec2(200, 0))).toBe(true);
      }
    });

    it('segments identiques confondus', () => {
      const s1 = segment2(vec2(50, 50), vec2(250, 150));
      const s2 = segment2(vec2(50, 50), vec2(250, 150));

      const res = intersectSegments(s1, s2);
      expect(res.type).toBe('overlap');
      if (res.type === 'overlap') {
        expect(equals(res.segment[0], s1.start)).toBe(true);
        expect(equals(res.segment[1], s1.end)).toBe(true);
        expect(res.tRange[0]).toBeCloseTo(0, 5);
        expect(res.tRange[1]).toBeCloseTo(1, 5);
      }
    });

    it('segment inclus entièrement dans un autre', () => {
      const sGrand = segment2(vec2(0, 0), vec2(1000, 0));
      const sPetit = segment2(vec2(200, 0), vec2(600, 0));

      const res = intersectSegments(sGrand, sPetit);
      expect(res.type).toBe('overlap');
      if (res.type === 'overlap') {
        expect(equals(res.segment[0], vec2(200, 0))).toBe(true);
        expect(equals(res.segment[1], vec2(600, 0))).toBe(true);
      }
    });
  });

  describe('Segments parallèles et cas limites', () => {
    it('segments parallèles non colinéaires (disjoints)', () => {
      const s1 = segment2(vec2(0, 0), vec2(100, 0));
      const s2 = segment2(vec2(0, 20), vec2(100, 20));

      expect(isParallelSegments(s1, s2)).toBe(true);
      expect(isCollinearSegments(s1, s2)).toBe(false);
      expect(intersectSegments(s1, s2).type).toBe('none');
    });

    it('segments de longueur nulle (dégénérés)', () => {
      const sValid = segment2(vec2(0, 0), vec2(100, 100));
      const sZero = segment2(vec2(50, 50), vec2(50, 50));

      const res1 = intersectSegments(sZero, sValid);
      expect(res1.type).toBe('degenerate');
      if (res1.type === 'degenerate') {
        expect(res1.reason).toBe('segment1_zero');
      }

      const res2 = intersectSegments(sValid, sZero);
      expect(res2.type).toBe('degenerate');
      if (res2.type === 'degenerate') {
        expect(res2.reason).toBe('segment2_zero');
      }

      const resBoth = intersectSegments(sZero, sZero);
      expect(resBoth.type).toBe('degenerate');
      if (resBoth.type === 'degenerate') {
        expect(resBoth.reason).toBe('both_zero');
      }
    });

    it('gère les valeurs numériques proches de la tolérance EPSILON_DISTANCE', () => {
      const s1 = segment2(vec2(0, 0), vec2(100, 0));
      // Écart de 0.00005 mm (inférieur à EPSILON_DISTANCE = 1e-4) -> considéré comme intersectant l'extrémité
      const s2Near = segment2(vec2(100 + 0.00005, 0), vec2(200, 0));
      const resNear = intersectSegments(s1, s2Near);
      expect(resNear.type).toBe('point');

      // Écart de 0.005 mm (largement supérieur à 1e-4) -> disjoint
      const s2Far = segment2(vec2(100 + 0.005, 0), vec2(200, 0));
      const resFar = intersectSegments(s1, s2Far);
      expect(resFar.type).toBe('none');
    });
  });

  describe('Projection et Distance Point-Segment', () => {
    it('projette un point perpendiculairement à l intérieur du segment', () => {
      const s = segment2(vec2(0, 0), vec2(200, 0));
      const p = vec2(100, 50);

      const proj = projectPointOnSegment(p, s);
      expect(proj.point.x).toBe(100);
      expect(proj.point.y).toBe(0);
      expect(proj.t).toBe(0.5);
      expect(distancePointToSegment(p, s)).toBe(50);
    });

    it('projette un point en dehors au-delà de la fin (clampé à end)', () => {
      const s = segment2(vec2(0, 0), vec2(200, 0));
      const p = vec2(250, 50);

      const proj = projectPointOnSegment(p, s);
      expect(proj.point.x).toBe(200);
      expect(proj.point.y).toBe(0);
      expect(proj.t).toBe(1.0);
      expect(distancePointToSegment(p, s)).toBeCloseTo(Math.hypot(50, 50), 6);
    });

    it('projette un point en dehors avant le départ (clampé à start)', () => {
      const s = segment2(vec2(0, 0), vec2(200, 0));
      const p = vec2(-30, 40);

      const proj = projectPointOnSegment(p, s);
      expect(proj.point.x).toBe(0);
      expect(proj.point.y).toBe(0);
      expect(proj.t).toBe(0.0);
      expect(distancePointToSegment(p, s)).toBe(50);
    });

    it('propriété : la distance point-segment est invariante par translation globale', () => {
      const s = segment2(vec2(100, 200), vec2(500, 600));
      const p = vec2(250, 400);
      const dInitial = distancePointToSegment(p, s);

      const offset = vec2(-1234.5, 6789.1);
      const sTrans = segment2(add(s.start, offset), add(s.end, offset));
      const pTrans = add(p, offset);

      expect(distancePointToSegment(pTrans, sTrans)).toBeCloseTo(dInitial, 6);
    });
  });
});
