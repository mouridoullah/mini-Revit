import { describe, it, expect } from 'vitest';
import { BimDocument } from './document.js';
import {
  AddWallCommand,
  DeleteWallCommand,
  AddDoorCommand,
  AddWindowCommand,
  AddDimensionCommand,
  AddRoomCommand,
} from './commands.js';
import type { Door, Window, Dimension, Room } from './types.js';
import { vec2 } from '@mini-bim/geometry';

describe('DeleteWallCommand Refactoré — Équivalence Comportementale (T-CMD-01 à 08)', () => {
  it('T-CMD-01: apply() sur mur avec 2 portes + 1 fenêtre supprime le mur et les 3 ouvertures', () => {
    const doc = BimDocument.createDefaultProject();
    const levelId = Object.keys(doc.getState().levels)[0]!;
    const typeId = Object.keys(doc.getState().wallTypes)[0]!;

    const wallId = 'w_host';
    doc.execute(
      new AddWallCommand({
        id: wallId,
        category: 'wall',
        typeId,
        levelId,
        start: vec2(0, 0),
        end: vec2(6000, 0),
      }),
    );

    const defaultDoorTypeId = Object.keys(doc.getState().doorTypes)[0]!;
    const defaultWindowTypeId = Object.keys(doc.getState().windowTypes)[0]!;

    const d1: Door = {
      id: 'd_1',
      category: 'door',
      doorTypeId: defaultDoorTypeId,
      hostWallId: wallId,
      offsetAlong: 500,
      swing: { side: 'left', direction: 'in' },
    };
    const d2: Door = {
      id: 'd_2',
      category: 'door',
      doorTypeId: defaultDoorTypeId,
      hostWallId: wallId,
      offsetAlong: 2000,
      swing: { side: 'right', direction: 'out' },
    };
    const win1: Window = {
      id: 'win_1',
      category: 'window',
      windowTypeId: defaultWindowTypeId,
      hostWallId: wallId,
      offsetAlong: 4000,
      sillHeight: 900,
    };

    doc.execute(new AddDoorCommand(d1));
    doc.execute(new AddDoorCommand(d2));
    doc.execute(new AddWindowCommand(win1));

    expect(doc.getState().walls[wallId]).toBeDefined();
    expect(doc.getState().doors['d_1']).toBeDefined();
    expect(doc.getState().doors['d_2']).toBeDefined();
    expect(doc.getState().windows['win_1']).toBeDefined();

    doc.execute(new DeleteWallCommand(wallId));

    expect(doc.getState().walls[wallId]).toBeUndefined();
    expect(doc.getState().doors['d_1']).toBeUndefined();
    expect(doc.getState().doors['d_2']).toBeUndefined();
    expect(doc.getState().windows['win_1']).toBeUndefined();
  });

  it('T-CMD-02: apply() sur mur avec 1 dimension référencée supprime la dimension', () => {
    const doc = BimDocument.createDefaultProject();
    const levelId = Object.keys(doc.getState().levels)[0]!;
    const typeId = Object.keys(doc.getState().wallTypes)[0]!;

    const wallId = 'w_dim';
    doc.execute(
      new AddWallCommand({
        id: wallId,
        category: 'wall',
        typeId,
        levelId,
        start: vec2(0, 0),
        end: vec2(4000, 0),
      }),
    );

    const dim: Dimension = {
      id: 'dim_1',
      category: 'dimension',
      type: 'linear',
      levelId,
      references: [wallId],
      offset: 500,
      value: 4000,
    };
    doc.execute(new AddDimensionCommand(dim));
    expect(doc.getState().dimensions['dim_1']).toBeDefined();

    doc.execute(new DeleteWallCommand(wallId));
    expect(doc.getState().walls[wallId]).toBeUndefined();
    expect(doc.getState().dimensions['dim_1']).toBeUndefined();
  });

  it('T-CMD-03: apply() sur mur portant 2 cotations supprime les 2 cotations', () => {
    const doc = BimDocument.createDefaultProject();
    const levelId = Object.keys(doc.getState().levels)[0]!;
    const typeId = Object.keys(doc.getState().wallTypes)[0]!;

    const wallId = 'w_multi_dim';
    doc.execute(
      new AddWallCommand({
        id: wallId,
        category: 'wall',
        typeId,
        levelId,
        start: vec2(0, 0),
        end: vec2(5000, 0),
      }),
    );

    const dim1: Dimension = {
      id: 'dim_a',
      category: 'dimension',
      type: 'linear',
      levelId,
      references: [wallId],
      offset: 300,
      value: 5000,
    };
    const dim2: Dimension = {
      id: 'dim_b',
      category: 'dimension',
      type: 'linear',
      levelId,
      references: [wallId],
      offset: -300,
      value: 5000,
    };
    doc.execute(new AddDimensionCommand(dim1));
    doc.execute(new AddDimensionCommand(dim2));

    expect(doc.getState().dimensions['dim_a']).toBeDefined();
    expect(doc.getState().dimensions['dim_b']).toBeDefined();

    doc.execute(new DeleteWallCommand(wallId));
    expect(doc.getState().dimensions['dim_a']).toBeUndefined();
    expect(doc.getState().dimensions['dim_b']).toBeUndefined();
  });

  it('T-CMD-04: apply() sur mur inexistant lève ELEMENT_NOT_FOUND', () => {
    const doc = BimDocument.createDefaultProject();
    expect(() => doc.execute(new DeleteWallCommand('non_existent_wall'))).toThrowError(
      /ELEMENT_NOT_FOUND/,
    );
  });

  it('T-CMD-05: getChangedIds() retourne la liste exhaustive ordonnée des IDs mutés par apply() (Option B / ADR-041 §5)', () => {
    const doc = BimDocument.createDefaultProject();
    const levelId = Object.keys(doc.getState().levels)[0]!;
    const typeId = Object.keys(doc.getState().wallTypes)[0]!;

    // Boucle de 4 murs fermée
    doc.execute(
      new AddWallCommand({
        id: 'w_s',
        category: 'wall',
        typeId,
        levelId,
        start: vec2(0, 0),
        end: vec2(4000, 0),
      }),
    );
    doc.execute(
      new AddWallCommand({
        id: 'w_e',
        category: 'wall',
        typeId,
        levelId,
        start: vec2(4000, 0),
        end: vec2(4000, 3000),
      }),
    );
    doc.execute(
      new AddWallCommand({
        id: 'w_n',
        category: 'wall',
        typeId,
        levelId,
        start: vec2(4000, 3000),
        end: vec2(0, 3000),
      }),
    );
    doc.execute(
      new AddWallCommand({
        id: 'w_w',
        category: 'wall',
        typeId,
        levelId,
        start: vec2(0, 3000),
        end: vec2(0, 0),
      }),
    );

    // 2 portes sur w_s
    doc.execute(
      new AddDoorCommand({
        id: 'd_1',
        category: 'door',
        hostWallId: 'w_s',
        offsetAlong: 500,
        doorTypeId: 'default-door-type',
        swing: { side: 'left', direction: 'in' },
      }),
    );
    doc.execute(
      new AddDoorCommand({
        id: 'd_2',
        category: 'door',
        hostWallId: 'w_s',
        offsetAlong: 2500,
        doorTypeId: 'default-door-type',
        swing: { side: 'right', direction: 'out' },
      }),
    );

    // 1 cotation référençant w_s
    doc.execute(
      new AddDimensionCommand({
        id: 'dim_1',
        category: 'dimension',
        type: 'linear',
        levelId,
        references: ['w_s'],
        offset: 200,
        value: 4000,
      }),
    );

    // 1 pièce hébergée par l'enceinte
    doc.execute(
      new AddRoomCommand({
        id: 'room_1',
        category: 'room',
        levelId,
        seed: vec2(2000, 1500),
        name: 'Séjour',
      }),
    );

    const cmd = new DeleteWallCommand('w_s');
    doc.execute(cmd);

    // Sémantique Option B exacte : pivot en tête, cascades ordonnées, rooms
    expect(cmd.getChangedIds()).toEqual(['w_s', 'd_1', 'd_2', 'dim_1', 'room_1']);
  });

  it('T-CMD-06: getAdditionalChangedIds() retourne les IDs des Rooms impactés (D1)', () => {
    const doc = BimDocument.createDefaultProject();
    const levelId = Object.keys(doc.getState().levels)[0]!;
    const typeId = Object.keys(doc.getState().wallTypes)[0]!;

    // 4 murs formant une boucle fermée
    doc.execute(
      new AddWallCommand({
        id: 'w_s',
        category: 'wall',
        typeId,
        levelId,
        start: vec2(0, 0),
        end: vec2(4000, 0),
      }),
    );
    doc.execute(
      new AddWallCommand({
        id: 'w_e',
        category: 'wall',
        typeId,
        levelId,
        start: vec2(4000, 0),
        end: vec2(4000, 3000),
      }),
    );
    doc.execute(
      new AddWallCommand({
        id: 'w_n',
        category: 'wall',
        typeId,
        levelId,
        start: vec2(4000, 3000),
        end: vec2(0, 3000),
      }),
    );
    doc.execute(
      new AddWallCommand({
        id: 'w_w',
        category: 'wall',
        typeId,
        levelId,
        start: vec2(0, 3000),
        end: vec2(0, 0),
      }),
    );

    const room: Room = {
      id: 'room_closed',
      category: 'room',
      levelId,
      seed: vec2(2000, 1500),
      name: 'Chambre 1',
    };
    doc.execute(new AddRoomCommand(room));
    expect(doc.getState().rooms['room_closed']).toBeDefined();

    const cmd = new DeleteWallCommand('w_w');
    doc.execute(cmd);

    expect(cmd.getAdditionalChangedIds()).toEqual(['room_closed']);
    expect(cmd.getChangedIds()).toContain('room_closed');
    expect(cmd.getChangedIds()).toContain('w_w');
  });

  it('T-CMD-07: undo() restaure mur + portes + fenêtres + cotations + Rooms bit-à-bit', () => {
    const doc = BimDocument.createDefaultProject();
    const levelId = Object.keys(doc.getState().levels)[0]!;
    const typeId = Object.keys(doc.getState().wallTypes)[0]!;

    doc.execute(
      new AddWallCommand({
        id: 'w_undo_1',
        category: 'wall',
        typeId,
        levelId,
        start: vec2(0, 0),
        end: vec2(4000, 0),
      }),
    );
    doc.execute(
      new AddDoorCommand({
        id: 'd_undo_1',
        category: 'door',
        hostWallId: 'w_undo_1',
        offsetAlong: 500,
        doorTypeId: 'default-door-type',
        swing: { side: 'left', direction: 'in' },
      }),
    );
    doc.execute(
      new AddDimensionCommand({
        id: 'dim_undo_1',
        category: 'dimension',
        type: 'linear',
        levelId,
        references: ['w_undo_1'],
        offset: 200,
        value: 4000,
      }),
    );

    const stateBefore = doc.getState();

    // Suppression
    doc.execute(new DeleteWallCommand('w_undo_1'));
    expect(doc.getState().walls['w_undo_1']).toBeUndefined();
    expect(doc.getState().doors['d_undo_1']).toBeUndefined();
    expect(doc.getState().dimensions['dim_undo_1']).toBeUndefined();

    // Undo bit-à-bit strict
    const undoRes = doc.undo();
    expect(undoRes).toBe(true);
    expect(doc.getState()).toEqual(stateBefore);

    // Redo
    const redoRes = doc.redo();
    expect(redoRes).toBe(true);
    expect(doc.getState().walls['w_undo_1']).toBeUndefined();
  });

  it('T-CMD-08: DeleteWallCommand continue de supprimer les Rooms en cascade (Phase 4 inchangée)', () => {
    const doc = BimDocument.createDefaultProject();
    const levelId = Object.keys(doc.getState().levels)[0]!;
    const typeId = Object.keys(doc.getState().wallTypes)[0]!;

    doc.execute(
      new AddWallCommand({
        id: 'wa',
        category: 'wall',
        typeId,
        levelId,
        start: vec2(0, 0),
        end: vec2(3000, 0),
      }),
    );
    doc.execute(
      new AddWallCommand({
        id: 'wb',
        category: 'wall',
        typeId,
        levelId,
        start: vec2(3000, 0),
        end: vec2(3000, 3000),
      }),
    );
    doc.execute(
      new AddWallCommand({
        id: 'wc',
        category: 'wall',
        typeId,
        levelId,
        start: vec2(3000, 3000),
        end: vec2(0, 3000),
      }),
    );
    doc.execute(
      new AddWallCommand({
        id: 'wd',
        category: 'wall',
        typeId,
        levelId,
        start: vec2(0, 3000),
        end: vec2(0, 0),
      }),
    );

    doc.execute(
      new AddRoomCommand({
        id: 'r_legacy',
        category: 'room',
        levelId,
        seed: vec2(1500, 1500),
        name: 'Salon',
      }),
    );
    expect(doc.getState().rooms['r_legacy']).toBeDefined();

    doc.execute(new DeleteWallCommand('wa'));
    expect(doc.getState().rooms['r_legacy']).toBeUndefined();
  });
});
