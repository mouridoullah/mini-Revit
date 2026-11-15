import { describe, it, expect } from 'vitest';
import { vec2, type Vec2 } from '@mini-bim/geometry';
import { BimDocument } from './document.js';
import { AddLevelCommand, AddWallCommand, AddSlabCommand } from './commands.js';
import { computeWallEffectiveHeight } from './walls.js';
import { type Wall, type Slab } from './types.js';

describe('Phase 6.1a — computeWallEffectiveHeight (packages/core/src/walls-top.test.ts)', () => {
  function setupTestScenario() {
    const doc = BimDocument.createDefaultProject();
    const state = doc.getState();
    const levelRdcId = Object.keys(state.levels)[0]!; // elevation: 0
    const wallTypeId = Object.keys(state.wallTypes)[0]!; // height: 2800
    const defaultSlabTypeId = Object.keys(state.slabTypes)[0]!; // thickness: 200

    // Ajouter l'étage R+1 à élévation 3000 mm
    const levelR1Id = 'lvl_r1_3000';
    doc.execute(
      new AddLevelCommand({
        id: levelR1Id,
        name: 'Étage 1 (R+1)',
        elevation: 3000,
      }),
    );

    return {
      doc,
      levelRdcId,
      levelR1Id,
      wallTypeId,
      defaultSlabTypeId,
    };
  }

  it('T-WALL-TOP-01 : Mur avec heightOverride -> priorité absolue, ignore topConstraint et dalles', () => {
    const { doc, levelRdcId, levelR1Id, wallTypeId } = setupTestScenario();

    const wall: Wall = {
      id: 'w_override',
      category: 'wall',
      typeId: wallTypeId,
      levelId: levelRdcId,
      start: vec2(0, 0),
      end: vec2(5000, 0),
      topConstraint: { levelId: levelR1Id, topOffset: 0 },
      heightOverride: 3200,
    };
    doc.execute(new AddWallCommand(wall));

    const h = computeWallEffectiveHeight(doc.getState().walls['w_override']!, doc.getState());
    expect(h).toBe(3200);
  });

  it('T-WALL-TOP-02 : Mur sans topConstraint ni heightOverride -> retourne wallType.height', () => {
    const { doc, levelRdcId, wallTypeId } = setupTestScenario();

    const wall: Wall = {
      id: 'w_nominal',
      category: 'wall',
      typeId: wallTypeId,
      levelId: levelRdcId,
      start: vec2(0, 0),
      end: vec2(5000, 0),
    };
    doc.execute(new AddWallCommand(wall));

    const h = computeWallEffectiveHeight(doc.getState().walls['w_nominal']!, doc.getState());
    expect(h).toBe(2800);
  });

  it('T-WALL-TOP-03 : Mur rattaché à un niveau supérieur SANS dalle -> hauteur = ΔZ nominal', () => {
    const { doc, levelRdcId, levelR1Id, wallTypeId } = setupTestScenario();

    const wall: Wall = {
      id: 'w_no_slab',
      category: 'wall',
      typeId: wallTypeId,
      levelId: levelRdcId,
      start: vec2(0, 0),
      end: vec2(5000, 0),
      topConstraint: { levelId: levelR1Id, topOffset: 0 },
    };
    doc.execute(new AddWallCommand(wall));

    // Pas de dalle sur R+1 -> s'étend jusqu'à l'élévation de R+1 (3000 mm)
    const h = computeWallEffectiveHeight(doc.getState().walls['w_no_slab']!, doc.getState());
    expect(h).toBe(3000);
  });

  it('T-WALL-TOP-04 : Mur rattaché à un niveau supérieur AVEC dalle standard 200 mm -> s’arrête à la sous-face', () => {
    const { doc, levelRdcId, levelR1Id, wallTypeId, defaultSlabTypeId } = setupTestScenario();

    // Dalle sur R+1 couvrant toute la zone
    const slab: Slab = {
      id: 'slab_r1',
      category: 'slab',
      slabTypeId: defaultSlabTypeId, // 200 mm
      levelId: levelR1Id, // 3000 mm
      boundary: [vec2(-500, -500), vec2(6000, -500), vec2(6000, 5000), vec2(-500, 5000)],
    };
    doc.execute(new AddSlabCommand(slab));

    const wall: Wall = {
      id: 'w_under_slab',
      category: 'wall',
      typeId: wallTypeId,
      levelId: levelRdcId,
      start: vec2(0, 0),
      end: vec2(5000, 0),
      topConstraint: { levelId: levelR1Id, topOffset: 0 },
    };
    doc.execute(new AddWallCommand(wall));

    // Sous-face = 3000 - 200 = 2800 mm
    const h = computeWallEffectiveHeight(doc.getState().walls['w_under_slab']!, doc.getState());
    expect(h).toBe(2800);
  });

  it('T-WALL-TOP-05 : Mur sous dalle avec baseOffset négatif (-50 mm) -> sous-face = 3000 - 50 - 200 = 2750 mm', () => {
    const { doc, levelRdcId, levelR1Id, wallTypeId, defaultSlabTypeId } = setupTestScenario();

    const slabWithDrop: Slab = {
      id: 'slab_dropped',
      category: 'slab',
      slabTypeId: defaultSlabTypeId,
      levelId: levelR1Id,
      boundary: [vec2(-500, -500), vec2(6000, -500), vec2(6000, 5000), vec2(-500, 5000)],
      baseOffset: -50,
    };
    doc.execute(new AddSlabCommand(slabWithDrop));

    const wall: Wall = {
      id: 'w_dropped',
      category: 'wall',
      typeId: wallTypeId,
      levelId: levelRdcId,
      start: vec2(0, 0),
      end: vec2(5000, 0),
      topConstraint: { levelId: levelR1Id, topOffset: 0 },
    };
    doc.execute(new AddWallCommand(wall));

    const h = computeWallEffectiveHeight(doc.getState().walls['w_dropped']!, doc.getState());
    expect(h).toBe(2750);
  });

  it('T-WALL-TOP-06 : Mur sous trémie (vide de plancher) -> non couvert par la dalle, s’étend à 3000 mm', () => {
    const { doc, levelRdcId, levelR1Id, wallTypeId, defaultSlabTypeId } = setupTestScenario();

    // Dalle avec trémie englobant le mur
    const slabWithHole: Slab = {
      id: 'slab_void',
      category: 'slab',
      slabTypeId: defaultSlabTypeId,
      levelId: levelR1Id,
      boundary: [vec2(-500, -500), vec2(6000, -500), vec2(6000, 5000), vec2(-500, 5000)],
      openings: [[vec2(-100, -500), vec2(5100, -500), vec2(5100, 500), vec2(-100, 500)]], // Trémie recouvrant tout le mur
    };
    doc.execute(new AddSlabCommand(slabWithHole));

    const wall: Wall = {
      id: 'w_in_void',
      category: 'wall',
      typeId: wallTypeId,
      levelId: levelRdcId,
      start: vec2(0, 0),
      end: vec2(5000, 0),
      topConstraint: { levelId: levelR1Id, topOffset: 0 },
    };
    doc.execute(new AddWallCommand(wall));

    // Non couvert -> hauteur jusqu'au niveau supérieur nominal (3000 mm)
    const h = computeWallEffectiveHeight(doc.getState().walls['w_in_void']!, doc.getState());
    expect(h).toBe(3000);
  });

  it('T-WALL-TOP-07 : Mur avec baseOffset (+100 mm) et dalle supérieure 200 mm -> hauteur = 2700 mm', () => {
    const { doc, levelRdcId, levelR1Id, wallTypeId, defaultSlabTypeId } = setupTestScenario();

    const slab: Slab = {
      id: 'slab_standard',
      category: 'slab',
      slabTypeId: defaultSlabTypeId,
      levelId: levelR1Id,
      boundary: [vec2(-500, -500), vec2(6000, -500), vec2(6000, 5000), vec2(-500, 5000)],
    };
    doc.execute(new AddSlabCommand(slab));

    const wall: Wall = {
      id: 'w_offset_base',
      category: 'wall',
      typeId: wallTypeId,
      levelId: levelRdcId,
      start: vec2(0, 0),
      end: vec2(5000, 0),
      baseOffset: 100,
      topConstraint: { levelId: levelR1Id, topOffset: 0 },
    };
    doc.execute(new AddWallCommand(wall));

    // Z_base = 0 + 100 = 100 mm. Z_top = 3000 - 200 = 2800 mm. Hauteur = 2800 - 100 = 2700 mm.
    const h = computeWallEffectiveHeight(doc.getState().walls['w_offset_base']!, doc.getState());
    expect(h).toBe(2700);
  });

  it('T-WALL-TOP-08 : Mur avec niveau supérieur d’élévation inférieure à la base -> hauteur clampée à 0', () => {
    const { doc, levelR1Id, wallTypeId } = setupTestScenario();

    // Niveau inférieur sous R+1
    const subLevelId = 'lvl_sub';
    doc.execute(
      new AddLevelCommand({
        id: subLevelId,
        name: 'Sous-sol',
        elevation: -2000,
      }),
    );

    const invertedWall: Wall = {
      id: 'w_inverted',
      category: 'wall',
      typeId: wallTypeId,
      levelId: levelR1Id, // base à 3000
      start: vec2(0, 0),
      end: vec2(5000, 0),
      topConstraint: { levelId: subLevelId, topOffset: 0 }, // cible à -2000
    };
    doc.execute(new AddWallCommand(invertedWall));

    const h = computeWallEffectiveHeight(doc.getState().walls['w_inverted']!, doc.getState());
    expect(h).toBe(0);
  });
});
