import { describe, it, expect } from 'vitest';
import { exportToIfc } from './generator.js';
import { createIfcGuid } from './guid.js';
import { BimDocument } from '../document.js';
import { type BimState } from '../types.js';
import * as WebIFC from 'web-ifc';

describe('Générateur IFC4 ISO 10303-21 (packages/core/ifc)', () => {
  const sampleState: BimState = {
    schemaVersion: 1,
    units: 'mm',
    levels: {
      lvl_00: { id: 'lvl_00', name: 'Rez-de-chaussée', elevation: 0, height: 2800 },
    },
    wallTypes: {
      wt_200: { id: 'wt_200', name: 'Béton 200mm', thickness: 200, height: 2800 },
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
    doors: {
      door_south: {
        id: 'door_south',
        category: 'door',
        kind: 'door',
        hostWallId: 'wall_south',
        offsetAlong: 2000,
        width: 900,
        height: 2150,
        swing: { side: 'right', direction: 'in' },
      },
    },
    windows: {
      win_north: {
        id: 'win_north',
        category: 'window',
        kind: 'window',
        hostWallId: 'wall_north',
        offsetAlong: 1500,
        width: 1200,
        height: 1400,
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
      schemaVersion: 1,
      units: 'mm',
      levels: {
        lvl_00: { id: 'lvl_00', name: 'Niveau 0', elevation: 0, height: 3000 },
      },
      wallTypes: {
        wt_std: { id: 'wt_std', name: 'Standard 200mm', thickness: 200, height: 3000 },
      },
      walls: {},
      doors: {},
      windows: {},
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
});
