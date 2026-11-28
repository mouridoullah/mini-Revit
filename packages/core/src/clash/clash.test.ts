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

  // ---------------------------------------------------------------------------
  // DURCISSEMENT 9.4.1 : CAS LIMITES GÉOMÉTRIQUES DU SOLVEUR 3D
  // ---------------------------------------------------------------------------
  it('T-CLASH-08 (9.4.1) : Collision avec mur oblique orienté à 45° et SAT 15 axes', () => {
    // Mur à 45°
    const wallOblique: Wall = {
      id: 'w_oblique',
      category: 'wall',
      typeId: 'wt_200',
      levelId: 'lvl_0',
      start: { x: 0, y: 0 },
      end: { x: 4000, y: 4000 },
    };

    // Tuyau orthogonal au mur coupant à (2000, 2000)
    const pipeCross = createPipe({
      id: 'pipe_cross_45',
      levelId: 'lvl_0',
      start: { x: 1000, y: 3000, z: 1200 },
      end: { x: 3000, y: 1000, z: 1200 },
      diameter: 60,
      systemType: 'domestic_cold_water',
    });

    const state: BimState = {
      ...baseState,
      walls: { w_oblique: wallOblique },
      pipes: { pipe_cross_45: pipeCross },
    };

    const clashes = detectClashes(state);
    expect(clashes).toHaveLength(1);
    expect(clashes[0]!.severity).toBe('hard');
    expect(clashes[0]!.elementA).toBe('pipe_cross_45');
    expect(clashes[0]!.elementB).toBe('w_oblique');
    expect(clashes[0]!.penetrationDepthMm).toBeGreaterThan(0);
  });

  it('T-CLASH-09 (9.4.1) : Colonne montante verticale traversant une dalle pleine sans trémie', () => {
    const slab: Slab = {
      id: 'slab_full',
      category: 'slab',
      slabTypeId: 'st_200',
      levelId: 'lvl_1',
      boundary: [
        { x: 0, y: 0 },
        { x: 4000, y: 0 },
        { x: 4000, y: 4000 },
        { x: 0, y: 4000 },
      ],
      holes: [],
      openings: [],
    };

    // Colonne montante verticale (axe Z : de z = 1000 à z = 4500 mm) traversant la dalle à z = 2800..3000
    const riserPipe = createPipe({
      id: 'riser_pipe',
      levelId: 'lvl_0',
      start: { x: 2000, y: 2000, z: 1000 },
      end: { x: 2000, y: 2000, z: 4500 },
      diameter: 100,
      systemType: 'drainage_waste',
    });

    const state: BimState = {
      ...baseState,
      slabs: { slab_full: slab },
      pipes: { riser_pipe: riserPipe },
    };

    const clashes = detectClashes(state);
    expect(clashes).toHaveLength(1);
    expect(clashes[0]!.severity).toBe('hard');
    expect(clashes[0]!.elementA).toBe('riser_pipe');
    expect(clashes[0]!.elementB).toBe('slab_full');
    expect(clashes[0]!.point.x).toBeCloseTo(2000, 0);
    expect(clashes[0]!.point.y).toBeCloseTo(2000, 0);
  });

  it('T-CLASH-10 (9.4.1) : Frontière exacte de tolérance de contact dalle/mur (1.9 mm toléré vs 2.5 mm détecté)', () => {
    const wall: Wall = {
      id: 'wall_support',
      category: 'wall',
      typeId: 'wt_200',
      levelId: 'lvl_0',
      start: { x: 0, y: 0 },
      end: { x: 4000, y: 0 },
      // Hauteur du mur 2800 mm (z: 0..2800)
    };

    // Dalle avec assise : épaisseur 200 mm sous zBase.
    // Pour une pénétration de 1.9 mm dans le mur (qui culmine à 2800 mm) :
    // zBase = 2800 - 1.9 + 200 = 2998.1 mm (pénétration = 1.9 mm <= 2.0 mm tolérée)
    const slabNormalContact: Slab = {
      id: 'slab_normal',
      category: 'slab',
      slabTypeId: 'st_200',
      levelId: 'lvl_0',
      baseOffset: 2998.1,
      boundary: [
        { x: 0, y: -500 },
        { x: 4000, y: -500 },
        { x: 4000, y: 500 },
        { x: 0, y: 500 },
      ],
      holes: [],
      openings: [],
    };

    const stateNormal: BimState = {
      ...baseState,
      walls: { wall_support: wall },
      slabs: { slab_normal: slabNormalContact },
    };

    // Pénétration de 1.9 mm -> aucun clash (règle sémantique d'appui dalle/mur ADR-059)
    const clashesNormal = detectClashes(stateNormal, { hardToleranceMm: 2.0 });
    expect(clashesNormal).toHaveLength(0);

    // Dalle avec pénétration excessive de 2.5 mm > 2.0 mm (zBase = 2800 - 2.5 + 200 = 2997.5 mm)
    const slabExcessivePenetration: Slab = {
      ...slabNormalContact,
      id: 'slab_excessive',
      baseOffset: 2997.5,
    };

    const stateExcessive: BimState = {
      ...baseState,
      walls: { wall_support: wall },
      slabs: { slab_excessive: slabExcessivePenetration },
    };

    // Pénétration de 2.5 mm -> clash détecté
    const clashesExcessive = detectClashes(stateExcessive, { hardToleranceMm: 2.0 });
    expect(clashesExcessive).toHaveLength(1);
    expect(clashesExcessive[0]!.severity).toBe('hard');
  });

  it('T-CLASH-11 (ADR-071) : Passage d\'un conduit à travers une baie ouverte (0 clash) vs linteau/trumeau (1 clash)', () => {
    const wall: Wall = {
      id: 'wall_with_door',
      category: 'wall',
      typeId: 'wt_200',
      levelId: 'lvl_0',
      start: { x: 0, y: 0 },
      end: { x: 4000, y: 0 },
    };

    const door: Door = {
      id: 'door_passage',
      category: 'door',
      doorTypeId: 'dt_std', // 830 x 2040 mm
      hostWallId: 'wall_with_door',
      offsetAlong: 1500,
      swing: { side: 'right', direction: 'in' },
    };

    // 1. Tuyau traversant pile au centre de la baie ouverte (x = 1900 mm, z = 1000 mm < 2040 mm)
    const pipeThroughOpening = createPipe({
      id: 'pipe_through_opening',
      levelId: 'lvl_0',
      start: { x: 1900, y: -500, z: 1000 },
      end: { x: 1900, y: 500, z: 1000 },
      diameter: 80,
      systemType: 'domestic_cold_water',
    });

    const stateOpening: BimState = {
      ...baseState,
      walls: { wall_with_door: wall },
      doors: { door_passage: door },
      pipes: { pipe_through_opening: pipeThroughOpening },
    };

    // Pas de clash avec le mur car la baie découpe le mur en morceaux solides réels
    const clashesOpening = detectClashes(stateOpening, { hardToleranceMm: 2.0 });
    const wallClashes = clashesOpening.filter(
      (c) => (c.elementA === 'wall_with_door' || c.elementB === 'wall_with_door') &&
             (c.elementA === 'pipe_through_opening' || c.elementB === 'pipe_through_opening'),
    );
    expect(wallClashes).toHaveLength(0);

    // 2. Tuyau déplacé dans le linteau (x = 1900 mm, z = 2400 mm > 2040 mm)
    const pipeInLintel = createPipe({
      id: 'pipe_in_lintel',
      levelId: 'lvl_0',
      start: { x: 1900, y: -500, z: 2400 },
      end: { x: 1900, y: 500, z: 2400 },
      diameter: 80,
      systemType: 'domestic_cold_water',
    });

    const stateLintel: BimState = {
      ...baseState,
      walls: { wall_with_door: wall },
      doors: { door_passage: door },
      pipes: { pipe_in_lintel: pipeInLintel },
    };

    const clashesLintel = detectClashes(stateLintel, { hardToleranceMm: 2.0 });
    const wallLintelClashes = clashesLintel.filter(
      (c) => (c.elementA === 'wall_with_door' || c.elementB === 'wall_with_door') &&
             (c.elementA === 'pipe_in_lintel' || c.elementB === 'pipe_in_lintel'),
    );
    expect(wallLintelClashes).toHaveLength(1);
    expect(wallLintelClashes[0]!.severity).toBe('hard');

    // 3. Tuyau déplacé dans le trumeau latéral (x = 500 mm < 1500 mm, z = 1000 mm)
    const pipeInJamb = createPipe({
      id: 'pipe_in_jamb',
      levelId: 'lvl_0',
      start: { x: 500, y: -500, z: 1000 },
      end: { x: 500, y: 500, z: 1000 },
      diameter: 80,
      systemType: 'domestic_cold_water',
    });

    const stateJamb: BimState = {
      ...baseState,
      walls: { wall_with_door: wall },
      doors: { door_passage: door },
      pipes: { pipe_in_jamb: pipeInJamb },
    };

    const clashesJamb = detectClashes(stateJamb, { hardToleranceMm: 2.0 });
    const wallJambClashes = clashesJamb.filter(
      (c) => (c.elementA === 'wall_with_door' || c.elementB === 'wall_with_door') &&
             (c.elementA === 'pipe_in_jamb' || c.elementB === 'pipe_in_jamb'),
    );
    expect(wallJambClashes).toHaveLength(1);
    expect(wallJambClashes[0]!.severity).toBe('hard');
  });

  it('T-CLASH-12 (ADR-071) : Colonne montante traversant une réservation de dalle (0 clash) vs pleine dalle (1 clash)', () => {
    // Dalle avec réservation (trou) centré en (2000, 2000)
    const slabWithVoid: Slab = {
      id: 'slab_void',
      category: 'slab',
      slabTypeId: 'st_200',
      levelId: 'lvl_1',
      boundary: [
        { x: 0, y: 0 },
        { x: 4000, y: 0 },
        { x: 4000, y: 4000 },
        { x: 0, y: 4000 },
      ],
      holes: [
        [
          { x: 1800, y: 1800 },
          { x: 2200, y: 1800 },
          { x: 2200, y: 2200 },
          { x: 1800, y: 2200 },
        ],
      ],
      openings: [],
    };

    // 1. Colonne passant en (2000, 2000) à travers le trou -> 0 clash
    const pipeThroughVoid = createPipe({
      id: 'pipe_through_void',
      levelId: 'lvl_0',
      start: { x: 2000, y: 2000, z: 1000 },
      end: { x: 2000, y: 2000, z: 4500 },
      diameter: 100,
      systemType: 'drainage_waste',
    });

    const stateVoid: BimState = {
      ...baseState,
      slabs: { slab_void: slabWithVoid },
      pipes: { pipe_through_void: pipeThroughVoid },
    };

    const clashesVoid = detectClashes(stateVoid);
    expect(clashesVoid).toHaveLength(0);

    // 2. Colonne décalée en pleine dalle en (1000, 1000) -> 1 clash
    const pipeInSolidSlab = createPipe({
      id: 'pipe_in_solid_slab',
      levelId: 'lvl_0',
      start: { x: 1000, y: 1000, z: 1000 },
      end: { x: 1000, y: 1000, z: 4500 },
      diameter: 100,
      systemType: 'drainage_waste',
    });

    const stateSolid: BimState = {
      ...baseState,
      slabs: { slab_void: slabWithVoid },
      pipes: { pipe_in_solid_slab: pipeInSolidSlab },
    };

    const clashesSolid = detectClashes(stateSolid);
    expect(clashesSolid).toHaveLength(1);
    expect(clashesSolid[0]!.severity).toBe('hard');
    expect(clashesSolid[0]!.elementA).toBe('pipe_in_solid_slab');
    expect(clashesSolid[0]!.elementB).toBe('slab_void');
  });

  it('T-CLASH-13 (ADR-071) : Colonne montante dans trémie d\'escalier dérivée -> 0 clash', () => {
    const stair = {
      id: 'stair_main',
      category: 'stair' as const,
      stairTypeId: 'stair_type_1',
      bottomLevelId: 'lvl_0',
      topLevelId: 'lvl_1',
      start: { x: 2000, y: 1000 },
      end: { x: 2000, y: 3500 },
      widthOverride: 1000,
    };

    const slabNoManualHoles: Slab = {
      id: 'slab_arrival',
      category: 'slab',
      slabTypeId: 'st_200',
      levelId: 'lvl_1',
      boundary: [
        { x: 0, y: 0 },
        { x: 5000, y: 0 },
        { x: 5000, y: 5000 },
        { x: 0, y: 5000 },
      ],
      holes: [],
      openings: [],
    };

    // Colonne traversant la dalle au niveau de la tête de l'escalier (x = 2000, y = 3400)
    const pipeInStairShaft = createPipe({
      id: 'pipe_in_shaft',
      levelId: 'lvl_0',
      start: { x: 2000, y: 3400, z: 1000 },
      end: { x: 2000, y: 3400, z: 4500 },
      diameter: 100,
      systemType: 'drainage_waste',
    });

    const stateShaft: BimState = {
      ...baseState,
      stairTypes: {
        stair_type_1: {
          id: 'stair_type_1',
          name: 'Escalier Béton',
          width: 1000,
        },
      },
      stairs: { stair_main: stair },
      slabs: { slab_arrival: slabNoManualHoles },
      pipes: { pipe_in_shaft: pipeInStairShaft },
    };

    // La trémie dérivée computeStairShaft autorise le passage sans clash avec la dalle
    const clashes = detectClashes(stateShaft);
    const slabClashes = clashes.filter(
      (c) => c.elementA === 'slab_arrival' || c.elementB === 'slab_arrival',
    );
    expect(slabClashes).toHaveLength(0);
  });

  it('T-CLASH-14 (ADR-071) : Détection de clash entre un conduit MEP et un pan de toiture', () => {
    const roof = {
      id: 'roof_main',
      category: 'roof' as const,
      roofTypeId: 'rt_gable',
      levelId: 'lvl_1',
      footprint: [
        { x: 0, y: 0 },
        { x: 4000, y: 0 },
        { x: 4000, y: 4000 },
        { x: 0, y: 4000 },
      ],
      ridgeAxis: {
        start: { x: 2000, y: 0 },
        end: { x: 2000, y: 4000 },
      },
    };

    // Conduit horizontal traversant le pan de toiture à z = 4000 mm
    const duct = createDuct({
      id: 'duct_in_roof',
      levelId: 'lvl_1',
      start: { x: 1000, y: -500, z: 4000 },
      end: { x: 1000, y: 2000, z: 4000 },
      shape: 'rectangular',
      width: 400,
      height: 300,
      systemType: 'supply_air',
    });

    const stateRoof: BimState = {
      ...baseState,
      roofTypes: {
        rt_gable: {
          id: 'rt_gable',
          name: 'Toit 2 Pans 30°',
          category: 'roofType',
          family: 'gable',
          thickness: 200,
          slopeDeg: 30,
          overhangMm: 200,
        },
      },
      roofs: { roof_main: roof },
      ducts: { duct_in_roof: duct },
    };

    const clashes = detectClashes(stateRoof);
    expect(clashes).toHaveLength(1);
    expect(clashes[0]!.severity).toBe('hard');
    expect(clashes[0]!.elementA).toBe('duct_in_roof');
    expect(clashes[0]!.elementB).toBe('roof_main');
  });

  it('T-CLASH-15 : Exclut le faux conflit (hard clash) entre deux tuyaux se rejoignant sur un coude (Elbow)', () => {
    const fitting: MepFitting = {
      id: 'elbow_90',
      category: 'mepFitting',
      levelId: 'lvl_0',
      fittingType: 'elbow',
      domain: 'plumbing',
      systemType: 'domestic_cold_water',
      position: { x: 1000, y: 1000, z: 500 },
      ports: [
        {
          id: 'port_elbow_0',
          elementId: 'elbow_90',
          domain: 'plumbing',
          systemType: 'domestic_cold_water',
          direction: { x: -1, y: 0, z: 0 },
          position: { x: 1000, y: 1000, z: 500 },
          shape: 'round',
          diameter: 50,
        },
        {
          id: 'port_elbow_1',
          elementId: 'elbow_90',
          domain: 'plumbing',
          systemType: 'domestic_cold_water',
          direction: { x: 0, y: 1, z: 0 },
          position: { x: 1000, y: 1000, z: 500 },
          shape: 'round',
          diameter: 50,
        },
      ],
    };

    const pipeA = createPipe({
      id: 'pipe_A',
      levelId: 'lvl_0',
      start: { x: 0, y: 1000, z: 500 },
      end: { x: 1000, y: 1000, z: 500 },
      diameter: 50,
      systemType: 'domestic_cold_water',
    });

    const pipeB = createPipe({
      id: 'pipe_B',
      levelId: 'lvl_0',
      start: { x: 1000, y: 1000, z: 500 },
      end: { x: 1000, y: 2000, z: 500 },
      diameter: 50,
      systemType: 'domestic_cold_water',
    });

    const connA: Connector = {
      id: 'conn_A',
      category: 'mepConnector',
      portAId: 'pipe_A_end',
      portBId: 'port_elbow_0',
    };

    const connB: Connector = {
      id: 'conn_B',
      category: 'mepConnector',
      portAId: 'pipe_B_start',
      portBId: 'port_elbow_1',
    };

    const state: BimState = {
      ...baseState,
      pipes: { pipe_A: pipeA, pipe_B: pipeB },
      mepFittings: { elbow_90: fitting },
      mepConnectors: { conn_A: connA, conn_B: connB },
    };

    const clashes = detectClashes(state);
    // Les deux tuyaux se coupent géométriquement de 50 mm à l'angle du coude,
    // mais ce contact est légitime car ils sont connectés au même coude -> 0 clash !
    expect(clashes).toHaveLength(0);
  });

  it('T-CLASH-MEP-02 : Deux tuyaux formant un coude à 90° sans connecteurs explicites -> 0 clash (jonction naturelle)', () => {
    const pipeA = createPipe({
      id: 'pipe_A',
      levelId: 'lvl_0',
      start: { x: 0, y: 0, z: 1000 },
      end: { x: 1000, y: 0, z: 1000 },
      diameter: 50,
      systemType: 'domestic_cold_water',
    });

    const pipeB = createPipe({
      id: 'pipe_B',
      levelId: 'lvl_0',
      start: { x: 1000, y: 0, z: 1000 },
      end: { x: 1000, y: 1000, z: 1000 },
      diameter: 50,
      systemType: 'domestic_cold_water',
    });

    const state: BimState = {
      ...baseState,
      pipes: { pipe_A: pipeA, pipe_B: pipeB },
    };

    const clashes = detectClashes(state);
    expect(clashes).toHaveLength(0);
  });
});
