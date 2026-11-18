import { describe, it, expect } from 'vitest';
import { createComplexVillaState, createComplexVillaDocument } from './fixtures/complex-villa.js';
import { resolveWallGeometry } from './walls/resolve.js';
import { solveWallJunctions } from '@mini-bim/geometry';
import { detectRooms } from './rooms/detect.js';
import { exportToIfc } from './ifc/generator.js';
import { computeLevelMetrics } from './metrics.js';
import * as WebIFC from 'web-ifc';

describe('Banc d’Épreuve — « Villa Contemporaine Complexe » (Chantier 7.5-A)', () => {
  const state = createComplexVillaState();

  it('T-VILLA-01 : État architectural complet et intégrité structurelle du document', () => {
    const doc = createComplexVillaDocument();
    const docState = doc.getState();

    // 11 murs (7 extérieurs + 1 refend + 3 cloisons)
    expect(Object.keys(docState.walls)).toHaveLength(11);
    // 4 portes et 2 fenêtres
    expect(Object.keys(docState.doors)).toHaveLength(4);
    expect(Object.keys(docState.windows)).toHaveLength(2);
    // 2 dalles, 1 escalier, 1 toiture
    expect(Object.keys(docState.slabs)).toHaveLength(2);
    expect(Object.keys(docState.stairs ?? {})).toHaveLength(1);
    expect(Object.keys(docState.roofs ?? {})).toHaveLength(1);
    // 5 pièces
    expect(Object.keys(docState.rooms)).toHaveLength(5);
  });

  it('T-VILLA-02 : Résolution altimétrique et biseautage du mur pignon ouest sous toiture', () => {
    const pignonWall = state.walls['w_ext_west_gable']!;
    const resolved = resolveWallGeometry(pignonWall, state);

    expect(resolved.wallHeightSource).toBe('roof');
    // Le mur pignon traverse le faîtage à y = 3000 mm -> profil en chevron à 3 points
    expect(resolved.topProfile).toHaveLength(3);
    const peakPt = resolved.topProfile[1]!;
    expect(peakPt.x).toBeCloseTo(3000, 1); // faîtage à 3000 mm du départ (0, 6000) -> (0, 0)
    // Altitude faîtage attendue : 2800 + 3000 * tan(35°) = 2800 + 2100.61 = 4900.61 mm
    expect(peakPt.y).toBeGreaterThan(4500);
    expect(resolved.zTop).toBeCloseTo(peakPt.y, 1);
  });

  it('T-VILLA-03 : Résolution des jonctions mixtes (300mm / 200mm / 70mm) et angles obliques (45° / 135°)', () => {
    // Extraire tous les murs du RDC pour le solveur géométrique
    const wallInputs = Object.values(state.walls).map((w) => {
      const type = state.wallTypes[w.typeId]!;
      return {
        id: w.id,
        start: w.start,
        end: w.end,
        thickness: type.thickness,
        locationLine: 'center' as const,
      };
    });

    const solution = solveWallJunctions(wallInputs);

    // Tous les murs doivent recevoir un polygone fermé valide
    expect(solution.walls).toHaveLength(wallInputs.length);
    for (const rw of solution.walls) {
      expect(rw.polygon.length).toBeGreaterThanOrEqual(4);
    }
  });

  it('T-VILLA-04 : Détection automatique des pièces sur plan complexe (décrochés et aile oblique)', () => {
    const detected = detectRooms(state, 'lvl_0');

    // Des pièces doivent être détectées
    expect(detected.length).toBeGreaterThanOrEqual(3);

    // Toutes les pièces détectées doivent avoir une surface strictement positive
    for (const r of detected) {
      expect(r.areaMm2).toBeGreaterThan(0);
      expect(r.perimeterMm).toBeGreaterThan(0);
      expect(r.polygon.length).toBeGreaterThanOrEqual(4);
    }
  });

  it('T-VILLA-05 : Métrés quantitatifs complets du RDC (surfaces, linéaires, volumes)', () => {
    const metrics = computeLevelMetrics(state, 'lvl_0');

    expect(metrics.walls).toHaveLength(11);
    expect(metrics.totals.wallLinearM).toBeGreaterThan(40); // > 40 mètres linéaires de murs
    expect(metrics.totals.wallVolumeM3).toBeGreaterThan(20); // > 20 m³ de maçonnerie
    expect(metrics.totals.doorCount).toBe(4);
    expect(metrics.totals.windowCount).toBe(2);
    expect(metrics.totals.roomAreaM2).toBeGreaterThan(30); // surface habitable RDC
  });

  it('T-VILLA-06 : Validation structurelle web-ifc de l’export IFC4 de la Villa Complexe', async () => {
    const ifcContent = exportToIfc(state, {
      projectName: 'Villa Contemporaine Complexe',
      author: 'Mini-BIM Stress Engine',
    });

    expect(ifcContent).toContain('IFCPROJECT(');
    expect(ifcContent).toContain('GableWallProfile'); // Le pignon biseauté en chevron
    expect(ifcContent).toContain('WallProfile');      // Les murs classiques
    expect(ifcContent).toContain('IFCROOF(');
    expect(ifcContent).toContain('IFCSLAB(');
    expect(ifcContent).toContain('IFCSTAIR(');
    expect(ifcContent).toContain('IFCDOOR(');
    expect(ifcContent).toContain('IFCWINDOW(');

    // Vérification de parsing avec le moteur C++ compilé en WASM de web-ifc
    const ifcApi = new WebIFC.IfcAPI();
    await ifcApi.Init();
    const modelId = ifcApi.OpenModel(new TextEncoder().encode(ifcContent));

    const walls = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCWALL);
    expect(walls.size()).toBe(11);

    const doors = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCDOOR);
    expect(doors.size()).toBe(4);

    const windows = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCWINDOW);
    expect(windows.size()).toBe(2);

    const slabs = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCSLAB);
    // 2 dalles plancher + 2 versants de toiture agrégés en IFCSLAB (.ROOF.) = 4 dalles
    expect(slabs.size()).toBe(4);

    const roofs = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCROOF);
    expect(roofs.size()).toBe(1);

    const stairs = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCSTAIR);
    expect(stairs.size()).toBe(1);

    ifcApi.CloseModel(modelId);
  });
});
