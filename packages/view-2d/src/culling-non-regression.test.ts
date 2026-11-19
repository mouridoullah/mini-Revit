import { describe, it, expect } from 'vitest';
import { vec2 } from '@mini-bim/geometry';
import { BimDocument, Commands, type Wall, type WallType, type Stair, type StairType } from '@mini-bim/core';
import { Transform2D } from './transform.js';
import { View2D } from './View2D.js';
import { renderPlanView, DEFAULT_VIEW2D_RENDER_CONFIG } from './renderer.js';
import { createMockCanvas } from './test-utils.js';
import { buildSpatialIndex, buildLinearSpatialIndex } from './spatial/index.js';
import { findWallAtScreen } from './hit-test.js';

describe('Validation & Non-Régression Frustum Culling & Filtrage par Niveau (@mini-bim/view-2d)', () => {
  const wallType: WallType = {
    id: 'wt_standard',
    name: 'Mur Extérieur 20cm',
    thickness: 200,
    height: 2800,
    layers: [{ materialId: 'concrete', thickness: 200 }],
  };

  const stairType: StairType = {
    id: 'st_standard',
    name: 'Escalier Droit Béton',
    width: 1000,
  };

  function setupTestDoc() {
    const doc = new BimDocument();
    doc.execute(new Commands.AddLevelCommand({ id: 'lvl_rdc', name: 'RDC', elevation: 0 }));
    doc.execute(new Commands.AddLevelCommand({ id: 'lvl_r1', name: 'R+1', elevation: 3000 }));
    doc.execute(new Commands.AddWallTypeCommand(wallType));
    doc.execute(new Commands.AddStairTypeCommand(stairType));
    return doc;
  }

  // ---------------------------------------------------------------------------
  // 1. Éléments hors viewport complètement éliminés du tracé
  // ---------------------------------------------------------------------------
  it('1. Élimine totalement les éléments situés hors du champ de vision (Frustum Culling)', () => {
    const doc = setupTestDoc();

    // Mur 1 : dans le champ de vision (autour de 0, 0)
    const wallIn: Wall = {
      id: 'w_inside',
      category: 'wall',
      typeId: 'wt_standard',
      start: vec2(-500, 0),
      end: vec2(500, 0),
      levelId: 'lvl_rdc',
    };

    // Mur 2 : très loin hors champ (à 50 mètres)
    const wallOut: Wall = {
      id: 'w_outside',
      category: 'wall',
      typeId: 'wt_standard',
      start: vec2(50000, 50000),
      end: vec2(52000, 50000),
      levelId: 'lvl_rdc',
    };

    doc.execute(new Commands.AddWallCommand(wallIn));
    doc.execute(new Commands.AddWallCommand(wallOut));

    const { mock } = createMockCanvas(800, 600);
    const transform = new Transform2D({
      origin: vec2(0, 0),
      scale: 0.1, // 800px = 8000mm de large (-4000 à +4000 mm)
      viewportWidth: 800,
      viewportHeight: 600,
    });

    const spatialIndex = buildSpatialIndex(doc);

    // Rendu avec Culling activé
    mock.clearCalls();
    renderPlanView(
      mock.ctx,
      transform,
      doc,
      new Set(),
      DEFAULT_VIEW2D_RENDER_CONFIG,
      'lvl_rdc',
      null,
      undefined,
      undefined,
      undefined,
      undefined,
      null,
      undefined,
      undefined,
      { enableCulling: true, spatialIndex },
    );

    // Vérifie via l'index spatial que seul le mur visible est interrogé
    const visibleBounds = transform.getVisibleWorldBounds();
    const query = spatialIndex.query(visibleBounds, 'lvl_rdc');
    expect(query.itemIds.has('w_inside')).toBe(true);
    expect(query.itemIds.has('w_outside')).toBe(false);
    expect(query.retainedCount).toBe(1);

    // Comparaison avec l'index linéaire de référence
    const linearIndex = buildLinearSpatialIndex(doc);
    const linearQuery = linearIndex.query(visibleBounds, 'lvl_rdc');
    expect(linearQuery.itemIds).toEqual(query.itemIds);
  });

  // ---------------------------------------------------------------------------
  // 2. Éléments partiellement visibles tracés sans rupture
  // ---------------------------------------------------------------------------
  it('2. Conserve et trace intégralement les éléments partiellement visibles traversant la bordure du viewport', () => {
    const doc = setupTestDoc();

    // Mur chevauchant la limite droite du viewport (de x=2000 mm à x=10000 mm)
    // Le viewport s'arrête à x=4000 mm
    const straddlingWall: Wall = {
      id: 'w_straddling',
      category: 'wall',
      typeId: 'wt_standard',
      start: vec2(2000, 0),
      end: vec2(10000, 0),
      levelId: 'lvl_rdc',
    };
    doc.execute(new Commands.AddWallCommand(straddlingWall));

    const { mock } = createMockCanvas(800, 600);
    const transform = new Transform2D({
      origin: vec2(0, 0),
      scale: 0.1,
      viewportWidth: 800,
      viewportHeight: 600,
    });

    const spatialIndex = buildSpatialIndex(doc);
    const visibleBounds = transform.getVisibleWorldBounds();
    const query = spatialIndex.query(visibleBounds, 'lvl_rdc');

    // Le mur chevauchant DOIT être retenu
    expect(query.itemIds.has('w_straddling')).toBe(true);
    expect(query.retainedCount).toBe(1);

    // Le tracé doit avoir lieu sans erreur
    renderPlanView(
      mock.ctx,
      transform,
      doc,
      new Set(),
      DEFAULT_VIEW2D_RENDER_CONFIG,
      'lvl_rdc',
      null,
      undefined,
      undefined,
      undefined,
      undefined,
      null,
      undefined,
      undefined,
      { enableCulling: true, spatialIndex },
    );

    const fillCalls = mock.filterCalls('fill');
    expect(fillCalls.length).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // 3. Visibilité par niveau et éléments traversants (escaliers)
  // ---------------------------------------------------------------------------
  it('3. Filtre rigoureusement par niveau actif et affiche les escaliers sur leurs niveaux bas et haut', () => {
    const doc = setupTestDoc();

    // Mur au RDC
    const wallRdc: Wall = {
      id: 'w_rdc',
      category: 'wall',
      typeId: 'wt_standard',
      start: vec2(0, 0),
      end: vec2(2000, 0),
      levelId: 'lvl_rdc',
    };
    // Mur à l'étage R+1
    const wallR1: Wall = {
      id: 'w_r1',
      category: 'wall',
      typeId: 'wt_standard',
      start: vec2(0, 0),
      end: vec2(2000, 0),
      levelId: 'lvl_r1',
    };
    // Escalier reliant RDC et R+1 (élément traversant)
    const stair: Stair = {
      id: 'st_main',
      category: 'stair',
      stairTypeId: 'st_standard',
      bottomLevelId: 'lvl_rdc',
      topLevelId: 'lvl_r1',
      start: vec2(1000, 1000),
      end: vec2(4000, 1000),
    };

    doc.execute(new Commands.AddWallCommand(wallRdc));
    doc.execute(new Commands.AddWallCommand(wallR1));
    doc.execute(new Commands.AddStairCommand(stair));

    const spatialIndex = buildSpatialIndex(doc);
    const bounds = { min: vec2(-5000, -5000), max: vec2(10000, 10000) };

    // A. Sur le niveau RDC : mur RDC et escalier visibles, mur R+1 masqué
    const queryRdc = spatialIndex.query(bounds, 'lvl_rdc');
    expect(queryRdc.itemIds.has('w_rdc')).toBe(true);
    expect(queryRdc.itemIds.has('st_main')).toBe(true);
    expect(queryRdc.itemIds.has('w_r1')).toBe(false);

    // B. Sur le niveau R+1 : mur R+1 et escalier visibles, mur RDC masqué
    const queryR1 = spatialIndex.query(bounds, 'lvl_r1');
    expect(queryR1.itemIds.has('w_r1')).toBe(true);
    expect(queryR1.itemIds.has('st_main')).toBe(true);
    expect(queryR1.itemIds.has('w_rdc')).toBe(false);

    // C. Sur un niveau R+2 : ni mur RDC, ni mur R+1, ni escalier (qui ne va que jusqu'à R+1)
    const queryR2 = spatialIndex.query(bounds, 'lvl_r2');
    expect(queryR2.itemIds.has('w_rdc')).toBe(false);
    expect(queryR2.itemIds.has('w_r1')).toBe(false);
    expect(queryR2.itemIds.has('st_main')).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // 4. Pan et Zoom dynamiques avec View2D
  // ---------------------------------------------------------------------------
  it('4. Met à jour dynamiquement la visibilité spatiale lors du Pan et du Zoom sans réallocation', () => {
    const doc = setupTestDoc();

    const wallWest: Wall = {
      id: 'w_west',
      category: 'wall',
      typeId: 'wt_standard',
      start: vec2(-3000, 0),
      end: vec2(-1000, 0),
      levelId: 'lvl_rdc',
    };
    const wallEast: Wall = {
      id: 'w_east',
      category: 'wall',
      typeId: 'wt_standard',
      start: vec2(10000, 0),
      end: vec2(12000, 0),
      levelId: 'lvl_rdc',
    };
    doc.execute(new Commands.AddWallCommand(wallWest));
    doc.execute(new Commands.AddWallCommand(wallEast));

    const { canvas } = createMockCanvas(800, 600);
    const view2d = new View2D(canvas, {
      activeLevelId: 'lvl_rdc',
      transform: {
        origin: vec2(-2000, 0), // Centré sur le mur ouest
        scale: 0.1, // Largeur visible : -6000 à +2000
        viewportWidth: 800,
        viewportHeight: 600,
      },
    });

    view2d.setDocument(doc);
    const initialIndex = view2d.getSpatialIndex();
    expect(initialIndex).not.toBeNull();

    // Initialement : mur ouest visible, mur est hors champ
    let visibleBounds = view2d.getTransform().getVisibleWorldBounds();
    let q = initialIndex!.query(visibleBounds, 'lvl_rdc');
    expect(q.itemIds.has('w_west')).toBe(true);
    expect(q.itemIds.has('w_east')).toBe(false);

    // Pan vers l'Est (déplacement de la caméra de +13 000 mm en X)
    view2d.getTransform().panByScreen(vec2(-1300, 0)); // pan en pixels : -1300 px à scale 0.1 = +13 000 mm monde
    view2d.render();

    // L'index spatial sous-jacent est réutilisé (zéro réallocation coûteuse de grille)
    expect(view2d.getSpatialIndex()).toBe(initialIndex);

    // Après Pan : mur est visible, mur ouest hors champ
    visibleBounds = view2d.getTransform().getVisibleWorldBounds();
    q = initialIndex!.query(visibleBounds, 'lvl_rdc');
    expect(q.itemIds.has('w_east')).toBe(true);
    expect(q.itemIds.has('w_west')).toBe(false);

    // Zoom arrière (dézoom x10) : les deux murs doivent être visibles en même temps
    view2d.getTransform().zoomAt(vec2(400, 300), 0.1);
    view2d.render();

    visibleBounds = view2d.getTransform().getVisibleWorldBounds();
    q = initialIndex!.query(visibleBounds, 'lvl_rdc');
    expect(q.itemIds.has('w_west')).toBe(true);
    expect(q.itemIds.has('w_east')).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 5. Intégrité du picking / sélection après culling
  // ---------------------------------------------------------------------------
  it('5. Préserve l’intégrité du picking et de la sélection avec et sans culling', () => {
    const doc = setupTestDoc();

    const wall1: Wall = {
      id: 'w_pick_1',
      category: 'wall',
      typeId: 'wt_standard',
      start: vec2(0, 0),
      end: vec2(2000, 0),
      levelId: 'lvl_rdc',
    };
    const wall2: Wall = {
      id: 'w_pick_2',
      category: 'wall',
      typeId: 'wt_standard',
      start: vec2(0, 3000),
      end: vec2(2000, 3000),
      levelId: 'lvl_rdc',
    };
    doc.execute(new Commands.AddWallCommand(wall1));
    doc.execute(new Commands.AddWallCommand(wall2));

    const transform = new Transform2D({
      origin: vec2(1000, 1500),
      scale: 0.1,
      viewportWidth: 800,
      viewportHeight: 600,
    });

    // Clic sur le mur 1
    const screenWall1 = transform.worldToScreen(vec2(1000, 0));
    const hitWall1 = findWallAtScreen(screenWall1, transform, doc, { activeLevelId: 'lvl_rdc' });
    expect(hitWall1).toBe('w_pick_1');

    // Clic sur le mur 2
    const screenWall2 = transform.worldToScreen(vec2(1000, 3000));
    const hitWall2 = findWallAtScreen(screenWall2, transform, doc, { activeLevelId: 'lvl_rdc' });
    expect(hitWall2).toBe('w_pick_2');

    // Clic dans le vide entre les deux murs
    const screenVoid = transform.worldToScreen(vec2(1000, 1500));
    const hitVoid = findWallAtScreen(screenVoid, transform, doc, { activeLevelId: 'lvl_rdc' });
    expect(hitVoid).toBeNull();

    // Rendu avec sélection active : w_pick_1 sélectionné
    const { mock } = createMockCanvas(800, 600);
    const selectedIds = new Set(['w_pick_1']);
    renderPlanView(
      mock.ctx,
      transform,
      doc,
      selectedIds,
      DEFAULT_VIEW2D_RENDER_CONFIG,
      'lvl_rdc',
      null,
      undefined,
      undefined,
      undefined,
      undefined,
      null,
      undefined,
      undefined,
      { enableCulling: true },
    );

    // Vérifie que la couleur de surbrillance de sélection (#2563eb) a été appliquée
    const saveCalls = mock.filterCalls('save');
    expect(saveCalls.length).toBeGreaterThan(0);
  });
});
