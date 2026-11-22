import { describe, it, expect, vi } from 'vitest';
import { BimDocument } from './document.js';
import {
  AddWallCommand,
  UpdateWallCommand,
  MoveWallCommand,
  DeleteWallCommand,
  AddDoorCommand,
  UpdateWallTypeCommand,
  AddDimensionCommand,
  AddRoomCommand,
  AddComponentCommand,
  Command,
} from './commands.js';
import { DependencyGraph } from './dag/DependencyGraph.js';
import type { Door, BimState, ElementId } from './types.js';
import { vec2 } from '@tabax/geometry';
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
    expect(res.changed).toContain('w_s'); // Voisin connecté recalculé
    expect(res.changed).toContain('w_n'); // Voisin connecté recalculé
    expect(new Set(res.changed)).toEqual(new Set(['w_w', 'w_s', 'w_n', 'd_w', 'dim_w', 'room_1']));
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

  it('T-EXEC-05: execute maintient le DAG de manière incrémentale sans reconstruction globale ex nihilo', () => {
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

    // Phase 10 : Le DAG est maintenu incrémentiellement (0 reconstruction complète)
    expect(buildSpy).toHaveBeenCalledTimes(0);

    // Et le DAG incrémental obtenu est strictement équivalent bit-à-bit à un build complet
    const referenceDag = DependencyGraph.build(doc.getState());
    expect(doc.getDependencyGraph().equals(referenceDag)).toBe(true);

    buildSpy.mockRestore();
  });

  it('T-EXEC-INVARIANT-CONTRACT : Le DAG incrémental reste bit-à-bit identique à DependencyGraph.build(state) après séquence mixte, rejets, undo et redo', () => {
    const doc = BimDocument.createDefaultProject();
    const levelId = Object.keys(doc.getState().levels)[0]!;
    const wallTypeId = Object.keys(doc.getState().wallTypes)[0]!;
    const doorTypeId = Object.keys(doc.getState().doorTypes)[0]!;

    const assertDagExact = () => {
      const fullDag = DependencyGraph.build(doc.getState());
      const incrementalDag = doc.getDependencyGraph();
      expect(incrementalDag.equals(fullDag)).toBe(true);
    };

    assertDagExact();

    // 1. Ajout de murs
    doc.execute(
      new AddWallCommand({
        id: 'wall_inv_1',
        category: 'wall',
        typeId: wallTypeId,
        levelId,
        start: vec2(0, 0),
        end: vec2(4000, 0),
      }),
    );
    assertDagExact();

    doc.execute(
      new AddWallCommand({
        id: 'wall_inv_2',
        category: 'wall',
        typeId: wallTypeId,
        levelId,
        start: vec2(4000, 0),
        end: vec2(4000, 3000),
      }),
    );
    assertDagExact();

    // 2. Ajout d'une porte
    doc.execute(
      new AddDoorCommand({
        id: 'door_inv_1',
        category: 'door',
        hostWallId: 'wall_inv_1',
        doorTypeId,
        offsetAlong: 1000,
        swing: { side: 'left', direction: 'in' },
      }),
    );
    assertDagExact();

    // 3. Déplacement du mur hôte
    doc.execute(new MoveWallCommand('wall_inv_1', { x: 50, y: 0 }));
    assertDagExact();

    // 4. Tentative d'opération rejetée par validation (BimValidationError)
    // Tenter de placer une porte hors du mur (offsetAlong = 9000 > longueur 4000)
    expect(() => {
      doc.execute(
        new AddDoorCommand({
          id: 'door_invalid',
          category: 'door',
          hostWallId: 'wall_inv_1',
          doorTypeId,
          offsetAlong: 9000,
          swing: { side: 'right', direction: 'in' },
        }),
      );
    }).toThrow();
    // Invariant préservé malgré le rejet (atomicité totale)
    assertDagExact();

    // 5. Test undo successifs
    expect(doc.canUndo()).toBe(true);
    doc.undo(); // Annule MoveWallCommand
    assertDagExact();

    doc.undo(); // Annule AddDoorCommand
    assertDagExact();

    // 6. Test redo
    expect(doc.canRedo()).toBe(true);
    doc.redo(); // Rétablit AddDoorCommand
    assertDagExact();

    doc.redo(); // Rétablit MoveWallCommand
    assertDagExact();
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

  it('T-EXEC-08: Modification d’un mur hôte invalide et propage les composants hébergés via le DAG', () => {
    const doc = BimDocument.createDefaultProject();
    const levelId = Object.keys(doc.getState().levels)[0]!;
    const typeId = Object.keys(doc.getState().wallTypes)[0]!;
    const wallId = 'w_host_comp';
    const compId = 'comp_hosted_1';

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

    doc.execute(
      new AddComponentCommand({
        id: compId,
        category: 'component',
        typeId: 'ct_sliding_door',
        levelId,
        placement: { x: 2500, y: 0, hostWallId: wallId },
        widthOverride: 2000,
      }),
    );

    // 1. getDependents(wallId) retrouve bien le composant hébergé
    const dag = DependencyGraph.build(doc.getState());
    expect(dag.getDependents(wallId)).toContain(compId);

    // 2. Écouteur abonné pour vérifier la notification réactive
    let notifiedChanged: readonly ElementId[] = [];
    doc.subscribe((changed) => {
      notifiedChanged = changed;
    });

    // Modification du mur hôte
    const res = doc.execute(new UpdateWallCommand(wallId, { end: { x: 6000, y: 0 } }));

    // 3. CommandResult.changed inclut le mur ET son composant hébergé via le DAG
    expect(res.changed).toContain(wallId);
    expect(res.changed).toContain(compId);

    // 4. Les écouteurs réactifs reçoivent compId dans lastChangedIds
    expect(notifiedChanged).toContain(compId);
  });
});
