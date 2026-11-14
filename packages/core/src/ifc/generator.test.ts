import { describe, it, expect } from 'vitest';
import { exportToIfc } from './generator.js';
import { BimDocument } from '../document.js';
import { type BimState } from '../types.js';

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
});
