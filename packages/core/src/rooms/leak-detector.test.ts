import { describe, it, expect } from 'vitest';
import { diagnoseRoomLeaks } from './leak-detector.js';
import { type BimState, type Level, type WallType } from '../types.js';
import { vec2 } from '@mini-bim/geometry';
import { createComplexVillaState } from '../fixtures/complex-villa.js';

describe('Room Leak Detector — Diagnostic automatique des brèches de pièces (Chantier 7.5-B)', () => {
  const level0: Level = { id: 'lvl_0', name: 'RDC', elevation: 0, height: 2800 };
  const wt200: WallType = { id: 'wt_200', name: 'Mur 200', thickness: 200, height: 2800 };

  it('T-LEAK-01 : Pièce parfaitement fermée -> aucune fuite détectée', () => {
    const baseState: BimState = {
      schemaVersion: 2,
      units: 'mm',
      levels: { lvl_0: level0 },
      wallTypes: { wt_200: wt200 },
      slabTypes: {},
      doorTypes: {},
      windowTypes: {},
      walls: {
        w1: { id: 'w1', category: 'wall', typeId: 'wt_200', levelId: 'lvl_0', start: vec2(0, 0), end: vec2(4000, 0) },
        w2: { id: 'w2', category: 'wall', typeId: 'wt_200', levelId: 'lvl_0', start: vec2(4000, 0), end: vec2(4000, 3000) },
        w3: { id: 'w3', category: 'wall', typeId: 'wt_200', levelId: 'lvl_0', start: vec2(4000, 3000), end: vec2(0, 3000) },
        w4: { id: 'w4', category: 'wall', typeId: 'wt_200', levelId: 'lvl_0', start: vec2(0, 3000), end: vec2(0, 0) },
      },
      slabs: {},
      doors: {},
      windows: {},
      rooms: {
        r1: { id: 'r1', category: 'room', levelId: 'lvl_0', name: 'Chambre', seed: vec2(2000, 1500) },
      },
      dimensions: {},
    };

    const leaks = diagnoseRoomLeaks(baseState, 'lvl_0');
    expect(leaks).toHaveLength(0);
  });

  it('T-LEAK-02 : Brèche en coin (mur court de 300 mm) -> identifie le type "unclosed_boundary", la taille et les points du gap', () => {
    // Mur w1 s'arrête à x=3700 au lieu de 4000 -> brèche physique de 300 mm d'axe au coin Sud-Est
    const gapState: BimState = {
      schemaVersion: 2,
      units: 'mm',
      levels: { lvl_0: level0 },
      wallTypes: { wt_200: wt200 },
      slabTypes: {},
      doorTypes: {},
      windowTypes: {},
      walls: {
        w1: { id: 'w1', category: 'wall', typeId: 'wt_200', levelId: 'lvl_0', start: vec2(0, 0), end: vec2(3700, 0) },
        w2: { id: 'w2', category: 'wall', typeId: 'wt_200', levelId: 'lvl_0', start: vec2(4000, 0), end: vec2(4000, 3000) },
        w3: { id: 'w3', category: 'wall', typeId: 'wt_200', levelId: 'lvl_0', start: vec2(4000, 3000), end: vec2(0, 3000) },
        w4: { id: 'w4', category: 'wall', typeId: 'wt_200', levelId: 'lvl_0', start: vec2(0, 3000), end: vec2(0, 0) },
      },
      slabs: {},
      doors: {},
      windows: {},
      rooms: {
        r1: { id: 'r1', category: 'room', levelId: 'lvl_0', name: 'Chambre Défectueuse', seed: vec2(2000, 1500) },
      },
      dimensions: {},
    };

    const leaks = diagnoseRoomLeaks(gapState, 'lvl_0');
    expect(leaks).toHaveLength(1);

    const leak = leaks[0]!;
    expect(leak.roomId).toBe('r1');
    expect(leak.kind).toBe('unclosed_boundary');
    expect(leak.leakGap).toBeDefined();
    expect(leak.leakGap!.distanceMm).toBeCloseTo(300, 1);
    expect(leak.leakPoint).toBeDefined();
    expect(leak.leakPoint!.x).toBeCloseTo(3850, 1);
    expect(leak.leakPoint!.y).toBeCloseTo(0, 1);
    expect(leak.message).toContain('300 mm');
  });

  it('T-LEAK-03 : Aboutement en T interrompu (mur court de 150 mm) -> identifie la fuite vers la face du mur traversant', () => {
    // Mur traversant de (0,0) à (0, 6000)
    // Murs formant une alcôve : w_top (0, 4000) -> (4000, 4000), w_right (4000, 4000) -> (4000, 1000)
    // Mur w_bottom (4000, 1000) -> (150, 1000) : s'arrête à x=150 au lieu de toucher le mur traversant à x=0
    // L'épaisseur du mur traversant est 200 mm (demi-épaisseur 100 mm), donc écart = 150 - 100 = 50 mm
    const tGapState: BimState = {
      schemaVersion: 2,
      units: 'mm',
      levels: { lvl_0: level0 },
      wallTypes: { wt_200: wt200 },
      slabTypes: {},
      doorTypes: {},
      windowTypes: {},
      walls: {
        w_main: { id: 'w_main', category: 'wall', typeId: 'wt_200', levelId: 'lvl_0', start: vec2(0, 0), end: vec2(0, 6000) },
        w_top: { id: 'w_top', category: 'wall', typeId: 'wt_200', levelId: 'lvl_0', start: vec2(0, 4000), end: vec2(4000, 4000) },
        w_right: { id: 'w_right', category: 'wall', typeId: 'wt_200', levelId: 'lvl_0', start: vec2(4000, 4000), end: vec2(4000, 1000) },
        w_bottom: { id: 'w_bottom', category: 'wall', typeId: 'wt_200', levelId: 'lvl_0', start: vec2(4000, 1000), end: vec2(250, 1000) },
      },
      slabs: {},
      doors: {},
      windows: {},
      rooms: {
        r_alcove: { id: 'r_alcove', category: 'room', levelId: 'lvl_0', name: 'Alcôve', seed: vec2(2000, 2500) },
      },
      dimensions: {},
    };

    const leaks = diagnoseRoomLeaks(tGapState, 'lvl_0');
    expect(leaks).toHaveLength(1);

    const leak = leaks[0]!;
    expect(leak.kind).toBe('unclosed_boundary');
    expect(leak.leakGap).toBeDefined();
    // Écart au-delà de la face (250 - 100 = 150 mm)
    expect(leak.leakGap!.distanceMm).toBeCloseTo(150, 1);
    expect(leak.leakPoint).toBeDefined();
  });

  it('T-LEAK-04 : Pièce redondante dans la Villa Complexe -> diagnostiquée comme "redundant" avec référence à l’autre pièce', () => {
    const villaState = createComplexVillaState();

    const leaks = diagnoseRoomLeaks(villaState, 'lvl_0');
    // Dans la Villa Complexe, Salon et Véranda partagent le même espace continu
    const redundantLeak = leaks.find((l) => l.roomId === 'room_veranda');
    expect(redundantLeak).toBeDefined();
    expect(redundantLeak!.kind).toBe('redundant');
    expect(redundantLeak!.message).toContain('Salon / Séjour');
  });

  it('T-LEAK-05 : Pièce isolée sans mur d’enceinte -> diagnostiquée comme "isolated"', () => {
    const isolatedState: BimState = {
      schemaVersion: 2,
      units: 'mm',
      levels: { lvl_0: level0 },
      wallTypes: { wt_200: wt200 },
      slabTypes: {},
      doorTypes: {},
      windowTypes: {},
      walls: {},
      slabs: {},
      doors: {},
      windows: {},
      rooms: {
        r_nowhere: { id: 'r_nowhere', category: 'room', levelId: 'lvl_0', name: 'Dans le vide', seed: vec2(5000, 5000) },
      },
      dimensions: {},
    };

    const leaks = diagnoseRoomLeaks(isolatedState, 'lvl_0');
    expect(leaks).toHaveLength(1);
    expect(leaks[0]!.kind).toBe('isolated');
  });
});
