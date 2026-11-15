import { describe, it, expect, vi } from 'vitest';
import { BimDocument } from './document.js';
import {
  AddWallCommand,
  DeleteWallCommand,
  AddDoorCommand,
  UpdateWallTypeCommand,
  AddDimensionCommand,
  AddRoomCommand,
  Command,
} from './commands.js';
import { DependencyGraph } from './dag/DependencyGraph.js';
import type { Door, BimState, ElementId } from './types.js';
import { vec2 } from '@mini-bim/geometry';
import { BimValidationError } from './rules.js';

describe('Intégration BimDocument.execute() + DAG Minimal (T-EXEC-01 à 07)', () => {
  it('T-EXEC-01: execute(AddDoorCommand(door)) → CommandResult.changed = [doorId, hostWallId]', () => {
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
        end: vec2(4000, 0),
      }),
    );

    const defaultDoorTypeId = Object.keys(doc.getState().doorTypes)[0]!;
    const door: Door = {
      id: 'd_test',
      category: 'door',
      doorTypeId: defaultDoorTypeId,
      hostWallId: wallId,
      offsetAlong: 500,
      swing: { side: 'left', direction: 'in' },
    };

    const res = doc.execute(new AddDoorCommand(door));
    expect(res.changed).toEqual(['d_test', wallId].sort());
  });

  it('T-EXEC-02: execute(UpdateWallTypeCommand) → changed contient [typeId, wallIds...] via le DAG', () => {
    const doc = BimDocument.createDefaultProject();
    const levelId = Object.keys(doc.getState().levels)[0]!;
    const typeId = Object.keys(doc.getState().wallTypes)[0]!;

    doc.execute(
      new AddWallCommand({
        id: 'w_1',
        category: 'wall',
        typeId,
        levelId,
        start: vec2(0, 0),
        end: vec2(2000, 0),
      }),
    );
    doc.execute(
      new AddWallCommand({
        id: 'w_2',
        category: 'wall',
        typeId,
        levelId,
        start: vec2(2000, 0),
        end: vec2(4000, 0),
      }),
    );

    const res = doc.execute(new UpdateWallTypeCommand(typeId, { thickness: 250 }));
    // Le DAG a l'arête typeId -> w_1 et typeId -> w_2
    expect(res.changed).toContain(typeId);
    expect(res.changed).toContain('w_1');
    expect(res.changed).toContain('w_2');
    expect(res.changed).toEqual([typeId, 'w_1', 'w_2'].sort());
  });

  it('T-EXEC-03: execute(DeleteWallCommand) → changed contient union complète [wallId, openingIds, dimIds, roomIds]', () => {
    const doc = BimDocument.createDefaultProject();
    const levelId = Object.keys(doc.getState().levels)[0]!;
    const typeId = Object.keys(doc.getState().wallTypes)[0]!;

    // Boucle de 4 murs
    doc.execute(
      new AddWallCommand({
        id: 'w_s',
        category: 'wall',
        typeId,
        levelId,
        start: vec2(0, 0),
        end: vec2(3000, 0),
      }),
    );
    doc.execute(
      new AddWallCommand({
        id: 'w_e',
        category: 'wall',
        typeId,
        levelId,
        start: vec2(3000, 0),
        end: vec2(3000, 3000),
      }),
    );
    doc.execute(
      new AddWallCommand({
        id: 'w_n',
        category: 'wall',
        typeId,
        levelId,
        start: vec2(3000, 3000),
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

    doc.execute(
      new AddDoorCommand({
        id: 'd_w',
        category: 'door',
        hostWallId: 'w_w',
        offsetAlong: 500,
        doorTypeId: 'default-door-type',
        swing: { side: 'left', direction: 'in' },
      }),
    );
    doc.execute(
      new AddDimensionCommand({
        id: 'dim_w',
        category: 'dimension',
        type: 'linear',
        levelId,
        references: ['w_w'],
        offset: 200,
        value: 3000,
      }),
    );
    doc.execute(
      new AddRoomCommand({
        id: 'room_1',
        category: 'room',
        levelId,
        seed: vec2(1500, 1500),
        name: 'Pièce',
      }),
    );

    const res = doc.execute(new DeleteWallCommand('w_w'));
    expect(res.changed).toContain('w_w');
    expect(res.changed).toContain('d_w');
    expect(res.changed).toContain('dim_w');
    expect(res.changed).toContain('room_1');
    expect(res.changed).toEqual(['w_w', 'd_w', 'dim_w', 'room_1']);
  });

  it('T-EXEC-04: execute sur commande produisant un cycle lève CYCLE_DETECTED sans altérer l’historique', () => {
    const doc = BimDocument.createDefaultProject();
    const canUndoBefore = doc.canUndo();

    // Commande malveillante injectant un cycle d'IDs artificiel
    class CorruptingCycleCommand implements Command {
      public readonly name = 'CorruptCycle';
      public apply(draft: BimState): void {
        // Crée une boucle directe dans les références de dimensions
        (draft.dimensions as any)['dim_cycle_1'] = {
          id: 'dim_cycle_1',
          category: 'dimension',
          type: 'linear',
          references: ['dim_cycle_2'],
          offset: 0,
          value: 100,
        };
        (draft.dimensions as any)['dim_cycle_2'] = {
          id: 'dim_cycle_2',
          category: 'dimension',
          type: 'linear',
          references: ['dim_cycle_1'],
          offset: 0,
          value: 100,
        };
      }
      public getChangedIds(): readonly ElementId[] {
        return ['dim_cycle_1', 'dim_cycle_2'];
      }
    }

    try {
      doc.execute(new CorruptingCycleCommand());
      expect.fail('Should have thrown CYCLE_DETECTED');
    } catch (err) {
      expect(err).toBeInstanceOf(BimValidationError);
      expect((err as BimValidationError).code).toBe('CYCLE_DETECTED');
    }

    // L'historique n'a pas été incrémenté
    expect(doc.canUndo()).toBe(canUndoBefore);
  });

  it('T-EXEC-05: execute sur 10 commandes successives reconstruit le DAG à chaque appel (D3)', () => {
    const doc = BimDocument.createDefaultProject();
    const levelId = Object.keys(doc.getState().levels)[0]!;
    const typeId = Object.keys(doc.getState().wallTypes)[0]!;

    const buildSpy = vi.spyOn(DependencyGraph, 'build');
    buildSpy.mockClear();

    for (let i = 0; i < 10; i++) {
      doc.execute(
        new AddWallCommand({
          id: `w_seq_${i}`,
          category: 'wall',
          typeId,
          levelId,
          start: vec2(i * 1000, 0),
          end: vec2((i + 1) * 1000, 0),
        }),
      );
    }

    // Le DAG est reconstruit à chaque execute (2 fois par execute : before + after pour couverture complète)
    expect(buildSpy).toHaveBeenCalledTimes(20);
    buildSpy.mockRestore();
  });

  it('T-EXEC-06: Vigilance V1 — Vérification de stabilité des commandes de type/niveau', () => {
    const doc = BimDocument.createDefaultProject();
    const levelId = Object.keys(doc.getState().levels)[0]!;
    const typeId = Object.keys(doc.getState().wallTypes)[0]!;

    // Sans murs dépendants
    const resType = doc.execute(new UpdateWallTypeCommand(typeId, { thickness: 300 }));
    expect(resType.changed).toEqual([typeId]);

    // Avec 1 mur dépendant
    doc.execute(
      new AddWallCommand({
        id: 'w_dep',
        category: 'wall',
        typeId,
        levelId,
        start: vec2(0, 0),
        end: vec2(2000, 0),
      }),
    );
    const resTypeWithWalls = doc.execute(new UpdateWallTypeCommand(typeId, { thickness: 350 }));
    expect(resTypeWithWalls.changed).toEqual([typeId, 'w_dep'].sort());
  });

  it('T-EXEC-07: Vigilance V2 — Vérification de stabilité de AddDoor et AddWindow', () => {
    const doc = BimDocument.createDefaultProject();
    const levelId = Object.keys(doc.getState().levels)[0]!;
    const typeId = Object.keys(doc.getState().wallTypes)[0]!;

    doc.execute(
      new AddWallCommand({
        id: 'w_v2',
        category: 'wall',
        typeId,
        levelId,
        start: vec2(0, 0),
        end: vec2(3000, 0),
      }),
    );

    const resDoor = doc.execute(
      new AddDoorCommand({
        id: 'd_v2',
        category: 'door',
        hostWallId: 'w_v2',
        offsetAlong: 500,
        doorTypeId: 'default-door-type',
        swing: { side: 'left', direction: 'in' },
      }),
    );

    // Retourne le couple [doorId, hostWallId] nécessaire pour la régénération du solide percé
    expect(resDoor.changed).toEqual(['d_v2', 'w_v2'].sort());
  });
});
