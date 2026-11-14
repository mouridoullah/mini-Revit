import { describe, it, expect } from 'vitest';
import { vec2 } from '@mini-bim/geometry';
import { computeWallMetrics, computeRoomMetrics, computeLevelMetrics } from './metrics.js';
import {
  type Wall,
  type WallType,
  type Door,
  type Window,
  type Room,
  type Level,
  type BimState,
} from './types.js';
import { type DetectedRoom } from './rooms/detect.js';

describe('Calculs de Surfaces et Métrés (metrics.ts)', () => {
  const wallType200: WallType = {
    id: 'wt_200',
    name: 'Mur Béton 200mm',
    thickness: 200,
    height: 2800,
  };

  const levelRdc: Level = {
    id: 'lvl_0',
    name: 'Rez-de-chaussée',
    elevation: 0,
  };

  describe('computeWallMetrics() — Déduction stricte des ouvertures', () => {
    it('calcule surface brute, déduction exacte des baies et volume pour mur 6m × 2.8m (netArea = 13.23 m²)', () => {
      // Mur de 6000 mm (6 m) de long et 2800 mm (2.8 m) de haut
      const wall: Wall = {
        id: 'w_test',
        category: 'wall',
        typeId: wallType200.id,
        levelId: levelRdc.id,
        start: vec2(0, 0),
        end: vec2(6000, 0),
      };

      // Porte 0.9m × 2.1m = 1.89 m² (1 890 000 mm²)
      const door: Door = {
        id: 'd_01',
        category: 'door',
        kind: 'door',
        hostWallId: wall.id,
        offsetAlong: 500,
        width: 900,
        height: 2100,
        swing: { side: 'right', direction: 'in' },
      };

      // Fenêtre 1.2m × 1.4m = 1.68 m² (1 680 000 mm²)
      const win: Window = {
        id: 'w_01',
        category: 'window',
        kind: 'window',
        hostWallId: wall.id,
        offsetAlong: 2500,
        width: 1200,
        height: 1400,
        sillHeight: 900,
      };

      const metrics = computeWallMetrics(wall, wallType200, [door, win]);

      // 1. Longueur = 6000 mm
      expect(metrics.lengthMm).toBe(6000);

      // 2. Surface brute = 6000 * 2800 = 16 800 000 mm² = 16.8 m²
      expect(metrics.grossAreaMm2).toBe(16800000);

      // 3. Déduction totale des ouvertures = 1.89 + 1.68 = 3.57 m² (3 570 000 mm²)
      expect(metrics.openings.totalOpeningAreaMm2).toBe(3570000);
      expect(metrics.openings.doorIds).toEqual(['d_01']);
      expect(metrics.openings.windowIds).toEqual(['w_01']);

      // 4. Surface nette = 16.8 - 3.57 = 13.23 m² (13 230 000 mm²)
      expect(metrics.netAreaMm2).toBe(13230000);

      // 5. Volume = 13 230 000 * 200 = 2 646 000 000 mm³ = 2.646 m³
      expect(metrics.volumeMm3).toBe(2646000000);
    });

    it('gère un mur plein sans ouverture (grossArea === netArea)', () => {
      const wall: Wall = {
        id: 'w_solid',
        category: 'wall',
        typeId: wallType200.id,
        levelId: levelRdc.id,
        start: vec2(0, 0),
        end: vec2(4000, 0),
      };

      const metrics = computeWallMetrics(wall, wallType200, []);
      expect(metrics.grossAreaMm2).toBe(4000 * 2800);
      expect(metrics.netAreaMm2).toBe(metrics.grossAreaMm2);
      expect(metrics.openings.doorIds).toHaveLength(0);
      expect(metrics.openings.windowIds).toHaveLength(0);
      expect(metrics.openings.totalOpeningAreaMm2).toBe(0);
    });
  });

  describe('computeRoomMetrics() — Surface intérieure et volume spatial', () => {
    it('calcule surface 10.64 m², périmètre 13.2m et volume 29.792 m³ pour pièce 3.8 × 2.8 × 2.8', () => {
      const room: Room = {
        id: 'room_sejour',
        category: 'room',
        levelId: levelRdc.id,
        seed: vec2(2000, 1500),
        name: 'Séjour',
      };

      const detected: DetectedRoom = {
        polygon: [vec2(100, 100), vec2(3900, 100), vec2(3900, 2900), vec2(100, 2900)],
        areaMm2: 10640000, // 3800 * 2800
        perimeterMm: 13200, // 2 * (3800 + 2800)
        seed: vec2(2000, 1500),
        existingRoomId: room.id,
      };

      const metrics = computeRoomMetrics(room, detected, levelRdc, 2800);

      expect(metrics.roomId).toBe('room_sejour');
      expect(metrics.name).toBe('Séjour');
      expect(metrics.areaMm2).toBe(10640000); // 10.64 m²
      expect(metrics.perimeterMm).toBe(13200); // 13.2 m
      // Volume = 10 640 000 * 2800 = 29 792 000 000 mm³ = 29.792 m³
      expect(metrics.volumeMm3).toBe(29792000000);
    });

    it('arbitrage de hauteur : utilise level.height si spécifié (2800 mm) même si wallType.height vaut 3000 mm', () => {
      const room: Room = {
        id: 'room_height_test',
        category: 'room',
        levelId: 'lvl_custom',
        seed: vec2(2000, 1500),
        name: 'Bureau',
      };

      const detected: DetectedRoom = {
        polygon: [vec2(100, 100), vec2(3900, 100), vec2(3900, 2900), vec2(100, 2900)],
        areaMm2: 10640000, // 10.64 m²
        perimeterMm: 13200,
        seed: vec2(2000, 1500),
      };

      const levelWithHeight: Level = {
        id: 'lvl_custom',
        name: 'Étage',
        elevation: 0,
        height: 2800, // Hauteur sous plafond conventionnelle BIM
      };

      // Cas 1 : level.height = 2800 mm prime sur wallTypeHeight = 3000 mm
      const metricsWithLevel = computeRoomMetrics(room, detected, levelWithHeight, 3000);
      expect(metricsWithLevel.volumeMm3).toBe(10640000 * 2800); // 29.792 m³

      // Cas 2 : level sans height (undefined) -> repli sur la hauteur des murs (3000 mm)
      const levelWithoutHeight: Level = {
        id: 'lvl_no_h',
        name: 'Étage sans h',
        elevation: 0,
      };
      const metricsWithoutLevelH = computeRoomMetrics(room, detected, levelWithoutHeight, 3000);
      expect(metricsWithoutLevelH.volumeMm3).toBe(10640000 * 3000); // 31.92 m³
    });
  });

  describe('computeLevelMetrics() — Synthèse globale agrégée', () => {
    it('agrège correctement 4 murs + 1 porte + 1 fenêtre + 1 pièce fermée', () => {
      // Pièce 4000 × 3000 mm d'axe, 200 mm d'épaisseur
      // Longueurs axiales : 2 × 4000 + 2 × 3000 = 14 000 mm = 14 m linéaire
      const wSouth: Wall = {
        id: 'w_s',
        category: 'wall',
        typeId: wallType200.id,
        levelId: levelRdc.id,
        start: vec2(0, 0),
        end: vec2(4000, 0),
      };
      const wEast: Wall = {
        id: 'w_e',
        category: 'wall',
        typeId: wallType200.id,
        levelId: levelRdc.id,
        start: vec2(4000, 0),
        end: vec2(4000, 3000),
      };
      const wNorth: Wall = {
        id: 'w_n',
        category: 'wall',
        typeId: wallType200.id,
        levelId: levelRdc.id,
        start: vec2(4000, 3000),
        end: vec2(0, 3000),
      };
      const wWest: Wall = {
        id: 'w_w',
        category: 'wall',
        typeId: wallType200.id,
        levelId: levelRdc.id,
        start: vec2(0, 3000),
        end: vec2(0, 0),
      };

      // Porte 900 × 2100 = 1.89 m² sur wSouth
      const door: Door = {
        id: 'door_s',
        category: 'door',
        kind: 'door',
        hostWallId: 'w_s',
        offsetAlong: 500,
        width: 900,
        height: 2100,
        swing: { side: 'right', direction: 'in' },
      };

      // Fenêtre 1000 × 1400 = 1.4 m² sur wNorth
      const win: Window = {
        id: 'win_n',
        category: 'window',
        kind: 'window',
        hostWallId: 'w_n',
        offsetAlong: 1500,
        width: 1000,
        height: 1400,
        sillHeight: 900,
      };

      const room: Room = {
        id: 'room_main',
        category: 'room',
        levelId: levelRdc.id,
        seed: vec2(2000, 1500),
        name: 'Pièce Principale',
      };

      const state: BimState = {
        schemaVersion: 1,
        units: 'mm',
        levels: { [levelRdc.id]: levelRdc },
        wallTypes: { [wallType200.id]: wallType200 },
        walls: { w_s: wSouth, w_e: wEast, w_n: wNorth, w_w: wWest },
        doors: { door_s: door },
        windows: { win_n: win },
        rooms: { room_main: room },
      };

      const levelMetrics = computeLevelMetrics(state, levelRdc.id);

      // Totaux
      expect(levelMetrics.totals.wallLinearM).toBe(14); // 4 + 3 + 4 + 3
      expect(levelMetrics.totals.doorCount).toBe(1);
      expect(levelMetrics.totals.windowCount).toBe(1);

      // Surface brute = 14m * 2.8m = 39.2 m²
      // Baies = 1.89 + 1.4 = 3.29 m²
      // Surface nette = 39.2 - 3.29 = 35.91 m²
      expect(levelMetrics.totals.wallNetAreaM2).toBe(35.91);

      // Volume brut = 35.91 m² * 0.2 m = 7.182 m³
      expect(levelMetrics.totals.wallVolumeM3).toBe(7.182);

      // Surface utile intérieure = 3.8 * 2.8 = 10.64 m²
      expect(levelMetrics.totals.roomAreaM2).toBe(10.64);
      expect(levelMetrics.rooms).toHaveLength(1);
      expect(levelMetrics.rooms[0]!.name).toBe('Pièce Principale');
    });
  });
});
