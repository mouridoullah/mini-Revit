import { BimDocument } from '../document.js';
import {
  type BimState,
  type Level,
  type WallType,
  type SlabType,
  type DoorType,
  type WindowType,
  type StairType,
  type GableRoofType,
  type Wall,
  type Slab,
  type Door,
  type Window,
  type Stair,
  type Roof,
  type Room,
} from '../types.js';
import { vec2 } from '@mini-bim/geometry';

/**
 * Générateur de projet de référence : « Villa Contemporaine Complexe »
 *
 * Ce modèle étalon intègre les cas géométriques les plus exigeants de l'architecture réelle :
 * 1. Murs à angles non-orthogonaux (aile biaisée à 45° et retour à 135°).
 * 2. Jonctions d'épaisseurs mixtes (façade 300 mm, refend 200 mm, cloisons 70 mm).
 * 3. Baies hébergées en cas limites (baie vitrée sur mur oblique, porte intérieure proche de jonction).
 * 4. Trémie d'escalier dans la dalle R+1 et escalier paramétrique associé.
 * 5. Toiture 2 pans avec mur pignon biseauté sous faîtage.
 * 6. Multiples pièces closes avec calcul de surfaces utiles nettes.
 */
export function createComplexVillaState(): BimState {
  const lvl0: Level = { id: 'lvl_0', name: 'Rez-de-chaussée', elevation: 0, height: 2800 };
  const lvl1: Level = { id: 'lvl_1', name: 'Étage R+1', elevation: 2800, height: 2800 };

  const wtExt300: WallType = {
    id: 'wt_ext_300',
    name: 'Façade ITE 300mm',
    thickness: 300,
    height: 2800,
    isExternal: true,
    loadBearing: true,
  };
  const wtRefend200: WallType = {
    id: 'wt_refend_200',
    name: 'Refend Béton 200mm',
    thickness: 200,
    height: 2800,
    isExternal: false,
    loadBearing: true,
  };
  const wtPart70: WallType = {
    id: 'wt_part_70',
    name: 'Cloison Plâtre 70mm',
    thickness: 70,
    height: 2800,
    isExternal: false,
    loadBearing: false,
  };

  const dtFront: DoorType = {
    id: 'dt_front',
    name: 'Porte Entrée 1000x2150',
    width: 1000,
    height: 2150,
  };
  const dtInt800: DoorType = {
    id: 'dt_int_800',
    name: 'Porte Intérieure 800x2040',
    width: 800,
    height: 2040,
  };
  const dtSliding: DoorType = {
    id: 'dt_sliding',
    name: 'Baie Coulissante 2400x2150',
    width: 2400,
    height: 2150,
  };

  const wtWinStd: WindowType = {
    id: 'wt_win_std',
    name: 'Fenêtre 1200x1400',
    width: 1200,
    height: 1400,
    defaultSillHeight: 900,
  };

  const stStd: StairType = {
    id: 'st_std',
    name: 'Escalier Droit Bois 900mm',
    width: 900,
  };

  const slabType200: SlabType = {
    id: 'slt_200',
    name: 'Dalle BA 200mm',
    thickness: 200,
  };

  const roofTypeGable: GableRoofType = {
    id: 'rt_gable_35',
    name: 'Toiture 2 Pans 35°',
    category: 'roofType',
    family: 'gable',
    thickness: 250,
    slopeDeg: 35,
    overhangMm: 300,
  };

  // Murs périphériques extérieurs (épaisseur 300 mm)
  // Contour : (0,0) -> (8000,0) -> (12000,4000) [45°] -> (12000,8000) -> (6000,8000) -> (6000,6000) -> (0,6000) -> (0,0)
  const walls: Record<string, Wall> = {
    // Corps principal Sud
    w_ext_south: {
      id: 'w_ext_south',
      category: 'wall',
      typeId: 'wt_ext_300',
      levelId: 'lvl_0',
      start: vec2(0, 0),
      end: vec2(8000, 0),
    },
    // Aile oblique à 45°
    w_ext_oblique_ne: {
      id: 'w_ext_oblique_ne',
      category: 'wall',
      typeId: 'wt_ext_300',
      levelId: 'lvl_0',
      start: vec2(8000, 0),
      end: vec2(12000, 4000),
    },
    // Aile oblique Est
    w_ext_east_wing: {
      id: 'w_ext_east_wing',
      category: 'wall',
      typeId: 'wt_ext_300',
      levelId: 'lvl_0',
      start: vec2(12000, 4000),
      end: vec2(12000, 8000),
    },
    // Aile Nord
    w_ext_north_wing: {
      id: 'w_ext_north_wing',
      category: 'wall',
      typeId: 'wt_ext_300',
      levelId: 'lvl_0',
      start: vec2(12000, 8000),
      end: vec2(6000, 8000),
    },
    // Décroché intérieur
    w_ext_recess_vert: {
      id: 'w_ext_recess_vert',
      category: 'wall',
      typeId: 'wt_ext_300',
      levelId: 'lvl_0',
      start: vec2(6000, 8000),
      end: vec2(6000, 6000),
    },
    // Façade Nord corps principal
    w_ext_north_main: {
      id: 'w_ext_north_main',
      category: 'wall',
      typeId: 'wt_ext_300',
      levelId: 'lvl_0',
      start: vec2(6000, 6000),
      end: vec2(0, 6000),
    },
    // Pignon Ouest (montant sous toiture)
    w_ext_west_gable: {
      id: 'w_ext_west_gable',
      category: 'wall',
      typeId: 'wt_ext_300',
      levelId: 'lvl_0',
      start: vec2(0, 6000),
      end: vec2(0, 0),
      topConstraint: { kind: 'roof', roofId: 'roof_main' },
    },

    // Murs intérieurs - Refend 200 mm
    w_refend_middle: {
      id: 'w_refend_middle',
      category: 'wall',
      typeId: 'wt_refend_200',
      levelId: 'lvl_0',
      start: vec2(4000, 0),
      end: vec2(4000, 6000),
    },

    // Cloisons de distribution 70 mm
    w_part_kitchen_sep: {
      id: 'w_part_kitchen_sep',
      category: 'wall',
      typeId: 'wt_part_70',
      levelId: 'lvl_0',
      start: vec2(0, 2600),
      end: vec2(4000, 2600),
    },
    w_part_cellar: {
      id: 'w_part_cellar',
      category: 'wall',
      typeId: 'wt_part_70',
      levelId: 'lvl_0',
      start: vec2(2000, 0),
      end: vec2(2000, 2600),
    },
    w_part_alcove: {
      id: 'w_part_alcove',
      category: 'wall',
      typeId: 'wt_part_70',
      levelId: 'lvl_0',
      start: vec2(3600, 2600),
      end: vec2(3600, 2100),
    },
  };

  // Ouvertures
  const doors: Record<string, Door> = {
    door_front: {
      id: 'door_front',
      category: 'door',
      hostWallId: 'w_ext_south',
      doorTypeId: 'dt_front',
      offsetAlong: 1200,
      swing: { side: 'right', direction: 'in' },
    },
    door_kitchen: {
      id: 'door_kitchen',
      category: 'door',
      hostWallId: 'w_part_kitchen_sep',
      doorTypeId: 'dt_int_800',
      offsetAlong: 800,
      swing: { side: 'left', direction: 'in' },
    },
    door_cellar: {
      id: 'door_cellar',
      category: 'door',
      hostWallId: 'w_part_cellar',
      doorTypeId: 'dt_int_800',
      offsetAlong: 500,
      swing: { side: 'right', direction: 'in' },
    },
    door_sliding_wing: {
      id: 'door_sliding_wing',
      category: 'door',
      hostWallId: 'w_ext_oblique_ne',
      doorTypeId: 'dt_sliding',
      offsetAlong: 1500,
      swing: { side: 'right', direction: 'in' },
    },
  };

  const windows: Record<string, Window> = {
    win_west: {
      id: 'win_west',
      category: 'window',
      hostWallId: 'w_ext_west_gable',
      windowTypeId: 'wt_win_std',
      offsetAlong: 3200,
      sillHeight: 900,
    },
    win_wing_east: {
      id: 'win_wing_east',
      category: 'window',
      hostWallId: 'w_ext_east_wing',
      windowTypeId: 'wt_win_std',
      offsetAlong: 1500,
      sillHeight: 900,
    },
  };

  // Dalle RDC (radier général couvrant tout le contour extérieur)
  const slabs: Record<string, Slab> = {
    slab_ground: {
      id: 'slab_ground',
      category: 'slab',
      slabTypeId: 'slt_200',
      levelId: 'lvl_0',
      boundary: [
        vec2(0, 0),
        vec2(8000, 0),
        vec2(12000, 4000),
        vec2(12000, 8000),
        vec2(6000, 8000),
        vec2(6000, 6000),
        vec2(0, 6000),
      ],
      baseOffset: 0,
    },
    slab_r1: {
      id: 'slab_r1',
      category: 'slab',
      slabTypeId: 'slt_200',
      levelId: 'lvl_1',
      boundary: [
        vec2(0, 0),
        vec2(8000, 0),
        vec2(8000, 6000),
        vec2(0, 6000),
      ],
      openings: [
        // Trémie d'escalier
        [vec2(4200, 1000), vec2(5200, 1000), vec2(5200, 3800), vec2(4200, 3800)],
      ],
      baseOffset: 0,
    },
  };

  // Escalier droit dans la trémie
  const stairs: Record<string, Stair> = {
    stair_main: {
      id: 'stair_main',
      category: 'stair',
      stairTypeId: 'st_std',
      bottomLevelId: 'lvl_0',
      topLevelId: 'lvl_1',
      start: vec2(4700, 1000),
      end: vec2(4700, 3800),
    },
  };

  // Toiture 2 pans sur le corps principal
  const roofs: Record<string, Roof> = {
    roof_main: {
      id: 'roof_main',
      category: 'roof',
      roofTypeId: 'rt_gable_35',
      levelId: 'lvl_0',
      baseOffset: 2800,
      footprint: [
        vec2(0, 0),
        vec2(8000, 0),
        vec2(8000, 6000),
        vec2(0, 6000),
      ],
      ridgeAxis: {
        start: vec2(0, 3000),
        end: vec2(8000, 3000),
      },
    },
  };

  // Pièces
  const rooms: Record<string, Room> = {
    room_cellar: {
      id: 'room_cellar',
      category: 'room',
      levelId: 'lvl_0',
      name: 'Cellier',
      seed: vec2(1000, 1000),
    },
    room_entry: {
      id: 'room_entry',
      category: 'room',
      levelId: 'lvl_0',
      name: 'Entrée',
      seed: vec2(3000, 1000),
    },
    room_kitchen: {
      id: 'room_kitchen',
      category: 'room',
      levelId: 'lvl_0',
      name: 'Cuisine',
      seed: vec2(2000, 4000),
    },
    room_living: {
      id: 'room_living',
      category: 'room',
      levelId: 'lvl_0',
      name: 'Salon / Séjour',
      seed: vec2(6000, 3000),
    },
    room_veranda: {
      id: 'room_veranda',
      category: 'room',
      levelId: 'lvl_0',
      name: 'Véranda Oblique',
      seed: vec2(10000, 6000),
    },
  };

  return {
    schemaVersion: 2,
    units: 'mm',
    levels: { lvl_0: lvl0, lvl_1: lvl1 },
    wallTypes: {
      wt_ext_300: wtExt300,
      wt_refend_200: wtRefend200,
      wt_part_70: wtPart70,
    },
    slabTypes: { slt_200: slabType200 },
    doorTypes: {
      dt_front: dtFront,
      dt_int_800: dtInt800,
      dt_sliding: dtSliding,
    },
    windowTypes: { wt_win_std: wtWinStd },
    stairTypes: { st_std: stStd },
    roofTypes: { rt_gable_35: roofTypeGable },
    walls,
    slabs,
    doors,
    windows,
    rooms,
    dimensions: {},
    stairs,
    roofs,
    roofOpenings: {},
  };
}

/**
 * Crée une instance de BimDocument initialisée avec la Villa Complexe.
 */
export function createComplexVillaDocument(): BimDocument {
  const state = createComplexVillaState();
  return new BimDocument(state);
}
