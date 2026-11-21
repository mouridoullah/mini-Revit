import { describe, it, expect, beforeEach } from 'vitest';
import { vec2 } from '@mini-bim/geometry';
import { BimDocument } from './document.js';
import {
  AddWallCommand,
  MoveWallCommand,
  UpdateWallCommand,
  DeleteWallCommand,
  AddRoomCommand,
  UpdateRoomCommand,
  DeleteRoomCommand,
  AddLevelCommand,
  AddWallTypeCommand,
} from './commands.js';
import { detectRooms } from './rooms/detect.js';
import { validateRoom, canDeleteLevel } from './rules.js';
import { type Wall, type Room, type BimState } from './types.js';

describe('Détection des Pièces et Modèle Room (core)', () => {
  let doc: BimDocument;
  let levelId: string;
  let typeId: string;

  beforeEach(() => {
    doc = BimDocument.createDefaultProject();
    const state = doc.getState();
    levelId = Object.keys(state.levels)[0] ?? '';
    typeId = Object.keys(state.wallTypes)[0] ?? '';
  });

  // Helper pour ajouter 4 murs formant une pièce rectangulaire fermée
  // Centres des murs : (0,0) -> (4000,0) -> (4000,3000) -> (0,3000) -> (0,0)
  // Épaisseur 200 mm -> Intérieur [100, 3900] × [100, 2900] = 3800 × 2800 mm
  function setupRectangularRoom(): {
    wallSouth: Wall;
    wallEast: Wall;
    wallNorth: Wall;
    wallWest: Wall;
  } {
    const wallSouth: Wall = {
      id: 'w_south',
      category: 'wall',
      typeId,
      levelId,
      start: vec2(0, 0),
      end: vec2(4000, 0),
    };
    const wallEast: Wall = {
      id: 'w_east',
      category: 'wall',
      typeId,
      levelId,
      start: vec2(4000, 0),
      end: vec2(4000, 3000),
    };
    const wallNorth: Wall = {
      id: 'w_north',
      category: 'wall',
      typeId,
      levelId,
      start: vec2(4000, 3000),
      end: vec2(0, 3000),
    };
    const wallWest: Wall = {
      id: 'w_west',
      category: 'wall',
      typeId,
      levelId,
      start: vec2(0, 3000),
      end: vec2(0, 0),
    };

    doc.execute(new AddWallCommand(wallSouth));
    doc.execute(new AddWallCommand(wallEast));
    doc.execute(new AddWallCommand(wallNorth));
    doc.execute(new AddWallCommand(wallWest));

    return { wallSouth, wallEast, wallNorth, wallWest };
  }

  describe('Algorithme detectRooms()', () => {
    it('détecte 1 pièce fermée avec sa surface intérieure exacte (3.8 × 2.8 = 10.64 m²)', () => {
      setupRectangularRoom();

      const rooms = detectRooms(doc.getState(), levelId);
      expect(rooms.length).toBe(1);

      const room = rooms[0]!;
      // Surface intérieure stricte : 3800 * 2800 = 10 640 000 mm² = 10.64 m²
      // (et NON la surface extérieure 4.2 * 3.2 = 13.44 m²)
      expect(room.areaMm2).toBe(10640000);
      expect(room.perimeterMm).toBe(13200); // 2 * (3800 + 2800)

      // Le polylabel doit être au centre géométrique (2000, 1500)
      expect(room.seed.x).toBeCloseTo(2000, 0);
      expect(room.seed.y).toBeCloseTo(1500, 0);
    });

    it('détecte 2 pièces adjacentes partageant un mur mitoyen (6 murs)', () => {
      setupRectangularRoom();

      // Deuxième pièce attenante à l'Est de dimensions identiques 4000 × 3000
      // Partage wallEast (x=4000) comme mur mitoyen
      const wallEast2: Wall = {
        id: 'w_east_2',
        category: 'wall',
        typeId,
        levelId,
        start: vec2(8000, 0),
        end: vec2(8000, 3000),
      };
      const wallSouth2: Wall = {
        id: 'w_south_2',
        category: 'wall',
        typeId,
        levelId,
        start: vec2(4000, 0),
        end: vec2(8000, 0),
      };
      const wallNorth2: Wall = {
        id: 'w_north_2',
        category: 'wall',
        typeId,
        levelId,
        start: vec2(8000, 3000),
        end: vec2(4000, 3000),
      };

      doc.execute(new AddWallCommand(wallSouth2));
      doc.execute(new AddWallCommand(wallEast2));
      doc.execute(new AddWallCommand(wallNorth2));

      const rooms = detectRooms(doc.getState(), levelId);
      expect(rooms.length).toBe(2);

      // Les deux pièces ont une surface nette intérieure identique de 10.64 m²
      expect(rooms[0]!.areaMm2).toBe(10640000);
      expect(rooms[1]!.areaMm2).toBe(10640000);
    });

    it('gère une pièce avec poteau / îlot central', () => {
      setupRectangularRoom();

      // Ajout d'un poteau carré central de 400 × 400 mm à (2000, 1500)
      // Modélisé comme un mur de longueur 400 mm avec épaisseur 400 mm
      const pillarTypeId = 'wt_pillar';
      doc.execute(
        new AddWallTypeCommand({
          id: pillarTypeId,
          name: 'Poteau 400mm',
          thickness: 400,
          height: 2800,
        }),
      );

      const pillar: Wall = {
        id: 'w_pillar',
        category: 'wall',
        typeId: pillarTypeId,
        levelId,
        start: vec2(1800, 1500),
        end: vec2(2200, 1500),
      };
      doc.execute(new AddWallCommand(pillar));

      const rooms = detectRooms(doc.getState(), levelId);
      expect(rooms.length).toBe(1);

      const room = rooms[0]!;
      expect(room.holes).toBeDefined();
      expect(room.holes!.length).toBe(1);

      // L'aire du poteau (environ 400 × 400 = 160 000 mm²) est déduite de l'aire nette
      expect(room.areaMm2).toBeLessThan(10640000);
      expect(room.areaMm2).toBeCloseTo(10640000 - 400 * 400, -2);
    });

    it('pièce 5m × 4m avec poteau central 0.4m × 0.4m : surface intérieure exacte 18.24 - 0.16 = 18.08 m²', () => {
      // 4 murs orthogonaux d'axe 5000 × 4000 mm, épaisseur 200 mm
      const wS: Wall = {
        id: 'w_5m_s',
        category: 'wall',
        typeId,
        levelId,
        start: vec2(0, 0),
        end: vec2(5000, 0),
      };
      const wE: Wall = {
        id: 'w_5m_e',
        category: 'wall',
        typeId,
        levelId,
        start: vec2(5000, 0),
        end: vec2(5000, 4000),
      };
      const wN: Wall = {
        id: 'w_5m_n',
        category: 'wall',
        typeId,
        levelId,
        start: vec2(5000, 4000),
        end: vec2(0, 4000),
      };
      const wW: Wall = {
        id: 'w_5m_w',
        category: 'wall',
        typeId,
        levelId,
        start: vec2(0, 4000),
        end: vec2(0, 0),
      };

      doc.execute(new AddWallCommand(wS));
      doc.execute(new AddWallCommand(wE));
      doc.execute(new AddWallCommand(wN));
      doc.execute(new AddWallCommand(wW));

      // Poteau central 400 × 400 mm (0.16 m²)
      const pillarTypeId = 'wt_pillar_400';
      doc.execute(
        new AddWallTypeCommand({
          id: pillarTypeId,
          name: 'Poteau Béton 400x400',
          thickness: 400,
          height: 2800,
        }),
      );

      const pillar: Wall = {
        id: 'w_pillar_central',
        category: 'wall',
        typeId: pillarTypeId,
        levelId,
        start: vec2(2300, 2000),
        end: vec2(2700, 2000),
      };
      doc.execute(new AddWallCommand(pillar));

      const rooms = detectRooms(doc.getState(), levelId);
      expect(rooms.length).toBe(1);

      const room = rooms[0];
      expect(room).toBeDefined();
      if (!room) return;

      // 1. Le contour extérieur contient bien 1 trou d'îlot
      expect(room.holes).toBeDefined();
      expect(room.holes?.length).toBe(1);

      // 2. Vérification numérique exacte : 18.24 m² - 0.16 m² = 18.08 m² (18 080 000 mm²)
      const grossHoleArea = 4800 * 3800; // 18 240 000 mm²
      const pillarArea = 400 * 400; // 160 000 mm²
      const expectedNetArea = grossHoleArea - pillarArea; // 18 080 000 mm²

      expect(expectedNetArea).toBe(18080000);
      expect(room.areaMm2).toBe(18080000);
    });

    it('renvoie 0 pièce pour un contour non fermé (mur manquant)', () => {
      // 3 murs en U (manque le mur Ouest)
      const wallSouth: Wall = {
        id: 'w_south',
        category: 'wall',
        typeId,
        levelId,
        start: vec2(0, 0),
        end: vec2(4000, 0),
      };
      const wallEast: Wall = {
        id: 'w_east',
        category: 'wall',
        typeId,
        levelId,
        start: vec2(4000, 0),
        end: vec2(4000, 3000),
      };
      const wallNorth: Wall = {
        id: 'w_north',
        category: 'wall',
        typeId,
        levelId,
        start: vec2(4000, 3000),
        end: vec2(0, 3000),
      };

      doc.execute(new AddWallCommand(wallSouth));
      doc.execute(new AddWallCommand(wallEast));
      doc.execute(new AddWallCommand(wallNorth));

      const rooms = detectRooms(doc.getState(), levelId);
      expect(rooms.length).toBe(0);
    });

    it('détecte les pièces de niveaux distincts séparément', () => {
      setupRectangularRoom();

      // Création d'un Niveau 1
      const level2Id = 'lvl_etage1';
      doc.execute(
        new AddLevelCommand({
          id: level2Id,
          name: 'Étage 1',
          elevation: 2800,
        }),
      );

      // Au Niveau 1, pas encore de mur
      expect(detectRooms(doc.getState(), level2Id)).toHaveLength(0);

      // Au Niveau 0, 1 pièce
      expect(detectRooms(doc.getState(), levelId)).toHaveLength(1);
    });
  });

  describe('Règles métier et validation de Room', () => {
    it('valide et ajoute une Room dans une pièce fermée', () => {
      setupRectangularRoom();

      const room: Room = {
        id: 'room_01',
        category: 'room',
        levelId,
        seed: vec2(2000, 1500),
        name: 'Séjour',
      };

      expect(() => validateRoom(room, doc.getState())).not.toThrow();
      doc.execute(new AddRoomCommand(room));

      expect(doc.getState().rooms['room_01']).toBeDefined();
      expect(doc.getState().rooms['room_01']!.name).toBe('Séjour');
    });

    it('rejette une Room dont le nom est vide (INVALID_ROOM_NAME)', () => {
      setupRectangularRoom();

      const emptyNameRoom: Room = {
        id: 'room_bad_name',
        category: 'room',
        levelId,
        seed: vec2(2000, 1500),
        name: '   ',
      };

      expect(() => validateRoom(emptyNameRoom, doc.getState())).toThrowError(/INVALID_ROOM_NAME/);
    });

    it('rejette une Room rattachée à un niveau inconnu (UNKNOWN_LEVEL)', () => {
      setupRectangularRoom();

      const ghostLevelRoom: Room = {
        id: 'room_ghost_lvl',
        category: 'room',
        levelId: 'lvl_non_existent',
        seed: vec2(2000, 1500),
        name: 'Chambre',
      };

      expect(() => validateRoom(ghostLevelRoom, doc.getState())).toThrowError(/UNKNOWN_LEVEL/);
    });

    it('rejette une Room dont le seed est hors de tout espace clos (ROOM_SEED_NOT_IN_CLOSED_AREA)', () => {
      setupRectangularRoom();

      // Point (10000, 10000) situé loin à l'extérieur de la pièce
      const outsideRoom: Room = {
        id: 'room_outside',
        category: 'room',
        levelId,
        seed: vec2(10000, 10000),
        name: 'Terrasse',
      };

      expect(() => validateRoom(outsideRoom, doc.getState())).toThrowError(
        /ROOM_SEED_NOT_IN_CLOSED_AREA/,
      );
      expect(() => doc.execute(new AddRoomCommand(outsideRoom))).toThrowError(
        /ROOM_SEED_NOT_IN_CLOSED_AREA/,
      );
    });

    it('bloque la suppression d un niveau si des Rooms y sont rattachées (canDeleteLevel)', () => {
      // Test d'un niveau isolé avec uniquement une Room (sans mur bloquant au préalable)
      const emptyLevelId = 'lvl_empty_with_room';
      doc.execute(
        new AddLevelCommand({
          id: emptyLevelId,
          name: 'Combles',
          elevation: 5600,
        }),
      );

      const stateWithRoom: BimState = {
        ...doc.getState(),
        rooms: {
          room_attic: {
            id: 'room_attic',
            category: 'room',
            levelId: emptyLevelId,
            seed: vec2(2000, 1500),
            name: 'Combles Aménagés',
          },
        },
      };

      const check = canDeleteLevel(emptyLevelId, stateWithRoom);
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('room(s) are attached to it');
    });
  });

  describe('Commandes Room & Cascade de suppression (ADR-032)', () => {
    it('UpdateRoomCommand modifie le nom ou le seed avec validation', () => {
      setupRectangularRoom();

      const room: Room = {
        id: 'room_01',
        category: 'room',
        levelId,
        seed: vec2(2000, 1500),
        name: 'Séjour',
      };
      doc.execute(new AddRoomCommand(room));

      doc.execute(new UpdateRoomCommand('room_01', { name: 'Grand Salon' }));
      expect(doc.getState().rooms['room_01']!.name).toBe('Grand Salon');

      // Déplacement du seed vers une autre position intérieure valide
      doc.execute(new UpdateRoomCommand('room_01', { seed: vec2(1500, 1200) }));
      expect(doc.getState().rooms['room_01']!.seed.x).toBe(1500);

      // Rejette le déplacement du seed hors de la pièce
      expect(() =>
        doc.execute(new UpdateRoomCommand('room_01', { seed: vec2(9000, 9000) })),
      ).toThrowError(/ROOM_SEED_NOT_IN_CLOSED_AREA/);
    });

    it('DeleteRoomCommand supprime la pièce sans impacter les murs', () => {
      setupRectangularRoom();

      const room: Room = {
        id: 'room_01',
        category: 'room',
        levelId,
        seed: vec2(2000, 1500),
        name: 'Séjour',
      };
      doc.execute(new AddRoomCommand(room));
      expect(doc.getState().rooms['room_01']).toBeDefined();

      doc.execute(new DeleteRoomCommand('room_01'));
      expect(doc.getState().rooms['room_01']).toBeUndefined();
      // Les murs sont préservés
      expect(Object.keys(doc.getState().walls).length).toBe(4);
    });

    it('Cascade ADR-032 : la suppression d un mur brisant la fermeture supprime la Room en cascade avec undo/redo réversible', () => {
      const { wallWest } = setupRectangularRoom();

      const room: Room = {
        id: 'room_cascade',
        category: 'room',
        levelId,
        seed: vec2(2000, 1500),
        name: 'Pièce Éphémère',
      };
      doc.execute(new AddRoomCommand(room));
      expect(doc.getState().rooms['room_cascade']).toBeDefined();

      // Suppression du mur Ouest : la pièce n'est plus close
      const deleteCmd = new DeleteWallCommand(wallWest.id);
      doc.execute(deleteCmd);

      // 1. Invariant de cascade Phase 7.6 : le mur est supprimé, la Room est préservée avec statut 'unenclosed'
      expect(doc.getState().walls[wallWest.id]).toBeUndefined();
      expect(doc.getState().rooms['room_cascade']).toBeDefined();
      expect(doc.getState().rooms['room_cascade']?.status).toBe('unenclosed');

      // 2. getChangedIds inclut l'ID du mur et l'ID de la room modifiée
      expect(deleteCmd.getChangedIds()).toEqual([wallWest.id, 'room_cascade']);

      // 3. Undo restaure à la fois le mur et le statut originel de la Room
      doc.undo();
      expect(doc.getState().walls[wallWest.id]).toBeDefined();
      expect(doc.getState().rooms['room_cascade']).toBeDefined();
      expect(doc.getState().rooms['room_cascade']?.status).toBe('enclosed');
      expect(doc.getState().rooms['room_cascade']?.name).toBe('Pièce Éphémère');

      // 4. Redo ré-applique la suppression du mur et bascule la Room en 'unenclosed'
      doc.redo();
      expect(doc.getState().walls[wallWest.id]).toBeUndefined();
      expect(doc.getState().rooms['room_cascade']?.status).toBe('unenclosed');
    });

    it('T-ROOM-UPDATE-LIFECYCLE-01 : UpdateWallCommand modifiant la géométrie ouvre puis referme une Room (Point B / Phase 7.6.1)', () => {
      const { wallWest } = setupRectangularRoom();

      const room: Room = {
        id: 'room_dynamic',
        category: 'room',
        levelId,
        seed: vec2(2000, 1500),
        name: 'Chambre Principale',
      };
      doc.execute(new AddRoomCommand(room));
      expect(doc.getState().rooms['room_dynamic']?.status).toBe('enclosed');
      const initialArea = doc.getState().rooms['room_dynamic']?.area;
      expect(initialArea).toBeCloseTo(10.64, 2);

      // 1. Raccourcissement du mur Ouest créant une brèche de 1000 mm (end: (0, 1000) au lieu de (0, 0))
      const updateCmd1 = new UpdateWallCommand(wallWest.id, {
        end: vec2(0, 1000),
      });
      const res1 = doc.execute(updateCmd1);

      // Invariant : la pièce est préservée, passe en 'unenclosed', signalée dans changedIds
      expect(doc.getState().rooms['room_dynamic']).toBeDefined();
      expect(doc.getState().rooms['room_dynamic']?.status).toBe('unenclosed');
      expect(res1.changed).toContain('room_dynamic');
      expect(updateCmd1.getChangedIds()).toContain('room_dynamic');

      // 2. Allongement du mur Ouest restaurant la fermeture complète (end: (0, 0))
      const updateCmd2 = new UpdateWallCommand(wallWest.id, {
        end: vec2(0, 0),
      });
      const res2 = doc.execute(updateCmd2);

      // Invariant : la pièce redevient 'enclosed', surface recalculée, signalée dans changedIds
      expect(doc.getState().rooms['room_dynamic']?.status).toBe('enclosed');
      expect(doc.getState().rooms['room_dynamic']?.area).toBeCloseTo(10.64, 2);
      expect(res2.changed).toContain('room_dynamic');

      // 3. Undo de la refermeture -> repasse en 'unenclosed'
      doc.undo();
      expect(doc.getState().rooms['room_dynamic']?.status).toBe('unenclosed');

      // 4. Redo -> redevient 'enclosed'
      doc.redo();
      expect(doc.getState().rooms['room_dynamic']?.status).toBe('enclosed');
      expect(doc.getState().rooms['room_dynamic']?.area).toBeCloseTo(10.64, 2);
    });

    it('T-ROOM-ADDWALL-LIFECYCLE-02 : AddWallCommand refermant une enceinte passe une Room unenclosed en enclosed', () => {
      const { wallWest } = setupRectangularRoom();

      // Ajouter une pièce puis supprimer le mur Ouest -> pièce unenclosed
      const room: Room = {
        id: 'room_reclose',
        category: 'room',
        levelId,
        seed: vec2(2000, 1500),
        name: 'Bureau',
      };
      doc.execute(new AddRoomCommand(room));
      doc.execute(new DeleteWallCommand(wallWest.id));
      expect(doc.getState().rooms['room_reclose']?.status).toBe('unenclosed');

      // Ajouter un nouveau mur qui referme exactement le côté Ouest (de (0, 3000) à (0, 0))
      const newWall: Wall = {
        id: 'wall_west_new',
        category: 'wall',
        typeId,
        levelId,
        start: vec2(0, 3000),
        end: vec2(0, 0),
      };
      const addCmd = new AddWallCommand(newWall);
      const res = doc.execute(addCmd);

      // La pièce est maintenant refermée
      expect(doc.getState().rooms['room_reclose']?.status).toBe('enclosed');
      expect(doc.getState().rooms['room_reclose']?.area).toBeCloseTo(10.64, 2);
      expect(res.changed).toContain('room_reclose');
      expect(addCmd.getChangedIds()).toContain('room_reclose');
    });

    it('T-ROOM-CACHE-01 : detectRooms réutilise le cache WeakMap sur la même référence BimState et recalcule sur mutation', () => {
      setupRectangularRoom();
      const state1 = doc.getState();

      const r1 = detectRooms(state1, levelId);
      const r2 = detectRooms(state1, levelId);
      // Même référence en mémoire (mémoïsation O(1))
      expect(r1).toBe(r2);

      // Mutation du document
      doc.execute(new AddRoomCommand({
        id: 'room_cached',
        category: 'room',
        levelId,
        seed: vec2(2000, 1500),
        name: 'Salon',
      }));
      const state2 = doc.getState();
      expect(state2).not.toBe(state1);

      const r3 = detectRooms(state2, levelId);
      expect(r3).not.toBe(r1);
      expect(r3[0]?.existingRoomId).toBe('room_cached');
    });

    it('T-ROOM-SCALE-FALLBACK : MoveWallCommand sur une grande pièce ouverte (> 15m) maintient le statut enclosed via repli architectural', () => {
      // Construction d'une grande salle de 20 m × 20 m (400 m²)
      const w1: Wall = {
        id: 'w_large_south',
        category: 'wall',
        typeId,
        levelId,
        start: vec2(0, 0),
        end: vec2(20000, 0),
      };
      const w2: Wall = {
        id: 'w_large_east',
        category: 'wall',
        typeId,
        levelId,
        start: vec2(20000, 0),
        end: vec2(20000, 20000),
      };
      const w3: Wall = {
        id: 'w_large_north',
        category: 'wall',
        typeId,
        levelId,
        start: vec2(20000, 20000),
        end: vec2(0, 20000),
      };
      const w4: Wall = {
        id: 'w_large_west',
        category: 'wall',
        typeId,
        levelId,
        start: vec2(0, 20000),
        end: vec2(0, 0),
      };

      doc.execute(new AddWallCommand(w1));
      doc.execute(new AddWallCommand(w2));
      doc.execute(new AddWallCommand(w3));
      doc.execute(new AddWallCommand(w4));

      const largeRoom: Room = {
        id: 'room_large_hall',
        category: 'room',
        levelId,
        seed: vec2(10000, 10000),
        name: 'Grand Hall Événementiel',
      };
      doc.execute(new AddRoomCommand(largeRoom));
      expect(doc.getState().rooms['room_large_hall']?.status).toBe('enclosed');

      // Déplacement cinématique du mur Sud vers le bas (y = -500 mm)
      // w_large_east et w_large_west sont élastiquement étirés
      const moveRes = doc.execute(new MoveWallCommand('w_large_south', vec2(0, -500)));

      const updatedRoom = doc.getState().rooms['room_large_hall'];
      expect(updatedRoom?.status).toBe('enclosed');
      expect(updatedRoom?.area).toBeGreaterThan(390); // Surface agrandie
      expect(moveRes.changed).toContain('room_large_hall');
    });
  });
});
