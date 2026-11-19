/**
 * @mini-bim/core
 * Générateur synthétique déterministe de maquettes architecturales multi-catégories.
 * Conçu pour les bancs de performance et d'échelle (Phase 9.1).
 *
 * Produit des maquettes de 100, 1 000 et 10 000 éléments avec complexité progressive :
 * Murs, Portes, Fenêtres, Dalles, Escaliers, Toitures, Mobilier/Sanitaires, Cotations et Pièces.
 */

import {
  type BimState,
  type ElementId,
  type Level,
  type WallType,
  type SlabType,
  type DoorType,
  type WindowType,
  type StairType,
  type RoofType,
  type Wall,
  type Door,
  type Window,
  type Slab,
  type Stair,
  type Roof,
  type Component,
  type Dimension,
  type Room,
  type ComponentType,
} from '../types.js';
import { STANDARD_COMPONENT_CATALOG } from '../components/catalog.js';

export interface SyntheticModelConfig {
  targetElementCount: number;
  levelCount?: number;
  seed?: number;
}

export interface SyntheticModelBreakdown {
  walls: number;
  doors: number;
  windows: number;
  slabs: number;
  stairs: number;
  roofs: number;
  components: number;
  dimensions: number;
  rooms: number;
  totalElements: number;
}

export interface SyntheticModelResult {
  state: BimState;
  breakdown: SyntheticModelBreakdown;
}

export function generateSyntheticBimModel(
  configOrCount: number | SyntheticModelConfig
): SyntheticModelResult {
  const config: SyntheticModelConfig =
    typeof configOrCount === 'number'
      ? { targetElementCount: configOrCount }
      : configOrCount;

  const target = Math.max(10, Math.floor(config.targetElementCount));
  const numLevels = config.levelCount ?? (target >= 5000 ? 10 : target >= 500 ? 4 : 2);

  // 1. Initialisation des types et catalogues de référence
  const levels: Record<ElementId, Level> = {};
  const levelHeight = 2800;
  for (let l = 0; l < numLevels; l++) {
    const id = `lvl_${l}`;
    levels[id] = {
      id,
      name: l === 0 ? 'RDC' : `R+${l}`,
      elevation: l * levelHeight,
      height: levelHeight,
    };
  }

  const wallTypes: Record<ElementId, WallType> = {
    wt_ext_200: {
      id: 'wt_ext_200',
      name: 'Mur Extérieur 200mm',
      thickness: 200,
      height: levelHeight,
      isExternal: true,
      loadBearing: true,
    },
    wt_int_100: {
      id: 'wt_int_100',
      name: 'Cloison Intérieure 100mm',
      thickness: 100,
      height: levelHeight,
      isExternal: false,
      loadBearing: false,
    },
  };

  const slabTypes: Record<ElementId, SlabType> = {
    slt_200: { id: 'slt_200', name: 'Dalle Béton 200mm', thickness: 200 },
  };

  const doorTypes: Record<ElementId, DoorType> = {
    dt_900: { id: 'dt_900', name: 'Porte Battante 900x2100', width: 900, height: 2100 },
    dt_800: { id: 'dt_800', name: 'Porte Intérieure 800x2100', width: 800, height: 2100 },
  };

  const windowTypes: Record<ElementId, WindowType> = {
    wt_1200: { id: 'wt_1200', name: 'Fenêtre 1200x1400', width: 1200, height: 1400, defaultSillHeight: 900 },
    wt_600: { id: 'wt_600', name: 'Châssis 600x600', width: 600, height: 600, defaultSillHeight: 1500 },
  };

  const stairTypes: Record<ElementId, StairType> = {
    st_900: { id: 'st_900', name: 'Escalier Droit 900mm', width: 900 },
  };

  const roofTypes: Record<ElementId, RoofType> = {
    rt_flat: { id: 'rt_flat', name: 'Toit Terrasse Plat', category: 'roofType', family: 'flat', thickness: 300, acrotereHeight: 400 },
    rt_gable: { id: 'rt_gable', name: 'Toiture 2 Pans 35°', category: 'roofType', family: 'gable', thickness: 250, slopeDeg: 35, overhangMm: 300 },
  };

  const componentTypes: Record<ElementId, ComponentType> = {};
  for (const ct of STANDARD_COMPONENT_CATALOG) {
    componentTypes[ct.id] = ct;
  }

  // 2. Calcul des quotas cibles par catégorie
  const targetWalls = Math.max(4, Math.floor(target * 0.40));
  const targetDoors = Math.max(1, Math.floor(target * 0.14));
  const targetWindows = Math.max(1, Math.floor(target * 0.14));
  const targetSlabs = Math.max(1, Math.floor(target * 0.04));
  const targetStairs = Math.max(1, Math.min(numLevels - 1, Math.floor(target * 0.01)));
  const targetRoofs = Math.max(1, Math.min(4, Math.floor(target * 0.01)));
  const targetDimensions = Math.max(1, Math.floor(target * 0.04));
  const targetRooms = Math.max(1, Math.floor(target * 0.05));

  // 3. Génération spatiale de la trame de murs
  const walls: Record<ElementId, Wall> = {};
  const wallIds: ElementId[] = [];
  const spacing = 5000; // 5 mètres entre trames
  
  // Détermination de la dimension de grille par niveau
  const wallsPerLevel = Math.ceil(targetWalls / numLevels);
  const gridSide = Math.max(2, Math.ceil(Math.sqrt(wallsPerLevel / 2)) + 1);

  let wallCount = 0;
  for (let l = 0; l < numLevels && wallCount < targetWalls; l++) {
    const levelId = `lvl_${l}`;
    const nextLevelId = l < numLevels - 1 ? `lvl_${l + 1}` : undefined;

    // Murs horizontaux
    for (let r = 0; r <= gridSide && wallCount < targetWalls; r++) {
      for (let c = 0; c < gridSide && wallCount < targetWalls; c++) {
        const id = `w_h_l${l}_r${r}_c${c}`;
        const isExt = r === 0 || r === gridSide;
        walls[id] = {
          id,
          category: 'wall',
          typeId: isExt ? 'wt_ext_200' : 'wt_int_100',
          levelId,
          start: { x: c * spacing, y: r * spacing },
          end: { x: (c + 1) * spacing, y: r * spacing },
          topConstraint: nextLevelId ? { kind: 'level', levelId: nextLevelId } : undefined,
          isExternal: isExt,
          loadBearing: isExt || r % 2 === 0,
        };
        wallIds.push(id);
        wallCount++;
      }
    }

    // Murs verticaux
    for (let c = 0; c <= gridSide && wallCount < targetWalls; c++) {
      for (let r = 0; r < gridSide && wallCount < targetWalls; r++) {
        const id = `w_v_l${l}_c${c}_r${r}`;
        const isExt = c === 0 || c === gridSide;
        walls[id] = {
          id,
          category: 'wall',
          typeId: isExt ? 'wt_ext_200' : 'wt_int_100',
          levelId,
          start: { x: c * spacing, y: r * spacing },
          end: { x: c * spacing, y: (r + 1) * spacing },
          topConstraint: nextLevelId ? { kind: 'level', levelId: nextLevelId } : undefined,
          isExternal: isExt,
          loadBearing: isExt || c % 2 === 0,
        };
        wallIds.push(id);
        wallCount++;
      }
    }
  }

  // 4. Génération des portes hébergées
  const doors: Record<ElementId, Door> = {};
  for (let d = 0; d < targetDoors; d++) {
    const hostWallId = wallIds[d % wallIds.length];
    const hostWall = hostWallId ? walls[hostWallId] : undefined;
    if (!hostWall) continue;
    const id = `door_${d}`;
    doors[id] = {
      id,
      category: 'door',
      doorTypeId: d % 3 === 0 ? 'dt_800' : 'dt_900',
      hostWallId: hostWall.id,
      offsetAlong: 600,
      swing: {
        side: d % 2 === 0 ? 'right' : 'left',
        direction: d % 4 < 2 ? 'in' : 'out',
      },
    };
  }

  // 5. Génération des fenêtres hébergées
  const windows: Record<ElementId, Window> = {};
  for (let w = 0; w < targetWindows; w++) {
    const wallIndex = (w * 7) % wallIds.length;
    const hostWallId = wallIds[wallIndex];
    const hostWall = hostWallId ? walls[hostWallId] : undefined;
    if (!hostWall) continue;
    const id = `win_${w}`;
    windows[id] = {
      id,
      category: 'window',
      windowTypeId: w % 2 === 0 ? 'wt_1200' : 'wt_600',
      hostWallId: hostWall.id,
      offsetAlong: 2800,
      sillHeight: w % 2 === 0 ? 900 : 1500,
    };
  }

  // 6. Génération des dalles
  const slabs: Record<ElementId, Slab> = {};
  let slabCount = 0;
  // Dalle principale par niveau
  for (let l = 0; l < numLevels && slabCount < targetSlabs; l++) {
    const levelId = `lvl_${l}`;
    const id = `slab_main_l${l}`;
    slabs[id] = {
      id,
      category: 'slab',
      slabTypeId: 'slt_200',
      levelId,
      boundary: [
        { x: 0, y: 0 },
        { x: gridSide * spacing, y: 0 },
        { x: gridSide * spacing, y: gridSide * spacing },
        { x: 0, y: gridSide * spacing },
      ],
      holes: [],
      openings: [],
    };
    slabCount++;
  }
  // Sous-dalles de trame si besoin
  for (let l = 0; l < numLevels && slabCount < targetSlabs; l++) {
    for (let r = 0; r < gridSide && slabCount < targetSlabs; r++) {
      for (let c = 0; c < gridSide && slabCount < targetSlabs; c++) {
        const id = `slab_sub_l${l}_r${r}_c${c}`;
        slabs[id] = {
          id,
          category: 'slab',
          slabTypeId: 'slt_200',
          levelId: `lvl_${l}`,
          boundary: [
            { x: c * spacing, y: r * spacing },
            { x: (c + 1) * spacing, y: r * spacing },
            { x: (c + 1) * spacing, y: (r + 1) * spacing },
            { x: c * spacing, y: (r + 1) * spacing },
          ],
          holes: [],
          openings: [],
        };
        slabCount++;
      }
    }
  }

  // 7. Génération des escaliers
  const stairs: Record<ElementId, Stair> = {};
  for (let s = 0; s < targetStairs; s++) {
    const bottomLvl = s % (numLevels - 1);
    const topLvl = bottomLvl + 1;
    const id = `stair_${s}`;
    stairs[id] = {
      id,
      category: 'stair',
      stairTypeId: 'st_900',
      bottomLevelId: `lvl_${bottomLvl}`,
      topLevelId: `lvl_${topLvl}`,
      start: { x: 1000 + (s * 500) % 3000, y: 1000 },
      end: { x: 1000 + (s * 500) % 3000, y: 4000 },
    };
  }

  // 8. Génération des toitures
  const roofs: Record<ElementId, Roof> = {};
  for (let rf = 0; rf < targetRoofs; rf++) {
    const id = `roof_${rf}`;
    const topLevelId = `lvl_${numLevels - 1}`;
    roofs[id] = {
      id,
      category: 'roof',
      roofTypeId: rf % 2 === 0 ? 'rt_flat' : 'rt_gable',
      levelId: topLevelId,
      footprint: [
        { x: 0, y: 0 },
        { x: gridSide * spacing, y: 0 },
        { x: gridSide * spacing, y: gridSide * spacing },
        { x: 0, y: gridSide * spacing },
      ],
      ...(rf % 2 !== 0
        ? {
            ridgeAxis: {
              start: { x: (gridSide * spacing) / 2, y: 0 },
              end: { x: (gridSide * spacing) / 2, y: gridSide * spacing },
            },
          }
        : {}),
    };
  }

  // 9. Génération des cotations (dimensions)
  const dimensions: Record<ElementId, Dimension> = {};
  for (let dm = 0; dm < targetDimensions; dm++) {
    const id = `dim_${dm}`;
    const wallId = wallIds[dm % wallIds.length];
    if (!wallId) continue;
    dimensions[id] = {
      id,
      category: 'dimension',
      levelId: walls[wallId]?.levelId ?? 'lvl_0',
      type: 'linear',
      references: [wallId],
      offset: 500,
      value: spacing,
    };
  }

  // 10. Génération des pièces (rooms)
  const rooms: Record<ElementId, Room> = {};
  for (let rm = 0; rm < targetRooms; rm++) {
    const id = `room_${rm}`;
    const levelIndex = rm % numLevels;
    const r = Math.floor(rm / gridSide) % gridSide;
    const c = rm % gridSide;
    rooms[id] = {
      id,
      category: 'room',
      levelId: `lvl_${levelIndex}`,
      name: `Espace ${r + 1}-${c + 1}`,
      seed: { x: c * spacing + spacing / 2, y: r * spacing + spacing / 2 },
    };
  }

  // 11. Calcul exact du solde pour les composants afin d'atteindre rigoureusement `target`
  const currentCount =
    Object.keys(walls).length +
    Object.keys(doors).length +
    Object.keys(windows).length +
    Object.keys(slabs).length +
    Object.keys(stairs).length +
    Object.keys(roofs).length +
    Object.keys(dimensions).length +
    Object.keys(rooms).length;

  const targetComponents = Math.max(0, target - currentCount);

  // 12. Génération des composants (mobilier & sanitaires)
  const components: Record<ElementId, Component> = {};
  const catalogKeys = Object.keys(componentTypes);
  for (let cp = 0; cp < targetComponents; cp++) {
    const id = `comp_${cp}`;
    const typeId = catalogKeys[cp % catalogKeys.length] ?? 'ct_chair_standard';
    const levelIndex = cp % numLevels;
    const r = Math.floor(cp / gridSide) % gridSide;
    const c = cp % gridSide;
    
    // Placement au centre ou adossé à un mur
    const isAdossed = cp % 3 === 0;
    const hostId = wallIds[cp % wallIds.length];
    const hostWall = isAdossed && hostId ? walls[hostId] : undefined;

    components[id] = {
      id,
      category: 'component',
      typeId,
      levelId: `lvl_${levelIndex}`,
      placement: {
        x: c * spacing + (isAdossed ? 500 : 2500),
        y: r * spacing + (isAdossed ? 500 : 2500),
        rotation: (cp * Math.PI) / 4,
        hostWallId: hostWall?.id,
      },
    };
  }

  // Breakdown final
  const breakdown: SyntheticModelBreakdown = {
    walls: Object.keys(walls).length,
    doors: Object.keys(doors).length,
    windows: Object.keys(windows).length,
    slabs: Object.keys(slabs).length,
    stairs: Object.keys(stairs).length,
    roofs: Object.keys(roofs).length,
    components: Object.keys(components).length,
    dimensions: Object.keys(dimensions).length,
    rooms: Object.keys(rooms).length,
    totalElements:
      Object.keys(walls).length +
      Object.keys(doors).length +
      Object.keys(windows).length +
      Object.keys(slabs).length +
      Object.keys(stairs).length +
      Object.keys(roofs).length +
      Object.keys(components).length +
      Object.keys(dimensions).length +
      Object.keys(rooms).length,
  };

  const state: BimState = {
    schemaVersion: 2,
    units: 'mm',
    levels,
    wallTypes,
    slabTypes,
    doorTypes,
    windowTypes,
    stairTypes,
    roofTypes,
    componentTypes,
    walls,
    slabs,
    doors,
    windows,
    rooms,
    dimensions,
    stairs,
    roofs,
    roofOpenings: {},
    components,
  };

  return { state, breakdown };
}
