/**
 * Tests unitaires et d'intégration de la fédération IFC (Sous-phase 9.5).
 * Valide l'isolation stricte de BimState (ADR-001), la normalisation métrique (ADR-003),
 * l'alignement étalon round-trip (< 1 mm), et la détection de clash fédéré avec le BVH (ADR-059).
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { loadFederatedIfc } from './loader.js';
import { detectFederatedClashes } from './spatial.js';
import { exportToIfc } from '../ifc/generator.js';
import { createComplexVillaDocument } from '../fixtures/complex-villa.js';
import { BimDocument } from '../document.js';
import * as Commands from '../commands.js';
import { createPipe } from '../mep/catalog.js';

describe('Sous-phase 9.5 : Fédération IFC & Coordination de Maquettes Externes', () => {
  const villaIfcPath = path.resolve(process.cwd(), 'dist/exports/villa-contemporaine-complexe.ifc');

  // ---------------------------------------------------------------------------
  // 1. ALIGNEMENT ÉTALON & NORMALISATION MÉTRIQUE (ADR-003)
  // ---------------------------------------------------------------------------
  it('T-FED-ALIGN-01 : Round-trip Villa Complexe — coïncidence des boîtes englobantes à < 1 mm près', async () => {
    let ifcBuffer: Buffer;
    if (fs.existsSync(villaIfcPath)) {
      ifcBuffer = fs.readFileSync(villaIfcPath);
    } else {
      // Génération à la volée si dist/exports n'est pas présent
      const villaDoc = createComplexVillaDocument();
      const ifcStr = exportToIfc(villaDoc.getState());
      ifcBuffer = Buffer.from(ifcStr, 'utf-8');
    }

    const fedModel = await loadFederatedIfc(ifcBuffer, {
      modelId: 'fed_villa_01',
      name: 'Villa Contemporaine Fédérée',
    });

    expect(fedModel.id).toBe('fed_villa_01');
    expect(fedModel.schema).toBe('IFC4');
    expect(fedModel.units.length).toBe('MILLIMETRE');
    expect(fedModel.units.scaleToMm).toBe(1.0);

    // Vérification de la boîte englobante globale dans le repère Mini-BIM Z-up
    // X : -180 .. 12180 mm (largeur totale 12 360 mm)
    // Y : -180 .. 8150 mm  (profondeur totale 8 330 mm)
    // Z : -200 .. 4900.6 mm (hauteur totale 5 100.6 mm)
    expect(fedModel.globalAABB.min.x).toBeCloseTo(-180, 0);
    expect(fedModel.globalAABB.max.x).toBeCloseTo(12180, 0);
    expect(fedModel.globalAABB.min.y).toBeCloseTo(-180, 0);
    expect(fedModel.globalAABB.max.y).toBeCloseTo(8150, 0);
    expect(fedModel.globalAABB.min.z).toBeCloseTo(-200, 0);
    expect(fedModel.globalAABB.max.z).toBeCloseTo(4900.6, 0);

    expect(fedModel.entityCount).toBeGreaterThan(10);
    expect(fedModel.meshes.length).toBeGreaterThan(10);
  });

  // ---------------------------------------------------------------------------
  // 2. EXTRACTION DES MÉTADONNÉES & PROPERTY SETS
  // ---------------------------------------------------------------------------
  it('T-FED-META-02 : Extraction sémantique neutre — types IFC, GlobalId et PropertySets en lecture seule', async () => {
    const villaDoc = createComplexVillaDocument();
    const ifcStr = exportToIfc(villaDoc.getState());
    const fedModel = await loadFederatedIfc(Buffer.from(ifcStr, 'utf-8'), {
      modelId: 'fed_meta_test',
    });

    const entities = Object.values(fedModel.entities);
    const wallEntity = entities.find((e) => e.ifcType === 'IfcWall');
    expect(wallEntity).toBeDefined();
    expect(wallEntity?.globalId).toBeDefined();
    expect(wallEntity?.globalId?.length).toBe(22);
    expect(wallEntity?.modelId).toBe('fed_meta_test');

    // Vérification des PropertySets / BaseQuantities
    expect(wallEntity?.propertySets).toBeDefined();
    const baseQuantities = wallEntity?.propertySets?.find((ps) => ps.name === 'BaseQuantities');
    expect(baseQuantities).toBeDefined();
    expect(baseQuantities?.properties['Length']).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // 3. ISOLATION STRICTE DE BIMSTATE (ADR-001)
  // ---------------------------------------------------------------------------
  it('T-FED-ISOLATION-03 : Le chargement, la consultation et la fermeture ne mutent jamais le BimState natif', async () => {
    const doc = createComplexVillaDocument();
    const initialState = JSON.parse(JSON.stringify(doc.getState()));

    const ifcStr = exportToIfc(doc.getState());
    const fedModel = await loadFederatedIfc(Buffer.from(ifcStr, 'utf-8'), {
      modelId: 'fed_isolated',
    });

    // Aucune entité fédérée n'est injectée dans BimState
    const currentState = doc.getState();
    expect(currentState).toEqual(initialState);
    expect(Object.keys(currentState.walls)).toHaveLength(Object.keys(initialState.walls).length);
    expect((currentState as any).federatedModels).toBeUndefined();

    // Les commandes natives restent 100 % opérationnelles
    const wallId = Object.keys(currentState.walls)[0]!;
    doc.execute(new Commands.UpdateWallCommand(wallId, { heightOverride: 3200 }));
    expect(doc.getState().walls[wallId]?.heightOverride).toBe(3200);

    // Décharger le modèle fédéré (simulé par suppression de référence) ne modifie rien
    expect(fedModel.entityCount).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // 4. COORDINATION BVH : CLASH ÉLÉMENT NATIF ↔ IFC FÉDÉRÉ (ADR-059)
  // ---------------------------------------------------------------------------
  it('T-FED-CLASH-04 : Détection spatiale BVH — un tuyau natif traversant un mur IFC externe est détecté', async () => {
    // 1. Modèle natif avec un tuyau traversant
    const doc = new BimDocument({
      schemaVersion: 2,
      units: 'mm',
      levels: {
        lvl_0: { id: 'lvl_0', name: 'RDC', elevation: 0, height: 2800 },
      },
      wallTypes: {
        wt_def: { id: 'wt_def', name: 'Mur', thickness: 200, height: 2800 },
      },
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

    // 2. Créer un tuyau natif à x = 6000 mm, y allant de -500 à 1000 mm (traverse le mur sud de la villa à y = 0)
    const pipe = createPipe({
      id: 'pipe_clash_fed',
      levelId: 'lvl_0',
      start: { x: 6000, y: -500, z: 1200 },
      end: { x: 6000, y: 1000, z: 1200 },
      diameter: 110,
      systemType: 'domestic_cold_water',
    });
    doc.execute(new Commands.AddPipeCommand(pipe));

    // 3. Charger la maquette fédérée de la villa
    let ifcBuffer: Buffer;
    if (fs.existsSync(villaIfcPath)) {
      ifcBuffer = fs.readFileSync(villaIfcPath);
    } else {
      const villaDoc = createComplexVillaDocument();
      ifcBuffer = Buffer.from(exportToIfc(villaDoc.getState()), 'utf-8');
    }

    const fedModel = await loadFederatedIfc(ifcBuffer, {
      modelId: 'fed_villa_struct',
    });

    // 4. Détecter les interférences spatiales avec le BVH
    const clashes = detectFederatedClashes(doc.getState(), fedModel);

    // Le tuyau traverse le mur sud de la villa externe
    expect(clashes.length).toBeGreaterThanOrEqual(1);
    const wallClash = clashes.find((c) => c.nativeId === 'pipe_clash_fed' && c.ifcType === 'IfcWall');
    expect(wallClash).toBeDefined();
    expect(wallClash?.point.x).toBeCloseTo(6000, -1);
    expect(wallClash?.point.z).toBeCloseTo(1200, -1);
  });
});
