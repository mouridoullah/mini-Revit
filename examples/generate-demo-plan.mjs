import { writeFileSync } from 'node:fs';
import { BimDocument, Commands } from './packages/core/dist/index.js';

const doc = BimDocument.createDefaultProject();
const state = doc.getState();
const levelId = Object.keys(state.levels)[0];
const typeId = Object.keys(state.wallTypes)[0];

if (!levelId || !typeId) {
  throw new Error('Missing level or wall type');
}

const walls = [
  { id: 'outer_south', start: { x: 0, y: 0 }, end: { x: 9000, y: 0 } },
  { id: 'outer_east', start: { x: 9000, y: 0 }, end: { x: 9000, y: 6000 } },
  { id: 'outer_north', start: { x: 9000, y: 6000 }, end: { x: 0, y: 6000 } },
  { id: 'outer_west', start: { x: 0, y: 6000 }, end: { x: 0, y: 0 } },
  { id: 'split_vertical', start: { x: 3500, y: 0 }, end: { x: 3500, y: 6000 } },
  { id: 'split_horizontal', start: { x: 3500, y: 3000 }, end: { x: 9000, y: 3000 } },
];

for (const wall of walls) {
  doc.execute(
    new Commands.AddWallCommand({
      id: wall.id,
      category: 'wall',
      typeId,
      levelId,
      start: wall.start,
      end: wall.end,
    }),
  );
}

doc.execute(
  new Commands.AddDoorCommand({
    id: 'door_main',
    category: 'door',
    kind: 'door',
    hostWallId: 'outer_south',
    offsetAlong: 2600,
    width: 900,
    height: 2100,
    swing: { side: 'right', direction: 'in' },
  }),
);

doc.execute(
  new Commands.AddWindowCommand({
    id: 'window_north',
    category: 'window',
    kind: 'window',
    hostWallId: 'outer_north',
    offsetAlong: 2700,
    width: 1300,
    height: 1400,
    sillHeight: 900,
  }),
);

doc.execute(
  new Commands.AddWindowCommand({
    id: 'window_west',
    category: 'window',
    kind: 'window',
    hostWallId: 'outer_west',
    offsetAlong: 1700,
    width: 1200,
    height: 1400,
    sillHeight: 900,
  }),
);

doc.execute(
  new Commands.AddRoomCommand({
    id: 'room_left',
    category: 'room',
    levelId,
    seed: { x: 1500, y: 1500 },
    name: 'Salon',
  }),
);

doc.execute(
  new Commands.AddRoomCommand({
    id: 'room_right_lower',
    category: 'room',
    levelId,
    seed: { x: 6000, y: 1500 },
    name: 'Cuisine',
  }),
);

doc.execute(
  new Commands.AddRoomCommand({
    id: 'room_right_upper',
    category: 'room',
    levelId,
    seed: { x: 6000, y: 4500 },
    name: 'Chambre',
  }),
);

doc.execute(
  new Commands.AddDimensionCommand({
    id: 'dim_south',
    category: 'dimension',
    levelId,
    type: 'linear',
    references: ['outer_south'],
    offset: -600,
    value: 9000,
  }),
);

doc.execute(
  new Commands.AddDimensionCommand({
    id: 'dim_east',
    category: 'dimension',
    levelId,
    type: 'linear',
    references: ['outer_east'],
    offset: 600,
    value: 6000,
  }),
);

const json = JSON.stringify(doc.getState(), null, 2);
writeFileSync('./demo-plan-ambitieux.json', json, 'utf8');
console.log('Wrote demo-plan-ambitieux.json');
