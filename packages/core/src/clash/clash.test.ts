import { describe, it, expect } from 'vitest';
import { detectClashes } from './engine.js';
import type { BimState, Wall, Slab, Door } from '../types.js';
import type { MepFitting, Connector } from '../mep/types.js';
import { createPipe, createDuct } from '../mep/catalog.js';

describe('Moteur de Détection des Conflits Géométriques BIM (Clash Detection Engine)', () => {
  const baseState: BimState = {
    schemaVersion: 2,
    units: 'mm',
    levels: {
      lvl_0: { id: 'lvl_0', name: 'RDC', elevation: 0, height: 2800 },
      lvl_1: { id: 'lvl_1', name: 'R+1', elevation: 3000, height: 2800 },
    },
    wallTypes: {
      wt_200: {
        id: 'wt_200',
        name: 'Mur Béton 200mm',
        thickness: 200,
        height: 2800,
      },
    },
    slabTypes: {
      st_200: {
        id: 'st_200',
        name: 'Dalle Béton 200mm',
        thickness: 200,
      },
    },
    doorTypes: {
      dt_std: {
        id: 'dt_std',
        name: 'Porte 83x204',
        width: 830,
        height: 2040,
      },
    },
    windowTypes: {},
    walls: {},
    doors: {},
    windows: {},
    slabs: {},
    rooms: {},
    dimensions: {},
    stairTypes: {},
    stairs: {},
    roofTypes: {},
    roofs: {},
    roofOpenings: {},
    componentTypes: {},
    components: {},
    pipes: {},
    ducts: {},
    cableTrays: {},
    mepSystems: {},
    mepFittings: {},
    mepEquipments: {},
    mepConnectors: {},
  };

  it('T-CLASH-01 : Détecte un conflit dur (hard clash) entre un tuyau MEP et un mur porteur', () => {
    const wall: Wall = {
      id: 'wall_host',
      category: 'wall',
      typeId: 'wt_200',
      levelId: 'lvl_0',
      start: { x: 0, y: 0 },
      end: { x: 4000, y: 0 },
    };

    // Tuyau traversant le mur à travers son épaisseur Y
    const pipe = createPipe({
      id: 'pipe_clashing',
      levelId: 'lvl_0',
      start: { x: 2000, y: -500, z: 1200 },
      end: { x: 2000, y: 500, z: 1200 },
      diameter: 50,
      systemType: 'domestic_cold_water',
    });

    const state: BimState = {
      ...baseState,
      walls: { wall_host: wall },
      pipes: { pipe_clashing: pipe },
    };

    const clashes = detectClashes(state, { hardToleranceMm: 2.0 });

    expect(clashes).toHaveLength(1);
    const firstClash = clashes[0]!;
    expect(firstClash.severity).toBe('hard');
    expect(firstClash.elementA).toBe('pipe_clashing');
    expect(firstClash.elementB).toBe('wall_host');
    expect(firstClash.categoryA).toBe('pipe');
    expect(firstClash.categoryB).toBe('wall');
    expect(firstClash.disciplineA).toBe('mep');
    expect(firstClash.disciplineB).toBe('structure');
    expect(firstClash.penetrationDepthMm).toBeGreaterThan(20);
    expect(firstClash.point.x).toBeCloseTo(2000, 0);
  });

  it('T-CLASH-02 : Détecte une gaine de ventilation traversant une dalle sans réservation', () => {
    const slab: Slab = {
      id: 'slab_r1',
      category: 'slab',
      slabTypeId: 'st_200',
      levelId: 'lvl_1', // Z = 3000 mm, épaisseur 200 mm -> Z de 2800 à 3000 mm
      boundary: [
        { x: 0, y: 0 },
        { x: 5000, y: 0 },
        { x: 5000, y: 5000 },
        { x: 0, y: 5000 },
      ],
    };

    // Gaine verticale montant de Z=2000 à Z=4000 à travers la dalle pleine
    const duct = createDuct({
      id: 'duct_vertical',
      levelId: 'lvl_0',
      shape: 'rectangular',
      width: 400,
      height: 300,
      start: { x: 2500, y: 2500, z: 2000 },
      end: { x: 2500, y: 2500, z: 4000 },
      systemType: 'supply_air',
    });

    const state: BimState = {
      ...baseState,
      slabs: { slab_r1: slab },
      ducts: { duct_vertical: duct },
    };

    const clashes = detectClashes(state);
    expect(clashes).toHaveLength(1);
    const firstClash = clashes[0]!;
    expect(firstClash.severity).toBe('hard');
    expect(firstClash.categoryA).toBe('duct');
    expect(firstClash.categoryB).toBe('slab');
    expect(firstClash.penetrationDepthMm).toBeGreaterThan(100);
  });

  it('T-CLASH-03 : Exclut 100% des faux positifs légitimes (Connecteur MEP)', () => {
    // Un tuyau raccordé à un raccord coudé via un connecteur MEP physique
    const fitting: MepFitting = {
      id: 'elbow_1',
      category: 'mepFitting',
      levelId: 'lvl_0',
      fittingType: 'elbow',
      domain: 'plumbing',
      systemType: 'domestic_cold_water',
      position: { x: 1000, y: 0, z: 500 },
      ports: [
        {
          id: 'port_fit_1',
          elementId: 'elbow_1',
          domain: 'plumbing',
          systemType: 'domestic_cold_water',
          direction: { x: -1, y: 0, z: 0 },
          position: { x: 950, y: 0, z: 500 },
          shape: 'round',
          diameter: 32,
        },
      ],
    };

    const pipe = createPipe({
      id: 'pipe_1',
      levelId: 'lvl_0',
      start: { x: 0, y: 0, z: 500 },
      end: { x: 950, y: 0, z: 500 },
      diameter: 32,
      systemType: 'domestic_cold_water',
    });

    const connector: Connector = {
      id: 'conn_1',
      category: 'mepConnector',
      portAId: 'port_fit_1',
      portBId: 'pipe_1_end',
    };

    const state: BimState = {
      ...baseState,
      pipes: { pipe_1: pipe },
      mepFittings: { elbow_1: fitting },
      mepConnectors: { conn_1: connector },
    };

    const clashes = detectClashes(state);
    // Le contact entre pipe_1 et elbow_1 est légitime et autorisé -> 0 clash !
    expect(clashes).toHaveLength(0);
  });

  it('T-CLASH-04 : Exclut les ouvertures hébergées dans leur mur hôte (Door / hostWallId)', () => {
    const wall: Wall = {
      id: 'wall_living',
      category: 'wall',
      typeId: 'wt_200',
      levelId: 'lvl_0',
      start: { x: 0, y: 0 },
      end: { x: 5000, y: 0 },
    };

    const door: Door = {
      id: 'door_entry',
      category: 'door',
      doorTypeId: 'dt_std',
      hostWallId: 'wall_living',
      offsetAlong: 1500,
      swing: { side: 'right', direction: 'in' },
    };

    const state: BimState = {
      ...baseState,
      walls: { wall_living: wall },
      doors: { door_entry: door },
    };

    const clashes = detectClashes(state);
    expect(clashes).toHaveLength(0);
  });

  it('T-CLASH-05 : Exclut les jonctions d’angle de murs connectés (L-Junction)', () => {
    const wallA: Wall = {
      id: 'wall_south',
      category: 'wall',
      typeId: 'wt_200',
      levelId: 'lvl_0',
      start: { x: 0, y: 0 },
      end: { x: 4000, y: 0 },
    };
    const wallB: Wall = {
      id: 'wall_east',
      category: 'wall',
      typeId: 'wt_200',
      levelId: 'lvl_0',
      start: { x: 4000, y: 0 }, // Partagé avec l'extrémité de wall_south
      end: { x: 4000, y: 3000 },
    };

    const state: BimState = {
      ...baseState,
      walls: { wall_south: wallA, wall_east: wallB },
    };

    const clashes = detectClashes(state);
    expect(clashes).toHaveLength(0);
  });

  it('T-CLASH-06 : Détecte les violations d’enveloppe de dégagement technique (clearance)', () => {
    const wall: Wall = {
      id: 'wall_tech',
      category: 'wall',
      typeId: 'wt_200',
      levelId: 'lvl_0',
      start: { x: 0, y: 0 },
      end: { x: 4000, y: 0 },
    };

    // Tuyau courant parallèlement au mur à 120 mm de l'axe (soit à 10 mm de la face du mur épaisseur 200mm -> Y face = 100 mm)
    // Distance de séparation physique : 10 mm (donc pas de collision solide > 2 mm, mais < 25 mm de clearance)
    const pipeNearWall = createPipe({
      id: 'pipe_close',
      levelId: 'lvl_0',
      start: { x: 500, y: 120, z: 1000 },
      end: { x: 3500, y: 120, z: 1000 },
      diameter: 20,
      systemType: 'domestic_cold_water',
    });

    const state: BimState = {
      ...baseState,
      walls: { wall_tech: wall },
      pipes: { pipe_close: pipeNearWall },
    };

    // Sans clearance : aucun clash dur
    const hardOnly = detectClashes(state, { checkClearance: false });
    expect(hardOnly).toHaveLength(0);

    // Avec clearance (25 mm) : détecte la violation d'enveloppe
    const withClearance = detectClashes(state, {
      checkClearance: true,
      clearanceDistanceMm: 25.0,
    });
    expect(withClearance).toHaveLength(1);
    const firstClash = withClearance[0]!;
    expect(firstClash.severity).toBe('clearance');
    expect(firstClash.elementA).toBe('pipe_close');
    expect(firstClash.elementB).toBe('wall_tech');
  });

  it('T-CLASH-07 : Garantit le déterminisme absolu des résultats', () => {
    const wall1: Wall = {
      id: 'w_1',
      category: 'wall',
      typeId: 'wt_200',
      levelId: 'lvl_0',
      start: { x: 0, y: 0 },
      end: { x: 5000, y: 0 },
    };
    const pipe1 = createPipe({
      id: 'p_1',
      levelId: 'lvl_0',
      start: { x: 1000, y: -200, z: 1000 },
      end: { x: 1000, y: 200, z: 1000 },
      diameter: 40,
      systemType: 'domestic_cold_water',
    });
    const pipe2 = createPipe({
      id: 'p_2',
      levelId: 'lvl_0',
      start: { x: 3000, y: -200, z: 1000 },
      end: { x: 3000, y: 200, z: 1000 },
      diameter: 40,
      systemType: 'domestic_cold_water',
    });

    const stateA: BimState = {
      ...baseState,
      walls: { w_1: wall1 },
      pipes: { p_1: pipe1, p_2: pipe2 },
    };

    const stateB: BimState = {
      ...baseState,
      walls: { w_1: wall1 },
      pipes: { p_2: pipe2, p_1: pipe1 }, // Ordre inversé
    };

    const resA = detectClashes(stateA);
    const resB = detectClashes(stateB);

    expect(resA.map((c) => c.id)).toEqual(resB.map((c) => c.id));
    expect(resA).toEqual(resB);
  });
});
