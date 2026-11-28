import { describe, it, expect } from 'vitest';
import type { MepAssembly3D, MepInstancePrototypeKey } from './assembly-types.js';
import { createPipeAssembly3D } from './pipes.js';
import { createDuctAssembly3D } from './ducts.js';
import { createCableTrayAssembly3D } from './cable-trays.js';
import { createMepFittingAssembly3D } from './fittings-assembly.js';
import { createMepEquipmentAssembly3D } from './equipment-assembly.js';
import { createMepAssembly3D, generateMepAssemblies } from './dispatcher.js';

function assertAssemblyValid(assembly: MepAssembly3D): void {
  expect(assembly.parts.length).toBeGreaterThan(0);

  for (const part of assembly.parts) {
    const raw = part.rawData;
    const vCount = raw.positions.length / 3;
    expect(vCount).toBeGreaterThan(0);
    expect(raw.normals.length).toBe(raw.positions.length);
    expect(raw.uvs?.length).toBe(vCount * 2);
    expect(raw.indices.length).toBeGreaterThan(0);
    expect(raw.indices.length % 3).toBe(0);

    for (let i = 0; i < raw.positions.length; i++) {
      expect(Number.isFinite(raw.positions[i])).toBe(true);
    }
    for (let i = 0; i < raw.normals.length; i++) {
      expect(Number.isFinite(raw.normals[i])).toBe(true);
    }
    for (let i = 0; i < (raw.uvs?.length ?? 0); i++) {
      expect(Number.isFinite(raw.uvs?.[i])).toBe(true);
    }
    for (let i = 0; i < raw.indices.length; i++) {
      expect(raw.indices[i]).toBeLessThan(vCount);
    }
  }

  for (const inst of assembly.instances) {
    expect(inst.matrix).toHaveLength(16);
    for (const val of inst.matrix) {
      expect(Number.isFinite(val)).toBe(true);
    }
  }
}

function totalTriangles(assembly: MepAssembly3D): number {
  return assembly.parts.reduce((acc, part) => acc + part.rawData.indices.length / 3, 0);
}

describe('Générateurs procéduraux MepAssembly3D LOD 350 (Lot 2)', () => {
  it('génère tuyaux horizontaux (cuivre/PVC, bagues, brides PN16, colliers + tiges) et protège les colonnes verticales', () => {
    const horizPipe = createPipeAssembly3D({
      id: 'pipe_horiz_ef',
      start: { x: 0, y: 0, z: 2400 },
      end: { x: 3600, y: 0, z: 2400 },
      diameter: 80,
      domain: 'plumbing',
      systemType: 'domestic_cold_water',
    });
    assertAssemblyValid(horizPipe);
    const rolesH = new Set(horizPipe.parts.map((p) => p.materialRole));
    expect(rolesH.has('copper_brushed')).toBe(true);
    expect(rolesH.has('fluid_accent')).toBe(true);
    expect(rolesH.has('zinc_hardware')).toBe(true);
    expect(rolesH.has('epdm_rubber')).toBe(true);
    expect(horizPipe.instances.some((i) => i.prototypeKey === 'pipe_clamp')).toBe(true);
    expect(horizPipe.instances.some((i) => i.prototypeKey === 'threaded_rod')).toBe(true);
    expect(horizPipe.instances.some((i) => i.prototypeKey === 'bolt_m10')).toBe(true);

    // Colonne montante strictement verticale (dir = (0,0,+1)) : aucun gimbal lock, zéro threaded_rod
    const riserEu = createPipeAssembly3D({
      id: 'sys_eu_riser_1',
      start: { x: -2500, y: 600, z: 2200 },
      end: { x: -2500, y: 600, z: 5200 },
      diameter: 100,
      domain: 'plumbing',
      systemType: 'drainage_waste',
    });
    assertAssemblyValid(riserEu);
    expect(riserEu.parts.some((p) => p.materialRole === 'pvc_matte')).toBe(true);
    expect(riserEu.instances.some((i) => i.prototypeKey === 'pipe_clamp')).toBe(true);
    expect(riserEu.instances.some((i) => i.prototypeKey === 'threaded_rod')).toBe(false);

    // Tronçon court L < 150 mm sans chevauchement ni NaN
    const shortPipe = createPipeAssembly3D({
      id: 'pipe_short',
      start: { x: 0, y: 0, z: 0 },
      end: { x: 90, y: 0, z: 0 },
      diameter: 32,
      systemType: 'domestic_hot_water',
    });
    assertAssemblyValid(shortPipe);
    expect(shortPipe.instances).toHaveLength(0);
  });

  it('génère gaines CVC rectangulaires/circulaires et grilles de soufflage à ailettes instanciées', () => {
    const rectDuct = createDuctAssembly3D({
      id: 'duct_rect_1',
      start: { x: 0, y: 0, z: 2600 },
      end: { x: 3000, y: 0, z: 2600 },
      shape: 'rectangular',
      width: 450,
      height: 250,
      domain: 'hvac',
      systemType: 'supply_air',
    });
    assertAssemblyValid(rectDuct);
    expect(rectDuct.parts.some((p) => p.materialRole === 'galvanized_steel')).toBe(true);
    expect(rectDuct.parts.some((p) => p.materialRole === 'epdm_rubber')).toBe(true);
    expect(rectDuct.instances.some((i) => i.prototypeKey === 'flange_corner')).toBe(true);
    expect(rectDuct.instances.some((i) => i.prototypeKey === 'bolt_m10')).toBe(true);
    expect(rectDuct.instances.some((i) => i.prototypeKey === 'threaded_rod')).toBe(true);

    const roundVmcRiser = createDuctAssembly3D({
      id: 'duct_vmc_vert',
      start: { x: 1000, y: 1000, z: 0 },
      end: { x: 1000, y: 1000, z: 3000 },
      shape: 'round',
      diameter: 250,
      domain: 'hvac',
      systemType: 'exhaust_air',
    });
    assertAssemblyValid(roundVmcRiser);
    expect(roundVmcRiser.instances.some((i) => i.prototypeKey === 'threaded_rod')).toBe(false);

    const diffuser = createMepEquipmentAssembly3D({
      id: 'diff_1',
      family: 'air_diffuser',
      position: { x: 500, y: 500, z: 2700 },
      width: 600,
      depth: 200,
      height: 200,
    });
    assertAssemblyValid(diffuser);
    expect(diffuser.parts.some((p) => p.materialRole === 'anodized_alu')).toBe(true);
    expect(diffuser.parts.some((p) => p.materialRole === 'galvanized_steel')).toBe(true);
    expect(diffuser.instances.some((i) => i.prototypeKey === 'diffuser_blade')).toBe(true);
  });

  it('génère raccords circulaires segmentés, rectangulaires et réductions excentriques flat_top / flat_bottom', () => {
    const segElbow = createMepFittingAssembly3D({
      id: 'fit_hvac_elbow',
      fittingType: 'elbow',
      position: { x: 0, y: 0, z: 2500 },
      domain: 'hvac',
      systemType: 'supply_air',
      ports: [
        { id: 'p0', position: { x: -300, y: 0, z: 2500 }, direction: { x: -1, y: 0, z: 0 }, shape: 'round', diameter: 250 },
        { id: 'p1', position: { x: 0, y: 300, z: 2500 }, direction: { x: 0, y: 1, z: 0 }, shape: 'round', diameter: 250 },
      ],
    });
    assertAssemblyValid(segElbow);

    const elecElbow = createMepFittingAssembly3D({
      id: 'fit_elec_elbow',
      fittingType: 'elbow',
      position: { x: 0, y: 0, z: 2500 },
      domain: 'electrical',
      systemType: 'power',
      ports: [
        { id: 'p0', position: { x: -200, y: 0, z: 2500 }, direction: { x: -1, y: 0, z: 0 }, shape: 'rectangular', width: 200, height: 60 },
        { id: 'p1', position: { x: 0, y: 200, z: 2500 }, direction: { x: 0, y: 1, z: 0 }, shape: 'rectangular', width: 200, height: 60 },
      ],
    });
    assertAssemblyValid(elecElbow);
    expect(elecElbow.parts[0]?.materialRole).toBe('galvanized_steel');

    const rectTee = createMepFittingAssembly3D({
      id: 'fit_rect_tee',
      fittingType: 'tee',
      position: { x: 0, y: 0, z: 2500 },
      domain: 'hvac',
      systemType: 'return_air',
      ports: [
        { id: 't0', position: { x: -300, y: 0, z: 2500 }, direction: { x: -1, y: 0, z: 0 }, shape: 'rectangular', width: 400, height: 250 },
        { id: 't1', position: { x: 300, y: 0, z: 2500 }, direction: { x: 1, y: 0, z: 0 }, shape: 'rectangular', width: 400, height: 250 },
        { id: 't2', position: { x: 0, y: 300, z: 2500 }, direction: { x: 0, y: 1, z: 0 }, shape: 'rectangular', width: 250, height: 200 },
      ],
    });
    assertAssemblyValid(rectTee);
    expect(rectTee.instances.some((i) => i.prototypeKey === 'flange_corner')).toBe(true);

    const flatTop = createMepFittingAssembly3D({
      id: 'fit_red_top',
      fittingType: 'transition',
      eccentricAlignment: 'flat_top',
      position: { x: 0, y: 0, z: 2500 },
      domain: 'hvac',
      systemType: 'supply_air',
      ports: [
        { id: 'r0', position: { x: 0, y: 0, z: 2500 }, direction: { x: -1, y: 0, z: 0 }, shape: 'rectangular', width: 400, height: 300 },
        { id: 'r1', position: { x: 300, y: 0, z: 2500 }, direction: { x: 1, y: 0, z: 0 }, shape: 'rectangular', width: 300, height: 150 },
      ],
    });
    const flatBottom = createMepFittingAssembly3D({
      id: 'fit_red_bot',
      fittingType: 'transition',
      eccentricAlignment: 'flat_bottom',
      position: { x: 0, y: 0, z: 2500 },
      domain: 'hvac',
      systemType: 'supply_air',
      ports: [
        { id: 'r0', position: { x: 0, y: 0, z: 2500 }, direction: { x: -1, y: 0, z: 0 }, shape: 'rectangular', width: 400, height: 300 },
        { id: 'r1', position: { x: 300, y: 0, z: 2500 }, direction: { x: 1, y: 0, z: 0 }, shape: 'rectangular', width: 300, height: 150 },
      ],
    });
    assertAssemblyValid(flatTop);
    assertAssemblyValid(flatBottom);
    // flat_top garde l'arase supérieure au même niveau (+150 au lieu de baisser) -> max.z supérieur à flat_bottom
    expect(flatTop.parts[0]?.rawData.boundingBox.max.z).toBeGreaterThan(
      flatBottom.parts[0]?.rawData.boundingBox.max.z ?? 0,
    );
  });

  it('génère vannes (levier <= DN50 vs volant > DN50), clapets, chemins perforés/échelle, boîtes & armoires RAL 7035', () => {
    const smallValve = createMepEquipmentAssembly3D({
      id: 'val_32',
      family: 'valve',
      position: { x: 0, y: 0, z: 1200 },
      width: 140,
      depth: 60,
      height: 110,
      ports: [{ id: 'vp0', position: { x: -70, y: 0, z: 1255 }, direction: { x: -1, y: 0, z: 0 }, diameter: 32, systemType: 'domestic_cold_water' }],
    });
    assertAssemblyValid(smallValve);
    expect(smallValve.parts.some((p) => p.materialRole === 'brass_machined')).toBe(true);
    expect(smallValve.parts.some((p) => p.materialRole === 'fluid_accent')).toBe(true);

    const bigValve = createMepEquipmentAssembly3D({
      id: 'val_100',
      family: 'valve',
      position: { x: 0, y: 0, z: 1200 },
      width: 260,
      depth: 180,
      height: 280,
      ports: [{ id: 'vp1', position: { x: -130, y: 0, z: 1340 }, direction: { x: -1, y: 0, z: 0 }, diameter: 100, systemType: 'domestic_hot_water' }],
    });
    assertAssemblyValid(bigValve);
    expect(bigValve.instances.some((i) => i.prototypeKey === 'bolt_m10')).toBe(true);

    const checkValve = createMepEquipmentAssembly3D({
      id: 'cv_1',
      family: 'check_valve',
      position: { x: 0, y: 0, z: 1200 },
      width: 160,
      depth: 80,
      height: 100,
    });
    assertAssemblyValid(checkValve);
    expect(checkValve.parts.some((p) => p.materialRole === 'brass_machined')).toBe(true);

    const ladderTray = createCableTrayAssembly3D({
      id: 'tray_lad',
      start: { x: 0, y: 0, z: 2500 },
      end: { x: 2400, y: 0, z: 2500 },
      width: 300,
      height: 60,
      style: 'ladder',
    });
    const perfTray = createCableTrayAssembly3D({
      id: 'tray_perf',
      start: { x: 0, y: 500, z: 2500 },
      end: { x: 2400, y: 500, z: 2500 },
      width: 300,
      height: 60,
      style: 'perforated',
    });
    assertAssemblyValid(ladderTray);
    assertAssemblyValid(perfTray);
    expect(ladderTray.instances.some((i) => i.prototypeKey === 'ladder_rung')).toBe(true);
    expect(perfTray.instances.some((i) => i.prototypeKey === 'ladder_rung')).toBe(false);
    expect(perfTray.parts.some((p) => p.materialRole === 'cable_cfo')).toBe(true);
    expect(perfTray.parts.some((p) => p.materialRole === 'cable_cfa')).toBe(true);
    expect(perfTray.parts.some((p) => p.materialRole === 'cable_earth')).toBe(true);

    const jBox = createMepEquipmentAssembly3D({
      id: 'jb_1',
      family: 'junction_box',
      position: { x: 100, y: 100, z: 1500 },
      width: 200,
      depth: 100,
      height: 200,
      ports: [
        { id: 'jp0', position: { x: 0, y: 100, z: 1600 }, direction: { x: -1, y: 0, z: 0 } },
        { id: 'jp1', position: { x: 200, y: 100, z: 1600 }, direction: { x: 1, y: 0, z: 0 } },
      ],
    });
    assertAssemblyValid(jBox);
    expect(jBox.parts.some((p) => p.materialRole === 'steel_ral7035')).toBe(true);
    expect(jBox.instances.some((i) => i.prototypeKey === 'cable_gland')).toBe(true);

    const panel = createMepEquipmentAssembly3D({
      id: 'tgbt_1',
      family: 'electrical_panel',
      position: { x: 0, y: 0, z: 0 },
      width: 800,
      depth: 350,
      height: 1800,
    });
    assertAssemblyValid(panel);
    expect(panel.parts.some((p) => p.materialRole === 'steel_ral7035')).toBe(true);
    expect(panel.parts.some((p) => p.materialRole === 'epdm_rubber')).toBe(true);
    expect(panel.parts.some((p) => p.materialRole === 'anodized_alu')).toBe(true);
    expect(panel.instances.some((i) => i.prototypeKey === 'cabinet_hinge')).toBe(true);
  });

  it('couvre toutes les familles équipements existantes, vérifie les 8 prototypes et réduit le détail en lod200', () => {
    const families = [
      'boiler',
      'heat_pump',
      'water_heater',
      'pump',
      'ahu',
      'fan',
      'radiator',
      'meter',
    ] as const;

    for (const family of families) {
      const asm = createMepEquipmentAssembly3D({
        id: `eq_${family}`,
        family,
        position: { x: 0, y: 0, z: 0 },
        width: 600,
        depth: 500,
        height: 800,
      });
      assertAssemblyValid(asm);
      expect(asm.parts.length).toBeGreaterThanOrEqual(2);
    }

    // Réduction effective entre lod350 et lod200
    const tray350 = createCableTrayAssembly3D(
      { id: 't_lod', start: { x: 0, y: 0, z: 2500 }, end: { x: 3000, y: 0, z: 2500 }, width: 300, height: 60, style: 'ladder' },
      { detailLevel: 'lod350' },
    );
    const tray200 = createCableTrayAssembly3D(
      { id: 't_lod', start: { x: 0, y: 0, z: 2500 }, end: { x: 3000, y: 0, z: 2500 }, width: 300, height: 60, style: 'ladder' },
      { detailLevel: 'lod200' },
    );
    expect(tray350.instances.length).toBeGreaterThan(tray200.instances.length);

    const diff350 = createMepAssembly3D(
      { category: 'mepEquipment', params: { id: 'd_lod', family: 'air_diffuser', position: { x: 0, y: 0, z: 2600 }, width: 600, depth: 200, height: 300 } },
      { detailLevel: 'lod350' },
    );
    const diff200 = createMepAssembly3D(
      { category: 'mepEquipment', params: { id: 'd_lod', family: 'air_diffuser', position: { x: 0, y: 0, z: 2600 }, width: 600, depth: 200, height: 300 } },
      { detailLevel: 'lod200' },
    );
    expect(diff350.instances.length).toBeGreaterThan(diff200.instances.length);
    expect(totalTriangles(diff350)).toBeGreaterThan(0);

    // Vérification dispatcher batch et présence globale des 8 prototypes GPU
    const batch = generateMepAssemblies({
      pipes: { p1: { id: 'p1', start: { x: 0, y: 0, z: 2400 }, end: { x: 3000, y: 0, z: 2400 }, diameter: 100 } },
      ducts: { d1: { id: 'd1', start: { x: 0, y: 500, z: 2600 }, end: { x: 2400, y: 500, z: 2600 }, shape: 'rectangular', width: 400, height: 250 } },
      cableTrays: { c1: { id: 'c1', start: { x: 0, y: 1000, z: 2500 }, end: { x: 2400, y: 1000, z: 2500 }, width: 300, height: 60, style: 'ladder' } },
      mepEquipments: {
        e1: { id: 'e1', family: 'air_diffuser', position: { x: 0, y: 1500, z: 2600 }, width: 500, depth: 200, height: 250 },
        e2: { id: 'e2', family: 'electrical_panel', position: { x: 1000, y: 1500, z: 0 }, width: 600, depth: 300, height: 1500, ports: [{ id: 'ep', position: { x: 1000, y: 1500, z: 1500 }, direction: { x: 0, y: 0, z: 1 } }] },
      },
    });
    const seenProtos = new Set<MepInstancePrototypeKey>();
    for (const asm of batch) {
      assertAssemblyValid(asm);
      for (const inst of asm.instances) {
        seenProtos.add(inst.prototypeKey);
      }
    }
    expect(seenProtos.size).toBe(8);
  });
});
