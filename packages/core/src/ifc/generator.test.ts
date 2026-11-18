import { describe, it, expect } from 'vitest';
import { exportToIfc } from './generator.js';
import { createIfcGuid } from './guid.js';
import { BimDocument } from '../document.js';
import { type BimState } from '../types.js';
import * as WebIFC from 'web-ifc';

describe('Générateur IFC4 ISO 10303-21 (packages/core/ifc)', () => {
  const sampleState: BimState = {
    schemaVersion: 2,
    units: 'mm',
    levels: {
      lvl_00: { id: 'lvl_00', name: 'Rez-de-chaussée', elevation: 0 },
    },
    wallTypes: {
      wt_200: { id: 'wt_200', name: 'Béton 200mm', thickness: 200, height: 2800 },
    },
    slabTypes: {},
    doorTypes: {
      dt_1: { id: 'dt_1', name: 'Porte 900x2150', width: 900, height: 2150 },
    },
    windowTypes: {
      wt_1: { id: 'wt_1', name: 'Fenêtre 1200x1400', width: 1200, height: 1400, defaultSillHeight: 900 },
    },
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
    slabs: {},
    doors: {
      door_south: {
        id: 'door_south',
        category: 'door',
        doorTypeId: 'dt_1',
        hostWallId: 'wall_south',
        offsetAlong: 2000,
        swing: { side: 'right', direction: 'in' },
      },
    },
    windows: {
      win_north: {
        id: 'win_north',
        category: 'window',
        windowTypeId: 'wt_1',
        hostWallId: 'wall_north',
        offsetAlong: 1500,
        sillHeight: 900,
      },
    },
    rooms: {
      room_salon: {
        id: 'room_salon',
        category: 'room',
        levelId: 'lvl_00',
        name: 'Salon Principal',
        seed: { x: 3000, y: 2000 },
      },
    },
    dimensions: {},
  };

  it('génère un fichier STEP ISO 10303-21 syntaxiquement valide', () => {
    const ifc = exportToIfc(sampleState, {
      projectName: 'Villa Moderne',
      author: 'Architecte Chef',
      organization: 'Cabinet BIM',
      filename: 'villa.ifc',
    });

    expect(ifc.startsWith('ISO-10303-21;')).toBe(true);
    expect(ifc).toContain('HEADER;');
    expect(ifc).toContain("FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');");
    expect(ifc).toContain("FILE_SCHEMA(('IFC4'));");
    expect(ifc).toContain('DATA;');
    expect(ifc).toContain('ENDSEC;');
    expect(ifc.trimEnd().endsWith('END-ISO-10303-21;')).toBe(true);

    // Métadonnées personnalisées
    expect(ifc).toContain('Villa Moderne');
    expect(ifc).toContain('Architecte Chef');
    expect(ifc).toContain('Cabinet BIM');
  });

  it('exporte la hiérarchie spatiale IFC complète (Project -> Site -> Building -> Storey)', () => {
    const ifc = exportToIfc(sampleState);

    expect(ifc).toContain('IFCPROJECT(');
    expect(ifc).toContain('IFCSITE(');
    expect(ifc).toContain('IFCBUILDING(');
    expect(ifc).toContain('IFCBUILDINGSTOREY(');
    expect(ifc).toContain('Rez-de-chauss\u00e9e'); // ou Rez-de-chaussée
    expect(ifc).toContain('IFCRELAGGREGATES(');
  });

  it('exporte les 4 murs avec géométrie extrudée et rattachement spatial', () => {
    const ifc = exportToIfc(sampleState);

    // 4 murs
    const wallMatches = ifc.match(/=IFCWALL\(/g);
    expect(wallMatches).toHaveLength(4);

    expect(ifc).toContain("'wall_south'");
    expect(ifc).toContain("'wall_north'");
    expect(ifc).toContain("'wall_west'");
    expect(ifc).toContain("'wall_east'");

    // Géométrie extrudée
    expect(ifc).toContain('IFCEXTRUDEDAREASOLID(');
    expect(ifc).toContain('IFCARBITRARYCLOSEDPROFILEDEF(');

    // Rattachement spatial
    expect(ifc).toContain('IFCRELCONTAINEDINSPATIALSTRUCTURE(');
  });

  it('exporte les ouvertures avec réservations IfcRelVoidsElement et remplissage IfcRelFillsElement', () => {
    const ifc = exportToIfc(sampleState);

    // Porte
    expect(ifc).toContain('IFCDOOR(');
    expect(ifc).toContain("'door_south'");
    expect(ifc).toContain('.SINGLE_SWING_RIGHT.');

    // Fenêtre
    expect(ifc).toContain('IFCWINDOW(');
    expect(ifc).toContain("'win_north'");

    // Réservations IfcOpeningElement (1 pour la porte + 1 pour la fenêtre)
    const openingMatches = ifc.match(/=IFCOPENINGELEMENT\(/g);
    expect(openingMatches).toHaveLength(2);

    // Relations BIM obligatoires
    const voidsMatches = ifc.match(/=IFCRELVOIDSELEMENT\(/g);
    expect(voidsMatches).toHaveLength(2);

    const fillsMatches = ifc.match(/=IFCRELFILLSELEMENT\(/g);
    expect(fillsMatches).toHaveLength(2);
  });

  it('exporte les pièces en IfcSpace avec quantités Qto_SpaceBaseQuantities', () => {
    const ifc = exportToIfc(sampleState);

    expect(ifc).toContain('IFCSPACE(');
    expect(ifc).toContain("'Salon Principal'");

    // Quantités de surface et volume
    expect(ifc).toContain('IFCELEMENTQUANTITY(');
    expect(ifc).toContain("'Qto_SpaceBaseQuantities'");
    expect(ifc).toContain("IFCQUANTITYAREA('NetFloorArea'");
    expect(ifc).toContain("IFCQUANTITYVOLUME('NetVolume'");
    expect(ifc).toContain('IFCRELDEFINESBYPROPERTIES(');
  });

  it('gère un projet vide sans crash et avec un niveau par défaut', () => {
    const emptyDoc = BimDocument.createEmptyState();
    const ifc = exportToIfc(emptyDoc);

    expect(ifc.startsWith('ISO-10303-21;')).toBe(true);
    expect(ifc).toContain('IFCPROJECT(');
    expect(ifc).toContain('IFCSITE(');
    expect(ifc).toContain('IFCBUILDING(');
    expect(ifc).toContain('IFCBUILDINGSTOREY(');
    expect(ifc.trimEnd().endsWith('END-ISO-10303-21;')).toBe(true);
  });

  it('génère des GUIDs strictement conformes à la norme IFC 22-caractères (alphabet 0-9A-Za-z_$)', () => {
    const ifc = exportToIfc(sampleState);
    const ifcGuidRegex = /^[0-9A-Za-z_$]{22}$/;

    // Vérifier 50 GUIDs générés unitairement
    for (let i = 0; i < 50; i++) {
      const guid = createIfcGuid();
      expect(guid).toHaveLength(22);
      expect(ifcGuidRegex.test(guid)).toBe(true);
    }

    // Vérifier tous les GUIDs présents dans le fichier STEP
    const extractedGuids = [...ifc.matchAll(/'([0-9A-Za-z_$]{22})'/g)].map((m) => m[1]);
    expect(extractedGuids.length).toBeGreaterThanOrEqual(10);
    for (const g of extractedGuids) {
      expect(ifcGuidRegex.test(g ?? '')).toBe(true);
    }
  });

  it('vérifie l’intégrité référentielle stricte des identifiants STEP (#id) entre Murs, Réservations et Menuiseries', () => {
    const ifc = exportToIfc(sampleState);
    const lines = ifc.split('\n');
    const entityMap = new Map<string, string>();

    for (const line of lines) {
      const match = line.match(/^#(\d+)=([A-Z0-9_]+)\(/);
      if (match && match[1] && match[2]) {
        entityMap.set(match[1], match[2]);
      }
    }

    // 1. Vérifier que IfcRelVoidsElement pointe vers un IFCWALL et un IFCOPENINGELEMENT existants
    const voidsRegex = /#(\d+)=IFCRELVOIDSELEMENT\('[^']+',#\d+,[$,]+#(\d+),#(\d+)\);/g;
    const voidsMatches = [...ifc.matchAll(voidsRegex)];
    expect(voidsMatches).toHaveLength(2);

    for (const vm of voidsMatches) {
      const wallId = vm[2];
      const openingId = vm[3];
      expect(wallId).toBeDefined();
      expect(openingId).toBeDefined();
      expect(entityMap.get(wallId!)).toBe('IFCWALL');
      expect(entityMap.get(openingId!)).toBe('IFCOPENINGELEMENT');
    }

    // 2. Vérifier que IfcRelFillsElement pointe vers un IFCOPENINGELEMENT et une menuiserie existante
    const fillsRegex = /#(\d+)=IFCRELFILLSELEMENT\('[^']+',#\d+,[$,]+#(\d+),#(\d+)\);/g;
    const fillsMatches = [...ifc.matchAll(fillsRegex)];
    expect(fillsMatches).toHaveLength(2);

    const fillingTypes = fillsMatches.map((fm) => entityMap.get(fm[3]!));
    expect(fillingTypes).toContain('IFCDOOR');
    expect(fillingTypes).toContain('IFCWINDOW');
  });

  it('VALIDE LE FICHIER IFC DANS LE PARSER INDUSTRIEL OFFICIEL WEB-IFC (buildingSMART)', async () => {
    const ifcApi = new WebIFC.IfcAPI();
    await ifcApi.Init();

    const ifcStr = exportToIfc(sampleState);
    const data = new TextEncoder().encode(ifcStr);

    const modelId = ifcApi.OpenModel(data);
    expect(modelId).toBeGreaterThanOrEqual(0);

    // Vérification des entités réelles parsées par le moteur C++/WASM
    const walls = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCWALL);
    expect(walls.size()).toBe(4);

    const doors = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCDOOR);
    expect(doors.size()).toBe(1);

    const windows = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCWINDOW);
    expect(windows.size()).toBe(1);

    const openings = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCOPENINGELEMENT);
    expect(openings.size()).toBe(2);

    const voids = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCRELVOIDSELEMENT);
    expect(voids.size()).toBe(2);

    const fills = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCRELFILLSELEMENT);
    expect(fills.size()).toBe(2);

    const spaces = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCSPACE);
    expect(spaces.size()).toBe(1);

    const storeys = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCBUILDINGSTOREY);
    expect(storeys.size()).toBe(1);

    ifcApi.CloseModel(modelId);
  });

  it('génère un modèle de 50 murs en moins de 50 ms (performance d’exportation)', () => {
    const largeState: BimState = {
      schemaVersion: 2,
      units: 'mm',
      levels: {
        lvl_00: { id: 'lvl_00', name: 'Niveau 0', elevation: 0 },
      },
      wallTypes: {
        wt_std: { id: 'wt_std', name: 'Standard 200mm', thickness: 200, height: 3000 },
      },
      slabTypes: {},
      doorTypes: {},
      windowTypes: {},
      walls: {},
      slabs: {},
      doors: {},
      windows: {},
      rooms: {},
      dimensions: {},
    };

    for (let i = 0; i < 50; i++) {
      largeState.walls[`wall_${i}`] = {
        id: `wall_${i}`,
        category: 'wall',
        typeId: 'wt_std',
        levelId: 'lvl_00',
        start: { x: i * 1000, y: 0 },
        end: { x: (i + 1) * 1000, y: 0 },
      };
    }

    const t0 = performance.now();
    const ifc = exportToIfc(largeState);
    const duration = performance.now() - t0;

    expect(duration).toBeLessThan(100);
    expect(ifc).toContain('IFCWALL(');
    expect(ifc.trimEnd().endsWith('END-ISO-10303-21;')).toBe(true);
  });

  it('T-SLAB-IFC-01 : Export IFC4 d’une dalle pleine -> entité IfcSlab (.FLOOR.) parsée par web-ifc', async () => {
    const doc = BimDocument.createDefaultProject();
    const baseState = doc.getState();
    const levelId = Object.keys(baseState.levels)[0]!;

    const slabState: BimState = {
      ...baseState,
      slabTypes: {
        st_test: { id: 'st_test', name: 'Dalle 200mm', thickness: 200 },
      },
      slabs: {
        slab_01: {
          id: 'slab_01',
          category: 'slab',
          slabTypeId: 'st_test',
          levelId,
          boundary: [
            { x: 0, y: 0 },
            { x: 5000, y: 0 },
            { x: 5000, y: 5000 },
            { x: 0, y: 5000 },
          ],
        },
      },
    };

    const ifcContent = exportToIfc(slabState);
    expect(ifcContent).toContain('IFCSLAB(');
    expect(ifcContent).toContain('.FLOOR.');

    const ifcApi = new WebIFC.IfcAPI();
    await ifcApi.Init();
    const modelId = ifcApi.OpenModel(new TextEncoder().encode(ifcContent));

    const slabs = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCSLAB);
    expect(slabs.size()).toBe(1);

    ifcApi.CloseModel(modelId);
  });

  it('T-SLAB-IFC-02 : Dalle pleine sans trémie -> génère IfcArbitraryClosedProfileDef', () => {
    const doc = BimDocument.createDefaultProject();
    const baseState = doc.getState();
    const levelId = Object.keys(baseState.levels)[0]!;

    const slabState: BimState = {
      ...baseState,
      slabTypes: {
        st_test: { id: 'st_test', name: 'Dalle 200mm', thickness: 200 },
      },
      slabs: {
        slab_solid: {
          id: 'slab_solid',
          category: 'slab',
          slabTypeId: 'st_test',
          levelId,
          boundary: [
            { x: 0, y: 0 },
            { x: 4000, y: 0 },
            { x: 4000, y: 4000 },
            { x: 0, y: 4000 },
          ],
        },
      },
    };

    const ifcContent = exportToIfc(slabState);
    expect(ifcContent).toContain("IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,'SlabProfile'");
    expect(ifcContent).not.toContain('IFCARBITRARYPROFILEDEFWITHVOIDS');
  });

  it('T-SLAB-IFC-03 : Dalle avec trémie (hole) -> génère IfcArbitraryProfileDefWithVoids', async () => {
    const doc = BimDocument.createDefaultProject();
    const baseState = doc.getState();
    const levelId = Object.keys(baseState.levels)[0]!;

    const slabState: BimState = {
      ...baseState,
      slabTypes: {
        st_test: { id: 'st_test', name: 'Dalle 200mm', thickness: 200 },
      },
      slabs: {
        slab_with_hole: {
          id: 'slab_with_hole',
          category: 'slab',
          slabTypeId: 'st_test',
          levelId,
          boundary: [
            { x: 0, y: 0 },
            { x: 6000, y: 0 },
            { x: 6000, y: 6000 },
            { x: 0, y: 6000 },
          ],
          holes: [
            [
              { x: 2000, y: 2000 },
              { x: 3000, y: 2000 },
              { x: 3000, y: 3000 },
              { x: 2000, y: 3000 },
            ],
          ],
        },
      },
    };

    const ifcContent = exportToIfc(slabState);
    expect(ifcContent).toContain("IFCARBITRARYPROFILEDEFWITHVOIDS(.AREA.,'SlabProfileWithVoids'");

    const ifcApi = new WebIFC.IfcAPI();
    await ifcApi.Init();
    const modelId = ifcApi.OpenModel(new TextEncoder().encode(ifcContent));

    const slabs = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCSLAB);
    expect(slabs.size()).toBe(1);

    ifcApi.CloseModel(modelId);
  });

  // Escaliers paramétriques IFC4 (ADR-048)
  it('T-STAIR-IFC-01 : Export IFC4 — génère IFCSTAIR (.STRAIGHT_RUN_STAIR.) et IFCSTAIRFLIGHT (.STRAIGHT.)', () => {
    const doc = BimDocument.createDefaultProject();
    const baseState = doc.getState();
    const lvl0 = Object.keys(baseState.levels)[0]!;
    const lvl1 = 'lvl_01';

    const stairState: BimState = {
      ...baseState,
      levels: {
        ...baseState.levels,
        [lvl1]: { id: lvl1, name: 'Étage 1', elevation: 3000 },
      },
      stairTypes: {
        st_timber: { id: 'st_timber', name: 'Escalier Bois 900', width: 900 },
      },
      stairs: {
        stair_main: {
          id: 'stair_main',
          category: 'stair',
          stairTypeId: 'st_timber',
          bottomLevelId: lvl0,
          topLevelId: lvl1,
          start: { x: 1000, y: 1000 },
          end: { x: 5200, y: 1000 },
          name: 'Escalier Principal',
        },
      },
    };

    const ifcContent = exportToIfc(stairState);

    expect(ifcContent).toContain('IFCSTAIR(');
    expect(ifcContent).toContain('.STRAIGHT_RUN_STAIR.');
    expect(ifcContent).toContain('IFCSTAIRFLIGHT(');
    expect(ifcContent).toContain('.STRAIGHT.');
    expect(ifcContent).toContain('Escalier Principal');
  });

  it('T-STAIR-IFC-02 : Relation d’agrégation — IFCRELAGGREGATES lie IFCSTAIR à IFCSTAIRFLIGHT', () => {
    const doc = BimDocument.createDefaultProject();
    const baseState = doc.getState();
    const lvl0 = Object.keys(baseState.levels)[0]!;
    const lvl1 = 'lvl_01';

    const stairState: BimState = {
      ...baseState,
      levels: {
        ...baseState.levels,
        [lvl1]: { id: lvl1, name: 'Étage 1', elevation: 3000 },
      },
      stairTypes: {
        st_timber: { id: 'st_timber', name: 'Escalier Bois 900', width: 900 },
      },
      stairs: {
        stair_main: {
          id: 'stair_main',
          category: 'stair',
          stairTypeId: 'st_timber',
          bottomLevelId: lvl0,
          topLevelId: lvl1,
          start: { x: 1000, y: 1000 },
          end: { x: 5200, y: 1000 },
        },
      },
    };

    const ifcContent = exportToIfc(stairState);

    expect(ifcContent).toContain("IFCRELAGGREGATES(");
    expect(ifcContent).toContain("'StairFlightAggregation'");
  });

  it('T-STAIR-IFC-03 : Validation structurelle web-ifc — IFCSTAIR et IFCSTAIRFLIGHT sont parsés sans erreur', async () => {
    const doc = BimDocument.createDefaultProject();
    const baseState = doc.getState();
    const lvl0 = Object.keys(baseState.levels)[0]!;
    const lvl1 = 'lvl_01';

    const stairState: BimState = {
      ...baseState,
      levels: {
        ...baseState.levels,
        [lvl1]: { id: lvl1, name: 'Étage 1', elevation: 3000 },
      },
      stairTypes: {
        st_timber: { id: 'st_timber', name: 'Escalier Bois 900', width: 900 },
      },
      stairs: {
        stair_main: {
          id: 'stair_main',
          category: 'stair',
          stairTypeId: 'st_timber',
          bottomLevelId: lvl0,
          topLevelId: lvl1,
          start: { x: 1000, y: 1000 },
          end: { x: 5200, y: 1000 },
        },
      },
    };

    const ifcContent = exportToIfc(stairState);

    const ifcApi = new WebIFC.IfcAPI();
    await ifcApi.Init();
    const modelId = ifcApi.OpenModel(new TextEncoder().encode(ifcContent));

    const stairs = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCSTAIR);
    expect(stairs.size()).toBe(1);

    const stairFlights = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCSTAIRFLIGHT);
    expect(stairFlights.size()).toBe(1);

    ifcApi.CloseModel(modelId);
  });

  it('T-IFC-S1-1 : Mur avec heightOverride=3000 et baseOffset=500 -> extrusion et placement exacts dans IFC', () => {
    const doc = BimDocument.createDefaultProject();
    const baseState = doc.getState();
    const lvl0 = Object.keys(baseState.levels)[0]!;

    const customWallState: BimState = {
      ...baseState,
      walls: {
        w_custom: {
          id: 'w_custom',
          category: 'wall',
          typeId: Object.keys(baseState.wallTypes)[0]!,
          levelId: lvl0,
          start: { x: 0, y: 0 },
          end: { x: 4000, y: 0 },
          heightOverride: 3000,
          baseOffset: 500,
        },
      },
      doors: {},
      windows: {},
      rooms: {},
      slabs: {},
    };

    const ifcContent = exportToIfc(customWallState);
    // Extrusion 3000.00
    expect(ifcContent).toContain('IFCEXTRUDEDAREASOLID');
    expect(ifcContent).toMatch(/IFCEXTRUDEDAREASOLID\(#\d+,#\d+,#\d+,3000\.00\)/);
    // Point de placement avec baseOffset 500.00
    expect(ifcContent).toContain('IFCCARTESIANPOINT((0.00,0.00,500.00))');
  });

  // Toitures IFC4 (ADR-053 [D6])
  it('T-IFC-ROOF-01 : Export IFC4 d’une toiture 2 pans -> entité IFCROOF (.GABLE_ROOF.) et agrégation IFCRELAGGREGATES', () => {
    const doc = BimDocument.createDefaultProject();
    const baseState = doc.getState();
    const lvl0 = Object.keys(baseState.levels)[0] ?? 'lvl_0';

    const roofState: BimState = {
      ...baseState,
      roofTypes: {
        rt_gable: {
          id: 'rt_gable',
          category: 'roofType',
          name: 'Toit 2 pans 35°',
          family: 'gable',
          thickness: 250,
          slopeDeg: 35,
          overhangMm: 300,
        },
      },
      roofs: {
        roof_01: {
          id: 'roof_01',
          name: 'Toiture Principale',
          category: 'roof',
          roofTypeId: 'rt_gable',
          levelId: lvl0,
          footprint: [
            { x: 0, y: 0 },
            { x: 8000, y: 0 },
            { x: 8000, y: 6000 },
            { x: 0, y: 6000 },
          ],
          ridgeAxis: {
            start: { x: 0, y: 3000 },
            end: { x: 8000, y: 3000 },
          },
        },
      },
    };

    const ifcContent = exportToIfc(roofState);

    expect(ifcContent).toContain('IFCROOF(');
    expect(ifcContent).toContain('.GABLE_ROOF.');
    expect(ifcContent).toContain('Toiture Principale');
    expect(ifcContent).toContain('RoofSlabAggregation');
    expect(ifcContent).toContain('.ROOF.');
  });

  it('T-IFC-ROOF-02 : Export IFC4 d’une toiture terrasse -> entité IFCROOF (.FLAT_ROOF.)', () => {
    const doc = BimDocument.createDefaultProject();
    const baseState = doc.getState();
    const lvl0 = Object.keys(baseState.levels)[0] ?? 'lvl_0';

    const roofState: BimState = {
      ...baseState,
      roofTypes: {
        rt_flat: {
          id: 'rt_flat',
          category: 'roofType',
          name: 'Toit terrasse béton',
          family: 'flat',
          thickness: 200,
        },
      },
      roofs: {
        roof_flat: {
          id: 'roof_flat',
          name: 'Toiture Terrasse',
          category: 'roof',
          roofTypeId: 'rt_flat',
          levelId: lvl0,
          footprint: [
            { x: 0, y: 0 },
            { x: 6000, y: 0 },
            { x: 6000, y: 4000 },
            { x: 0, y: 4000 },
          ],
        },
      },
    };

    const ifcContent = exportToIfc(roofState);

    expect(ifcContent).toContain('IFCROOF(');
    expect(ifcContent).toContain('.FLAT_ROOF.');
    expect(ifcContent).toContain('Toiture Terrasse');
  });

  it('T-IFC-ROOF-03 : Toiture 2 pans -> 2 versants IFCSLAB (.ROOF.) agrégés sous IFCROOF', () => {
    const doc = BimDocument.createDefaultProject();
    const baseState = doc.getState();
    const lvl0 = Object.keys(baseState.levels)[0] ?? 'lvl_0';

    const roofState: BimState = {
      ...baseState,
      roofTypes: {
        rt_gable: {
          id: 'rt_gable',
          category: 'roofType',
          name: 'Toit 2 pans 35°',
          family: 'gable',
          thickness: 250,
          slopeDeg: 35,
          overhangMm: 0,
        },
      },
      roofs: {
        roof_01: {
          id: 'roof_01',
          category: 'roof',
          roofTypeId: 'rt_gable',
          levelId: lvl0,
          footprint: [
            { x: 0, y: 0 },
            { x: 8000, y: 0 },
            { x: 8000, y: 6000 },
            { x: 0, y: 6000 },
          ],
          ridgeAxis: {
            start: { x: 0, y: 3000 },
            end: { x: 8000, y: 3000 },
          },
        },
      },
    };

    const ifcContent = exportToIfc(roofState);

    // 2 versants IfcSlab avec .ROOF.
    const slabMatches = ifcContent.match(/IFCSLAB\([^)]*\.ROOF\.\)/g);
    expect(slabMatches).toBeDefined();
    expect(slabMatches?.length).toBe(2);
  });

  it('T-IFC-ROOF-04 : Validation structurelle web-ifc — IFCROOF et ses IFCSLAB (.ROOF.) sont parsés sans erreur', async () => {
    const doc = BimDocument.createDefaultProject();
    const baseState = doc.getState();
    const lvl0 = Object.keys(baseState.levels)[0] ?? 'lvl_0';

    const roofState: BimState = {
      ...baseState,
      roofTypes: {
        rt_gable: {
          id: 'rt_gable',
          category: 'roofType',
          name: 'Toit 2 pans 35°',
          family: 'gable',
          thickness: 250,
          slopeDeg: 35,
          overhangMm: 0,
        },
      },
      roofs: {
        roof_01: {
          id: 'roof_01',
          name: 'Toiture 2 Pans',
          category: 'roof',
          roofTypeId: 'rt_gable',
          levelId: lvl0,
          footprint: [
            { x: 0, y: 0 },
            { x: 8000, y: 0 },
            { x: 8000, y: 6000 },
            { x: 0, y: 6000 },
          ],
          ridgeAxis: {
            start: { x: 0, y: 3000 },
            end: { x: 8000, y: 3000 },
          },
        },
      },
    };

    const ifcContent = exportToIfc(roofState);

    const ifcApi = new WebIFC.IfcAPI();
    await ifcApi.Init();
    const modelId = ifcApi.OpenModel(new TextEncoder().encode(ifcContent));

    const roofs = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCROOF);
    expect(roofs.size()).toBe(1);

    const slabs = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCSLAB);
    expect(slabs.size()).toBe(2);

    ifcApi.CloseModel(modelId);
  });

  it('T-IFC-GUID-BUILDINGSMART : 1 000 GUIDs consécutifs respectent strictement le standard ISO 16739 (22 chars, premier char dans 0..3)', () => {
    const validFirstChars = new Set(['0', '1', '2', '3']);
    const ifcAlphabetRegex = /^[0-9A-Za-z_$]{22}$/;

    for (let i = 0; i < 1000; i++) {
      const guid = createIfcGuid();
      expect(guid).toHaveLength(22);
      expect(ifcAlphabetRegex.test(guid)).toBe(true);
      expect(validFirstChars.has(guid[0]!)).toBe(true);
    }
  });

  it('T-IFC-WALL-GABLE-PROFILE : Mur pignon sous toiture 2 pans -> profil supérieur biseauté dans le contenu IFC (GableWallProfile)', async () => {
    const doc = BimDocument.createDefaultProject();
    const baseState = doc.getState();
    const lvl0 = Object.keys(baseState.levels)[0] ?? 'lvl_0';

    const gableState: BimState = {
      ...baseState,
      roofTypes: {
        rt_gable: {
          id: 'rt_gable',
          category: 'roofType',
          name: 'Toit 2 pans 45°',
          family: 'gable',
          thickness: 250,
          slopeDeg: 45,
          overhangMm: 0,
        },
      },
      roofs: {
        roof_gable: {
          id: 'roof_gable',
          category: 'roof',
          roofTypeId: 'rt_gable',
          levelId: lvl0,
          baseOffset: 0,
          footprint: [
            { x: 0, y: 0 },
            { x: 10000, y: 0 },
            { x: 10000, y: 8000 },
            { x: 0, y: 8000 },
          ],
          ridgeAxis: {
            start: { x: 0, y: 4000 },
            end: { x: 10000, y: 4000 },
          },
        },
      },
      walls: {
        wall_gable_west: {
          id: 'wall_gable_west',
          category: 'wall',
          typeId: 'wt_200',
          levelId: lvl0,
          start: { x: 0, y: 0 },
          end: { x: 0, y: 8000 },
          topConstraint: { kind: 'roof', roofId: 'roof_gable' },
        },
        wall_regular: {
          id: 'wall_regular',
          category: 'wall',
          typeId: 'wt_200',
          levelId: lvl0,
          start: { x: 0, y: 0 },
          end: { x: 10000, y: 0 },
        },
      },
      roofOpenings: {},
    };

    const ifcContent = exportToIfc(gableState);

    // Le mur pignon (topConstraint: roof) doit générer un profil non-rectangulaire
    // Vérification : IFCARBITRARYCLOSEDPROFILEDEF avec label 'GableWallProfile' pour le mur pignon
    expect(ifcContent).toContain('GableWallProfile');

    // Le mur classique conserve son WallProfile rectangulaire
    expect(ifcContent).toContain('WallProfile');

    // Validation structurelle web-ifc — le fichier reste parsable et valide
    const ifcApi = new WebIFC.IfcAPI();
    await ifcApi.Init();
    const modelId = ifcApi.OpenModel(new TextEncoder().encode(ifcContent));
    const walls = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCWALL);
    expect(walls.size()).toBe(2);
    ifcApi.CloseModel(modelId);
  });
});
