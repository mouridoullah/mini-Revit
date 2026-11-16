import { writeFileSync } from 'node:fs';
import { BimDocument, Commands } from '../packages/core/dist/index.js';

const doc = BimDocument.createDefaultProject();
const state = doc.getState();
const levelId = Object.keys(state.levels)[0];
const wallTypeId = Object.keys(state.wallTypes)[0];
const gableTypeId = 'default-gable-roof-type';
const doorTypeId = 'default-door-type';
const windowTypeId = 'default-window-type';

const roofId = 'roof_main';
const roofFootprint = [
  { x: 0, y: 0 },
  { x: 8000, y: 0 },
  { x: 8000, y: 5000 },
  { x: 0, y: 5000 },
];
const ridgeAxis = {
  start: { x: 0, y: 2500 },
  end: { x: 8000, y: 2500 },
};

doc.execute(
  new Commands.AddRoofCommand({
    id: roofId,
    category: 'roof',
    roofTypeId: gableTypeId,
    levelId,
    footprint: roofFootprint,
    ridgeAxis,
    baseOffset: 2800,
  }),
);

// Add 4 walls attached to roof
// Gouttereau Sud (y=0, from x=0 to 8000)
doc.execute(
  new Commands.AddWallCommand({
    id: 'wall_south',
    category: 'wall',
    typeId: wallTypeId,
    levelId,
    start: { x: 0, y: 0 },
    end: { x: 8000, y: 0 },
    topConstraint: { kind: 'roof', roofId },
  }),
);

// Pignon Est (x=8000, from y=0 to 5000)
doc.execute(
  new Commands.AddWallCommand({
    id: 'wall_east',
    category: 'wall',
    typeId: wallTypeId,
    levelId,
    start: { x: 8000, y: 0 },
    end: { x: 8000, y: 5000 },
    topConstraint: { kind: 'roof', roofId },
  }),
);

// Gouttereau Nord (y=5000, from x=8000 to 0)
doc.execute(
  new Commands.AddWallCommand({
    id: 'wall_north',
    category: 'wall',
    typeId: wallTypeId,
    levelId,
    start: { x: 8000, y: 5000 },
    end: { x: 0, y: 5000 },
    topConstraint: { kind: 'roof', roofId },
  }),
);

// Pignon Ouest (x=0, from y=5000 to 0)
doc.execute(
  new Commands.AddWallCommand({
    id: 'wall_west',
    category: 'wall',
    typeId: wallTypeId,
    levelId,
    start: { x: 0, y: 5000 },
    end: { x: 0, y: 0 },
    topConstraint: { kind: 'roof', roofId },
  }),
);

// Add door on wall_south
doc.execute(
  new Commands.AddDoorCommand({
    id: 'door_south',
    category: 'door',
    kind: 'door',
    doorTypeId,
    hostWallId: 'wall_south',
    offsetAlong: 2500,
    swing: { side: 'right', direction: 'in' },
  }),
);

// Add windows
doc.execute(
  new Commands.AddWindowCommand({
    id: 'window_south',
    category: 'window',
    kind: 'window',
    windowTypeId,
    hostWallId: 'wall_south',
    offsetAlong: 5500,
    sillHeight: 900,
  }),
);

doc.execute(
  new Commands.AddWindowCommand({
    id: 'window_east',
    category: 'window',
    kind: 'window',
    windowTypeId,
    hostWallId: 'wall_east',
    offsetAlong: 1800,
    sillHeight: 900,
  }),
);

// Add slab
doc.execute(
  new Commands.AddSlabCommand({
    id: 'slab_ground',
    category: 'slab',
    slabTypeId: 'default-slab-type',
    levelId,
    boundary: roofFootprint,
    elevation: 0,
  }),
);

const json = JSON.stringify(doc.getState(), null, 2);
writeFileSync('./demo-roof-plan.json', json, 'utf8');
console.log('Successfully generated demo-roof-plan.json');
