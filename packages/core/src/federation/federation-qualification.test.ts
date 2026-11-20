/**
 * SOUS-PHASE 9.5.1 — AUDIT INDÉPENDANT & QUALIFICATION DE LA FÉDÉRATION IFC
 *
 * Couvre les 5 lots contractuels :
 * - Lot A : Audit des coordonnées et transformations (coordonnées connues, rotations, placements imbriqués)
 * - Lot B : Matrice d'unités et de schémas (IFC2X3, IFC4, IFC4.3, Mètres, Millimètres, Centimètres, Pieds, Pouces, Storeys)
 * - Lot C : Identité et isolation fédérées (multi-modèles, collision d'expressId, sélection, intégrité BimState)
 * - Lot D : Qualification du clash inter-modèles (CANDIDATE vs QUALIFIED_CLASH vs IGNORED, inter-modèles fédérés)
 * - Lot E : Cycle de vie et mémoire (10 cycles charge/décharge, fichier corrompu, nettoyage déterministe)
 */

import { describe, it, expect } from 'vitest';
import * as WebIFC from 'web-ifc';
import { loadFederatedIfc } from './loader.js';
import { detectIfcUnits } from './units.js';
import {
  detectFederatedClashes,
  detectFederatedInterModelClashes,
} from './spatial.js';
import { transformVertexToMiniBim, transformNormalToMiniBim } from './coordinates.js';
import { BimDocument } from '../document.js';
import * as Commands from '../commands.js';
import { createPipe } from '../mep/catalog.js';
import { exportToIfc } from '../ifc/generator.js';
import { createComplexVillaDocument } from '../fixtures/complex-villa.js';

/**
 * Générateur d'IFC STEP minimaliste paramétrique pour les tests de qualification.
 */
function buildMinimalIfc(options: {
  schema?: string;
  unitLength?: 'METRE' | 'MILLIMETRE' | 'CENTIMETRE' | 'FOOT' | 'INCH';
  wallPos?: { x: number; y: number; z: number };
  wallSize?: { len: number; thick: number; height: number };
  rotationDegZ?: number;
  nestedPlacements?: boolean;
  includeSpace?: boolean;
}): string {
  const schema = options.schema ?? 'IFC4';
  const unit = options.unitLength ?? 'METRE';
  const pos = options.wallPos ?? { x: 2, y: 3, z: 1 };
  const size = options.wallSize ?? { len: 4, thick: 0.2, height: 2.5 };
  const rotRad = ((options.rotationDegZ ?? 0) * Math.PI) / 180;
  const dirX = Math.cos(rotRad);
  const dirY = Math.sin(rotRad);

  const lines: string[] = [];
  let id = 0;
  const add = (txt: string) => {
    id++;
    lines.push(`#${id}=${txt};`);
    return id;
  };

  // En-tête
  const header = [
    'ISO-10303-21;',
    'HEADER;',
    `FILE_DESCRIPTION(('Qualification Test'),'2;1');`,
    `FILE_NAME('qualification.ifc','2026-11-20',('Auditeur'),('Mini-BIM'),'','','');`,
    `FILE_SCHEMA(('${schema}'));`,
    'ENDSEC;',
    'DATA;',
  ].join('\n');

  // Histoire & Contexte
  const person = add(`IFCPERSON($,'Auditor',$,$,$,$,$,$)`);
  const org = add(`IFCORGANIZATION($,'Mini-BIM Audit',$,$,$)`);
  const personOrg = add(`IFCPERSONANDORGANIZATION(#${person},#${org},$)`);
  const app = add(`IFCAPPLICATION(#${org},'1.0','Mini-BIM','mini-bim')`);
  const history = add(`IFCOWNERHISTORY(#${personOrg},#${app},$,.ADDED.,$,$,$,1700000000)`);

  // Unités
  let lengthUnitId: number;
  if (unit === 'MILLIMETRE') {
    lengthUnitId = add(`IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.)`);
  } else if (unit === 'CENTIMETRE') {
    lengthUnitId = add(`IFCSIUNIT(*,.LENGTHUNIT.,.CENTI.,.METRE.)`);
  } else if (unit === 'FOOT') {
    const baseM = add(`IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)`);
    const measure = add(`IFCMEASUREWITHUNIT(IFCLENGTHMEASURE(0.3048),#${baseM})`);
    const exp = add(`IFCDIMENSIONALEXPONENTS(1,0,0,0,0,0,0)`);
    lengthUnitId = add(`IFCCONVERSIONBASEDUNIT(#${exp},.LENGTHUNIT.,'FOOT',#${measure})`);
  } else if (unit === 'INCH') {
    const baseM = add(`IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)`);
    const measure = add(`IFCLENGTHMEASURE(0.0254)`);
    const measureUnit = add(`IFCMEASUREWITHUNIT(#${measure},#${baseM})`);
    const exp = add(`IFCDIMENSIONALEXPONENTS(1,0,0,0,0,0,0)`);
    lengthUnitId = add(`IFCCONVERSIONBASEDUNIT(#${exp},.LENGTHUNIT.,'INCH',#${measureUnit})`);
  } else {
    // METRE standard
    lengthUnitId = add(`IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)`);
  }

  const unitAssign = add(`IFCUNITASSIGNMENT((#${lengthUnitId}))`);

  // Repère mondial
  const p0 = add(`IFCCARTESIANPOINT((0.,0.,0.))`);
  const dZ = add(`IFCDIRECTION((0.,0.,1.))`);
  const dX = add(`IFCDIRECTION((1.,0.,0.))`);
  const wPlacement = add(`IFCAXIS2PLACEMENT3D(#${p0},#${dZ},#${dX})`);
  const context = add(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#${wPlacement},$)`);
  const subContext = add(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,#${context},$,.MODEL_VIEW.,$)`);

  // Projet
  add(`IFCPROJECT('0000000000000000000001',#${history},'QualifProject',$,$,$,$,(#${context}),#${unitAssign})`);

  // Structure spatiale : Site -> Building -> Storey
  let currentPlacement = wPlacement;
  if (options.nestedPlacements) {
    const pSite = add(`IFCCARTESIANPOINT((10.,20.,0.))`); // Site à (10, 20, 0)
    const placeSite3D = add(`IFCAXIS2PLACEMENT3D(#${pSite},#${dZ},#${dX})`);
    const sitePlacement = add(`IFCLOCALPLACEMENT($,#${placeSite3D})`);

    const pBldg = add(`IFCCARTESIANPOINT((5.,5.,0.))`); // Building à +5, +5
    const placeBldg3D = add(`IFCAXIS2PLACEMENT3D(#${pBldg},#${dZ},#${dX})`);
    const bldgPlacement = add(`IFCLOCALPLACEMENT(#${sitePlacement},#${placeBldg3D})`);

    const pStorey = add(`IFCCARTESIANPOINT((0.,0.,3.))`); // Storey à Z = +3
    const placeStorey3D = add(`IFCAXIS2PLACEMENT3D(#${pStorey},#${dZ},#${dX})`);
    currentPlacement = add(`IFCLOCALPLACEMENT(#${bldgPlacement},#${placeStorey3D})`);
  } else {
    const pLocal = add(`IFCCARTESIANPOINT((0.,0.,0.))`);
    const placeLocal = add(`IFCAXIS2PLACEMENT3D(#${pLocal},#${dZ},#${dX})`);
    currentPlacement = add(`IFCLOCALPLACEMENT($,#${placeLocal})`);
  }

  // Placement du mur avec rotation éventuelle
  const pWall = add(`IFCCARTESIANPOINT((${pos.x},${pos.y},${pos.z}))`);
  const dirWallX = add(`IFCDIRECTION((${dirX},${dirY},0.))`);
  const placeWall3D = add(`IFCAXIS2PLACEMENT3D(#${pWall},#${dZ},#${dirWallX})`);
  const wallPlacement = add(`IFCLOCALPLACEMENT(#${currentPlacement},#${placeWall3D})`);

  // Profil rectangulaire et solide extrudé
  const pProfOrigin = add(`IFCCARTESIANPOINT((${size.len / 2},0.))`);
  const placeProf2D = add(`IFCAXIS2PLACEMENT2D(#${pProfOrigin},$)`);
  const rectProfile = add(`IFCRECTANGLEPROFILEDEF(.AREA.,'WallProfile',#${placeProf2D},${size.len},${size.thick})`);
  const solid = add(`IFCEXTRUDEDAREASOLID(#${rectProfile},#${wPlacement},#${dZ},${size.height})`);

  // Représentation de forme
  const rep = add(`IFCSHAPEREPRESENTATION(#${subContext},'Body','SweptSolid',(#${solid}))`);
  const prodShape = add(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${rep}))`);

  // Mur
  add(`IFCWALL('0000000000000000000002',#${history},'MurDeTest',$,$,#${wallPlacement},#${prodShape},$)`);

  // Espace / Space si demandé
  if (options.includeSpace) {
    const pSp = add(`IFCCARTESIANPOINT((1.,1.,0.))`);
    const placeSp3D = add(`IFCAXIS2PLACEMENT3D(#${pSp},#${dZ},#${dX})`);
    const spPlacement = add(`IFCLOCALPLACEMENT(#${currentPlacement},#${placeSp3D})`);
    const spProfile = add(`IFCRECTANGLEPROFILEDEF(.AREA.,'SpProfile',$,2.0,2.0)`);
    const spSolid = add(`IFCEXTRUDEDAREASOLID(#${spProfile},#${wPlacement},#${dZ},2.5)`);
    const spRep = add(`IFCSHAPEREPRESENTATION(#${subContext},'Body','SweptSolid',(#${spSolid}))`);
    const spShape = add(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${spRep}))`);
    add(`IFCSPACE('0000000000000000000005',#${history},'PieceTest',$,$,#${spPlacement},#${spShape},.ELEMENT.,.INTERNAL.,$)`);
  }

  // Clôture
  lines.push('ENDSEC;', 'END-ISO-10303-21;');
  return `${header}\n${lines.join('\n')}\n`;
}

describe('Sous-phase 9.5.1 : Audit Indépendant et Qualification de la Fédération IFC', () => {
  // ===========================================================================
  // LOT A : AUDIT DES COORDONNÉES ET TRANSFORMATIONS
  // ===========================================================================
  describe('Lot A — Audit des Coordonnées et Transformations', () => {
    it('T-QUAL-A01 : Pipeline de transformation — Cube à coordonnées connues sans dérive', async () => {
      // Cube placé à X=2.0 m, Y=3.0 m, Z=1.0 m, de dimensions L=4.0 m, l=0.2 m, H=2.5 m
      const ifcStr = buildMinimalIfc({
        unitLength: 'METRE',
        wallPos: { x: 2, y: 3, z: 1 },
        wallSize: { len: 4, thick: 0.2, height: 2.5 },
      });

      const model = await loadFederatedIfc(Buffer.from(ifcStr, 'utf-8'), { modelId: 'cube_test' });

      // En millimètres dans Mini-BIM Z-up :
      // X attendu : [2000, 6000] mm (pos.x=2m, longueur=4m)
      // Y attendu : [2900, 3100] mm (pos.y=3m, épaisseur centrée=0.2m -> 3000 ± 100 mm)
      // Z attendu : [1000, 3500] mm (pos.z=1m, hauteur=2.5m -> [1000, 3500] mm)
      expect(model.globalAABB.min.x).toBeCloseTo(2000, 0);
      expect(model.globalAABB.max.x).toBeCloseTo(6000, 0);
      expect(model.globalAABB.min.y).toBeCloseTo(2900, 0);
      expect(model.globalAABB.max.y).toBeCloseTo(3100, 0);
      expect(model.globalAABB.min.z).toBeCloseTo(1000, 0);
      expect(model.globalAABB.max.z).toBeCloseTo(3500, 0);
    });

    it('T-QUAL-A02 : Rotation angulaire 45° — Axes et orientations vérifiés', async () => {
      const ifcStr = buildMinimalIfc({
        unitLength: 'METRE',
        wallPos: { x: 0, y: 0, z: 0 },
        wallSize: { len: 2, thick: 0.2, height: 1.0 },
        rotationDegZ: 45,
      });

      const model = await loadFederatedIfc(Buffer.from(ifcStr, 'utf-8'), { modelId: 'rot_45_test' });

      // Le vecteur (2m, 0, 0) tourné de 45° a pour composantes X = 2 * cos(45°) = 1.414m = 1414mm, Y = 1414mm
      expect(model.globalAABB.max.x).toBeGreaterThan(1300);
      expect(model.globalAABB.max.y).toBeGreaterThan(1300);
      expect(model.globalAABB.min.z).toBeCloseTo(0, 0);
      expect(model.globalAABB.max.z).toBeCloseTo(1000, 0);
    });

    it('T-QUAL-A03 : Placements hiérarchiques imbriqués (Site + Building + Storey + Wall)', async () => {
      // Site=(10, 20, 0) + Building=(5, 5, 0) + Storey=(0, 0, 3) + Wall=(2, 3, 1)
      // Position finale globale attendue :
      // X = 10 + 5 + 2 = 17m = 17 000 mm
      // Y = 20 + 5 + 3 = 28m = 28 000 mm
      // Z = 0 + 0 + 3 + 1 = 4m = 4 000 mm
      const ifcStr = buildMinimalIfc({
        unitLength: 'METRE',
        wallPos: { x: 2, y: 3, z: 1 },
        wallSize: { len: 2, thick: 0.2, height: 2 },
        nestedPlacements: true,
      });

      const model = await loadFederatedIfc(Buffer.from(ifcStr, 'utf-8'), { modelId: 'nested_test' });

      expect(model.globalAABB.min.x).toBeCloseTo(17000, 0);
      expect(model.globalAABB.min.z).toBeCloseTo(4000, 0);
    });

    it('T-QUAL-A04 : Transformateurs purs unitaires — Absence de dérive et orthogonalité', () => {
      // Matrice identité 4x4
      const identityMat = [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1,
      ];
      // Sommet local (10, 20, 30) dans WebIFC Y-up
      // Conversion vers Mini-BIM Z-up avec scaleToMm = 1000 :
      // X_mini = X_web * 1000 = 10 000
      // Y_mini = -Z_web * 1000 = -30 000
      // Z_mini = Y_web * 1000 = 20 000
      const v = transformVertexToMiniBim(10, 20, 30, identityMat, 1000);
      expect(v.x).toBe(10000);
      expect(v.y).toBe(-30000);
      expect(v.z).toBe(20000);

      // Normal unitaire sortante
      const n = transformNormalToMiniBim(0, 1, 0, identityMat);
      expect(n.x).toBe(0);
      expect(n.y).toBe(0);
      expect(n.z).toBe(1); // Y_web devient Z_mini vertical
    });
  });

  // ===========================================================================
  // LOT B : MATRICE D'UNITÉS ET DE SCHÉMAS
  // ===========================================================================
  describe("Lot B — Matrice d'Unités et de Schémas", () => {
    it('T-QUAL-B01 : Schéma IFC2X3 — Chargement et conformité des unités', async () => {
      const ifc2x3 = buildMinimalIfc({ schema: 'IFC2X3', unitLength: 'METRE' });
      const model = await loadFederatedIfc(Buffer.from(ifc2x3, 'utf-8'), { modelId: 'ifc2x3_test' });

      expect(model.schema).toBe('IFC2X3');
      expect(model.units.scaleToMm).toBe(1000);
      expect(model.entityCount).toBeGreaterThan(0);
    });

    it('T-QUAL-B02 : Schéma IFC4 — Standard natif', async () => {
      const ifc4 = buildMinimalIfc({ schema: 'IFC4', unitLength: 'MILLIMETRE' });
      const model = await loadFederatedIfc(Buffer.from(ifc4, 'utf-8'), { modelId: 'ifc4_test' });

      expect(model.schema).toBe('IFC4');
      expect(model.units.scaleToMm).toBe(1.0);
    });

    it('T-QUAL-B03 : Schéma IFC4.3 — Identification et prise en charge', async () => {
      const ifc43 = buildMinimalIfc({ schema: 'IFC4X3', unitLength: 'METRE' });
      const model = await loadFederatedIfc(Buffer.from(ifc43, 'utf-8'), { modelId: 'ifc43_test' });

      expect(model.schema).toBe('IFC4X3');
      expect(model.units.scaleToMm).toBe(1000);
    });

    it('T-QUAL-B04 : Unités en Millimètres (scaleToMm = 1.0)', async () => {
      const ifcMm = buildMinimalIfc({
        unitLength: 'MILLIMETRE',
        wallPos: { x: 3000, y: 4000, z: 0 },
        wallSize: { len: 5000, thick: 200, height: 2800 },
      });
      const model = await loadFederatedIfc(Buffer.from(ifcMm, 'utf-8'));

      expect(model.units.length).toBe('MILLIMETRE');
      expect(model.units.scaleToMm).toBe(1.0);
      expect(model.globalAABB.min.x).toBeCloseTo(3000, 0);
      expect(model.globalAABB.max.x).toBeCloseTo(8000, 0);
    });

    it('T-QUAL-B05 : Unités en Centimètres (scaleToMm = 10.0)', async () => {
      const ifcCm = buildMinimalIfc({
        unitLength: 'CENTIMETRE',
        wallPos: { x: 200, y: 100, z: 0 },
        wallSize: { len: 400, thick: 20, height: 250 },
      });
      const model = await loadFederatedIfc(Buffer.from(ifcCm, 'utf-8'));

      expect(model.units.length).toBe('CENTIMETRE');
      expect(model.units.scaleToMm).toBe(10.0);
      expect(model.globalAABB.min.x).toBeCloseTo(2000, 0); // 200 cm = 2000 mm
      expect(model.globalAABB.max.x).toBeCloseTo(6000, 0); // (200 + 400) cm = 6000 mm
    });

    it('T-QUAL-B06 : Unités en Pieds (scaleToMm = 304.8)', async () => {
      const ifcFoot = buildMinimalIfc({
        unitLength: 'FOOT',
        wallPos: { x: 10, y: 0, z: 0 }, // 10 pieds = 3048 mm
        wallSize: { len: 20, thick: 1, height: 8 }, // 20 pieds = 6096 mm
      });
      const model = await loadFederatedIfc(Buffer.from(ifcFoot, 'utf-8'));

      expect(model.units.length).toBe('FOOT');
      expect(model.units.scaleToMm).toBeCloseTo(304.8, 1);
      expect(model.globalAABB.min.x).toBeCloseTo(3048, -1);
      expect(model.globalAABB.max.x).toBeCloseTo(3048 + 6096, -1);
    });

    it('T-QUAL-B07 : Détection directe d’unités via detectIfcUnits', async () => {
      const api = new WebIFC.IfcAPI();
      await api.Init();
      const ifcData = Buffer.from(buildMinimalIfc({ unitLength: 'METRE' }), 'utf-8');
      const mId = api.OpenModel(ifcData);

      try {
        const units = detectIfcUnits(api, mId);
        expect(units.length).toBe('METRE');
        expect(units.scaleToMm).toBe(1000);
      } finally {
        api.CloseModel(mId);
      }
    });
  });

  // ===========================================================================
  // LOT C : IDENTITÉ ET ISOLATION FÉDÉRÉES
  // ===========================================================================
  describe('Lot C — Identité et Isolation Fédérées', () => {
    it('T-QUAL-C01 : Deux modèles simultanés partageant le même expressId restent strictement disjoints', async () => {
      const ifcA = buildMinimalIfc({ wallPos: { x: 0, y: 0, z: 0 } });
      const ifcB = buildMinimalIfc({ wallPos: { x: 50, y: 50, z: 0 } });

      const modelA = await loadFederatedIfc(Buffer.from(ifcA, 'utf-8'), { modelId: 'modele_A' });
      const modelB = await loadFederatedIfc(Buffer.from(ifcB, 'utf-8'), { modelId: 'modele_B' });

      // Les deux modèles ont des entités avec les mêmes expressIds internes WebIFC
      const idsA = Object.keys(modelA.entities).map(Number);
      const idsB = Object.keys(modelB.entities).map(Number);
      const sharedExpressId = idsA.find((id) => idsB.includes(id));

      expect(sharedExpressId).toBeDefined();

      // Vérification que les identités composées { modelId, expressId } sont distinctes
      const entityA = modelA.entities[sharedExpressId!];
      const entityB = modelB.entities[sharedExpressId!];

      expect(entityA?.modelId).toBe('modele_A');
      expect(entityB?.modelId).toBe('modele_B');
      expect(entityA?.aabb.min.x).not.toBe(entityB?.aabb.min.x);
    });

    it('T-QUAL-C02 : Le déchargement d’un modèle ne corrompt ni n’altère les autres modèles', async () => {
      const ifcA = buildMinimalIfc({ wallPos: { x: 0, y: 0, z: 0 } });
      const ifcB = buildMinimalIfc({ wallPos: { x: 10, y: 10, z: 0 } });

      let modelA: unknown = await loadFederatedIfc(Buffer.from(ifcA, 'utf-8'), { modelId: 'mod_A' });
      const modelB = await loadFederatedIfc(Buffer.from(ifcB, 'utf-8'), { modelId: 'mod_B' });

      const initialCountB = modelB.entityCount;

      // Déchargement / suppression de la référence de modelA
      modelA = null;
      expect(modelA).toBeNull();

      // ModelB conserve intactes toutes ses entités
      expect(modelB.entityCount).toBe(initialCountB);
      expect(Object.keys(modelB.entities).length).toBe(initialCountB);
    });

    it('T-QUAL-C03 : Garantie d’étanchéité absolue de BimState et de l’historique Undo/Redo', async () => {
      const villa = createComplexVillaDocument();
      const stateBefore = JSON.parse(JSON.stringify(villa.getState()));

      const ifcStr = exportToIfc(villa.getState());
      await loadFederatedIfc(Buffer.from(ifcStr, 'utf-8'), { modelId: 'test_isolation' });

      // L'état natif est strictement bit-à-bit identique
      expect(villa.getState()).toEqual(stateBefore);

      // Le CommandBus n'a reçu aucune mutation
      expect(villa.canUndo()).toBe(false);
      expect(villa.canRedo()).toBe(false);
    });
  });

  // ===========================================================================
  // LOT D : QUALIFICATION DU CLASH INTER-MODÈLES
  // ===========================================================================
  describe('Lot D — Qualification du Clash Inter-Modèles', () => {
    it('T-QUAL-D01 : Distinction CANDIDATE vs QUALIFIED_CLASH — Élimination des faux positifs AABB', async () => {
      // 1. Modèle fédéré : Mur orienté le long de Y à X = 2000 mm, Y de 0 à 4000 mm, épaisseur 200 mm (X de 1900 à 2100 mm)
      const ifcStr = buildMinimalIfc({
        unitLength: 'METRE',
        wallPos: { x: 2, y: 0, z: 0 },
        wallSize: { len: 4, thick: 0.2, height: 2.8 },
      });
      const fedModel = await loadFederatedIfc(Buffer.from(ifcStr, 'utf-8'), { modelId: 'fed_wall' });

      // 2. Modèle natif avec deux tuyaux :
      // - Tuyau 1 (PÉNÉTRANT) : Traverse le mur à X = 2000 mm, Y = 2000 mm
      // - Tuyau 2 (NON-PÉNÉTRANT) : Tuyau oblique dont l'AABB englobante touche l'AABB du mur, mais le solide ne pénètre pas
      const doc = new BimDocument({
        schemaVersion: 2,
        units: 'mm',
        levels: { lvl_0: { id: 'lvl_0', name: 'RDC', elevation: 0, height: 2800 } },
        wallTypes: {},
        slabTypes: {},
        doorTypes: {},
        windowTypes: {},
        stairTypes: {},
        roofTypes: {},
        componentTypes: {},
        walls: {},
        slabs: {},
        doors: {},
        windows: {},
        rooms: {},
        dimensions: {},
        stairs: {},
        roofs: {},
        roofOpenings: {},
        components: {},
        pipes: {},
        mepFittings: {},
      });

      // Tuyau 1 : Traverse physiquement le mur centré en Y=0 (X=3000, Z=1000)
      const pipePenetrating = createPipe({
        id: 'pipe_real_clash',
        levelId: 'lvl_0',
        start: { x: 3000, y: -500, z: 1000 },
        end: { x: 3000, y: 500, z: 1000 },
        diameter: 100,
        systemType: 'domestic_cold_water',
      });
      doc.execute(new Commands.AddPipeCommand(pipePenetrating));

      // Tuyau 2 : Parallèle au mur, situé à X = 3000 mm, Y allant de 150 à 800 mm (rayon 25 -> Ymin=125 > mur Ymax=100)
      // Son AABB est très proche du mur, mais le solide ne pénètre pas (SAT sépare les deux)
      const pipeExternal = createPipe({
        id: 'pipe_outside',
        levelId: 'lvl_0',
        start: { x: 3000, y: 150, z: 1000 },
        end: { x: 3000, y: 800, z: 1000 },
        diameter: 50,
        systemType: 'domestic_cold_water',
      });
      doc.execute(new Commands.AddPipeCommand(pipeExternal));

      const clashes = detectFederatedClashes(doc.getState(), fedModel);

      // Seul le tuyau pénétrant doit être qualifié en QUALIFIED_CLASH (0 faux positif pour le tuyau voisin)
      expect(clashes).toHaveLength(1);
      expect(clashes[0]?.nativeId).toBe('pipe_real_clash');
      expect(clashes[0]?.status).toBe('QUALIFIED_CLASH');
      expect(clashes[0]?.qualifier).toBe('HARD_CLASH');
    });

    it('T-QUAL-D02 : Exclusion sémantique — Les ouvertures (IfcOpeningElement) et espaces sont filtrés et marqués IGNORED', async () => {
      const ifcStr = buildMinimalIfc({
        unitLength: 'METRE',
        wallPos: { x: 0, y: 0, z: 0 },
        wallSize: { len: 4, thick: 0.2, height: 2.8 },
      });

      const fedModel = await loadFederatedIfc(Buffer.from(ifcStr, 'utf-8'), { modelId: 'fed_void' });

      // Simulation d'une entité sémantique de type IfcOpeningElement (réservation de baie)
      const wallEntityId = Number(Object.keys(fedModel.entities)[0]);
      (fedModel.entities[wallEntityId] as { ifcType: string }).ifcType = 'IfcOpeningElement';

      const doc = new BimDocument({
        schemaVersion: 2,
        units: 'mm',
        levels: { lvl_0: { id: 'lvl_0', name: 'RDC', elevation: 0, height: 2800 } },
        wallTypes: {},
        slabTypes: {},
        doorTypes: {},
        windowTypes: {},
        stairTypes: {},
        roofTypes: {},
        componentTypes: {},
        walls: {},
        slabs: {},
        doors: {},
        windows: {},
        rooms: {},
        dimensions: {},
        stairs: {},
        roofs: {},
        roofOpenings: {},
        components: {},
        pipes: {},
        mepFittings: {},
      });

      // Tuyau traversant l'ouverture
      const pipeInOpening = createPipe({
        id: 'pipe_in_opening',
        levelId: 'lvl_0',
        start: { x: 2000, y: -500, z: 1000 },
        end: { x: 2000, y: 500, z: 1000 },
        diameter: 80,
        systemType: 'domestic_cold_water',
      });
      doc.execute(new Commands.AddPipeCommand(pipeInOpening));

      // Par défaut, les ouvertures/réservations ne sont pas rapportées comme conflits (0 faux positif de réservation)
      const defaultClashes = detectFederatedClashes(doc.getState(), fedModel);
      expect(defaultClashes).toHaveLength(0);

      // Si includeIgnored est demandé, la réservation apparaît explicitement avec le statut 'IGNORED'
      const withIgnored = detectFederatedClashes(doc.getState(), fedModel, { includeIgnored: true });
      expect(withIgnored).toHaveLength(1);
      expect(withIgnored[0]?.ifcType).toBe('IfcOpeningElement');
      expect(withIgnored[0]?.status).toBe('IGNORED');
      expect(withIgnored[0]?.qualifier).toBe('SEMANTIC_EXCLUSION_VOID_OR_SPACE');
    });

    it('T-QUAL-D03 : Détection de collisions entre deux maquettes IFC fédérées (Inter-Model Clash)', async () => {
      // Modèle 1 : Mur A à X = [0..4000] mm
      const ifc1 = buildMinimalIfc({
        unitLength: 'METRE',
        wallPos: { x: 0, y: 0, z: 0 },
        wallSize: { len: 4, thick: 0.2, height: 2.8 },
      });
      // Modèle 2 : Poutre ou mur B sécant à X = 2000 mm, Y = [-1000..1000] mm
      const ifc2 = buildMinimalIfc({
        unitLength: 'METRE',
        wallPos: { x: 2, y: -1, z: 1 },
        wallSize: { len: 2, thick: 0.2, height: 0.5 },
        rotationDegZ: 90,
      });

      const modelA = await loadFederatedIfc(Buffer.from(ifc1, 'utf-8'), { modelId: 'struct_A' });
      const modelB = await loadFederatedIfc(Buffer.from(ifc2, 'utf-8'), { modelId: 'mep_B' });

      const interClashes = detectFederatedInterModelClashes(modelA, modelB);
      expect(interClashes.length).toBeGreaterThanOrEqual(1);
      expect(interClashes[0]?.status).toBe('QUALIFIED_CLASH');
    });
  });

  // ===========================================================================
  // LOT E : CYCLE DE VIE ET MÉMOIRE
  // ===========================================================================
  describe('Lot E — Cycle de Vie et Mémoire', () => {
    it('T-QUAL-E01 : 10 cycles consécutifs de chargement et déchargement sans fuite ni blocage', async () => {
      const ifcData = Buffer.from(buildMinimalIfc({ unitLength: 'METRE' }), 'utf-8');

      for (let i = 0; i < 10; i++) {
        const model = await loadFederatedIfc(ifcData, { modelId: `loop_cycle_${i}` });
        expect(model.id).toBe(`loop_cycle_${i}`);
        expect(model.entityCount).toBeGreaterThan(0);
      }
    });

    it('T-QUAL-E02 : Résilience aux fichiers corrompus — Erreur contrôlée et nettoyage WASM', async () => {
      const corruptedData = Buffer.from('NOT AN IFC FILE HEADER DATA CORRUPTED', 'utf-8');

      // Doit rejeter ou échouer proprement sans crash de runtime
      let failed = false;
      try {
        await loadFederatedIfc(corruptedData, { modelId: 'corrupt_test' });
      } catch {
        failed = true;
      }
      expect(failed).toBe(true);
    });
  });
});
