import { describe, it, expect } from 'vitest';
import * as WebIFC from 'web-ifc';
import {
  BimDocument,
  type BimState,
  type Component,
  type ComponentType,
  STANDARD_COMPONENT_CATALOG,
  createDefaultComponentTypes,
  AddComponentTypeCommand,
  UpdateComponentTypeCommand,
  DeleteComponentTypeCommand,
  AddComponentCommand,
  UpdateComponentCommand,
  DeleteComponentCommand,
  DeleteLevelCommand,
  DeleteWallCommand,
  AddWallCommand,
  validateComponentType,
  validateComponent,
  canDeleteComponentType,
  BimValidationError,
  toJSON,
  fromJSON,
  exportToIfc,
} from '../index.js';

describe('Composants architecturaux et mobilier paramétrique (Phase 8.1 - Core Model)', () => {
  // -------------------------------------------------------------------------
  // 1. Catalogue standard et initialisation
  // -------------------------------------------------------------------------
  describe('Catalogue standard (STANDARD_COMPONENT_CATALOG)', () => {
    it('définit 15 familles standards réparties sur les 4 grandes catégories architecturales', () => {
      expect(STANDARD_COMPONENT_CATALOG.length).toBe(15);

      const families = new Set(STANDARD_COMPONENT_CATALOG.map((c) => c.family));
      expect(families.has('sanitary')).toBe(true);
      expect(families.has('kitchen')).toBe(true);
      expect(families.has('furniture')).toBe(true);
      expect(families.has('glazing')).toBe(true);
    });

    it('tous les composants du catalogue possèdent des dimensions strictement positives et valides', () => {
      for (const ct of STANDARD_COMPONENT_CATALOG) {
        expect(ct.width).toBeGreaterThan(0);
        expect(ct.depth).toBeGreaterThan(0);
        expect(ct.height).toBeGreaterThan(0);
        expect(typeof ct.name).toBe('string');
        expect(ct.name.trim().length).toBeGreaterThan(0);
        expect(ct.category).toBe('componentType');
        // Validation unitaire via rule
        expect(() => validateComponentType(ct)).not.toThrow();
      }
    });

    it('createDefaultComponentTypes indexe correctement le catalogue par ElementId', () => {
      const dict = createDefaultComponentTypes();
      expect(Object.keys(dict).length).toBe(15);
      expect(dict['ct_toilet_wall_hung']?.name).toBe('WC Suspendu 36x54');
      expect(dict['ct_bed_double']?.name).toBe('Lit Double 160x200');
    });

    it('BimDocument.createDefaultProject() initialise les types standards et une collection de composants vide', () => {
      const doc = BimDocument.createDefaultProject();
      const state = doc.getState();

      expect(state.componentTypes).toBeDefined();
      expect(Object.keys(state.componentTypes ?? {}).length).toBe(15);
      expect(state.components).toBeDefined();
      expect(Object.keys(state.components ?? {}).length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Règles de validation métier
  // -------------------------------------------------------------------------
  describe('Règles de validation métier (validateComponentType, validateComponent)', () => {
    it('valide un ComponentType correct et rejette un nom vide ou des dimensions négatives', () => {
      const valid: ComponentType = {
        id: 'ct_custom',
        category: 'componentType',
        name: 'Bureau Direction',
        family: 'furniture',
        subType: 'table',
        width: 1800,
        depth: 900,
        height: 750,
      };
      expect(() => validateComponentType(valid)).not.toThrow();

      expect(() =>
        validateComponentType({
          ...valid,
          name: '',
        }),
      ).toThrowError(/empty name/);

      expect(() =>
        validateComponentType({
          ...valid,
          width: -100,
        }),
      ).toThrowError(/strictly positive/);

      expect(() =>
        validateComponentType({
          ...valid,
          // @ts-expect-error test invalid family
          family: 'invalid_family',
        }),
      ).toThrowError(/invalid family/);
    });

    it('rejette un composant pointant vers un typeId ou levelId inexistant', () => {
      const doc = BimDocument.createDefaultProject();
      const state = doc.getState();
      const levelId = Object.keys(state.levels)[0] ?? 'lvl_0';

      const validComp: Component = {
        id: 'comp_1',
        category: 'component',
        typeId: 'ct_bed_double',
        levelId,
        placement: { x: 2000, y: 1500, rotation: 0 },
      };
      expect(() => validateComponent(validComp, state)).not.toThrow();

      // TypeId inconnu
      expect(() =>
        validateComponent({ ...validComp, typeId: 'non_existent_type' }, state),
      ).toThrowError(/references non-existent ComponentType/);

      // LevelId inconnu
      expect(() =>
        validateComponent({ ...validComp, levelId: 'non_existent_lvl' }, state),
      ).toThrowError(/references non-existent Level/);

      // Coordonnées non finies
      expect(() =>
        validateComponent(
          { ...validComp, placement: { ...validComp.placement, x: NaN } },
          state,
        ),
      ).toThrowError(/non-finite placement/);

      // Mur hôte inexistant
      expect(() =>
        validateComponent(
          {
            ...validComp,
            placement: { ...validComp.placement, hostWallId: 'ghost_wall' },
          },
          state,
        ),
      ).toThrowError(/references non-existent host wall/);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Commandes transactionnelles et Undo / Redo
  // -------------------------------------------------------------------------
  describe('Commandes transactionnelles et Undo/Redo', () => {
    it('AddComponentCommand ajoute un composant et supporte undo/redo', () => {
      const doc = BimDocument.createDefaultProject();
      const levelId = Object.keys(doc.getState().levels)[0] ?? 'lvl_0';

      const comp: Component = {
        id: 'comp_bed_1',
        category: 'component',
        typeId: 'ct_bed_double',
        levelId,
        placement: { x: 3000, y: 4000, rotation: Math.PI / 2 },
        name: 'Lit Suite Parentale',
      };

      const result = doc.execute(new AddComponentCommand(comp));
      expect(result.changed).toContain('comp_bed_1');
      expect(doc.getState().components?.['comp_bed_1']).toBeDefined();
      expect(doc.getState().components?.['comp_bed_1']?.placement.rotation).toBe(Math.PI / 2);

      // Undo
      doc.undo();
      expect(doc.getState().components?.['comp_bed_1']).toBeUndefined();

      // Redo
      doc.redo();
      expect(doc.getState().components?.['comp_bed_1']).toBeDefined();
      expect(doc.getState().components?.['comp_bed_1']?.name).toBe('Lit Suite Parentale');
    });

    it('UpdateComponentCommand modifie les paramètres et supporte undo/redo', () => {
      const doc = BimDocument.createDefaultProject();
      const levelId = Object.keys(doc.getState().levels)[0] ?? 'lvl_0';

      const comp: Component = {
        id: 'comp_sofa_1',
        category: 'component',
        typeId: 'ct_sofa_3p',
        levelId,
        placement: { x: 1000, y: 1000 },
      };
      doc.execute(new AddComponentCommand(comp));

      // Update position et rotation
      doc.execute(
        new UpdateComponentCommand('comp_sofa_1', {
          placement: { x: 1500, y: 1200, rotation: Math.PI / 4, elevationOffset: 50 },
          name: 'Canapé Salon',
        }),
      );

      let sofa = doc.getState().components?.['comp_sofa_1'];
      expect(sofa?.placement.x).toBe(1500);
      expect(sofa?.placement.y).toBe(1200);
      expect(sofa?.placement.rotation).toBe(Math.PI / 4);
      expect(sofa?.placement.elevationOffset).toBe(50);
      expect(sofa?.name).toBe('Canapé Salon');

      // Undo update
      doc.undo();
      sofa = doc.getState().components?.['comp_sofa_1'];
      expect(sofa?.placement.x).toBe(1000);
      expect(sofa?.placement.rotation).toBeUndefined();

      // Redo update
      doc.redo();
      sofa = doc.getState().components?.['comp_sofa_1'];
      expect(sofa?.placement.x).toBe(1500);
    });

    it('DeleteComponentCommand supprime un composant et supporte undo/redo', () => {
      const doc = BimDocument.createDefaultProject();
      const levelId = Object.keys(doc.getState().levels)[0] ?? 'lvl_0';

      const comp: Component = {
        id: 'comp_table_1',
        category: 'component',
        typeId: 'ct_dining_table',
        levelId,
        placement: { x: 2500, y: 2500 },
      };
      doc.execute(new AddComponentCommand(comp));
      expect(doc.getState().components?.['comp_table_1']).toBeDefined();

      doc.execute(new DeleteComponentCommand('comp_table_1'));
      expect(doc.getState().components?.['comp_table_1']).toBeUndefined();

      // Undo deletion
      doc.undo();
      expect(doc.getState().components?.['comp_table_1']).toBeDefined();

      // Redo deletion
      doc.redo();
      expect(doc.getState().components?.['comp_table_1']).toBeUndefined();
    });

    it('AddComponentTypeCommand et DeleteComponentTypeCommand gèrent les familles personnalisées', () => {
      const doc = BimDocument.createDefaultProject();

      const customType: ComponentType = {
        id: 'ct_custom_island',
        category: 'componentType',
        name: 'Îlot Central 200x100',
        family: 'kitchen',
        subType: 'kitchen_base',
        width: 2000,
        depth: 1000,
        height: 900,
      };

      doc.execute(new AddComponentTypeCommand(customType));
      expect(doc.getState().componentTypes?.['ct_custom_island']).toBeDefined();

      doc.execute(
        new UpdateComponentTypeCommand('ct_custom_island', {
          height: 920,
        }),
      );
      expect(doc.getState().componentTypes?.['ct_custom_island']?.height).toBe(920);

      doc.execute(new DeleteComponentTypeCommand('ct_custom_island'));
      expect(doc.getState().componentTypes?.['ct_custom_island']).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // 4. Intégrité Référentielle et Dépendances
  // -------------------------------------------------------------------------
  describe('Intégrité référentielle et relations inter-entités', () => {
    it('interdit la suppression d’un ComponentType si des instances actives l’utilisent (DELETE_RESTRICTED)', () => {
      const doc = BimDocument.createDefaultProject();
      const levelId = Object.keys(doc.getState().levels)[0] ?? 'lvl_0';

      const comp: Component = {
        id: 'comp_wc_1',
        category: 'component',
        typeId: 'ct_toilet_wall_hung',
        levelId,
        placement: { x: 500, y: 500 },
      };
      doc.execute(new AddComponentCommand(comp));

      // Vérification canDeleteComponentType
      const canDel = canDeleteComponentType('ct_toilet_wall_hung', doc.getState());
      expect(canDel.allowed).toBe(false);
      expect(canDel.reason).toContain('is referenced by 1 component(s)');

      // Tentative de suppression -> BimValidationError DELETE_RESTRICTED
      expect(() => {
        doc.execute(new DeleteComponentTypeCommand('ct_toilet_wall_hung'));
      }).toThrowError(/DELETE_RESTRICTED/);
    });

    it('interdit la suppression d’un niveau si des composants y sont posés', () => {
      const doc = BimDocument.createDefaultProject();
      const levelId = Object.keys(doc.getState().levels)[0] ?? 'lvl_0';

      const comp: Component = {
        id: 'comp_shower_1',
        category: 'component',
        typeId: 'ct_shower_tray',
        levelId,
        placement: { x: 800, y: 800 },
      };
      doc.execute(new AddComponentCommand(comp));

      // DeleteLevelCommand doit être rejeté
      expect(() => {
        doc.execute(new DeleteLevelCommand(levelId));
      }).toThrow();
    });

    it('détache gracieusement hostWallId quand le mur hôte est supprimé', () => {
      const doc = BimDocument.createDefaultProject();
      const state = doc.getState();
      const levelId = Object.keys(state.levels)[0] ?? 'lvl_0';
      const wallTypeId = Object.keys(state.wallTypes)[0] ?? 'wt_0';

      // Ajout d'un mur hôte
      doc.execute(
        new AddWallCommand({
          id: 'host_wall_1',
          category: 'wall',
          levelId,
          typeId: wallTypeId,
          start: { x: 0, y: 0 },
          end: { x: 4000, y: 0 },
        }),
      );

      // Composant adossé à ce mur
      const comp: Component = {
        id: 'comp_wc_hosted',
        category: 'component',
        typeId: 'ct_toilet_wall_hung',
        levelId,
        placement: { x: 1000, y: 0, hostWallId: 'host_wall_1' },
      };
      doc.execute(new AddComponentCommand(comp));
      expect(doc.getState().components?.['comp_wc_hosted']?.placement.hostWallId).toBe('host_wall_1');

      // Suppression du mur
      const delResult = doc.execute(new DeleteWallCommand('host_wall_1'));
      expect(delResult.changed).toContain('comp_wc_hosted');

      // Le composant subsiste, mais son hostWallId a été détaché à undefined
      const updatedComp = doc.getState().components?.['comp_wc_hosted'];
      expect(updatedComp).toBeDefined();
      expect(updatedComp?.placement.hostWallId).toBeUndefined();

      // Undo restaure le mur et le rattachement
      doc.undo();
      expect(doc.getState().components?.['comp_wc_hosted']?.placement.hostWallId).toBe('host_wall_1');
    });
  });

  // -------------------------------------------------------------------------
  // 5. Sérialisation JSON et Rétro-compatibilité
  // -------------------------------------------------------------------------
  describe('Sérialisation JSON (toJSON / fromJSON)', () => {
    it('effectue un aller-retour parfait de sérialisation avec composants', () => {
      const doc = BimDocument.createDefaultProject();
      const levelId = Object.keys(doc.getState().levels)[0] ?? 'lvl_0';

      doc.execute(
        new AddComponentCommand({
          id: 'comp_sink_1',
          category: 'component',
          typeId: 'ct_sink_vanity',
          levelId,
          placement: { x: 1200, y: 1500, rotation: 1.57, elevationOffset: 0 },
          name: 'Vasque SDB',
          materialOverride: 'mat_ceramic_white',
        }),
      );

      const jsonStr = toJSON(doc.getState());
      const restored = fromJSON(jsonStr);

      expect(restored.componentTypes).toBeDefined();
      expect(restored.components?.['comp_sink_1']).toBeDefined();
      expect(restored.components?.['comp_sink_1']?.name).toBe('Vasque SDB');
      expect(restored.components?.['comp_sink_1']?.placement.x).toBe(1200);
      expect(restored.components?.['comp_sink_1']?.materialOverride).toBe('mat_ceramic_white');
    });

    it('fromJSON rejette un composant corrompu ou avec clé étrangère invalide', () => {
      const doc = BimDocument.createDefaultProject();
      const state = doc.getState();

      const corruptState: BimState = {
        ...state,
        components: {
          bad_comp: {
            id: 'bad_comp',
            category: 'component',
            typeId: 'invalid_type_id',
            levelId: Object.keys(state.levels)[0] ?? 'lvl_0',
            placement: { x: 0, y: 0 },
          },
        },
      };

      const badJson = JSON.stringify(corruptState);
      expect(() => fromJSON(badJson)).toThrowError(BimValidationError);
    });
  });

  // -------------------------------------------------------------------------
  // 6. Exportation IFC4 et Validation Industrielle WebIFC
  // -------------------------------------------------------------------------
  describe('Exportation IFC4 ISO 10303-21', () => {
    it('exporte les composants comme IfcFurnishingElement et IfcSanitaryTerminal avec solides 3D', async () => {
      const doc = BimDocument.createDefaultProject();
      const levelId = Object.keys(doc.getState().levels)[0] ?? 'lvl_0';

      // 1 Mobilier (Table)
      doc.execute(
        new AddComponentCommand({
          id: 'comp_table',
          category: 'component',
          typeId: 'ct_dining_table',
          levelId,
          placement: { x: 3000, y: 3000, rotation: 0 },
          name: 'Grande Table Salle à Manger',
        }),
      );

      // 1 Sanitaire (WC)
      doc.execute(
        new AddComponentCommand({
          id: 'comp_wc',
          category: 'component',
          typeId: 'ct_toilet_wall_hung',
          levelId,
          placement: { x: 1000, y: 500, rotation: Math.PI / 2 },
          name: 'WC Suspendu RDC',
        }),
      );

      const ifcString = exportToIfc(doc.getState());

      // Vérifications textuelles STEP
      expect(ifcString).toContain('IFCFURNISHINGELEMENT(');
      expect(ifcString).toContain('IFCSANITARYTERMINAL(');
      expect(ifcString).toContain('Grande Table Salle à Manger');
      expect(ifcString).toContain('WC Suspendu RDC');

      // Validation industrielle stricte avec WebIFC C++/WASM
      const ifcApi = new WebIFC.IfcAPI();
      await ifcApi.Init();

      const data = new TextEncoder().encode(ifcString);
      const modelId = ifcApi.OpenModel(data);
      expect(modelId).toBeGreaterThanOrEqual(0);

      const furnishingLines = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCFURNISHINGELEMENT);
      expect(furnishingLines.size()).toBe(1);

      const sanitaryLines = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCSANITARYTERMINAL);
      expect(sanitaryLines.size()).toBe(1);

      // Vérification que les solides extrudés 3D sont bien créés
      const extrudedSolids = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCEXTRUDEDAREASOLID);
      expect(extrudedSolids.size()).toBeGreaterThanOrEqual(2);

      ifcApi.CloseModel(modelId);
    });
  });
});
