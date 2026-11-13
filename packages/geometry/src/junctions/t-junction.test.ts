import { describe, it, expect } from 'vitest';
import { solveTJunction } from './t-junction.js';
import { vec2, distance } from '../vec2.js';
import { type WallInput } from './types.js';

describe('Jonctions en T (Aboutements)', () => {
  // Mur traversant horizontal de (0, 1000) à (4000, 1000), épaisseur 200 mm
  // Faces : y = 900 (intérieur) et y = 1100 (extérieur)
  const throughWall: WallInput = {
    id: 'through_w',
    start: vec2(0, 1000),
    end: vec2(4000, 1000),
    thickness: 200,
    locationLine: 'center',
  };

  it('résout une jonction en T orthogonale (90°) depuis le bas', () => {
    // Mur secondaire venant de (2000, 0) vers le haut, aboutissant en (2000, 1000)
    const stemWall: WallInput = {
      id: 'stem_w',
      start: vec2(2000, 0),
      end: vec2(2000, 1000),
      thickness: 150,
      locationLine: 'center',
    };

    const res = solveTJunction(throughWall, stemWall, 'end', vec2(2000, 1000));

    expect(res.throughWallId).toBe('through_w');
    expect(res.stemWallId).toBe('stem_w');
    expect(res.stemEnd).toBe('end');

    // Le mur arrive par le bas (y croissant vers y=1000), il frappe la face intérieure (y = 900)
    expect(res.hitFace).toBe('interior');

    const [pRight, pLeft] = res.vertices;
    // Les deux sommets doivent avoir y = 900 exactement
    expect(pRight.y).toBeCloseTo(900, 4);
    expect(pLeft.y).toBeCloseTo(900, 4);

    // Largeur de découpe doit valoir 150 mm (épaisseur du mur secondaire)
    expect(distance(pRight, pLeft)).toBeCloseTo(150, 4);
  });

  it('résout une jonction en T oblique à 45°', () => {
    // Mur secondaire incliné arrivant en (2000, 1000)
    const stemWall: WallInput = {
      id: 'stem_w_45',
      start: vec2(1000, 0),
      end: vec2(2000, 1000),
      thickness: 200,
      locationLine: 'center',
    };

    const res = solveTJunction(throughWall, stemWall, 'end', vec2(2000, 1000));
    const [pRight, pLeft] = res.vertices;

    // Les sommets doivent se trouver rigoureusement sur la face d'impact y = 900
    expect(pRight.y).toBeCloseTo(900, 4);
    expect(pLeft.y).toBeCloseTo(900, 4);

    // En oblique à 45°, l'empreinte biseautée est plus large que l'épaisseur nominale : 200 / sin(45°) ≈ 282.84 mm
    expect(distance(pRight, pLeft)).toBeCloseTo(200 * Math.SQRT2, 4);
  });

  it('résout une jonction en T arrivant sur la face extérieure (depuis le haut)', () => {
    // Mur venant du haut (2000, 3000) vers le bas (2000, 1000)
    const stemWall: WallInput = {
      id: 'stem_top',
      start: vec2(2000, 3000),
      end: vec2(2000, 1000),
      thickness: 100,
      locationLine: 'center',
    };

    const res = solveTJunction(throughWall, stemWall, 'end', vec2(2000, 1000));

    expect(res.hitFace).toBe('exterior');
    const [pRight, pLeft] = res.vertices;

    // Doit se trouver exactement sur la face extérieure y = 1100
    expect(pRight.y).toBeCloseTo(1100, 4);
    expect(pLeft.y).toBeCloseTo(1100, 4);
    expect(distance(pRight, pLeft)).toBeCloseTo(100, 4);
  });
});
