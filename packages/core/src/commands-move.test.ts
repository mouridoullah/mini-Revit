import { describe, it, expect } from 'vitest';
import { BimDocument } from './document.js';
import { AddWallCommand, MoveWallCommand, AddDoorCommand, AddRoomCommand } from './commands.js';
import { type Wall, type BimState } from './types.js';
import { BimValidationError } from './rules.js';

function createBaseDoc(): { doc: BimDocument; levelId: string; typeId: string } {
  const doc = BimDocument.createDefaultProject();
  const state = doc.getState();
  const levelId = Object.keys(state.levels)[0];
  const typeId = Object.keys(state.wallTypes)[0];
  return { doc, levelId, typeId };
}

describe('Phase 6.0c — MoveWallCommand Tests (packages/core)', () => {
  // T-MOVE-01 : MoveWallCommand sur mur isolé (0 neighbors) -> pure translation, offsetAlong préservé
  it('T-MOVE-01 : MoveWallCommand sur mur isolé -> pure translation, offsetAlong porte préservé', () => {
    const { doc, levelId, typeId } = createBaseDoc();
    doc.execute(
      new AddWallCommand({
        id: 'wall_iso',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 1000, y: 1000 },
        end: { x: 5000, y: 1000 },
      }),
    );
    doc.execute(
      new AddDoorCommand({
        id: 'door_iso',
        category: 'door',
        doorTypeId: 'door_type_std',
        hostWallId: 'wall_iso',
        offsetAlong: 1200,
        width: 900,
        height: 2100,
        swing: { side: 'left', direction: 'in' },
      }),
    );

    const res = doc.execute(new MoveWallCommand('wall_iso', { x: 200, y: 300 }));
    // Le DAG inclut la porte dépendante dans res.changed (ADR-041)
    expect(res.changed).toEqual(['wall_iso', 'door_iso']);

    const moved = doc.getState().walls['wall_iso'];
    expect(moved.start).toEqual({ x: 1200, y: 1300 });
    expect(moved.end).toEqual({ x: 5200, y: 1300 });

    const door = doc.getState().doors['door_iso'];
    expect(door.offsetAlong).toBe(1200); // Règle d'or Phase 3.3
  });

  // T-MOVE-02 : MoveWallCommand sur L-junction -> neighbor suit, changed contient [wallId, neighborId]
  it('T-MOVE-02 : MoveWallCommand sur L-junction -> neighbor suit, changed contient [wallId, neighborId]', () => {
    const { doc, levelId, typeId } = createBaseDoc();
    doc.execute(
      new AddWallCommand({
        id: 'wall_A',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 0, y: 0 },
        end: { x: 4000, y: 0 },
      }),
    );
    doc.execute(
      new AddWallCommand({
        id: 'wall_B',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 4000, y: 0 },
        end: { x: 4000, y: 3000 },
      }),
    );

    const res = doc.execute(new MoveWallCommand('wall_A', { x: 500, y: 0 }));
    expect(res.changed).toEqual(['wall_A', 'wall_B']);

    const wallB = doc.getState().walls['wall_B'];
    expect(wallB.start).toEqual({ x: 4500, y: 0 }); // suit A.end
    expect(wallB.end).toEqual({ x: 4000, y: 3000 }); // reste ancré
  });

  // T-MOVE-03 : MoveWallCommand sur X-junction -> 2 voisins adjacents suivent (Précision 3)
  it('T-MOVE-03 : MoveWallCommand sur X-junction -> 2 voisins adjacents suivent, opposé stationnaire', () => {
    const { doc, levelId, typeId } = createBaseDoc();
    // Nœud partagé en (0, 0)
    doc.execute(
      new AddWallCommand({
        id: 'wall_A',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 0, y: 2000 },
        end: { x: 0, y: 0 }, // Nord -> Nœud
      }),
    );
    doc.execute(
      new AddWallCommand({
        id: 'wall_B',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 0, y: 0 },
        end: { x: 2000, y: 0 }, // Est
      }),
    );
    doc.execute(
      new AddWallCommand({
        id: 'wall_C',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 0, y: 0 },
        end: { x: 0, y: -2000 }, // Sud (opposé colinéaire à A)
      }),
    );
    doc.execute(
      new AddWallCommand({
        id: 'wall_D',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 0, y: 0 },
        end: { x: -2000, y: 0 }, // Ouest
      }),
    );

    const res = doc.execute(new MoveWallCommand('wall_A', { x: 300, y: 0 }));
    // Précision 3 : A déplace les adjacents B et D, mais pas C opposé
    expect(res.changed).toEqual(['wall_A', 'wall_B', 'wall_D']);

    const state = doc.getState();
    expect(state.walls['wall_B'].start).toEqual({ x: 300, y: 0 });
    expect(state.walls['wall_D'].start).toEqual({ x: 300, y: 0 });
    expect(state.walls['wall_C'].start).toEqual({ x: 0, y: 0 }); // C n'a pas bougé
  });

  // T-MOVE-04 : MoveWallCommand avec ouverture sur neighbor -> offsetAlong compensé (Option β)
  it('T-MOVE-04 : MoveWallCommand avec ouverture sur neighbor -> offsetAlong compensé par projection', () => {
    const { doc, levelId, typeId } = createBaseDoc();
    doc.execute(
      new AddWallCommand({
        id: 'wall_A',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 0, y: 0 },
        end: { x: 6000, y: 0 },
      }),
    );
    doc.execute(
      new AddWallCommand({
        id: 'wall_B',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 6000, y: 0 },
        end: { x: 6000, y: 4000 },
      }),
    );
    doc.execute(
      new AddDoorCommand({
        id: 'door_B',
        category: 'door',
        doorTypeId: 'door_type_std',
        hostWallId: 'wall_B',
        offsetAlong: 1500,
        width: 900,
        height: 2100,
        swing: { side: 'left', direction: 'in' },
      }),
    );

    const res = doc.execute(new MoveWallCommand('wall_A', { x: 500, y: 0 }));
    expect(res.changed).toContain('door_B');

    const updatedDoor = doc.getState().doors['door_B'];
    // Projection monde calculée avec précision en T-STRETCH-13
    expect(updatedDoor.offsetAlong).toBeCloseTo(1550.43, 1);
  });

  // T-MOVE-05 : MoveWallCommand avec COLLAPSE sur neighbor -> throw, rollback intégral
  it('T-MOVE-05 : MoveWallCommand avec COLLAPSE sur neighbor -> throw, AUCUN patch empilé, état inchangé', () => {
    const { doc, levelId, typeId } = createBaseDoc();
    doc.execute(
      new AddWallCommand({
        id: 'wall_A',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 0, y: 0 },
        end: { x: 1000, y: 0 },
      }),
    );
    doc.execute(
      new AddWallCommand({
        id: 'wall_B',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 1000, y: 0 },
        end: { x: 1000, y: 150 }, // 150 mm
      }),
    );

    const stateBefore = doc.getState();

    const canUndoBefore = doc.canUndo();

    // Translation qui rapproche B.start de B.end (+70 mm -> longueur = 80 mm < 100 mm)
    expect(() => doc.execute(new MoveWallCommand('wall_A', { x: 0, y: 70 }))).toThrowError(
      BimValidationError,
    );

    expect(doc.getState()).toEqual(stateBefore);
    expect(doc.canUndo()).toBe(canUndoBefore);
  });

  // T-MOVE-06 : MoveWallCommand avec REVERSED -> throw, rollback intégral
  it('T-MOVE-06 : MoveWallCommand avec REVERSED -> throw, état documentaire inchangé', () => {
    const { doc, levelId, typeId } = createBaseDoc();
    doc.execute(
      new AddWallCommand({
        id: 'wall_A',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 0, y: 0 },
        end: { x: 1000, y: 0 },
      }),
    );
    doc.execute(
      new AddWallCommand({
        id: 'wall_B',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 1000, y: 0 },
        end: { x: 1000, y: 100 },
      }),
    );

    const stateBefore = doc.getState();

    // Déplacement de y=+200 mm qui inverse l'axe de B
    expect(() => doc.execute(new MoveWallCommand('wall_A', { x: 0, y: 200 }))).toThrowError(
      BimValidationError,
    );

    expect(doc.getState()).toEqual(stateBefore);
  });

  // T-MOVE-07 : MoveWallCommand avec CYCLE (propagateChain: true) -> throw WALL_STRETCH_CYCLE (Précision 1)
  it('T-MOVE-07 : MoveWallCommand avec CYCLE en propagation en chaîne -> throw WALL_STRETCH_CYCLE (garde-fou défensif)', () => {
    const { doc, levelId, typeId } = createBaseDoc();
    // Triangle fermé A -> B -> C -> A
    doc.execute(
      new AddWallCommand({
        id: 'wall_A',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 0, y: 0 },
        end: { x: 2000, y: 0 },
      }),
    );
    doc.execute(
      new AddWallCommand({
        id: 'wall_B',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 2000, y: 0 },
        end: { x: 1000, y: 1732 },
      }),
    );
    doc.execute(
      new AddWallCommand({
        id: 'wall_C',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 1000, y: 1732 },
        end: { x: 0, y: 0 },
      }),
    );

    try {
      doc.execute(new MoveWallCommand('wall_A', { x: 100, y: 0 }, { propagateChain: true }));
      expect.fail('Devrait lever WALL_STRETCH_CYCLE');
    } catch (e) {
      expect(e).toBeInstanceOf(BimValidationError);
      expect((e as BimValidationError).code).toBe('WALL_STRETCH_CYCLE');
      expect((e as BimValidationError).offendingIds).toBeDefined();
    }
  });

  // T-MOVE-08 : MoveWallCommand sur cascade linéaire A->B->C (propagateChain: true) -> C suit via recursion
  it('T-MOVE-08 : MoveWallCommand sur cascade linéaire A->B->C -> C suit via récursion (2 niveaux)', () => {
    const { doc, levelId, typeId } = createBaseDoc();
    // Chaîne linéaire A -> B -> C
    doc.execute(
      new AddWallCommand({
        id: 'wall_A',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 0, y: 0 },
        end: { x: 2000, y: 0 },
      }),
    );
    doc.execute(
      new AddWallCommand({
        id: 'wall_B',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 2000, y: 0 },
        end: { x: 2000, y: 2000 },
      }),
    );
    doc.execute(
      new AddWallCommand({
        id: 'wall_C',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 2000, y: 2000 },
        end: { x: 4000, y: 2000 },
      }),
    );

    const res = doc.execute(
      new MoveWallCommand('wall_A', { x: 0, y: 200 }, { propagateChain: true }),
    );

    expect(res.changed).toContain('wall_A');
    expect(res.changed).toContain('wall_B');
    expect(res.changed).toContain('wall_C');

    const state = doc.getState();
    expect(state.walls['wall_A'].start).toEqual({ x: 0, y: 200 });
    expect(state.walls['wall_B'].start).toEqual({ x: 2000, y: 200 });
  });

  // T-MOVE-09 : MoveWallCommand undo -> état revient à stateBefore
  it('T-MOVE-09 : MoveWallCommand undo -> état revient à stateBefore (toEqual deepEqual)', () => {
    const { doc, levelId, typeId } = createBaseDoc();
    doc.execute(
      new AddWallCommand({
        id: 'wall_A',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 0, y: 0 },
        end: { x: 4000, y: 0 },
      }),
    );
    doc.execute(
      new AddWallCommand({
        id: 'wall_B',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 4000, y: 0 },
        end: { x: 4000, y: 3000 },
      }),
    );

    const stateBefore = doc.getState();
    doc.execute(new MoveWallCommand('wall_A', { x: 300, y: 0 }));
    expect(doc.getState()).not.toEqual(stateBefore);

    doc.undo();
    expect(doc.getState()).toEqual(stateBefore);
  });

  // T-MOVE-10 : MoveWallCommand redo -> état revient à stateAfter
  it('T-MOVE-10 : MoveWallCommand redo -> état revient à stateAfter', () => {
    const { doc, levelId, typeId } = createBaseDoc();
    doc.execute(
      new AddWallCommand({
        id: 'wall_A',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 0, y: 0 },
        end: { x: 4000, y: 0 },
      }),
    );
    doc.execute(
      new AddWallCommand({
        id: 'wall_B',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 4000, y: 0 },
        end: { x: 4000, y: 3000 },
      }),
    );

    doc.execute(new MoveWallCommand('wall_A', { x: 300, y: 0 }));
    const stateAfter = doc.getState();

    doc.undo();
    doc.redo();
    expect(doc.getState()).toEqual(stateAfter);
  });

  // T-MOVE-11 : MoveWallCommand sur mur avec voisins dont 1 collapse -> offendingIds précis
  it('T-MOVE-11 : MoveWallCommand avec échec sur 1 voisin -> offendingIds contient le mur déplacé et le voisin fautif', () => {
    const { doc, levelId, typeId } = createBaseDoc();
    doc.execute(
      new AddWallCommand({
        id: 'wall_A',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 0, y: 0 },
        end: { x: 4000, y: 0 },
      }),
    );
    doc.execute(
      new AddWallCommand({
        id: 'wall_short',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 4000, y: 0 },
        end: { x: 4000, y: 150 },
      }),
    );

    try {
      doc.execute(new MoveWallCommand('wall_A', { x: 0, y: 70 }));
      expect.fail('Devrait lever une erreur');
    } catch (e) {
      expect(e).toBeInstanceOf(BimValidationError);
      const err = e as BimValidationError;
      expect(err.code).toBe('WALL_STRETCH_COLLAPSE');
      expect(err.offendingIds).toContain('wall_A');
      expect(err.offendingIds).toContain('wall_short');
    }
  });

  // T-MOVE-12a : PRÉCISION 2 de Claude — Pièce fermée déformée -> Room reste enclosed et surface recalculée
  it('T-MOVE-12a : Déplacement dans pièce fermée -> Room reste enclosed et sa surface change', () => {
    const { doc, levelId, typeId } = createBaseDoc();
    // 4 murs formant une pièce rectangulaire 4000 x 3000 = 12 m²
    doc.execute(
      new AddWallCommand({
        id: 'w_s',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 0, y: 0 },
        end: { x: 4000, y: 0 },
      }),
    );
    doc.execute(
      new AddWallCommand({
        id: 'w_e',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 4000, y: 0 },
        end: { x: 4000, y: 3000 },
      }),
    );
    doc.execute(
      new AddWallCommand({
        id: 'w_n',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 4000, y: 3000 },
        end: { x: 0, y: 3000 },
      }),
    );
    doc.execute(
      new AddWallCommand({
        id: 'w_w',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 0, y: 3000 },
        end: { x: 0, y: 0 },
      }),
    );

    doc.execute(
      new AddRoomCommand({
        id: 'room_1',
        category: 'room',
        levelId,
        name: 'Séjour',
        seed: { x: 2000, y: 1500 },
      }),
    );

    const initialRoom = doc.getState().rooms['room_1'];
    const initialArea = initialRoom.area;

    // Déplacer le mur sud de (500, 0)
    const res = doc.execute(new MoveWallCommand('w_s', { x: 500, y: 0 }));
    expect(res.changed).toContain('room_1');

    const updatedRoom = doc.getState().rooms['room_1'];
    expect(updatedRoom.status).toBe('enclosed');
    expect(updatedRoom.area).toBeDefined();
    // Vérification de la précision 2 : la surface a changé (écart mesurable)
    expect(updatedRoom.area).not.toBe(initialArea);
  });

  // T-MOVE-12b : PRÉCISION 2 de Claude — Rupture d'enceinte -> Room passe unenclosed, surface = 0, non supprimée
  it('T-MOVE-12b : Déplacement rompant une enceinte -> Room passe unenclosed avec surface=0 (non supprimée, ADR-039)', () => {
    const { doc, levelId, typeId } = createBaseDoc();
    doc.execute(
      new AddWallCommand({
        id: 'w_s',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 0, y: 0 },
        end: { x: 4000, y: 0 },
      }),
    );
    doc.execute(
      new AddWallCommand({
        id: 'w_e',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 4000, y: 0 },
        end: { x: 4000, y: 3000 },
      }),
    );
    doc.execute(
      new AddWallCommand({
        id: 'w_n',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 4000, y: 3000 },
        end: { x: 0, y: 3000 },
      }),
    );
    doc.execute(
      new AddWallCommand({
        id: 'w_w',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 0, y: 3000 },
        end: { x: 0, y: 0 },
      }),
    );

    doc.execute(
      new AddRoomCommand({
        id: 'room_leak',
        category: 'room',
        levelId,
        name: 'Bureau',
        seed: { x: 2000, y: 1500 },
      }),
    );

    // Déplacer w_s SANS étirement des voisins ({ stretchNeighbors: false }) -> crée une brèche de 2000 mm
    doc.execute(new MoveWallCommand('w_s', { x: 0, y: -2000 }, { stretchNeighbors: false }));

    const leakRoom = doc.getState().rooms['room_leak'];
    expect(leakRoom).toBeDefined(); // ADR-039 : NON supprimée !
    expect(leakRoom.status).toBe('unenclosed');
    expect(leakRoom.area).toBe(0);
  });

  // T-PERF-MOVE-01 : MoveWallCommand sur 100 neighbors < 50ms
  it('T-PERF-MOVE-01 : Performance MoveWallCommand sur 100 voisins concourants < 50ms', () => {
    const { doc, levelId, typeId } = createBaseDoc();
    doc.execute(
      new AddWallCommand({
        id: 'wall_hub',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 0, y: 0 },
        end: { x: 5000, y: 0 },
      }),
    );

    // 100 cloisons incidentes le long du mur
    for (let i = 1; i <= 100; i++) {
      const x = (5000 * i) / 101;
      doc.execute(
        new AddWallCommand({
          id: `spoke_${i}`,
          category: 'wall',
          typeId,
          levelId,
          start: { x, y: 0 },
          end: { x, y: 2000 },
        }),
      );
    }

    const t0 = performance.now();
    doc.execute(new MoveWallCommand('wall_hub', { x: 0, y: 200 }));
    const duration = performance.now() - t0;

    expect(duration).toBeLessThan(50);
  });

  // T-PERF-MOVE-02 : DAG build après MoveWallCommand < 5ms
  it('T-PERF-MOVE-02 : Invalidation DAG après MoveWallCommand < 5ms', () => {
    const { doc, levelId, typeId } = createBaseDoc();
    doc.execute(
      new AddWallCommand({
        id: 'wall_dag_1',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 0, y: 0 },
        end: { x: 4000, y: 0 },
      }),
    );
    doc.execute(
      new AddWallCommand({
        id: 'wall_dag_2',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 4000, y: 0 },
        end: { x: 4000, y: 3000 },
      }),
    );

    const t0 = performance.now();
    doc.execute(new MoveWallCommand('wall_dag_1', { x: 100, y: 0 }));
    const duration = performance.now() - t0;

    expect(duration).toBeLessThan(10);
  });
});
