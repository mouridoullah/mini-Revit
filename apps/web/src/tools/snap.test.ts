import { describe, it, expect } from 'vitest';
import { snapAngle45 } from './snap.js';

describe('snapAngle45 (Snap angulaire à 45°)', () => {
  const origin = { x: 0, y: 0 };

  it('renvoie l’origine si la distance est nulle', () => {
    const res = snapAngle45(origin, origin);
    expect(res).toEqual({ x: 0, y: 0 });
  });

  it('snap fidèlement à 0° (horizontal +X) pour un vecteur proche', () => {
    // 5° par rapport à l'horizontale
    const target = { x: 1000, y: 87.5 };
    const snapped = snapAngle45(origin, target);

    expect(snapped.y).toBe(0);
    expect(snapped.x).toBeCloseTo(Math.hypot(1000, 87.5), 6);
  });

  it('snap fidèlement à 45° (diagonale Nord-Est) avec égalité exacte x == y', () => {
    // 42° au lieu de 45°
    const target = { x: 1000, y: 900 };
    const snapped = snapAngle45(origin, target);

    expect(snapped.x).toBeCloseTo(snapped.y, 6);
    expect(snapped.x).toBeGreaterThan(0);
    expect(Math.hypot(snapped.x, snapped.y)).toBeCloseTo(Math.hypot(1000, 900), 6);
  });

  it('tracé à 44° donne un mur à exactement 45° (précision float64 dy/dx ≈ 1.0) et conserve la longueur', () => {
    const start = { x: 1250, y: 750 };
    const radius = 4500; // 4,5 mètres
    const angle44Rad = (44 * Math.PI) / 180;
    const target = {
      x: start.x + radius * Math.cos(angle44Rad),
      y: start.y + radius * Math.sin(angle44Rad),
    };

    const snapped = snapAngle45(start, target);
    const deltaX = snapped.x - start.x;
    const deltaY = snapped.y - start.y;

    // 1. Rapport de pente exactement égal à 1.0 à la précision machine IEEE-754 (< 1e-15)
    expect(Math.abs(deltaY / deltaX - 1.0)).toBeLessThan(1e-15);

    // 2. Égalité bit-à-bit stricte si l'origine est (0, 0)
    const snappedFromZero = snapAngle45({ x: 0, y: 0 }, { x: 1000, y: 965 }); // ~44°
    expect(snappedFromZero.y).toBe(snappedFromZero.x);
    expect(snappedFromZero.y / snappedFromZero.x).toBe(1.0);

    // 3. Préservation de la longueur (distance euclidienne conservée)
    expect(Math.hypot(deltaX, deltaY)).toBeCloseTo(radius, 10);
  });

  it('snap fidèlement à 90° (vertical +Y) avec x == 0 exact', () => {
    // 88° par rapport à l'horizontale
    const target = { x: 35, y: 1000 };
    const snapped = snapAngle45(origin, target);

    expect(snapped.x).toBe(0);
    expect(snapped.y).toBeCloseTo(Math.hypot(35, 1000), 6);
  });

  it('snap fidèlement à 135° (diagonale Nord-Ouest) avec -x == y', () => {
    // 138°
    const target = { x: -800, y: 900 };
    const snapped = snapAngle45(origin, target);

    expect(snapped.x).toBeCloseTo(-snapped.y, 6);
    expect(snapped.x).toBeLessThan(0);
    expect(snapped.y).toBeGreaterThan(0);
    expect(Math.hypot(snapped.x, snapped.y)).toBeCloseTo(Math.hypot(-800, 900), 6);
  });

  it('snap fidèlement à 180° (horizontal -X) avec y == 0 exact', () => {
    // 175°
    const target = { x: -1000, y: 87.5 };
    const snapped = snapAngle45(origin, target);

    expect(snapped.y).toBe(0);
    expect(snapped.x).toBeCloseTo(-Math.hypot(-1000, 87.5), 6);
  });

  it('snap fidèlement à 225° (diagonale Sud-Ouest)', () => {
    const target = { x: -1000, y: -950 };
    const snapped = snapAngle45(origin, target);

    expect(snapped.x).toBeCloseTo(snapped.y, 6);
    expect(snapped.x).toBeLessThan(0);
    expect(snapped.y).toBeLessThan(0);
  });

  it('snap fidèlement à 270° (vertical -Y) avec x == 0 exact', () => {
    const target = { x: -20, y: -1000 };
    const snapped = snapAngle45(origin, target);

    expect(snapped.x).toBe(0);
    expect(snapped.y).toBeCloseTo(-Math.hypot(-20, -1000), 6);
  });

  it('snap fidèlement à 315° (diagonale Sud-Est) avec x == -y', () => {
    const target = { x: 1000, y: -950 };
    const snapped = snapAngle45(origin, target);

    expect(snapped.x).toBeCloseTo(-snapped.y, 6);
    expect(snapped.x).toBeGreaterThan(0);
    expect(snapped.y).toBeLessThan(0);
  });

  it('fonctionne correctement avec un point de départ non nul (décentré)', () => {
    const start = { x: 2500, y: 3000 };
    const target = { x: 3500, y: 3020 }; // Déplacement quasi horizontal vers l'Est
    const snapped = snapAngle45(start, target);

    // Y reste rigoureusement aligné sur start.y
    expect(snapped.y).toBe(3000);
    expect(snapped.x).toBeCloseTo(2500 + Math.hypot(1000, 20), 6);
  });
});
