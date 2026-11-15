import { describe, it, expect, beforeEach } from 'vitest';
import { BimDocument } from './document.js';
import {
  UpdateWallCommand,
  DeleteWallCommand,
  AddDimensionCommand,
  UpdateDimensionCommand,
  DeleteDimensionCommand,
} from './commands.js';
import { computeDimensionValue } from './dimensions/index.js';
import { validateDimension, BimValidationError } from './rules.js';
import { type Dimension } from './types.js';

describe('Cotations 2D Associatives (packages/core)', () => {
  let doc: BimDocument;

  beforeEach(() => {
    doc = new BimDocument({
      schemaVersion: 2,
      units: 'mm',
      levels: {
        lvl_00: { id: 'lvl_00', name: 'RDC', elevation: 0 },
      },
      wallTypes: {
        wt_200: { id: 'wt_200', name: '200mm', thickness: 200, height: 2800 },
      },
      slabTypes: {},
      doorTypes: {},
      windowTypes: {},
      slabs: {},
      walls: {
        wall_south: {
          id: 'wall_south',
          category: 'wall',
          typeId: 'wt_200',
          levelId: 'lvl_00',
          start: { x: 0, y: 0 },
          end: { x: 6000, y: 0 },
        },
        wall_north: {
          id: 'wall_north',
          category: 'wall',
          typeId: 'wt_200',
          levelId: 'lvl_00',
          start: { x: 0, y: 4000 },
          end: { x: 6000, y: 4000 },
        },
        wall_west: {
          id: 'wall_west',
          category: 'wall',
          typeId: 'wt_200',
          levelId: 'lvl_00',
          start: { x: 0, y: 0 },
          end: { x: 0, y: 4000 },
        },
        wall_east: {
          id: 'wall_east',
          category: 'wall',
          typeId: 'wt_200',
          levelId: 'lvl_00',
          start: { x: 6000, y: 0 },
          end: { x: 6000, y: 4000 },
        },
      },
      doors: {},
      windows: {},
      rooms: {},
      dimensions: {},
    });
  });

  describe('computeDimensionValue', () => {
    it('calcule la longueur axiale exacte d’un mur unique', () => {
      const dim: Pick<Dimension, 'references'> = { references: ['wall_south'] };
      const val = computeDimensionValue(dim, doc.getState());
      expect(val).toBe(6000);
    });

    it('calcule la distance orthogonale entre deux murs parallèles', () => {
      // wall_south (y=0) et wall_north (y=4000) sont horizontaux et parallèles, distance = 4000
      const dim: Pick<Dimension, 'references'> = { references: ['wall_south', 'wall_north'] };
      const val = computeDimensionValue(dim, doc.getState());
      expect(val).toBe(4000);
    });

    it('retourne 0 si aucune référence ou référence inconnue', () => {
      expect(computeDimensionValue({ references: [] }, doc.getState())).toBe(0);
      expect(computeDimensionValue({ references: ['ghost_wall'] }, doc.getState())).toBe(0);
    });
  });

  describe('validateDimension', () => {
    it('rejette un niveau inexistant', () => {
      const dim: Dimension = {
        id: 'dim_01',
        category: 'dimension',
        levelId: 'lvl_unknown',
        type: 'linear',
        references: ['wall_south'],
        offset: 500,
        value: 6000,
      };
      expect(() => validateDimension(dim, doc.getState())).toThrowError(BimValidationError);
      expect(() => validateDimension(dim, doc.getState())).toThrowError(/UNKNOWN_LEVEL/);
    });

    it('rejette des références vides', () => {
      const dim: Dimension = {
        id: 'dim_01',
        category: 'dimension',
        levelId: 'lvl_00',
        type: 'linear',
        references: [],
        offset: 500,
        value: 0,
      };
      expect(() => validateDimension(dim, doc.getState())).toThrowError(/INVALID_DIMENSION_REFERENCES/);
    });

    it('rejette une référence vers un mur inexistant', () => {
      const dim: Dimension = {
        id: 'dim_01',
        category: 'dimension',
        levelId: 'lvl_00',
        type: 'linear',
        references: ['wall_phantom'],
        offset: 500,
        value: 0,
      };
      expect(() => validateDimension(dim, doc.getState())).toThrowError(/UNKNOWN_DIMENSION_REFERENCE/);
    });

    it('rejette un décalage (offset) non fini', () => {
      const dim: Dimension = {
        id: 'dim_01',
        category: 'dimension',
        levelId: 'lvl_00',
        type: 'linear',
        references: ['wall_south'],
        offset: NaN,
        value: 6000,
      };
      expect(() => validateDimension(dim, doc.getState())).toThrowError(/INVALID_DIMENSION_OFFSET/);
    });
  });

  describe('Commandes Add / Update / Delete Dimension', () => {
    it('AddDimensionCommand ajoute une cotation avec calcul automatique de la valeur', () => {
      const dim: Dimension = {
        id: 'dim_south',
        category: 'dimension',
        levelId: 'lvl_00',
        type: 'linear',
        references: ['wall_south'],
        offset: -600,
        value: 0, // sera auto-calculé
      };
      const res = doc.execute(new AddDimensionCommand(dim));
      expect(res.changed).toEqual(['dim_south']);
      expect(doc.getState().dimensions['dim_south']).toBeDefined();
      expect(doc.getState().dimensions['dim_south']!.value).toBe(6000);
    });

    it('UpdateDimensionCommand modifie le décalage et le label personnalisé', () => {
      doc.execute(
        new AddDimensionCommand({
          id: 'dim_south',
          category: 'dimension',
          levelId: 'lvl_00',
          type: 'linear',
          references: ['wall_south'],
          offset: -600,
          value: 6000,
        }),
      );

      const res = doc.execute(
        new UpdateDimensionCommand('dim_south', {
          offset: -800,
          customLabel: 'Longueur Façade Sud',
        }),
      );
      expect(res.changed).toEqual(['dim_south']);
      expect(doc.getState().dimensions['dim_south']!.offset).toBe(-800);
      expect(doc.getState().dimensions['dim_south']!.customLabel).toBe('Longueur Façade Sud');
    });

    it('DeleteDimensionCommand supprime la cotation du modèle', () => {
      doc.execute(
        new AddDimensionCommand({
          id: 'dim_south',
          category: 'dimension',
          levelId: 'lvl_00',
          type: 'linear',
          references: ['wall_south'],
          offset: -600,
          value: 6000,
        }),
      );

      const res = doc.execute(new DeleteDimensionCommand('dim_south'));
      expect(res.changed).toEqual(['dim_south']);
      expect(doc.getState().dimensions['dim_south']).toBeUndefined();
    });
  });

  describe('Associativité paramétrique bidirectionnelle (ADR-034)', () => {
    it('lorsqu’un mur est allongé via UpdateWallCommand, la cotation se recalcule et est notifiée dans getChangedIds', () => {
      doc.execute(
        new AddDimensionCommand({
          id: 'dim_south',
          category: 'dimension',
          levelId: 'lvl_00',
          type: 'linear',
          references: ['wall_south'],
          offset: -600,
          value: 6000,
        }),
      );

      // Allongement de wall_south de 6000 à 7500 mm
      const res = doc.execute(
        new UpdateWallCommand('wall_south', {
          end: { x: 7500, y: 0 },
        }),
      );

      // Invariant : l'id du mur ET l'id de la cotation impactée sont retournés dans l'ordre déterministe
      expect(res.changed).toEqual(['wall_south', 'dim_south']);

      // Invariant : la valeur de la cotation a été automatiquement mise à jour
      expect(doc.getState().dimensions['dim_south']!.value).toBe(7500);

      // Undo restaure la valeur d'origine
      doc.undo();
      expect(doc.getState().dimensions['dim_south']!.value).toBe(6000);

      // Redo réapplique la valeur allongée
      doc.redo();
      expect(doc.getState().dimensions['dim_south']!.value).toBe(7500);
    });

    it('lorsqu’un mur est supprimé via DeleteWallCommand, les cotations associées sont supprimées en cascade', () => {
      doc.execute(
        new AddDimensionCommand({
          id: 'dim_south',
          category: 'dimension',
          levelId: 'lvl_00',
          type: 'linear',
          references: ['wall_south'],
          offset: -600,
          value: 6000,
        }),
      );

      const stateBefore = doc.getState();

      // Suppression de wall_south
      const res = doc.execute(new DeleteWallCommand('wall_south'));

      // Invariant : la cotation est supprimée et signalée dans getChangedIds dans l'ordre déterministe
      expect(res.changed).toEqual(['wall_south', 'dim_south']);
      expect(doc.getState().dimensions['dim_south']).toBeUndefined();

      // Invariant Undo : restauration bit-à-bit stricte
      doc.undo();
      expect(doc.getState().dimensions['dim_south']).toBeDefined();
      expect(doc.getState().dimensions['dim_south']!.value).toBe(6000);
      expect(doc.getState()).toEqual(stateBefore);

      // Redo
      doc.redo();
      expect(doc.getState().dimensions['dim_south']).toBeUndefined();
    });
  });
});
