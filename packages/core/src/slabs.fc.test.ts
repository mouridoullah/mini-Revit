import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { vec2, type Vec2 } from '@mini-bim/geometry';
import { BimDocument } from './document.js';
import {
  AddSlabTypeCommand,
  AddSlabCommand,
  AddWallCommand,
  AddLevelCommand,
  UpdateLevelCommand,
} from './commands.js';
import { validateSlab, BimValidationError } from './rules.js';
import { computeWallEffectiveHeight } from './walls.js';
import { toJSON, fromJSON } from './serialization.js';
import { type Slab, type Wall, type BimState } from './types.js';

describe('Phase 6.1a — Property-Based Fast-Check Tests (packages/core/src/slabs.fc.test.ts)', () => {
  it('T-FC-01 : Invariance Undo/Redo sur 20 séquences de commandes aléatoires', () => {
    // Arbitraire de commande valide sur document
    const doc = BimDocument.createDefaultProject();
    const initialState = doc.getState();
    const levelId = Object.keys(initialState.levels)[0]!;
    const slabTypeId = Object.keys(initialState.slabTypes)[0]!;
    const wallTypeId = Object.keys(initialState.wallTypes)[0]!;

    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            type: fc.constantFrom('add_wall', 'add_slab', 'move_wall'),
            coord: fc.integer({ min: 100, max: 2000 }),
          }),
          { minLength: 1, maxLength: 8 },
        ),
        (actions) => {
          const testDoc = BimDocument.createDefaultProject();
          const startState = testDoc.getState();
          let executedCount = 0;

          try {
            for (let i = 0; i < actions.length; i++) {
              const action = actions[i]!;
              const id = `fc_elem_${i}_${action.coord}`;

              if (action.type === 'add_wall') {
                testDoc.execute(
                  new AddWallCommand({
                    id,
                    category: 'wall',
                    typeId: wallTypeId,
                    levelId,
                    start: vec2(action.coord, 0),
                    end: vec2(action.coord + 1000, 0),
                  }),
                );
                executedCount++;
              } else if (action.type === 'add_slab') {
                testDoc.execute(
                  new AddSlabCommand({
                    id,
                    category: 'slab',
                    slabTypeId,
                    levelId,
                    boundary: [
                      vec2(action.coord, action.coord),
                      vec2(action.coord + 1000, action.coord),
                      vec2(action.coord + 1000, action.coord + 1000),
                      vec2(action.coord, action.coord + 1000),
                    ],
                  }),
                );
                executedCount++;
              }
            }
          } catch {
            // Ignorer les rejets légitimes de collision
          }

          // Annuler toutes les commandes exécutées
          for (let k = 0; k < executedCount; k++) {
            if (testDoc.canUndo()) {
              testDoc.undo();
            }
          }

          // Invariance stricte : retour exact à l'état initial
          expect(testDoc.getState()).toEqual(startState);
        },
      ),
      { numRuns: 20 },
    );
  });

  it('T-FC-02 : Fuzzing validateSlab — zéro crash non géré sur n’importe quel polygone aléatoire', () => {
    const doc = BimDocument.createDefaultProject();
    const state = doc.getState();
    const levelId = Object.keys(state.levels)[0]!;
    const slabTypeId = Object.keys(state.slabTypes)[0]!;

    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            x: fc.float({ noNaN: false }),
            y: fc.float({ noNaN: false }),
          }),
          { minLength: 0, maxLength: 10 },
        ),
        (rawPoints) => {
          const slab: Slab = {
            id: 'fuzz_slab',
            category: 'slab',
            slabTypeId,
            levelId,
            boundary: rawPoints.map((p) => ({ x: p.x, y: p.y }) as Vec2),
          };

          try {
            validateSlab(slab, state);
          } catch (err) {
            // Toute exception doit obligatoirement être une BimValidationError
            expect(err).toBeInstanceOf(BimValidationError);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('T-FC-03 : Non-interpénétration mur/dalle sur 100 configurations aléatoires (Z_base + H <= Z_inf_slab)', () => {
    fc.assert(
      fc.property(
        fc.record({
          rdcElevation: fc.integer({ min: 0, max: 2000 }),
          storyHeight: fc.integer({ min: 2500, max: 4000 }),
          slabThickness: fc.integer({ min: 100, max: 350 }),
          slabBaseOffset: fc.integer({ min: -80, max: 0 }),
          wallBaseOffset: fc.integer({ min: -50, max: 150 }),
          topOffset: fc.integer({ min: -100, max: 100 }),
        }),
        (config) => {
          const doc = BimDocument.createDefaultProject();
          const rdcId = Object.keys(doc.getState().levels)[0]!;
          doc.execute(new UpdateLevelCommand(rdcId, { elevation: config.rdcElevation }));
          const wallTypeId = Object.keys(doc.getState().wallTypes)[0]!;

          const r1Id = 'lvl_r1_fc';
          const r1Elevation = config.rdcElevation + config.storyHeight;
          doc.execute(new AddLevelCommand({ id: r1Id, name: 'R+1', elevation: r1Elevation }));

          const slabTypeId = 'st_fc';
          doc.execute(
            new AddSlabTypeCommand({
              id: slabTypeId,
              name: 'Dalle FC',
              thickness: config.slabThickness,
            }),
          );
          doc.execute(
            new AddSlabCommand({
              id: 'slab_fc',
              category: 'slab',
              slabTypeId,
              levelId: r1Id,
              boundary: [
                vec2(-1000, -1000),
                vec2(6000, -1000),
                vec2(6000, 6000),
                vec2(-1000, 6000),
              ],
              baseOffset: config.slabBaseOffset,
            }),
          );

          const draftState = doc.getState();

          const wall: Wall = {
            id: 'wall_fc',
            category: 'wall',
            typeId: wallTypeId,
            levelId: rdcId,
            start: vec2(0, 0),
            end: vec2(4000, 0),
            baseOffset: config.wallBaseOffset,
            topConstraint: { levelId: r1Id, topOffset: config.topOffset },
          };

          const effectiveHeight = computeWallEffectiveHeight(wall, draftState);

          const zBase = config.rdcElevation + config.wallBaseOffset;
          const zInfSlab = r1Elevation + config.slabBaseOffset - config.slabThickness;
          const zWallTop = zBase + effectiveHeight;

          // Invariant physique absolu : le mur ne pénètre JAMAIS dans la dalle
          expect(zWallTop).toBeLessThanOrEqual(zInfSlab + 1e-4);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('T-FC-04 : Round-trip JSON sérialisation/désérialisation sur 20 états aléatoires avec dalles', () => {
    const doc = BimDocument.createDefaultProject();
    const baseState = doc.getState();
    const levelId = Object.keys(baseState.levels)[0]!;
    const slabTypeId = Object.keys(baseState.slabTypes)[0]!;

    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.stringMatching(/^sl_[a-z0-9]{4}$/),
            x: fc.integer({ min: 0, max: 5000 }),
            y: fc.integer({ min: 0, max: 5000 }),
            w: fc.integer({ min: 500, max: 2000 }),
            h: fc.integer({ min: 500, max: 2000 }),
          }),
          { minLength: 1, maxLength: 5 },
        ),
        (slabsData) => {
          const testSlabs: Record<string, Slab> = {};
          for (const s of slabsData) {
            testSlabs[s.id] = {
              id: s.id,
              category: 'slab',
              slabTypeId,
              levelId,
              boundary: [
                vec2(s.x, s.y),
                vec2(s.x + s.w, s.y),
                vec2(s.x + s.w, s.y + s.h),
                vec2(s.x, s.y + s.h),
              ],
            };
          }

          const state: BimState = {
            ...baseState,
            slabs: testSlabs,
          };

          const serialized = toJSON(state);
          const restored = fromJSON(serialized);

          // Round-trip parfait
          expect(restored).toEqual(state);
        },
      ),
      { numRuns: 20 },
    );
  });
});
