import { describe, it, expect } from 'vitest';
import { solveLMiter } from './miter.js';
import { vec2, distance } from '../vec2.js';
import { type WallInput } from './types.js';

describe('Jonctions en L (Miter / Onglet)', () => {
  const node = vec2(1000, 1000);

  it('résout une jonction en L orthogonale à 90° avec même épaisseur (200 mm)', () => {
    // W1 arrive de la gauche vers node : start (0, 1000), end (1000, 1000)
    const w1: WallInput = {
      id: 'w1',
      start: vec2(0, 1000),
      end: node,
      thickness: 200,
      locationLine: 'center',
    };
    // W2 part de node vers le haut : start (1000, 1000), end (1000, 3000)
    const w2: WallInput = {
      id: 'w2',
      start: node,
      end: vec2(1000, 3000),
      thickness: 200,
      locationLine: 'center',
    };

    const res = solveLMiter(w1, 'end', w2, 'start', node);

    expect(res.result1.isBevelled).toBe(false);
    expect(res.result2.isBevelled).toBe(false);

    // Les deux sommets d'extrémité doivent concorder pour fermer le coin
    const v1 = res.result1.vertices;
    const v2 = res.result2.vertices;

    expect(v1.length).toBe(2);
    expect(v2.length).toBe(2);

    // Coin extérieur : à (1100, 900)
    // Coin intérieur : à (900, 1100)
    // Les sommets sont partagés entre les deux murs
    const sharedCornerExt = v1.find((p) => v2.some((q) => distance(p, q) < 1e-4));
    expect(sharedCornerExt).toBeDefined();
  });

  it('résout une jonction en L à 45°', () => {
    const w1: WallInput = {
      id: 'w1',
      start: vec2(0, 1000),
      end: node,
      thickness: 200,
      locationLine: 'center',
    };
    // W2 part à 45° vers le haut-droite
    const w2: WallInput = {
      id: 'w2',
      start: node,
      end: vec2(1000 + 1000 * Math.SQRT1_2, 1000 + 1000 * Math.SQRT1_2),
      thickness: 200,
      locationLine: 'center',
    };

    const res = solveLMiter(w1, 'end', w2, 'start', node);
    expect(res.result1.vertices.length).toBe(2);
    expect(res.result2.vertices.length).toBe(2);
  });

  it('résout une jonction en L à 120° (obtus)', () => {
    const w1: WallInput = {
      id: 'w1',
      start: vec2(0, 1000),
      end: node,
      thickness: 200,
      locationLine: 'center',
    };
    const angle120 = (2 * Math.PI) / 3;
    const w2: WallInput = {
      id: 'w2',
      start: node,
      end: vec2(1000 + 1000 * Math.cos(angle120), 1000 + 1000 * Math.sin(angle120)),
      thickness: 200,
      locationLine: 'center',
    };

    const res = solveLMiter(w1, 'end', w2, 'start', node);
    expect(res.result1.isBevelled).toBe(false);
  });

  it('applique la limite d onglet sur un angle très aigu (10°) et biseaute le coin', () => {
    const w1: WallInput = {
      id: 'w1',
      start: vec2(0, 1000),
      end: node,
      thickness: 200,
      locationLine: 'center',
    };
    // Angle très aigu de 10° (demi-angle 5° => miter distance ~1147 mm > 800 mm)
    const angle10 = (10 * Math.PI) / 180;
    const w2: WallInput = {
      id: 'w2',
      start: node,
      end: vec2(1000 - 1500 * Math.cos(angle10), 1000 + 1500 * Math.sin(angle10)),
      thickness: 200,
      locationLine: 'center',
    };

    const res = solveLMiter(w1, 'end', w2, 'start', node, 4.0);
    // À 10°, la pointe d'onglet dépasse largement la limite (4 * 200 = 800 mm) et est biseautée
    expect(res.result1.isBevelled && res.result2.isBevelled).toBe(true);
    // Clôture étanche : chaque mur dispose de 3 sommets d'extrémité incluant le biseau
    expect(res.result1.vertices.length).toBe(3);
    expect(res.result2.vertices.length).toBe(3);

    // Les deux murs partagent 2 sommets communs sur l'interface (coin intérieur + milieu du biseau)
    const sharedCount = res.result1.vertices.filter((p1) =>
      res.result2.vertices.some((p2) => distance(p1, p2) <= 1e-3),
    ).length;
    expect(sharedCount).toBe(2);
  });

  it('gère des murs d épaisseurs différentes (200 mm et 400 mm)', () => {
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
      end: vec2(1000, 3000),
      thickness: 400,
      locationLine: 'center',
    };

    const res = solveLMiter(w1, 'end', w2, 'start', node);
    expect(res.result1.vertices.length).toBeGreaterThanOrEqual(2);
    expect(res.result2.vertices.length).toBeGreaterThanOrEqual(2);
  });

  it('gère des lignes de référence différentes (exterior et interior)', () => {
    const w1: WallInput = {
      id: 'w1',
      start: vec2(0, 1000),
      end: node,
      thickness: 200,
      locationLine: 'exterior',
    };
    const w2: WallInput = {
      id: 'w2',
      start: node,
      end: vec2(1000, 3000),
      thickness: 200,
      locationLine: 'interior',
    };

    const res = solveLMiter(w1, 'end', w2, 'start', node);
    expect(res.result1.vertices.length).toBe(2);
    expect(res.result2.vertices.length).toBe(2);
  });

  it('gère des murs orientés en sens opposés (start-to-start)', () => {
    // Les deux murs partent de node
    const w1: WallInput = {
      id: 'w1',
      start: node,
      end: vec2(0, 1000),
      thickness: 200,
      locationLine: 'center',
    };
    const w2: WallInput = {
      id: 'w2',
      start: node,
      end: vec2(1000, 3000),
      thickness: 200,
      locationLine: 'center',
    };

    const res = solveLMiter(w1, 'start', w2, 'start', node);
    expect(res.result1.vertices.length).toBe(2);
    expect(res.result2.vertices.length).toBe(2);
  });
});
