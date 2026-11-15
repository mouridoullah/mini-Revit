import { describe, it, expect } from 'vitest';
import {
  computeWallStretch,
  projectOpeningOffset,
  findConnectedWalls,
  WallStretchError,
  type WallLike,
} from './stretch.js';

describe('Phase 6.0c — Wall Stretching Geometry (packages/geometry)', () => {
  // T-STRETCH-01 : L-junction, A translate ALONG its own axis (500, 0), B perpendicular
  it('T-STRETCH-01 : L-junction, A translate ALONG its own axis (500,0), B perpendicular', () => {
    // A horizontal de (0,0) à (6000,0)
    // B vertical de (6000,0) à (6000,4000) (connecté par son start)
    const movedWall = { start: { x: 0, y: 0 }, end: { x: 6000, y: 0 } };
    const delta = { x: 500, y: 0 };
    const neighbor = { start: { x: 6000, y: 0 }, end: { x: 6000, y: 4000 } };

    const res = computeWallStretch({
      movedWall,
      delta,
      neighbor,
      connection: 'endpoint-start',
    });

    // Selon Q1 (Option α) : B.start suit A.end (6500, 0), B.end reste à (6000, 4000)
    expect(res.newNeighborEndpoints.start).toEqual({ x: 6500, y: 0 });
    expect(res.newNeighborEndpoints.end).toEqual({ x: 6000, y: 4000 });
    expect(res.deltaStart).toEqual({ x: 500, y: 0 });
    expect(res.deltaEnd).toEqual({ x: 0, y: 0 });
  });

  // T-STRETCH-02 : L-junction, A translate PERPENDICULAR (0, 500), B perpendicular
  it('T-STRETCH-02 : L-junction, A translate PERPENDICULAR (0,500), B perpendicular', () => {
    const movedWall = { start: { x: 0, y: 0 }, end: { x: 6000, y: 0 } };
    const delta = { x: 0, y: 500 };
    const neighbor = { start: { x: 6000, y: 0 }, end: { x: 6000, y: 4000 } };

    const res = computeWallStretch({
      movedWall,
      delta,
      neighbor,
      connection: 'endpoint-start',
    });

    // B.start passe à (6000, 500), B.end reste à (6000, 4000) -> pure contraction sans rotation
    expect(res.newNeighborEndpoints.start).toEqual({ x: 6000, y: 500 });
    expect(res.newNeighborEndpoints.end).toEqual({ x: 6000, y: 4000 });
    expect(res.deltaStart).toEqual({ x: 0, y: 500 });
    expect(res.deltaEnd).toEqual({ x: 0, y: 0 });
  });

  // T-STRETCH-03 : T-at-middle, A translate PERPENDICULAR (0, 500)
  it('T-STRETCH-03 : T-at-middle, A translate PERPENDICULAR (0,500) -> intersection D_B ∩ D_A', () => {
    // A horizontal de (0,0) à (6000,0)
    // B vertical de (3000,0) à (3000,2000)
    const movedWall = { start: { x: 0, y: 0 }, end: { x: 6000, y: 0 } };
    const delta = { x: 0, y: 500 };
    const neighbor = { start: { x: 3000, y: 0 }, end: { x: 3000, y: 2000 } };

    const res = computeWallStretch({
      movedWall,
      delta,
      neighbor,
      connection: 'mid',
    });

    // B.start se déplace à (3000, 500), B.end reste à (3000, 2000)
    expect(res.newNeighborEndpoints.start.x).toBeCloseTo(3000, 4);
    expect(res.newNeighborEndpoints.start.y).toBeCloseTo(500, 4);
    expect(res.newNeighborEndpoints.end).toEqual({ x: 3000, y: 2000 });
    expect(res.deltaStart.y).toBeCloseTo(500, 4);
  });

  // T-STRETCH-04 : T-at-middle, A translate ALONG axis (500, 0)
  // VIGILANCE 1 de Claude : B ne bouge pas, assertions explicites requises !
  it('T-STRETCH-04 : T-at-middle, A translate ALONG axis (500,0) -> B ne bouge pas (A glisse sous B)', () => {
    const movedWall = { start: { x: 0, y: 0 }, end: { x: 6000, y: 0 } };
    const delta = { x: 500, y: 0 };
    const neighbor = { start: { x: 3000, y: 0 }, end: { x: 3000, y: 2000 } };

    const res = computeWallStretch({
      movedWall,
      delta,
      neighbor,
      connection: 'mid',
    });

    // Assertions explicites conformément à la vigilance 1 : B ne bouge pas
    expect(res.newNeighborEndpoints.start).toEqual({ x: 3000, y: 0 });
    expect(res.newNeighborEndpoints.end).toEqual({ x: 3000, y: 2000 });
    expect(res.deltaStart).toEqual({ x: 0, y: 0 });
    expect(res.deltaEnd).toEqual({ x: 0, y: 0 });
  });

  // T-STRETCH-05 : T-at-end (B.end = A.start), A translate
  it('T-STRETCH-05 : T-at-end (B.end connecté à A.start), A translate -> B s’étire par end', () => {
    const movedWall = { start: { x: 0, y: 0 }, end: { x: 6000, y: 0 } };
    const delta = { x: 0, y: 500 };
    const neighbor = { start: { x: 0, y: -3000 }, end: { x: 0, y: 0 } };

    const res = computeWallStretch({
      movedWall,
      delta,
      neighbor,
      connection: 'endpoint-end',
    });

    expect(res.newNeighborEndpoints.start).toEqual({ x: 0, y: -3000 });
    expect(res.newNeighborEndpoints.end).toEqual({ x: 0, y: 500 });
    expect(res.deltaStart).toEqual({ x: 0, y: 0 });
    expect(res.deltaEnd).toEqual({ x: 0, y: 500 });
  });

  // T-STRETCH-06 : X-junction (4 murs concourants en (0,0))
  // PRÉCISION 3 de Claude : 2 voisins adjacents étirés, le mur opposé C reste statique !
  it('T-STRETCH-06 : X-junction (4 murs concourants), A translate -> 2 voisins adjacents détectés', () => {
    // Nœud commun en (0, 0)
    // A (Nord) : (0, 1000) -> (0, 0)
    // B (Est)  : (0, 0) -> (1000, 0)
    // C (Sud, opposé) : (0, 0) -> (0, -1000)
    // D (Ouest) : (0, 0) -> (-1000, 0)
    const wallA: WallLike = { id: 'wall_A', start: { x: 0, y: 1000 }, end: { x: 0, y: 0 } };
    const wallB: WallLike = { id: 'wall_B', start: { x: 0, y: 0 }, end: { x: 1000, y: 0 } };
    const wallC: WallLike = { id: 'wall_C', start: { x: 0, y: 0 }, end: { x: 0, y: -1000 } };
    const wallD: WallLike = { id: 'wall_D', start: { x: 0, y: 0 }, end: { x: -1000, y: 0 } };

    const allWalls = [wallA, wallB, wallC, wallD];
    const connected = findConnectedWalls(wallA, allWalls);

    // Précision 3 : Exactement 2 voisins détectés (B et D adjacents), C opposé exclu !
    expect(connected.length).toBe(2);
    const neighborIds = connected.map((c) => c.wallId).sort();
    expect(neighborIds).toEqual(['wall_B', 'wall_D']);
  });

  // T-STRETCH-06b : Multi-branches (5 murs concourants)
  it('T-STRETCH-06b : Multi-branches (5 murs concourants en (0,0)), A translate -> voisins transversaux détectés', () => {
    const wallA: WallLike = { id: 'wall_A', start: { x: 0, y: 1000 }, end: { x: 0, y: 0 } };
    const wallB: WallLike = { id: 'wall_B', start: { x: 0, y: 0 }, end: { x: 1000, y: 0 } };
    const wallC: WallLike = { id: 'wall_C', start: { x: 0, y: 0 }, end: { x: 0, y: -1000 } }; // opposé
    const wallD: WallLike = { id: 'wall_D', start: { x: 0, y: 0 }, end: { x: -1000, y: 0 } };
    const wallE: WallLike = { id: 'wall_E', start: { x: 0, y: 0 }, end: { x: 707, y: 707 } }; // diagonal

    const allWalls = [wallA, wallB, wallC, wallD, wallE];
    const connected = findConnectedWalls(wallA, allWalls);

    // Mur C opposé filtré, les autres concourants restent
    const neighborIds = connected.map((c) => c.wallId);
    expect(neighborIds).not.toContain('wall_C');
    expect(neighborIds).toContain('wall_B');
    expect(neighborIds).toContain('wall_D');
  });

  // T-STRETCH-07 : Multi-branch (murs en L, T et coins multiples)
  it('T-STRETCH-07 : Jonctions multi-branches complexes -> identification précise des types de connexion', () => {
    const movedWall: WallLike = { id: 'A', start: { x: 0, y: 0 }, end: { x: 4000, y: 0 } };
    const neighbor1: WallLike = { id: 'N1', start: { x: 0, y: 0 }, end: { x: 0, y: 2000 } };
    const neighbor2: WallLike = { id: 'N2', start: { x: 4000, y: 0 }, end: { x: 4000, y: 3000 } };
    const neighborMid: WallLike = { id: 'N3', start: { x: 2000, y: 0 }, end: { x: 2000, y: -1500 } };

    const connected = findConnectedWalls(movedWall, [movedWall, neighbor1, neighbor2, neighborMid]);
    expect(connected.length).toBe(3);

    const n1 = connected.find((c) => c.wallId === 'N1');
    const n2 = connected.find((c) => c.wallId === 'N2');
    const n3 = connected.find((c) => c.wallId === 'N3');

    expect(n1?.connection).toBe('endpoint-start');
    expect(n2?.connection).toBe('endpoint-start');
    expect(n3?.connection).toBe('mid');
  });

  // T-STRETCH-08 : Parallèle bout-à-bout, A translate ALONG axis (Q3)
  it('T-STRETCH-08 : Murs colinéaires bout-à-bout, A translate ALONG axis -> étirement axial pur autorisé', () => {
    // A de (0,0) à (6000,0), B de (6000,0) à (12000,0)
    const movedWall = { start: { x: 0, y: 0 }, end: { x: 6000, y: 0 } };
    const delta = { x: 500, y: 0 };
    const neighbor = { start: { x: 6000, y: 0 }, end: { x: 12000, y: 0 } };

    const res = computeWallStretch({
      movedWall,
      delta,
      neighbor,
      connection: 'endpoint-start',
    });

    // B.start passe à (6500, 0), B.end reste à (12000, 0), nouvelle longueur = 5500 mm
    expect(res.newNeighborEndpoints.start).toEqual({ x: 6500, y: 0 });
    expect(res.newNeighborEndpoints.end).toEqual({ x: 12000, y: 0 });
    expect(res.deltaStart).toEqual({ x: 500, y: 0 });
  });

  // T-STRETCH-09 : Parallèle bout-à-bout, A translate PERPENDICULAR (Q3)
  it('T-STRETCH-09 : Murs colinéaires bout-à-bout, A translate PERPENDICULAR -> légère rotation acceptée', () => {
    const movedWall = { start: { x: 0, y: 0 }, end: { x: 6000, y: 0 } };
    const delta = { x: 0, y: 200 };
    const neighbor = { start: { x: 6000, y: 0 }, end: { x: 12000, y: 0 } };

    const res = computeWallStretch({
      movedWall,
      delta,
      neighbor,
      connection: 'endpoint-start',
    });

    expect(res.newNeighborEndpoints.start).toEqual({ x: 6000, y: 200 });
    expect(res.newNeighborEndpoints.end).toEqual({ x: 12000, y: 0 });
  });

  // T-STRETCH-10 : WALL_STRETCH_COLLAPSE : newLength = 80 mm, old = 150 mm -> throw
  it('T-STRETCH-10 : WALL_STRETCH_COLLAPSE : nouvelle longueur < 100 mm et raccourci -> throw', () => {
    const movedWall = { start: { x: 0, y: 0 }, end: { x: 1000, y: 0 } };
    // Déplacer A de y=+70 mm rapproche B.start de B.end -> longueur passe de 150 à 80 mm (< 100 mm)
    const delta = { x: 0, y: 70 };
    const neighbor = { start: { x: 1000, y: 0 }, end: { x: 1000, y: 150 } }; // long = 150 mm

    expect(() =>
      computeWallStretch({
        movedWall,
        delta,
        neighbor,
        connection: 'endpoint-start',
      }),
    ).toThrowError(WallStretchError);

    try {
      computeWallStretch({
        movedWall,
        delta,
        neighbor,
        connection: 'endpoint-start',
      });
    } catch (e) {
      expect((e as WallStretchError).code).toBe('WALL_STRETCH_COLLAPSE');
    }
  });

  // T-STRETCH-11 : WALL_STRETCH_COLLAPSE bypass : newLength = 90mm, old = 90mm (inchangé) -> ne throw PAS
  it('T-STRETCH-11 : WALL_STRETCH_COLLAPSE bypass : mur déjà court non raccourci -> passe', () => {
    const movedWall = { start: { x: 0, y: 0 }, end: { x: 1000, y: 0 } };
    const delta = { x: 50, y: 0 }; // translation latérale sans raccourcir B (longueur augmente ou reste >= 90)
    const neighbor = { start: { x: 1000, y: 0 }, end: { x: 1000, y: 90 } };

    const res = computeWallStretch({
      movedWall,
      delta,
      neighbor,
      connection: 'endpoint-start',
    });

    expect(res.newNeighborEndpoints.start).toEqual({ x: 1050, y: 0 });
  });

  // T-STRETCH-12 : WALL_STRETCH_REVERSED : orientation s'inverse -> throw
  it('T-STRETCH-12 : WALL_STRETCH_REVERSED : B orientation flips -> throw', () => {
    const movedWall = { start: { x: 0, y: 0 }, end: { x: 1000, y: 0 } };
    // B va de (1000, 0) à (1000, 100). On déplace A de y=+200 mm
    // B.start passe à (1000, 200), B.end reste à (1000, 100) -> vecteur s'inverse (y descend au lieu de monter)
    const delta = { x: 0, y: 200 };
    const neighbor = { start: { x: 1000, y: 0 }, end: { x: 1000, y: 100 } };

    expect(() =>
      computeWallStretch({
        movedWall,
        delta,
        neighbor,
        connection: 'endpoint-start',
      }),
    ).toThrowError(WallStretchError);

    try {
      computeWallStretch({
        movedWall,
        delta,
        neighbor,
        connection: 'endpoint-start',
      });
    } catch (e) {
      expect((e as WallStretchError).code).toBe('WALL_STRETCH_REVERSED');
    }
  });

  // T-STRETCH-13 : PRÉCISION BONUS de Claude — Rotation de B avec ouverture hébergée
  it('T-STRETCH-13 : Rotation de B avec ouverture hébergée -> offsetAlong projeté dans les bornes', () => {
    // B initial de (6000, 0) à (6000, 4000). Porte à offsetAlong = 1500 mm.
    const oldWall = { start: { x: 6000, y: 0 }, end: { x: 6000, y: 4000 } };
    const oldOffset = 1500;

    // Déplacement de A de (500, 0) : B.start passe à (6500, 0), B.end reste à (6000, 4000).
    // B subit une rotation d'angle θ ≈ 7.1° et s'étire à L = sqrt(500² + 4000²) ≈ 4031.13 mm.
    const newWall = { start: { x: 6500, y: 0 }, end: { x: 6000, y: 4000 } };

    const newOffset = projectOpeningOffset(oldOffset, oldWall, newWall);

    // La projection doit être strictement positive et rester bien à l'intérieur du mur étiré
    expect(newOffset).toBeGreaterThan(0);
    expect(newOffset).toBeLessThan(4031.13);
    // Vérifier la valeur projetée précise : (6250000 / sqrt(16250000)) ≈ 1550.43 mm
    expect(newOffset).toBeCloseTo(1550.43, 1);
  });
});
