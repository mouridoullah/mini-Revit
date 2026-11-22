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
  checkComponentCollisions,
  checkFunctionalClearance,
  canDeleteComponentType,
  getComponentEffectiveDimensions,
  resolveWallGeometry,
  BimValidationError,
  toJSON,
  fromJSON,
  exportToIfc,
  escapeStepString,
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

    it('T-COMP-TYPE-CONSTRAINTS-01 : validateComponentType rejette minWidth > maxWidth ou bornes négatives (Phase 8.4)', () => {
      const baseType: ComponentType = {
        id: 'ct_test_bounds',
        category: 'componentType',
        name: 'Type Test Bornes',
        family: 'furniture',
        subType: 'table',
        width: 1600,
        depth: 900,
        height: 750,
      };

      // minWidth > maxWidth
      expect(() =>
        validateComponentType({ ...baseType, minWidth: 2000, maxWidth: 1000 }),
      ).toThrowError(/minWidth .* cannot exceed maxWidth/);

      // minDepth > maxDepth
      expect(() =>
        validateComponentType({ ...baseType, minDepth: 1200, maxDepth: 800 }),
      ).toThrowError(/minDepth .* cannot exceed maxDepth/);

      // minWidth négatif
      expect(() =>
        validateComponentType({ ...baseType, minWidth: -50 }),
      ).toThrowError(/minWidth must be a strictly positive finite number/);
    });

    it('T-COMP-OVERRIDE-DEPTH-01 : validateComponent contrôle depthOverride et heightOverride (Phase 8.4)', () => {
      const doc = BimDocument.createDefaultProject();
      const state = doc.getState();
      const levelId = Object.keys(state.levels)[0] ?? 'lvl_0';

      const comp: Component = {
        id: 'comp_table_depth_test',
        category: 'component',
        typeId: 'ct_dining_table',
        levelId,
        placement: { x: 1000, y: 1000 },
      };

      // ct_dining_table a minDepth: 700, maxDepth: 1100
      expect(() =>
        validateComponent({ ...comp, depthOverride: 500 }, state),
      ).toThrowError(/is below minimum allowed/);

      expect(() =>
        validateComponent({ ...comp, depthOverride: 1500 }, state),
      ).toThrowError(/exceeds maximum allowed/);

      expect(() =>
        validateComponent({ ...comp, depthOverride: 900 }, state),
      ).not.toThrow();
    });

    it('T-COMP-WALL-METRICS-01 : une baie vitrée sur un mur réduit la surface nette calculée du mur (Phase 8.4)', () => {
      const doc = BimDocument.createDefaultProject();
      const levelId = Object.keys(doc.getState().levels)[0] ?? 'lvl_0';
      const wallTypeId = Object.keys(doc.getState().wallTypes)[0] ?? 'wt_default';
      const wallId = 'wall_net_area_test';

      doc.execute(
        new AddWallCommand({
          id: wallId,
          category: 'wall',
          typeId: wallTypeId,
          levelId,
          start: { x: 0, y: 0 },
          end: { x: 5000, y: 0 },
        }),
      );

      const resBefore = resolveWallGeometry(doc.getState().walls[wallId]!, doc.getState());
      expect(resBefore.openings).toHaveLength(0);

      // Ajout d'une baie coulissante de 2000 mm × 2150 mm
      doc.execute(
        new AddComponentCommand({
          id: 'comp_bay_net',
          category: 'component',
          typeId: 'ct_sliding_door',
          levelId,
          placement: { x: 2500, y: 0, hostWallId: wallId },
          widthOverride: 2000,
        }),
      );

      const resAfter = resolveWallGeometry(doc.getState().walls[wallId]!, doc.getState());
      expect(resAfter.openings).toHaveLength(1);
      expect(resAfter.openings[0]?.width).toBe(2000);
      expect(resAfter.openings[0]?.height).toBe(2150);
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

      // Surcharge dimensionnelle hors bornes (Phase 8.4)
      // ct_bed_double a minWidth: 900, maxWidth: 2000, allowedWidths: [900, 1400, 1600, 1800, 2000]
      expect(() =>
        validateComponent({ ...validComp, widthOverride: 500 }, state),
      ).toThrowError(/is below minimum allowed/);

      expect(() =>
        validateComponent({ ...validComp, widthOverride: 2500 }, state),
      ).toThrowError(/exceeds maximum allowed/);

      expect(() =>
        validateComponent({ ...validComp, widthOverride: 1500 }, state),
      ).toThrowError(/is not in allowed list/);

      // Surcharges valides
      expect(() =>
        validateComponent({ ...validComp, widthOverride: 1600 }, state),
      ).not.toThrow();

      // Non-finite overrides
      expect(() =>
        validateComponent({ ...validComp, widthOverride: NaN }, state),
      ).toThrowError(/must be a strictly positive finite number/);

      expect(() =>
        validateComponent({ ...validComp, depthOverride: -100 }, state),
      ).toThrowError(/must be a strictly positive finite number/);
    });

    it('T-COMP-DIMS-01 : getComponentEffectiveDimensions résout correctement nominal vs surcharge (Phase 8.4)', () => {
      const type = { width: 1600, depth: 900, height: 750 };

      // Sans surcharge : nominal
      const effNominal = getComponentEffectiveDimensions({}, type);
      expect(effNominal.width).toBe(1600);
      expect(effNominal.depth).toBe(900);
      expect(effNominal.height).toBe(750);

      // Avec surcharge partielle
      const effPartial = getComponentEffectiveDimensions({ widthOverride: 2000 }, type);
      expect(effPartial.width).toBe(2000);
      expect(effPartial.depth).toBe(900);
      expect(effPartial.height).toBe(750);

      // Avec toutes surcharges
      const effAll = getComponentEffectiveDimensions(
        { widthOverride: 2400, depthOverride: 1000, heightOverride: 800 },
        type,
      );
      expect(effAll.width).toBe(2400);
      expect(effAll.depth).toBe(1000);
      expect(effAll.height).toBe(800);
    });

    it('T-COMP-ROOF-GLAZING-01 : resolveWallGeometry intègre les baies vitrées de composants dans les réservations du mur hôte (Phase 8.4)', () => {
      const doc = BimDocument.createDefaultProject();
      const levelId = Object.keys(doc.getState().levels)[0] ?? 'lvl_0';
      const wallTypeId = Object.keys(doc.getState().wallTypes)[0] ?? 'wt_default';
      const wallId = 'wall_bay_test';

      // Mur de 6000 mm de long, hauteur nominale 2800 mm
      doc.execute(
        new AddWallCommand({
          id: wallId,
          category: 'wall',
          typeId: wallTypeId,
          levelId,
          start: { x: 0, y: 0 },
          end: { x: 6000, y: 0 },
        }),
      );

      // Insertion d'une baie coulissante de 2400 mm centrée en X=3000
      doc.execute(
        new AddComponentCommand({
          id: 'comp_bay_opening',
          category: 'component',
          typeId: 'ct_sliding_door',
          levelId,
          placement: { x: 3000, y: 0, hostWallId: wallId },
          widthOverride: 2400,
        }),
      );

      const resolved = resolveWallGeometry(doc.getState().walls[wallId]!, doc.getState());
      expect(resolved.openings).toHaveLength(1);

      const op = resolved.openings[0]!;
      expect(op.id).toBe('comp_bay_opening');
      expect(op.kind).toBe('door');
      expect(op.width).toBe(2400);
      // Centre en 3000, largeur 2400 -> offsetAlong = 3000 - 1200 = 1800
      expect(op.offsetAlong).toBeCloseTo(1800, 1);
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
  // 6. Exportation IFC4 et Validation Industrielle WebIFC (Phase 8 & 8.4)
  // -------------------------------------------------------------------------
  describe('Exportation IFC4 ISO 10303-21 (buildingSMART)', () => {
    it('exporte les composants selon le standard IFC4 officiel (IfcFurniture, IfcSanitaryTerminal, types et IfcRelDefinesByType)', async () => {
      const doc = BimDocument.createDefaultProject();
      const levelId = Object.keys(doc.getState().levels)[0] ?? 'lvl_0';

      // 1 Mobilier (Table) avec surcharges dimensionnelles (Phase 8.4)
      doc.execute(
        new AddComponentCommand({
          id: 'comp_table',
          category: 'component',
          typeId: 'ct_dining_table',
          levelId,
          placement: { x: 3000, y: 3000, rotation: 0 },
          widthOverride: 2000,
          depthOverride: 1000,
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
      expect(ifcString).toContain('IFCFURNITURE(');
      expect(ifcString).toContain('IFCFURNITURETYPE(');
      expect(ifcString).toContain('IFCSANITARYTERMINAL(');
      expect(ifcString).toContain('IFCSANITARYTERMINALTYPE(');
      expect(ifcString).toContain('IFCRELDEFINESBYTYPE(');
      expect(ifcString).toContain(escapeStepString('Grande Table Salle à Manger'));
      expect(ifcString).toContain(escapeStepString('WC Suspendu RDC'));

      // Validation industrielle stricte avec WebIFC C++/WASM
      const ifcApi = new WebIFC.IfcAPI();
      await ifcApi.Init();

      const data = new TextEncoder().encode(ifcString);
      const modelId = ifcApi.OpenModel(data);
      expect(modelId).toBeGreaterThanOrEqual(0);

      const furnitureLines = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCFURNITURE);
      expect(furnitureLines.size()).toBe(1);

      const furnitureTypeLines = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCFURNITURETYPE);
      expect(furnitureTypeLines.size()).toBe(1);

      const sanitaryLines = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCSANITARYTERMINAL);
      expect(sanitaryLines.size()).toBe(1);

      const relDefines = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCRELDEFINESBYTYPE);
      expect(relDefines.size()).toBeGreaterThanOrEqual(2);

      // Vérification que les solides extrudés 3D sont bien créés
      const extrudedSolids = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCEXTRUDEDAREASOLID);
      expect(extrudedSolids.size()).toBeGreaterThanOrEqual(2);

      ifcApi.CloseModel(modelId);
    });

    it('génère la chaîne buildingSMART complète pour les menuiseries hôtes (IfcWall -> IfcRelVoidsElement -> IfcOpeningElement -> IfcRelFillsElement -> IfcDoor)', async () => {
      const doc = BimDocument.createDefaultProject();
      const levelId = Object.keys(doc.getState().levels)[0] ?? 'lvl_0';
      const wallTypeId = Object.keys(doc.getState().wallTypes)[0] ?? 'wt_default';
      const wallSouthId = 'wall_south';

      doc.execute(
        new AddWallCommand({
          id: wallSouthId,
          category: 'wall',
          typeId: wallTypeId,
          levelId,
          start: { x: 0, y: 0 },
          end: { x: 6000, y: 0 },
        }),
      );

      // Insertion d'une baie vitrée coulissante adossée au mur sud
      doc.execute(
        new AddComponentCommand({
          id: 'comp_sliding_1',
          category: 'component',
          typeId: 'ct_sliding_door',
          levelId,
          placement: { x: 3000, y: 0, rotation: 0, hostWallId: wallSouthId },
          widthOverride: 2400,
          name: 'Baie Coulissante Salon',
        }),
      );

      const ifcString = exportToIfc(doc.getState());

      // Vérification de la chaîne de relations IFC4
      expect(ifcString).toContain('IFCDOOR(');
      expect(ifcString).toContain('IFCDOORTYPE(');
      expect(ifcString).toContain('IFCOPENINGELEMENT(');
      expect(ifcString).toContain('IFCRELVOIDSELEMENT(');
      expect(ifcString).toContain('IFCRELFILLSELEMENT(');
      expect(ifcString).toContain('Opening_comp_sliding_1');

      // Validation WebIFC
      const ifcApi = new WebIFC.IfcAPI();
      await ifcApi.Init();
      const modelId = ifcApi.OpenModel(new TextEncoder().encode(ifcString));
      expect(modelId).toBeGreaterThanOrEqual(0);

      const openings = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCOPENINGELEMENT);
      expect(openings.size()).toBeGreaterThanOrEqual(1);

      const relVoids = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCRELVOIDSELEMENT);
      expect(relVoids.size()).toBeGreaterThanOrEqual(1);

      const relFills = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCRELFILLSELEMENT);
      expect(relFills.size()).toBeGreaterThanOrEqual(1);

      ifcApi.CloseModel(modelId);
    });
  });

  // =========================================================================
  // PHASE 8.5 : QUALIFICATION INDUSTRIELLE DES COMPOSANTS
  // =========================================================================

  describe('Phase 8.5-A : Qualification Sémantique IFC4 & buildingSMART', () => {
    it('génère IfcSystemFurnitureElement et IfcSystemFurnitureElementType pour les meubles modulaires de cuisine', async () => {
      const doc = BimDocument.createDefaultProject();
      const levelId = Object.keys(doc.getState().levels)[0] ?? 'lvl_0';

      doc.execute(
        new AddComponentCommand({
          id: 'comp_kitchen_base',
          category: 'component',
          typeId: 'ct_kitchen_base_60',
          levelId,
          placement: { x: 1000, y: 1000 },
          name: 'Meuble Bas Cuisine 60',
        }),
      );

      doc.execute(
        new AddComponentCommand({
          id: 'comp_kitchen_wall',
          category: 'component',
          typeId: 'ct_kitchen_wall_60',
          levelId,
          placement: { x: 1000, y: 1000, elevationOffset: 1400 },
          name: 'Meuble Haut Cuisine 60',
        }),
      );

      const ifc = exportToIfc(doc.getState());

      expect(ifc).toContain('IFCSYSTEMFURNITUREELEMENTTYPE(');
      expect(ifc).toContain('IFCSYSTEMFURNITUREELEMENT(');
      expect(ifc).toContain('.USERDEFINED.');

      const ifcApi = new WebIFC.IfcAPI();
      await ifcApi.Init();
      const modelId = ifcApi.OpenModel(new TextEncoder().encode(ifc));
      expect(modelId).toBeGreaterThanOrEqual(0);

      const sysElements = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCSYSTEMFURNITUREELEMENT);
      expect(sysElements.size()).toBe(2);

      const sysTypes = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCSYSTEMFURNITUREELEMENTTYPE);
      expect(sysTypes.size()).toBe(2);

      ifcApi.CloseModel(modelId);
    });

    it('génère les énumérations IFC4 officielles pour tous les appareils sanitaires (TOILETPAN, WASHHANDBASIN, SHOWER, BATH, SINK)', () => {
      const doc = BimDocument.createDefaultProject();
      const levelId = Object.keys(doc.getState().levels)[0] ?? 'lvl_0';

      const sanitaries = [
        { id: 'c_wc', typeId: 'ct_toilet_wall_hung', enumVal: '.TOILETPAN.' },
        { id: 'c_basin', typeId: 'ct_sink_vanity', enumVal: '.WASHHANDBASIN.' },
        { id: 'c_shower', typeId: 'ct_shower_tray', enumVal: '.SHOWER.' },
        { id: 'c_bath', typeId: 'ct_bath_tub', enumVal: '.BATH.' },
        { id: 'c_sink', typeId: 'ct_kitchen_sink_unit', enumVal: '.SINK.' },
      ];

      for (let i = 0; i < sanitaries.length; i++) {
        const s = sanitaries[i]!;
        doc.execute(
          new AddComponentCommand({
            id: s.id,
            category: 'component',
            typeId: s.typeId,
            levelId,
            placement: { x: 500 * (i + 1), y: 500 },
          }),
        );
      }

      const ifc = exportToIfc(doc.getState());

      for (const s of sanitaries) {
        expect(ifc).toContain(s.enumVal);
      }
    });

    it('génère les énumérations officielles pour le mobilier (BED, TABLE, CHAIR, SOFA, USERDEFINED)', () => {
      const doc = BimDocument.createDefaultProject();
      const levelId = Object.keys(doc.getState().levels)[0] ?? 'lvl_0';

      const furniture = [
        { id: 'c_bed', typeId: 'ct_bed_double', enumVal: '.BED.' },
        { id: 'c_table', typeId: 'ct_dining_table', enumVal: '.TABLE.' },
        { id: 'c_chair', typeId: 'ct_chair', enumVal: '.CHAIR.' },
        { id: 'c_sofa', typeId: 'ct_sofa_3p', enumVal: '.SOFA.' },
        { id: 'c_wardrobe', typeId: 'ct_wardrobe', enumVal: '.USERDEFINED.' },
      ];

      for (let i = 0; i < furniture.length; i++) {
        const f = furniture[i]!;
        doc.execute(
          new AddComponentCommand({
            id: f.id,
            category: 'component',
            typeId: f.typeId,
            levelId,
            placement: { x: 800 * (i + 1), y: 1500 },
          }),
        );
      }

      const ifc = exportToIfc(doc.getState());

      for (const f of furniture) {
        expect(ifc).toContain(f.enumVal);
      }
    });
  });

  describe('Phase 8.5-B : Qualification Géométrique des Menuiseries Hôtes', () => {
    it('rejette avec INVALID_OPENING_POSITION une menuiserie dépassant les extrémités du mur hôte (aucun clampage silencieux)', () => {
      const doc = BimDocument.createDefaultProject();
      const levelId = Object.keys(doc.getState().levels)[0] ?? 'lvl_0';
      const wallTypeId = Object.keys(doc.getState().wallTypes)[0] ?? 'wt_default';

      // Mur de 3000 mm de long de (0,0) à (3000, 0)
      doc.execute(
        new AddWallCommand({
          id: 'wall_bounds_test',
          category: 'wall',
          typeId: wallTypeId,
          levelId,
          start: { x: 0, y: 0 },
          end: { x: 3000, y: 0 },
        }),
      );

      // Baie coulissante de largeur 2400 mm centrée en x = 500 :
      // offsetAlong = 500 - 1200 = -700 < 0 -> doit être rejeté !
      expect(() => {
        doc.execute(
          new AddComponentCommand({
            id: 'comp_overflow_start',
            category: 'component',
            typeId: 'ct_sliding_door',
            levelId,
            placement: { x: 500, y: 0, hostWallId: 'wall_bounds_test' },
            widthOverride: 2400,
          }),
        );
      }).toThrowError(/INVALID_OPENING_POSITION/);

      // Baie coulissante centrée en x = 2500 :
      // offsetAlong = 2500 - 1200 = 1300 ; fin = 1300 + 2400 = 3700 > 3000 -> doit être rejeté !
      expect(() => {
        doc.execute(
          new AddComponentCommand({
            id: 'comp_overflow_end',
            category: 'component',
            typeId: 'ct_sliding_door',
            levelId,
            placement: { x: 2500, y: 0, hostWallId: 'wall_bounds_test' },
            widthOverride: 2400,
          }),
        );
      }).toThrowError(/INVALID_OPENING_POSITION/);
    });

    it('rejette avec INVALID_HOST_WALL_DISTANCE une menuiserie placée trop loin de l’axe du mur hôte', () => {
      const doc = BimDocument.createDefaultProject();
      const levelId = Object.keys(doc.getState().levels)[0] ?? 'lvl_0';
      const wallTypeId = Object.keys(doc.getState().wallTypes)[0] ?? 'wt_default';

      doc.execute(
        new AddWallCommand({
          id: 'wall_dist_test',
          category: 'wall',
          typeId: wallTypeId,
          levelId,
          start: { x: 0, y: 0 },
          end: { x: 5000, y: 0 },
        }),
      );

      // Mur d'épaisseur 200 mm : limite = 200/2 + 50 = 150 mm.
      // Placement à y = 250 mm -> écart orthogonal de 250 mm > 150 mm -> rejet !
      expect(() => {
        doc.execute(
          new AddComponentCommand({
            id: 'comp_too_far',
            category: 'component',
            typeId: 'ct_sliding_door',
            levelId,
            placement: { x: 2500, y: 250, hostWallId: 'wall_dist_test' },
            widthOverride: 1800,
          }),
        );
      }).toThrowError(/INVALID_HOST_WALL_DISTANCE/);
    });

    it('rejette avec OPENING_OVERLAP une menuiserie chevauchant une autre baie sur le même mur hôte', () => {
      const doc = BimDocument.createDefaultProject();
      const levelId = Object.keys(doc.getState().levels)[0] ?? 'lvl_0';
      const wallTypeId = Object.keys(doc.getState().wallTypes)[0] ?? 'wt_default';

      doc.execute(
        new AddWallCommand({
          id: 'wall_overlap_test',
          category: 'wall',
          typeId: wallTypeId,
          levelId,
          start: { x: 0, y: 0 },
          end: { x: 6000, y: 0 },
        }),
      );

      // Première menuiserie de 2000 mm de large centrée en x = 2000 mm (emprise [1000, 3000])
      doc.execute(
        new AddComponentCommand({
          id: 'comp_window_1',
          category: 'component',
          typeId: 'ct_french_window',
          levelId,
          placement: { x: 2000, y: 0, hostWallId: 'wall_overlap_test' },
          widthOverride: 2000,
        }),
      );

      // Seconde menuiserie de 1800 mm centrée en x = 2600 mm (emprise [1700, 3500]) -> chevauchement [1700, 3000] !
      expect(() => {
        doc.execute(
          new AddComponentCommand({
            id: 'comp_window_2',
            category: 'component',
            typeId: 'ct_sliding_door',
            levelId,
            placement: { x: 2600, y: 0, hostWallId: 'wall_overlap_test' },
            widthOverride: 1800,
          }),
        );
      }).toThrowError(/OPENING_OVERLAP/);
    });

    it('gère le cycle de vie complet : création, retaillage, suppression avec restitution de matière et suppression du mur hôte', () => {
      const doc = BimDocument.createDefaultProject();
      const levelId = Object.keys(doc.getState().levels)[0] ?? 'lvl_0';
      const wallTypeId = Object.keys(doc.getState().wallTypes)[0] ?? 'wt_default';
      const wallId = 'wall_lifecycle';

      doc.execute(
        new AddWallCommand({
          id: wallId,
          category: 'wall',
          typeId: wallTypeId,
          levelId,
          start: { x: 0, y: 0 },
          end: { x: 5000, y: 0 },
        }),
      );

      // 1. Ajout de la menuiserie
      doc.execute(
        new AddComponentCommand({
          id: 'comp_door_lifecycle',
          category: 'component',
          typeId: 'ct_sliding_door',
          levelId,
          placement: { x: 2500, y: 0, hostWallId: wallId },
          widthOverride: 2000,
        }),
      );

      let resolved = resolveWallGeometry(doc.getState().walls[wallId]!, doc.getState());
      expect(resolved.openings.length).toBe(1);
      expect(resolved.openings[0]?.offsetAlong).toBe(1500);
      expect(resolved.openings[0]?.width).toBe(2000);

      // 2. Retaillage de la menuiserie via UpdateComponentCommand
      doc.execute(
        new UpdateComponentCommand('comp_door_lifecycle', {
          widthOverride: 2400,
        }),
      );

      resolved = resolveWallGeometry(doc.getState().walls[wallId]!, doc.getState());
      expect(resolved.openings[0]?.offsetAlong).toBe(1300);
      expect(resolved.openings[0]?.width).toBe(2400);

      // 3. Suppression de la menuiserie -> matière du mur intégralement restituée
      doc.execute(new DeleteComponentCommand('comp_door_lifecycle'));
      resolved = resolveWallGeometry(doc.getState().walls[wallId]!, doc.getState());
      expect(resolved.openings.length).toBe(0);

      // 4. Ré-insertion puis suppression du mur hôte -> le composant est détaché gracieusement
      doc.execute(
        new AddComponentCommand({
          id: 'comp_attached',
          category: 'component',
          typeId: 'ct_sliding_door',
          levelId,
          placement: { x: 2500, y: 0, hostWallId: wallId },
        }),
      );
      expect(doc.getState().components?.['comp_attached']?.placement.hostWallId).toBe(wallId);

      doc.execute(new DeleteWallCommand(wallId));
      expect(doc.getState().components?.['comp_attached']?.placement.hostWallId).toBeUndefined();
    });
  });

  describe('Phase 8.5-C : Moteur de Détection de Collisions & Dégagements Fonctionnels', () => {
    it('checkComponentCollisions détecte les collisions 2D/3D entre composants au même niveau et ignore les composants à des altitudes disjointes', () => {
      const doc = BimDocument.createDefaultProject();
      const state = doc.getState();
      const levelId = Object.keys(state.levels)[0] ?? 'lvl_0';

      // Composant 1 : Meuble bas cuisine 60 (600x600x860) à (1000, 1000)
      const comp1: Component = {
        id: 'comp_base',
        category: 'component',
        typeId: 'ct_kitchen_base_60',
        levelId,
        placement: { x: 1000, y: 1000, rotation: 0, elevationOffset: 0 },
      };

      // Composant 2 : Table à manger qui chevauche comp1 en plan à (1200, 1000)
      const comp2Colliding: Component = {
        id: 'comp_table',
        category: 'component',
        typeId: 'ct_dining_table',
        levelId,
        placement: { x: 1200, y: 1000, rotation: 0, elevationOffset: 0 },
      };

      const collidingState: BimState = {
        ...state,
        components: {
          [comp1.id]: comp1,
          [comp2Colliding.id]: comp2Colliding,
        },
      };

      const collisions = checkComponentCollisions(comp1, collidingState);
      expect(collisions.length).toBe(1);
      expect(collisions[0]?.code).toBe('COMPONENT_COLLISION');
      expect(collisions[0]?.offendingIds).toContain(comp2Colliding.id);

      // Composant 3 : Meuble haut de cuisine superposé en plan (1000, 1000), mais en hauteur à z = 1400 mm
      const comp3High: Component = {
        id: 'comp_wall_unit',
        category: 'component',
        typeId: 'ct_kitchen_wall_60',
        levelId,
        placement: { x: 1000, y: 1000, rotation: 0, elevationOffset: 1400 },
      };

      const nonCollidingState: BimState = {
        ...state,
        components: {
          [comp1.id]: comp1,
          [comp3High.id]: comp3High,
        },
      };

      const noCollisions = checkComponentCollisions(comp1, nonCollidingState);
      expect(noCollisions.length).toBe(0);
    });

    it('checkComponentCollisions ignore le mur hôte pour les menuiseries hôtes et détecte les collisions avec les autres murs', () => {
      const doc = BimDocument.createDefaultProject();
      const levelId = Object.keys(doc.getState().levels)[0] ?? 'lvl_0';
      const wallTypeId = Object.keys(doc.getState().wallTypes)[0] ?? 'wt_default';

      const hostWallId = 'w_host';
      const obstacleWallId = 'w_obstacle';

      const state: BimState = {
        ...doc.getState(),
        walls: {
          [hostWallId]: {
            id: hostWallId,
            category: 'wall',
            typeId: wallTypeId,
            levelId,
            start: { x: 0, y: 0 },
            end: { x: 5000, y: 0 },
          },
          [obstacleWallId]: {
            id: obstacleWallId,
            category: 'wall',
            typeId: wallTypeId,
            levelId,
            start: { x: 2500, y: -2000 },
            end: { x: 2500, y: 2000 },
          },
        },
      };

      // Composant 1 : Baie coulissante hébergée sur hostWallId, ne traversant pas obstacleWallId
      const compHosted: Component = {
        id: 'comp_glazing',
        category: 'component',
        typeId: 'ct_sliding_door',
        levelId,
        placement: { x: 1000, y: 0, hostWallId },
      };

      const hostedViolations = checkComponentCollisions(compHosted, {
        ...state,
        components: { [compHosted.id]: compHosted },
      });
      // Le mur hôte w_host n'est pas rapporté comme une collision
      expect(hostedViolations.some((v) => v.offendingIds.includes(hostWallId))).toBe(false);

      // Composant 2 : Lit placé à travers le mur d'obstacle
      const compObstacle: Component = {
        id: 'comp_bed_clash',
        category: 'component',
        typeId: 'ct_bed_double',
        levelId,
        placement: { x: 2500, y: 500, rotation: 0 },
      };

      const wallClashViolations = checkComponentCollisions(compObstacle, {
        ...state,
        components: { [compObstacle.id]: compObstacle },
      });
      expect(wallClashViolations.some((v) => v.offendingIds.includes(obstacleWallId))).toBe(true);
    });

    it('checkFunctionalClearance détecte les obstacles dans la zone de dégagement ergonomique recommandée', () => {
      const doc = BimDocument.createDefaultProject();
      const levelId = Object.keys(doc.getState().levels)[0] ?? 'lvl_0';

      // WC suspendu (largeur 360, profondeur 540, clearanceDepth = 800 mm)
      // Placé en (2000, 2000), rotation 0 (avant orienté vers -Y)
      const wc: Component = {
        id: 'wc_clearance_test',
        category: 'component',
        typeId: 'ct_toilet_wall_hung',
        levelId,
        placement: { x: 2000, y: 2000, rotation: 0 },
      };

      const emptyState: BimState = {
        ...doc.getState(),
        components: { [wc.id]: wc },
      };

      const freeCheck = checkFunctionalClearance(wc, emptyState);
      expect(freeCheck.isObstructed).toBe(false);
      expect(freeCheck.obstacles.length).toBe(0);

      // Obstacle : une chaise placée dans les 800 mm de dégagement frontal (par ex. à y = 1600 mm)
      const chairObstacle: Component = {
        id: 'chair_obstacle',
        category: 'component',
        typeId: 'ct_chair',
        levelId,
        placement: { x: 2000, y: 1600 },
      };

      const obstructedState: BimState = {
        ...doc.getState(),
        components: {
          [wc.id]: wc,
          [chairObstacle.id]: chairObstacle,
        },
      };

      const obstructedCheck = checkFunctionalClearance(wc, obstructedState);
      expect(obstructedCheck.isObstructed).toBe(true);
      expect(obstructedCheck.obstacles).toContain('chair_obstacle');
    });
  });

  describe('Phase 8.5-E : Villa Étalon — Qualification Industrielle Exhaustive des 15 Composants', () => {
    it('instancie l’ensemble des 15 composants du catalogue dans une configuration architecturale réaliste et valide l’export IFC4 avec WebIFC', async () => {
      const doc = BimDocument.createDefaultProject();
      const levelId = Object.keys(doc.getState().levels)[0] ?? 'lvl_0';
      const wallTypeId = Object.keys(doc.getState().wallTypes)[0] ?? 'wt_default';

      // 1. Murs périphériques de la Villa Étalon (12m x 10m)
      const walls = [
        { id: 'w_s', start: { x: 0, y: 0 }, end: { x: 12000, y: 0 } },
        { id: 'w_e', start: { x: 12000, y: 0 }, end: { x: 12000, y: 10000 } },
        { id: 'w_n', start: { x: 12000, y: 10000 }, end: { x: 0, y: 10000 } },
        { id: 'w_w', start: { x: 0, y: 10000 }, end: { x: 0, y: 0 } },
      ];

      for (const w of walls) {
        doc.execute(
          new AddWallCommand({
            id: w.id,
            category: 'wall',
            typeId: wallTypeId,
            levelId,
            start: w.start,
            end: w.end,
          }),
        );
      }

      // 2. Instanciation des 15 composants du catalogue standard
      const villaComponents = [
        // Sanitaires
        { id: 'villa_wc', typeId: 'ct_toilet_wall_hung', x: 2000, y: 9500, rot: 0, host: 'w_n' },
        { id: 'villa_basin', typeId: 'ct_sink_vanity', x: 3000, y: 9500, rot: 0, host: 'w_n' },
        { id: 'villa_shower', typeId: 'ct_shower_tray', x: 1000, y: 9000, rot: 0 },
        { id: 'villa_bath', typeId: 'ct_bath_tub', x: 1000, y: 7500, rot: 0 },
        // Cuisine
        { id: 'villa_kitchen_base', typeId: 'ct_kitchen_base_60', x: 5000, y: 9500, rot: 0 },
        { id: 'villa_kitchen_sink', typeId: 'ct_kitchen_sink_unit', x: 6000, y: 9500, rot: 0 },
        { id: 'villa_kitchen_wall', typeId: 'ct_kitchen_wall_60', x: 5000, y: 9500, elev: 1400 },
        { id: 'villa_fridge', typeId: 'ct_kitchen_fridge', x: 7000, y: 9500, rot: 0 },
        // Mobilier
        { id: 'villa_bed', typeId: 'ct_bed_double', x: 2000, y: 3000, rot: 0, wOver: 1800 },
        { id: 'villa_table', typeId: 'ct_dining_table', x: 8000, y: 5000, rot: 0, wOver: 2000 },
        { id: 'villa_chair1', typeId: 'ct_chair', x: 8000, y: 4400, rot: 0 },
        { id: 'villa_sofa', typeId: 'ct_sofa_3p', x: 5000, y: 3000, rot: 0, wOver: 2200 },
        { id: 'villa_wardrobe', typeId: 'ct_wardrobe', x: 1000, y: 1500, rot: 0 },
        // Menuiseries hôtes
        { id: 'villa_sliding', typeId: 'ct_sliding_door', x: 6000, y: 0, host: 'w_s', wOver: 2400 },
        { id: 'villa_french', typeId: 'ct_french_window', x: 12000, y: 5000, host: 'w_e', wOver: 1400 },
      ];

      expect(villaComponents.length).toBe(15);

      for (const c of villaComponents) {
        doc.execute(
          new AddComponentCommand({
            id: c.id,
            category: 'component',
            typeId: c.typeId,
            levelId,
            placement: {
              x: c.x,
              y: c.y,
              rotation: c.rot ?? 0,
              elevationOffset: c.elev ?? 0,
              hostWallId: c.host,
            },
            ...(c.wOver ? { widthOverride: c.wOver } : {}),
          }),
        );
      }

      // Vérification du nombre de composants instanciés
      expect(Object.keys(doc.getState().components ?? {}).length).toBe(15);

      // Génération et export IFC4
      const ifcContent = exportToIfc(doc.getState(), {
        projectName: 'Villa Étalon Composants',
      });

      // Validation stricte WebIFC C++/WASM
      const ifcApi = new WebIFC.IfcAPI();
      await ifcApi.Init();
      const modelId = ifcApi.OpenModel(new TextEncoder().encode(ifcContent));
      expect(modelId).toBeGreaterThanOrEqual(0);

      // Vérification de la présence de toutes les familles d'entités (exactement 15 composants distincts)
      const ifcSanitary = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCSANITARYTERMINAL);
      expect(ifcSanitary.size()).toBe(5);

      const ifcFurniture = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCFURNITURE);
      expect(ifcFurniture.size()).toBe(6);

      const ifcSystemFurn = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCSYSTEMFURNITUREELEMENT);
      expect(ifcSystemFurn.size()).toBe(2);

      const ifcDoors = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCDOOR);
      expect(ifcDoors.size()).toBe(1);

      const ifcWindows = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCWINDOW);
      expect(ifcWindows.size()).toBe(1);

      // 2 réservations (une pour la baie coulissante sur w_s, une pour la porte-fenêtre sur w_e)
      const ifcOpenings = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCOPENINGELEMENT);
      expect(ifcOpenings.size()).toBe(2);

      const ifcRelVoids = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCRELVOIDSELEMENT);
      expect(ifcRelVoids.size()).toBe(2);

      const ifcRelFills = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCRELFILLSELEMENT);
      expect(ifcRelFills.size()).toBe(2);

      ifcApi.CloseModel(modelId);
    });

    it('Phase 8.5.1 : vérifie la conformité sémantique buildingSMART IFC4 et les signatures EXPRESS des types et occurrences', async () => {
      const doc = BimDocument.createDefaultProject();
      const levelId = Object.keys(doc.getState().levels)[0] ?? 'lvl_0';
      const wallTypeId = Object.keys(doc.getState().wallTypes)[0] ?? 'wt_default';

      // Mur hôte pour les menuiseries
      doc.execute(
        new AddWallCommand({
          id: 'w_test',
          category: 'wall',
          typeId: wallTypeId,
          levelId,
          start: { x: 0, y: 0 },
          end: { x: 10000, y: 0 },
        }),
      );

      // Menuiserie coulissante (IfcDoor / DOUBLE_DOOR_SLIDING)
      doc.execute(
        new AddComponentCommand({
          id: 'comp_slide',
          category: 'component',
          typeId: 'ct_sliding_door',
          levelId,
          placement: { x: 3000, y: 0, hostWallId: 'w_test' },
        }),
      );

      // Porte-fenêtre (IfcWindow / DOUBLE_PANEL_VERTICAL)
      doc.execute(
        new AddComponentCommand({
          id: 'comp_french',
          category: 'component',
          typeId: 'ct_french_window',
          levelId,
          placement: { x: 7000, y: 0, hostWallId: 'w_test' },
        }),
      );

      // Mobilier modulaire cuisine (IfcSystemFurnitureElement / USERDEFINED avec ObjectType / ElementType)
      doc.execute(
        new AddComponentCommand({
          id: 'comp_kitchen_base',
          category: 'component',
          typeId: 'ct_kitchen_base_60',
          levelId,
          placement: { x: 1000, y: 1000 },
        }),
      );

      // Mobilier standard (IfcFurnitureType avec 11 arguments dont AssemblyPlace .NOTDEFINED.)
      doc.execute(
        new AddComponentCommand({
          id: 'comp_bed',
          category: 'component',
          typeId: 'ct_bed_double',
          levelId,
          placement: { x: 5000, y: 2000 },
        }),
      );

      const ifcContent = exportToIfc(doc.getState());

      // Vérification textuelle exacte des constructions EXPRESS IFC4
      // 1. IfcDoorType et IfcDoor : DOUBLE_DOOR_SLIDING (conforme buildingSMART IFC4, pas de .SLIDING. non standard)
      expect(ifcContent).toContain('.DOUBLE_DOOR_SLIDING.');
      expect(ifcContent).not.toContain("'.SLIDING.'");
      expect(ifcContent).not.toMatch(/IFCDOOR\([^)]*\.SLIDING\./);

      // 2. IfcWindowType et IfcWindow : DOUBLE_PANEL_VERTICAL
      expect(ifcContent).toContain('.DOUBLE_PANEL_VERTICAL.');

      // 3. IfcSystemFurnitureElementType & IfcSystemFurnitureElement : ElementType et ObjectType valorisés
      expect(ifcContent).toMatch(/IFCSYSTEMFURNITUREELEMENTTYPE\([^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,'KITCHEN_BASE',\.USERDEFINED\.\)/);
      expect(ifcContent).toMatch(/IFCSYSTEMFURNITUREELEMENT\([^,]+,[^,]+,[^,]+,[^,]+,'KITCHEN_BASE',/);

      // 4. IfcFurnitureType : 11 arguments incluant AssemblyPlace .NOTDEFINED. et PredefinedType .BED.
      expect(ifcContent).toMatch(/IFCFURNITURETYPE\([^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,'BED',\.NOTDEFINED\.,\.BED\.\)/);

      // Validation structurelle WebIFC C++/WASM
      const ifcApi = new WebIFC.IfcAPI();
      await ifcApi.Init();
      const modelId = ifcApi.OpenModel(new TextEncoder().encode(ifcContent));
      expect(modelId).toBeGreaterThanOrEqual(0);

      const doors = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCDOOR);
      expect(doors.size()).toBe(1);

      const windows = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCWINDOW);
      expect(windows.size()).toBe(1);

      const doorTypes = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCDOORTYPE);
      expect(doorTypes.size()).toBe(1);

      const windowTypes = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCWINDOWTYPE);
      expect(windowTypes.size()).toBe(1);

      const furnitureTypes = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCFURNITURETYPE);
      expect(furnitureTypes.size()).toBe(1);

      const sysFurnTypes = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCSYSTEMFURNITUREELEMENTTYPE);
      expect(sysFurnTypes.size()).toBe(1);

      ifcApi.CloseModel(modelId);
    });
  });
});
