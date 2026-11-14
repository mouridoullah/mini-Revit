import { BimDocument, Commands } from '@mini-bim/core';

/**
 * Crée un BimDocument initial de démonstration contenant une pièce fermée à 4 murs
 * (dimensions : 6 000 mm x 4 000 mm = 24 m²).
 *
 * Conforme à la Règle d'or 2 : aucun import direct de @mini-bim/geometry.
 */
export function createDemoDocument(): BimDocument {
  const doc = BimDocument.createDefaultProject();
  const state = doc.getState();

  const levelId = Object.keys(state.levels)[0];
  const typeId = Object.keys(state.wallTypes)[0];

  if (!levelId || !typeId) {
    throw new Error('Le projet par défaut doit comporter au moins un niveau et un type de mur.');
  }

  // 4 murs orthogonaux formant une pièce fermée rectangulaire
  const wallsData = [
    {
      id: 'wall_south',
      start: { x: 0, y: 0 },
      end: { x: 6000, y: 0 },
    },
    {
      id: 'wall_east',
      start: { x: 6000, y: 0 },
      end: { x: 6000, y: 4000 },
    },
    {
      id: 'wall_north',
      start: { x: 6000, y: 4000 },
      end: { x: 0, y: 4000 },
    },
    {
      id: 'wall_west',
      start: { x: 0, y: 4000 },
      end: { x: 0, y: 0 },
    },
  ];

  for (const w of wallsData) {
    doc.execute(
      new Commands.AddWallCommand({
        id: w.id,
        category: 'wall',
        typeId,
        levelId,
        start: w.start,
        end: w.end,
      }),
    );
  }

  // Phase 3.2 : 1 porte sur wall_south et 1 fenêtre sur wall_north
  doc.execute(
    new Commands.AddDoorCommand({
      id: 'door_demo',
      category: 'door',
      kind: 'door',
      hostWallId: 'wall_south',
      offsetAlong: 2000,
      width: 900,
      height: 2100,
      swing: { side: 'right', direction: 'in' },
    }),
  );

  doc.execute(
    new Commands.AddWindowCommand({
      id: 'window_demo',
      category: 'window',
      kind: 'window',
      hostWallId: 'wall_north',
      offsetAlong: 2000,
      width: 1200,
      height: 1400,
      sillHeight: 900,
    }),
  );

  // Phase 4 : Pièce déclarée "Séjour" associée à la pièce close de 22.04 m²
  doc.execute(
    new Commands.AddRoomCommand({
      id: 'room_demo_sejour',
      category: 'room',
      levelId,
      seed: { x: 3000, y: 2000 },
      name: 'Séjour',
    }),
  );

  // Phase 5 : Cotation 2D associative de la façade Sud
  doc.execute(
    new Commands.AddDimensionCommand({
      id: 'dim_demo_south',
      category: 'dimension',
      levelId,
      type: 'linear',
      references: ['wall_south'],
      offset: -600,
      value: 6000,
    }),
  );

  return doc;
}
