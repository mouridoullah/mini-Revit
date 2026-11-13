import { describe, it, expect } from 'vitest';
import {
  vec2,
  add,
  sub,
  mul,
  dot,
  cross2d,
  length,
  lengthSquared,
  normalize,
  perp,
  distance,
  distanceSquared,
  equals,
  lerp,
  VEC2_ZERO,
} from './vec2.js';

describe('Vecteurs 2D (Vec2)', () => {
  describe('Construction et validation des entrées', () => {
    it('construit un vecteur valide avec coordonnées finies', () => {
      const v = vec2(100, -250.5);
      expect(v.x).toBe(100);
      expect(v.y).toBe(-250.5);
    });

    it('rejette NaN et Infinity avec une RangeError', () => {
      expect(() => vec2(NaN, 10)).toThrow(RangeError);
      expect(() => vec2(10, Infinity)).toThrow(RangeError);
      expect(() => vec2(-Infinity, 0)).toThrow(RangeError);
    });

    it('normalise -0 en 0', () => {
      const v = vec2(-0, 0);
      expect(Object.is(v.x, 0)).toBe(true);
      expect(Object.is(v.y, 0)).toBe(true);
    });

    it('est immuable (freeze)', () => {
      const v = vec2(10, 20);
      expect(Object.isFrozen(v)).toBe(true);
    });
  });

  describe('Opérations arithmétiques de base', () => {
    it('additionne correctement deux vecteurs', () => {
      const a = vec2(10, 20);
      const b = vec2(30, -5);
      const res = add(a, b);
      expect(res.x).toBe(40);
      expect(res.y).toBe(15);
    });

    it('soustrait correctement deux vecteurs', () => {
      const a = vec2(10, 20);
      const b = vec2(30, 5);
      const res = sub(a, b);
      expect(res.x).toBe(-20);
      expect(res.y).toBe(15);
    });

    it('multiplie par un scalaire', () => {
      const v = vec2(15, -10);
      const res = mul(v, 2.5);
      expect(res.x).toBe(37.5);
      expect(res.y).toBe(-25);
    });

    it('rejette la multiplication par NaN ou Infinity', () => {
      const v = vec2(10, 10);
      expect(() => mul(v, NaN)).toThrow(RangeError);
      expect(() => mul(v, Infinity)).toThrow(RangeError);
    });
  });

  describe('Produit scalaire et vectoriel 2D', () => {
    it('calcule le produit scalaire (dot)', () => {
      const a = vec2(2, 3);
      const b = vec2(4, 5);
      expect(dot(a, b)).toBe(2 * 4 + 3 * 5); // 23
    });

    it('respecte l orthogonalité (dot = 0 à 90°)', () => {
      const a = vec2(100, 0);
      const b = vec2(0, 50);
      expect(dot(a, b)).toBe(0);
    });

    it('calcule le produit vectoriel 2D (cross2d / déterminant)', () => {
      const a = vec2(1, 0);
      const b = vec2(0, 1);
      expect(cross2d(a, b)).toBe(1); // 90° CCW
      expect(cross2d(b, a)).toBe(-1); // 90° CW
    });

    it('donne cross2d = 0 pour deux vecteurs colinéaires (0° et 180°)', () => {
      const a = vec2(100, 200);
      const bCollinear = vec2(200, 400);
      const bOpposite = vec2(-100, -200);
      expect(cross2d(a, bCollinear)).toBe(0);
      expect(cross2d(a, bOpposite)).toBe(0);
    });
  });

  describe('Normes, distances et normalisation', () => {
    it('calcule length et lengthSquared', () => {
      const v = vec2(300, 400);
      expect(lengthSquared(v)).toBe(250000);
      expect(length(v)).toBe(500);
    });

    it('normalise un vecteur non nul', () => {
      const v = vec2(0, 500);
      const norm = normalize(v);
      expect(norm.x).toBe(0);
      expect(norm.y).toBe(1);
      expect(length(norm)).toBeCloseTo(1, 10);
    });

    it('gère le vecteur nul sans erreur ni NaN lors de normalize', () => {
      const zero = vec2(0, 0);
      const norm = normalize(zero);
      expect(norm.x).toBe(0);
      expect(norm.y).toBe(0);
      expect(Number.isFinite(norm.x)).toBe(true);
      expect(Number.isFinite(norm.y)).toBe(true);
    });

    it('gère un vecteur quasi-nul (inférieur à EPSILON_NUMERICAL)', () => {
      const tiny = vec2(1e-12, 1e-12);
      const norm = normalize(tiny);
      expect(norm).toEqual(VEC2_ZERO);
    });

    it('calcule la normale gauche unitaire (perp)', () => {
      const dirX = vec2(1, 0);
      const normalX = perp(dirX);
      expect(normalX.x).toBe(0);
      expect(normalX.y).toBe(1); // Tourne de +90° vers +Y
      expect(dot(dirX, normalX)).toBe(0);

      const dirY = vec2(0, 1);
      const normalY = perp(dirY);
      expect(normalY.x).toBe(-1);
      expect(normalY.y).toBe(0); // Tourne de +90° vers -X
    });
  });

  describe('Tests de Propriétés Mathématiques', () => {
    it('propriété : la distance est toujours positive ou nulle', () => {
      const points = [
        [vec2(0, 0), vec2(0, 0)],
        [vec2(100, 200), vec2(100, 200)],
        [vec2(-500, 300), vec2(400, -100)],
      ] as const;

      for (const [p1, p2] of points) {
        expect(distance(p1, p2)).toBeGreaterThanOrEqual(0);
        expect(distanceSquared(p1, p2)).toBeGreaterThanOrEqual(0);
      }
    });

    it('propriété : la distance est strictement symétrique d(A, B) = d(B, A)', () => {
      const a = vec2(123.456, -789.012);
      const b = vec2(987.654, 321.098);
      expect(distance(a, b)).toBe(distance(b, a));
      expect(distanceSquared(a, b)).toBe(distanceSquared(b, a));
    });

    it('propriété : une translation préserve les distances', () => {
      const a = vec2(100, 200);
      const b = vec2(400, 600);
      const translation = vec2(5000, -2500);

      const aTrans = add(a, translation);
      const bTrans = add(b, translation);

      expect(distance(aTrans, bTrans)).toBeCloseTo(distance(a, b), 8);
    });

    it('propriété : une rotation préserve les longueurs', () => {
      const v = vec2(300, 400);
      const initialLen = length(v);

      const angles = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4, Math.PI];
      for (const angle of angles) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const rotated = vec2(v.x * cos - v.y * sin, v.x * sin + v.y * cos);
        expect(length(rotated)).toBeCloseTo(initialLen, 8);
      }
    });

    it('interpolation linéaire (lerp) exacte aux bornes', () => {
      const a = vec2(100, 200);
      const b = vec2(300, 500);
      expect(equals(lerp(a, b, 0), a)).toBe(true);
      expect(equals(lerp(a, b, 1), b)).toBe(true);
      expect(equals(lerp(a, b, 0.5), vec2(200, 350))).toBe(true);
    });
  });
});
