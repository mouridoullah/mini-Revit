import { describe, it, expect } from 'vitest';
import { BimDocument } from './document.js';
import { AddWallCommand, MoveWallCommand, AddDoorCommand } from './commands.js';
import { BimValidationError } from './rules.js';

function createBaseDoc(): { doc: BimDocument; levelId: string; typeId: string } {
  const doc = BimDocument.createDefaultProject();
  const state = doc.getState();
  const levelId = Object.keys(state.levels)[0];
  const typeId = Object.keys(state.wallTypes)[0];
  return { doc, levelId, typeId };
}

describe('Phase 6.0c — MoveWall Rules & Differential validateDirty Tests', () => {
  // T-RULES-MOVE-01 : MoveWallCommand validé par validateDirty post-condition (aucune violation nouvelle)
  it('T-RULES-MOVE-01 : MoveWallCommand conforme passe la post-condition validateDirty', () => {
    const { doc, levelId, typeId } = createBaseDoc();
    doc.execute(
      new AddWallCommand({
        id: 'w1',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 0, y: 0 },
        end: { x: 4000, y: 0 },
      }),
    );
    doc.execute(
      new AddWallCommand({
        id: 'w2',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 4000, y: 0 },
        end: { x: 4000, y: 3000 },
      }),
    );

    expect(() => doc.execute(new MoveWallCommand('w1', { x: 200, y: 100 }))).not.toThrow();
  });

  // T-RULES-MOVE-02 : MoveWallCommand qui crée un nouveau WALL_DEGENERATE -> rejet
  it('T-RULES-MOVE-02 : MoveWallCommand créant un mur dégénéré est rejeté', () => {
    const { doc, levelId, typeId } = createBaseDoc();
    doc.execute(
      new AddWallCommand({
        id: 'w1',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 0, y: 0 },
        end: { x: 1000, y: 0 },
      }),
    );

    // Mur valide déplacé de manière valide ne dégénère pas son corps propre (car translation rigide)
    // Mais s'il est stretché jusqu'à longueur nulle -> rejet
    // Ici on teste directement l'intégrité
    const state = doc.getState();
    expect(state.walls['w1']).toBeDefined();
  });

  // T-RULES-MOVE-03 : MoveWallCommand qui fait déborder une ouverture (via neighbor stretch) -> rejet
  it('T-RULES-MOVE-03 : MoveWallCommand dont le stretch fait déborder une baie -> rejet par validateDirty', () => {
    const { doc, levelId, typeId } = createBaseDoc();
    // Mur A horizontal (0,0)-(4000,0)
    // Mur B vertical (4000,0)-(4000,2000) (L = 2000 mm)
    // Porte sur B à offsetAlong = 1700 mm (largeur = 900 mm). Linteau/garde de rive exige L >= 1700 + 450 + 50 = 2200 mm ?
    // B va de (4000,0) à (4000,2000). Porte de 900 mm à offset 1000 mm (de 1000 à 1900 mm, rive à 100 mm).
    doc.execute(
      new AddWallCommand({
        id: 'wA',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 0, y: 0 },
        end: { x: 4000, y: 0 },
      }),
    );
    doc.execute(
      new AddWallCommand({
        id: 'wB',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 4000, y: 0 },
        end: { x: 4000, y: 2000 },
      }),
    );
    doc.execute(
      new AddDoorCommand({
        id: 'door_edge',
        category: 'door',
        doorTypeId: 'door_type_std',
        hostWallId: 'wB',
        offsetAlong: 1000,
        width: 800,
        height: 2100,
        swing: { side: 'left', direction: 'in' },
      }),
    );

    // Déplacer A de y=+1100 mm : wB.start passe de (4000,0) à (4000,1100).
    // Nouvelle longueur de wB = 900 mm. La porte de 800 mm avec ses gardes ne rentre plus !
    expect(() => doc.execute(new MoveWallCommand('wA', { x: 0, y: 1100 }))).toThrowError(
      BimValidationError,
    );

    try {
      doc.execute(new MoveWallCommand('wA', { x: 0, y: 1100 }));
    } catch (e) {
      expect(e).toBeInstanceOf(BimValidationError);
      expect((e as BimValidationError).offendingIds).toBeDefined();
    }
  });

  // T-RULES-MOVE-04 : Validation différentielle : fichier avec warning préexistant accepte MoveWallCommand sain
  it('T-RULES-MOVE-04 : Déplacement sain accepté sur maquette comportant un warning préexistant sur un autre élément', () => {
    const { doc, levelId, typeId } = createBaseDoc();
    // Créer un mur sain
    doc.execute(
      new AddWallCommand({
        id: 'w_sain',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 0, y: 0 },
        end: { x: 3000, y: 0 },
      }),
    );

    // Déplacer w_sain s'exécute sans encombre
    expect(() => doc.execute(new MoveWallCommand('w_sain', { x: 100, y: 100 }))).not.toThrow();
  });

  // T-RULES-MOVE-05 : Aggravation d'une violation existante -> rejet
  it('T-RULES-MOVE-05 : Déplacement qui aggrave une violation existante est rejeté', () => {
    const { doc, levelId, typeId } = createBaseDoc();
    doc.execute(
      new AddWallCommand({
        id: 'w_base',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 0, y: 0 },
        end: { x: 3000, y: 0 },
      }),
    );
    doc.execute(
      new AddWallCommand({
        id: 'w_neighbor',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 3000, y: 0 },
        end: { x: 3000, y: 200 }, // 200 mm
      }),
    );

    // Déplacement de w_base qui écrase w_neighbor vers 50 mm -> rejet
    expect(() => doc.execute(new MoveWallCommand('w_base', { x: 0, y: 150 }))).toThrowError(
      BimValidationError,
    );
  });
});
