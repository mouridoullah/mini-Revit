import { describe, it, expect } from 'vitest';
import {
  BimDocument,
  Commands,
  type Level,
  BimValidationError,
  getSortedLevels,
  getLevelStoryHeight,
  setStoryHeight,
} from './index.js';

describe('Intégrité Altimétrique des Niveaux & setStoryHeight (Phase 6.0b / ADR-036 / MULTI_LEVEL_SPEC)', () => {
  it('T-LVL-01: AddLevelCommand rejette deux niveaux avec la même élévation (DUPLICATE_LEVEL_ELEVATION)', () => {
    const doc = BimDocument.createDefaultProject();
    // Default project a déjà un niveau à Z = 0

    const dupLevel: Level = {
      id: 'lvl_dup_zero',
      name: 'Niveau Coplanaire 0',
      elevation: 0,
    };

    try {
      doc.execute(new Commands.AddLevelCommand(dupLevel));
      expect.unreachable('Devait rejeter le niveau coplanaire avec DUPLICATE_LEVEL_ELEVATION');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(BimValidationError);
      const bErr = err as BimValidationError;
      expect(bErr.code).toBe('DUPLICATE_LEVEL_ELEVATION');
      expect(bErr.offendingIds).toBeDefined();
      expect(bErr.offendingIds?.length).toBe(2);
      expect(bErr.offendingIds).toContain('lvl_dup_zero');
    }
  });

  it('T-LVL-02: UpdateLevelCommand rejette la modification d un niveau vers une élévation déjà occupée', () => {
    const doc = BimDocument.createDefaultProject();
    // Ajout d'un R+1 valide à 2800 mm
    doc.execute(
      new Commands.AddLevelCommand({
        id: 'lvl_etage1',
        name: 'Étage 1',
        elevation: 2800,
      }),
    );

    // Tentative de déplacer l'Étage 1 vers Z = 0 (occupé par le RDC)
    try {
      doc.execute(
        new Commands.UpdateLevelCommand(
          'lvl_etage1',
          { elevation: 0 },
          { shiftSuperiorLevels: false },
        ),
      );
      expect.unreachable('Devait rejeter la duplication d élévation');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(BimValidationError);
      const bErr = err as BimValidationError;
      expect(bErr.code).toBe('DUPLICATE_LEVEL_ELEVATION');
      expect(bErr.offendingIds).toContain('lvl_etage1');
    }
  });

  it('T-LVL-03: AddLevelCommand accepte des niveaux avec des élévations distinctes positives et négatives', () => {
    const doc = BimDocument.createDefaultProject();

    // Sous-sol à -2500 mm
    doc.execute(
      new Commands.AddLevelCommand({
        id: 'lvl_sous_sol',
        name: 'Sous-Sol',
        elevation: -2500,
      }),
    );

    // R+1 à 2800 mm
    doc.execute(
      new Commands.AddLevelCommand({
        id: 'lvl_etage_1',
        name: 'Étage 1',
        elevation: 2800,
      }),
    );

    // R+2 à 5600 mm
    doc.execute(
      new Commands.AddLevelCommand({
        id: 'lvl_etage_2',
        name: 'Étage 2',
        elevation: 5600,
      }),
    );

    const state = doc.getState();
    expect(state.levels['lvl_sous_sol']?.elevation).toBe(-2500);
    expect(state.levels['lvl_etage_1']?.elevation).toBe(2800);
    expect(state.levels['lvl_etage_2']?.elevation).toBe(5600);
  });

  it('T-LVL-04: Tolérance numérique : deux élévations distantes de moins de 1e-4 mm sont considérées coplanaires', () => {
    const doc = BimDocument.createDefaultProject();

    doc.execute(
      new Commands.AddLevelCommand({
        id: 'lvl_ref_2800',
        name: 'Étage Réf 2800',
        elevation: 2800.0,
      }),
    );

    // Écart de 5e-5 mm (< 1e-4) -> Rejeté
    const rejectedLevel: Level = {
      id: 'lvl_too_close',
      name: 'Étage Trop Proche',
      elevation: 2800.00005,
    };
    expect(() => {
      doc.execute(new Commands.AddLevelCommand(rejectedLevel));
    }).toThrowError(/DUPLICATE_LEVEL_ELEVATION/);

    // Écart de 2e-4 mm (> 1e-4) -> Accepté
    const acceptedLevel: Level = {
      id: 'lvl_distinct_ok',
      name: 'Étage Distinct OK',
      elevation: 2800.0002,
    };
    expect(() => {
      doc.execute(new Commands.AddLevelCommand(acceptedLevel));
    }).not.toThrow();
  });

  it('T-LVL-05: getSortedLevels trie strictement les niveaux par élévation croissante', () => {
    const levels: Record<string, Level> = {
      l3: { id: 'l3', name: 'Étage 2', elevation: 5600 },
      l0: { id: 'l0', name: 'Sous-sol', elevation: -2800 },
      l2: { id: 'l2', name: 'Étage 1', elevation: 2800 },
      l1: { id: 'l1', name: 'RDC', elevation: 0 },
    };

    const sorted = getSortedLevels(levels);
    expect(sorted.map((l) => l.id)).toEqual(['l0', 'l1', 'l2', 'l3']);
    expect(sorted.map((l) => l.elevation)).toEqual([-2800, 0, 2800, 5600]);
  });

  it('T-LVL-06: getLevelStoryHeight calcule la hauteur libre exacte entre niveaux consécutifs', () => {
    const doc = BimDocument.createDefaultProject();
    const rdcId = Object.keys(doc.getState().levels)[0]!;

    doc.execute(
      new Commands.AddLevelCommand({
        id: 'lvl_r1',
        name: 'R+1',
        elevation: 2750,
      }),
    );
    doc.execute(
      new Commands.AddLevelCommand({
        id: 'lvl_r2',
        name: 'R+2',
        elevation: 5800,
      }),
    );

    const h0 = getLevelStoryHeight(doc.getState(), rdcId);
    expect(h0).toBe(2750); // 2750 - 0

    const h1 = getLevelStoryHeight(doc.getState(), 'lvl_r1');
    expect(h1).toBe(3050); // 5800 - 2750
  });

  it('T-LVL-07: getLevelStoryHeight retourne undefined pour le niveau sommital ou un ID inconnu', () => {
    const doc = BimDocument.createDefaultProject();
    const rdcId = Object.keys(doc.getState().levels)[0]!;

    // Seul niveau du projet -> aucun étage au-dessus
    expect(getLevelStoryHeight(doc.getState(), rdcId)).toBeUndefined();
    expect(getLevelStoryHeight(doc.getState(), 'lvl_unknown')).toBeUndefined();
  });

  it('T-LVL-08: setStoryHeight(doc, levelIndex, height) ajuste la hauteur et décale paramétriquement les étages supérieurs', () => {
    const doc = BimDocument.createDefaultProject();
    doc.execute(
      new Commands.AddLevelCommand({
        id: 'lvl_r1',
        name: 'R+1',
        elevation: 2800,
      }),
    );
    doc.execute(
      new Commands.AddLevelCommand({
        id: 'lvl_r2',
        name: 'R+2',
        elevation: 5600,
      }),
    );

    // Modifier la hauteur du RDC (index 0) de 2800 mm à 3000 mm (+200 mm)
    const res = setStoryHeight(doc, 0, 3000);
    expect(res.changed).toContain('lvl_r1');
    expect(res.changed).toContain('lvl_r2');

    const state = doc.getState();
    expect(state.levels['lvl_r1']?.elevation).toBe(3000);
    // R+2 doit être automatiquement décalé à 5800 mm (5600 + 200) pour conserver sa hauteur sous plafond !
    expect(state.levels['lvl_r2']?.elevation).toBe(5800);
  });

  it('T-LVL-09: setStoryHeight(state, levelIndex, height) retourne une instance valide d UpdateLevelCommand', () => {
    const doc = BimDocument.createDefaultProject();
    doc.execute(
      new Commands.AddLevelCommand({
        id: 'lvl_r1',
        name: 'R+1',
        elevation: 2800,
      }),
    );

    const cmd = setStoryHeight(doc.getState(), 0, 3100);
    expect(cmd).toBeInstanceOf(Commands.UpdateLevelCommand);
    expect(cmd.levelId).toBe('lvl_r1');
    expect(cmd.patch.elevation).toBe(3100);
  });

  it('T-LVL-10: setStoryHeight rejette les indices hors bornes avec LEVEL_INDEX_OUT_OF_BOUNDS', () => {
    const doc = BimDocument.createDefaultProject();

    // Projet à 1 seul niveau -> index 0 n a pas de niveau supérieur
    expect(() => setStoryHeight(doc, 0, 2800)).toThrowError(/LEVEL_INDEX_OUT_OF_BOUNDS/);
    expect(() => setStoryHeight(doc, -1, 2800)).toThrowError(/LEVEL_INDEX_OUT_OF_BOUNDS/);
  });

  it('T-LVL-11: setStoryHeight rejette une hauteur d étage négative ou nulle avec INVALID_STORY_HEIGHT', () => {
    const doc = BimDocument.createDefaultProject();
    doc.execute(
      new Commands.AddLevelCommand({
        id: 'lvl_r1',
        name: 'R+1',
        elevation: 2800,
      }),
    );

    expect(() => setStoryHeight(doc, 0, 0)).toThrowError(/INVALID_STORY_HEIGHT/);
    expect(() => setStoryHeight(doc, 0, -500)).toThrowError(/INVALID_STORY_HEIGHT/);
    expect(() => setStoryHeight(doc, 0, Number.NaN)).toThrowError(/INVALID_STORY_HEIGHT/);
  });

  it('T-LVL-12: Réversibilité transactionnelle Undo/Redo de setStoryHeight', () => {
    const doc = BimDocument.createDefaultProject();
    doc.execute(
      new Commands.AddLevelCommand({
        id: 'lvl_r1',
        name: 'R+1',
        elevation: 2800,
      }),
    );
    doc.execute(
      new Commands.AddLevelCommand({
        id: 'lvl_r2',
        name: 'R+2',
        elevation: 5600,
      }),
    );

    const stateBefore = doc.getState();

    // Action : augmentation de la hauteur du RDC (+400 mm)
    setStoryHeight(doc, 0, 3200);
    expect(doc.getState().levels['lvl_r1']?.elevation).toBe(3200);
    expect(doc.getState().levels['lvl_r2']?.elevation).toBe(6000);

    // Annulation (Undo) bit-à-bit
    expect(doc.canUndo()).toBe(true);
    doc.undo();
    expect(doc.getState().levels['lvl_r1']?.elevation).toBe(2800);
    expect(doc.getState().levels['lvl_r2']?.elevation).toBe(5600);
    expect(doc.getState()).toEqual(stateBefore);

    // Rétablissement (Redo)
    expect(doc.canRedo()).toBe(true);
    doc.redo();
    expect(doc.getState().levels['lvl_r1']?.elevation).toBe(3200);
    expect(doc.getState().levels['lvl_r2']?.elevation).toBe(6000);
  });
});
