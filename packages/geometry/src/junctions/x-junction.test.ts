import { describe, it, expect } from 'vitest';
import { solveXJunction } from './x-junction.js';
import { vec2 } from '../vec2.js';
import { type WallInput } from './types.js';

describe('Jonctions en X (Croisements)', () => {
  const crossingPt = vec2(2000, 2000);

  it('résout un croisement à 90° avec priorité explicite', () => {
    // Mur 1 horizontal prioritaire (priorité 100) : y = 2000, épaisseur 200 (faces y=1900 et y=2100)
    const w1: WallInput = {
      id: 'w_horiz',
      start: vec2(0, 2000),
      end: vec2(4000, 2000),
      thickness: 200,
      locationLine: 'center',
      priority: 100,
    };

    // Mur 2 vertical secondaire (priorité 10) : x = 2000, épaisseur 150
    const w2: WallInput = {
      id: 'w_vert',
      start: vec2(2000, 0),
      end: vec2(2000, 4000),
      thickness: 150,
      locationLine: 'center',
      priority: 10,
    };

    const res = solveXJunction(w1, w2, crossingPt);

    expect(res.primaryWallId).toBe('w_horiz');
    expect(res.secondaryWallId).toBe('w_vert');

    // Branch 1 (du bas vers w1)
    expect(res.branch1.id).toBe('w_vert_branchA');
    const [b1Right, b1Left] = res.branch1.tResult.vertices;
    expect(b1Right.y).toBeCloseTo(1900, 4);
    expect(b1Left.y).toBeCloseTo(1900, 4);

    // Branch 2 (de w1 vers le haut)
    expect(res.branch2.id).toBe('w_vert_branchB');
    const [b2Right, b2Left] = res.branch2.tResult.vertices;
    expect(b2Right.y).toBeCloseTo(2100, 4);
    expect(b2Left.y).toBeCloseTo(2100, 4);
  });

  it('résout un croisement oblique à 45° de façon déterministe', () => {
    const w1: WallInput = {
      id: 'w_diag1',
      start: vec2(0, 0),
      end: vec2(4000, 4000),
      thickness: 200,
      locationLine: 'center',
      priority: 50,
    };
    const w2: WallInput = {
      id: 'w_diag2',
      start: vec2(0, 4000),
      end: vec2(4000, 0),
      thickness: 200,
      locationLine: 'center',
      priority: 20,
    };

    const res = solveXJunction(w1, w2, crossingPt);

    expect(res.primaryWallId).toBe('w_diag1');
    expect(res.secondaryWallId).toBe('w_diag2');
    expect(res.branch1.tResult.vertices.length).toBe(2);
    expect(res.branch2.tResult.vertices.length).toBe(2);
  });
});
