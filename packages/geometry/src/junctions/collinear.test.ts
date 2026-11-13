import { describe, it, expect } from 'vitest';
import { solveCollinearJunction } from './collinear.js';
import { vec2, distance } from '../vec2.js';
import { type WallInput } from './types.js';

describe('Jonctions Colinéaires', () => {
  const node = vec2(2000, 1000);

  it('résout deux murs colinéaires aboutés bout-à-bout de même épaisseur', () => {
    const w1: WallInput = {
      id: 'w1',
      start: vec2(0, 1000),
      end: node,
      thickness: 200,
      locationLine: 'center',
    };
    const w2: WallInput = {
      id: 'w2',
      start: node,
      end: vec2(4000, 1000),
      thickness: 200,
      locationLine: 'center',
    };

    const res = solveCollinearJunction(w1, 'end', w2, 'start', node);

    expect(res.isOverlapping).toBe(false);

    // Les coupes au point de contact sont droites et coïncident
    const [p1Right, p1Left] = res.vertices1;
    const [p2Right, p2Left] = res.vertices2;

    expect(p1Right.x).toBeCloseTo(2000, 4);
    expect(p1Left.x).toBeCloseTo(2000, 4);
    expect(p2Right.x).toBeCloseTo(2000, 4);
    expect(p2Left.x).toBeCloseTo(2000, 4);

    expect(distance(p1Right, p1Left)).toBeCloseTo(200, 4);
    expect(distance(p2Right, p2Left)).toBeCloseTo(200, 4);
  });

  it('gère deux murs colinéaires aboutés d épaisseurs différentes', () => {
    const w1: WallInput = {
      id: 'w1_thin',
      start: vec2(0, 1000),
      end: node,
      thickness: 150,
      locationLine: 'center',
    };
    const w2: WallInput = {
      id: 'w2_thick',
      start: node,
      end: vec2(4000, 1000),
      thickness: 300,
      locationLine: 'center',
    };

    const res = solveCollinearJunction(w1, 'end', w2, 'start', node);
    expect(res.isOverlapping).toBe(false);

    expect(distance(res.vertices1[0], res.vertices1[1])).toBeCloseTo(150, 4);
    expect(distance(res.vertices2[0], res.vertices2[1])).toBeCloseTo(300, 4);
  });

  it('détecte et gère la superposition partielle de deux murs colinéaires', () => {
    const w1: WallInput = {
      id: 'w1',
      start: vec2(0, 1000),
      end: vec2(2500, 1000),
      thickness: 200,
      locationLine: 'center',
    };
    const w2: WallInput = {
      id: 'w2',
      start: vec2(2000, 1000), // Se superpose sur [2000, 2500]
      end: vec2(4000, 1000),
      thickness: 200,
      locationLine: 'center',
    };

    const res = solveCollinearJunction(w1, 'end', w2, 'start', node);
    expect(res.isOverlapping).toBe(true);
  });
});
