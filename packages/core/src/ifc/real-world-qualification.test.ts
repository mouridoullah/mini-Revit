import { describe, it, expect } from 'vitest';
import * as WebIFC from 'web-ifc';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { exportToIfc, escapeStepString } from './generator.js';
import { createComplexVillaState } from '../fixtures/complex-villa.js';

describe('Qualification IFC4 Réelle - Banc d’Épreuve Villa Complexe (ADR-053)', () => {
  const villaState = createComplexVillaState();

  it('T-QUALIF-IFC-SYNTAX : Produit un fichier STEP ISO 10303-21 valide avec en-têtes IFC4 et métadonnées complètes', () => {
    const ifc = exportToIfc(villaState, {
      projectName: 'Villa Contemporaine R+1',
      author: 'Architecte Chef Mini-BIM',
      organization: 'Mini-BIM Studio',
      filename: 'villa-complexe.ifc',
    });

    expect(ifc.startsWith('ISO-10303-21;')).toBe(true);
    expect(ifc).toContain("FILE_SCHEMA(('IFC4'));");
    expect(ifc).toContain("FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');");
    expect(ifc).toContain('Villa Contemporaine R+1');
    expect(ifc).toContain('Architecte Chef Mini-BIM');
    expect(ifc.trimEnd().endsWith('END-ISO-10303-21;')).toBe(true);
  });

  it('T-QUALIF-IFC-HIERARCHY : Structure spatiale Project -> Site -> Building -> 2 Storeys', () => {
    const ifc = exportToIfc(villaState);

    expect(ifc).toContain('IFCPROJECT(');
    expect(ifc).toContain('IFCSITE(');
    expect(ifc).toContain('IFCBUILDING(');
    expect(ifc).toContain('IFCBUILDINGSTOREY(');
    expect(ifc).toContain(`'${escapeStepString('Rez-de-chaussée')}'`);
    expect(ifc).toContain(`'${escapeStepString('Étage R+1')}'`);

    // Vérifier les liaisons d'agrégation
    const relAggregates = ifc.match(/=IFCRELAGGREGATES\(/g);
    expect(relAggregates).not.toBeNull();
    // Au minimum : Project->Site, Site->Building, Building->Storeys, Roof->Slabs, Stair->Flight
    expect(relAggregates!.length).toBeGreaterThanOrEqual(4);
  });

  it('T-QUALIF-IFC-BASE-QUANTITIES : Murs, Dalles, Baies et Espaces disposent de Psets et Qtos normalisés', () => {
    const ifc = exportToIfc(villaState);

    // Qto_WallBaseQuantities et Pset_WallCommon
    expect(ifc).toContain("'Qto_WallBaseQuantities'");
    expect(ifc).toContain("'Pset_WallCommon'");
    expect(ifc).toContain("IFCQUANTITYLENGTH('Length'");
    expect(ifc).toContain("IFCQUANTITYLENGTH('Width'");
    expect(ifc).toContain("IFCQUANTITYLENGTH('Height'");
    expect(ifc).toContain("IFCQUANTITYAREA('GrossSideArea'");
    expect(ifc).toContain("IFCQUANTITYAREA('NetSideArea'");
    expect(ifc).toContain("IFCQUANTITYVOLUME('GrossVolume'");
    expect(ifc).toContain("IFCQUANTITYVOLUME('NetVolume'");
    expect(ifc).toContain("IFCPROPERTYSINGLEVALUE('Reference'");
    expect(ifc).toContain("IFCPROPERTYSINGLEVALUE('LoadBearing'");
    expect(ifc).toContain("IFCPROPERTYSINGLEVALUE('IsExternal'");

    // Qto_SlabBaseQuantities
    expect(ifc).toContain("'Qto_SlabBaseQuantities'");
    expect(ifc).toContain("IFCQUANTITYAREA('GrossArea'");
    expect(ifc).toContain("IFCQUANTITYAREA('NetArea'");

    // Qto_DoorBaseQuantities et Qto_WindowBaseQuantities
    expect(ifc).toContain("'Qto_DoorBaseQuantities'");
    expect(ifc).toContain("'Qto_WindowBaseQuantities'");

    // Qto_SpaceBaseQuantities
    expect(ifc).toContain("'Qto_SpaceBaseQuantities'");
    expect(ifc).toContain("IFCQUANTITYAREA('NetFloorArea'");
    expect(ifc).toContain("IFCQUANTITYVOLUME('NetVolume'");

    // Relations de propriétés
    const relDefinesProps = ifc.match(/=IFCRELDEFINESBYPROPERTIES\(/g);
    expect(relDefinesProps).not.toBeNull();
    // 11 murs * 2 (Qto + Pset) + 2 dalles * 1 (Qto) + 6 baies * 1 (Qto) + 5 pièces * 1 (Qto) = 35 rels min
    expect(relDefinesProps!.length).toBeGreaterThanOrEqual(30);
  });

  it('T-QUALIF-IFC-WEBIFC-PARSER : Validation structurelle native WebIFC C++ WASM', async () => {
    const ifcContent = exportToIfc(villaState, {
      projectName: 'Villa Contemporaine R+1',
      author: 'Mini-BIM Qualification Engine',
    });

    const ifcApi = new WebIFC.IfcAPI();
    await ifcApi.Init();

    const buffer = new TextEncoder().encode(ifcContent);
    const modelId = ifcApi.OpenModel(buffer);
    expect(modelId).toBeGreaterThanOrEqual(0);

    // 1. Murs (11 au total)
    const walls = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCWALL);
    expect(walls.size()).toBe(11);

    // 2. Portes (4) et Fenêtres (2)
    const doors = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCDOOR);
    expect(doors.size()).toBe(4);

    const windows = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCWINDOW);
    expect(windows.size()).toBe(2);

    // 3. Réservations (6)
    const openings = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCOPENINGELEMENT);
    expect(openings.size()).toBe(6);

    // 4. Relations de percement et remplissage
    const voids = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCRELVOIDSELEMENT);
    expect(voids.size()).toBe(6);

    const fills = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCRELFILLSELEMENT);
    expect(fills.size()).toBe(6);

    // 5. Dalles (2 dalles plancher + 2 versants de toit 2 pans exportés en IfcSlab .ROOF. = 4 dalles)
    const slabs = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCSLAB);
    expect(slabs.size()).toBe(4);

    // 6. Escalier et volée
    const stairs = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCSTAIR);
    expect(stairs.size()).toBe(1);

    const flights = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCSTAIRFLIGHT);
    expect(flights.size()).toBe(1);

    // 7. Toiture
    const roofs = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCROOF);
    expect(roofs.size()).toBe(1);

    // 8. Espaces détectés
    const spaces = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCSPACE);
    expect(spaces.size()).toBe(5);

    // 9. Niveaux (Storeys)
    const storeys = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCBUILDINGSTOREY);
    expect(storeys.size()).toBe(2);

    // 10. Propriétés et Quantités
    const elementQuantities = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCELEMENTQUANTITY);
    expect(elementQuantities.size()).toBeGreaterThanOrEqual(20);

    const propertySets = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCPROPERTYSET);
    expect(propertySets.size()).toBe(11); // 11 murs avec Pset_WallCommon

    ifcApi.CloseModel(modelId);
  });

  it('T-QUALIF-IFC-EXPORT-FILES : Valide l’écriture sur disque et la cohérence binaire du modèle sérialisé', () => {
    const ifcContent = exportToIfc(villaState, {
      projectName: 'Villa Contemporaine R+1 - Modèle Étalon',
      author: 'Mini-BIM Qualification Architecture',
      organization: 'Mini-BIM Open Source',
      filename: 'villa-complexe.ifc',
    });

    const tmpDir = os.tmpdir();
    const ifcPath = path.join(tmpDir, 'villa-complexe-test.ifc');
    fs.writeFileSync(ifcPath, ifcContent, 'utf-8');
    expect(fs.existsSync(ifcPath)).toBe(true);
    expect(fs.statSync(ifcPath).size).toBeGreaterThan(5000);

    const jsonPath = path.join(tmpDir, 'villa-complexe-test.json');
    fs.writeFileSync(jsonPath, JSON.stringify(villaState, null, 2), 'utf-8');
    expect(fs.existsSync(jsonPath)).toBe(true);

    // Nettoyage
    fs.unlinkSync(ifcPath);
    fs.unlinkSync(jsonPath);
  });

  it('T-QUALIF-IFC-VILLA-GEOMETRY-EXACTNESS (ADR-071) : Vérifie la 3D exacte des toitures inclinées et escaliers crénelés', () => {
    const ifcContent = exportToIfc(villaState, {
      projectName: 'Villa Contemporaine R+1 - Géométrie Exacte',
    });

    // 1. Toiture inclinée : repère 3D avec normale inclinée (Nz < 1) et extrusion orthogonale
    expect(ifcContent).toContain('IFCSLAB(');
    expect(ifcContent).toContain("'RoofSlab'");
    expect(ifcContent).toContain('.ROOF.');
    expect(ifcContent).toContain('roof_main Versant 1');
    // Vérifier la présence d'au moins une normale inclinée avec composante Z non unitaire
    const dirMatches = ifcContent.match(/IFCDIRECTION\(\(([^)]+)\)\)/g);
    expect(dirMatches).not.toBeNull();
    const inclinedDirs = dirMatches!.filter((d) => {
      // Ex: IFCDIRECTION((0.,-0.573576,0.819152))
      const coords = d.match(/IFCDIRECTION\(\(([^,]+),([^,]+),([^)]+)\)\)/);
      if (!coords) return false;
      const z = parseFloat(coords[3]!);
      return z > 0.01 && z < 0.99; // Normale inclinée à 35° : z = cos(35°) ≈ 0.819
    });
    expect(inclinedDirs.length).toBeGreaterThanOrEqual(2); // 2 versants

    // 2. Escalier crénelé : profil crénelé avec marches et contremarches
    expect(ifcContent).toContain('IFCSTAIRFLIGHT(');
    // 16 contremarches directes dans les attributs IFC4
    expect(ifcContent).toMatch(/IFCSTAIRFLIGHT\('[^']+',#\d+,'[^']+',\$,'Flight',#\d+,#\d+,\$,16,16,/);
    // Profil en crémaillère
    expect(ifcContent).toContain("'StairFlightCremaillereProfile'");

    // 3. Trémie d'escalier intégrée dans la dalle R+1
    expect(ifcContent).toContain('IFCARBITRARYPROFILEDEFWITHVOIDS(');
  });

  it('T-QUALIF-IFC-IMMEUBLE-R4-MEP-AND-DETERMINISM (ADR-071) : Reproductibilité bit-à-bit et export complet MEP IFC4', async () => {
    const r4Path = fs.existsSync(path.resolve(process.cwd(), 'apps/web/public/demo-immeuble-r4.json'))
      ? path.resolve(process.cwd(), 'apps/web/public/demo-immeuble-r4.json')
      : path.resolve(process.cwd(), '../../apps/web/public/demo-immeuble-r4.json');

    expect(fs.existsSync(r4Path)).toBe(true);
    const r4State = JSON.parse(fs.readFileSync(r4Path, 'utf-8'));

    // 1. Déterminisme absolu : deux exports successifs doivent être strictement identiques bit-à-bit
    const ifcRun1 = exportToIfc(r4State, { projectName: 'Immeuble R+4 Tertiaire' });
    const ifcRun2 = exportToIfc(r4State, { projectName: 'Immeuble R+4 Tertiaire' });
    expect(ifcRun1).toBe(ifcRun2);

    // 2. Vérification sémantique STEP
    expect(ifcRun1).toContain('IFCPIPESEGMENT(');
    expect(ifcRun1).toContain('IFCDUCTSEGMENT(');
    expect(ifcRun1).toContain('IFCCABLECARRIERSEGMENT(');
    expect(ifcRun1).toContain('IFCDISTRIBUTIONSYSTEM(');
    expect(ifcRun1).toContain('IFCRELASSIGNSTOGROUP(');

    // 3. Parsing natif WebIFC C++ WASM
    const ifcApi = new WebIFC.IfcAPI();
    await ifcApi.Init();

    const buffer = new TextEncoder().encode(ifcRun1);
    const modelId = ifcApi.OpenModel(buffer);
    expect(modelId).toBeGreaterThanOrEqual(0);

    // Murs (78) et Dalles (6 planchers + 1 toiture terrasse = 7 IfcSlab)
    const walls = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCWALL);
    expect(walls.size()).toBe(78);

    const slabs = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCSLAB);
    expect(slabs.size()).toBe(7);

    const roofs = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCROOF);
    expect(roofs.size()).toBe(1);

    // Niveaux (6)
    const storeys = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCBUILDINGSTOREY);
    expect(storeys.size()).toBe(6);

    // MEP : Tuyauterie (285), Gaines (12), Chemins de câbles (12)
    const pipes = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCPIPESEGMENT);
    expect(pipes.size()).toBe(285);

    const ducts = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCDUCTSEGMENT);
    expect(ducts.size()).toBe(12);

    const cableTrays = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCCABLECARRIERSEGMENT);
    expect(cableTrays.size()).toBe(12);

    // Systèmes MEP (7) et liaisons aux groupes (7)
    const systems = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCDISTRIBUTIONSYSTEM);
    expect(systems.size()).toBe(7);

    const relAssigns = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCRELASSIGNSTOGROUP);
    expect(relAssigns.size()).toBe(7);

    ifcApi.CloseModel(modelId);
  });
});
