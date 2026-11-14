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

  return doc;
}
