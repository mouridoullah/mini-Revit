import { describe, it, expect, beforeEach } from 'vitest';
import {
  Transform2D,
  drawMepElements,
  buildSpatialIndex,
  renderPlanView,
  type DocumentFor2D,
  type PipeFor2D,
  type DuctFor2D,
  type CableTrayFor2D,
  type MepFittingFor2D,
  type MepEquipmentFor2D,
  type ConnectorFor2D,
} from './index.js';
import { createMockCanvas, type MockCanvasContext } from './test-utils.js';

describe('Phase 9.3.1 — Rendu Graphique & Tracé 2D MEP', () => {
  let mock: MockCanvasContext;
  let transform: Transform2D;

  beforeEach(() => {
    const res = createMockCanvas(800, 600);
    mock = res.mock;
    transform = new Transform2D({
      viewportWidth: 800,
      viewportHeight: 600,
      origin: { x: 2000, y: 1500 },
      scale: 0.1, // 1 px = 10 mm
    });
  });

  // --------------------------------------------------------------------------
  // 1. Tuyauterie : Modes unifilaire et bifilaire
  // --------------------------------------------------------------------------
  describe('Tuyauterie (Pipe)', () => {
    it('trace un tuyau en mode unifilaire avec la couleur du système', () => {
      const pipe: PipeFor2D = {
        id: 'p1',
        start: { x: 0, y: 1000, z: 500 },
        end: { x: 3000, y: 1000, z: 500 },
        diameter: 32,
        levelId: 'lvl_0',
        ports: [
          {
            id: 'p1_0',
            elementId: 'p1',
            position: { x: 0, y: 1000, z: 500 },
            direction: { x: -1, y: 0, z: 0 },
            systemType: 'domestic_cold_water',
          },
          {
            id: 'p1_1',
            elementId: 'p1',
            position: { x: 3000, y: 1000, z: 500 },
            direction: { x: 1, y: 0, z: 0 },
            systemType: 'domestic_cold_water',
          },
        ],
      };

      drawMepElements(
        mock.ctx,
        transform,
        {
          pipes: { p1: pipe },
          mepSystems: {
            sys_ef: {
              id: 'sys_ef',
              name: 'EF',
              systemType: 'domestic_cold_water',
              elementIds: ['p1'],
              color: '#2563eb',
            },
          },
        },
        { mode: 'single-line' },
      );

      // Vérifie les appels de tracé Canvas
      const strokeCalls = mock.calls.filter((c) => c.method === 'stroke');
      expect(strokeCalls.length).toBeGreaterThan(0);
      const moveToCalls = mock.calls.filter((c) => c.method === 'moveTo');
      expect(moveToCalls.length).toBeGreaterThan(0);
    });

    it('trace un tuyau en mode bifilaire avec contours et axe pointillé', () => {
      const pipe: PipeFor2D = {
        id: 'p_bifilaire',
        start: { x: 1000, y: 1000, z: 500 },
        end: { x: 4000, y: 1000, z: 500 },
        diameter: 100,
        levelId: 'lvl_0',
      };

      drawMepElements(
        mock.ctx,
        transform,
        { pipes: { p_bifilaire: pipe } },
        { mode: 'double-line' },
      );

      // Mode bifilaire applique setLineDash pour l'axe
      const dashCalls = mock.calls.filter((c) => c.method === 'setLineDash');
      expect(dashCalls.length).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Gaine aéraulique (Duct)
  // --------------------------------------------------------------------------
  describe('Gaine aéraulique (Duct)', () => {
    it('trace une gaine rectangulaire avec poché translucide et contours en mode bifilaire', () => {
      const duct: DuctFor2D = {
        id: 'd1',
        shape: 'rectangular',
        start: { x: 0, y: 2000, z: 2500 },
        end: { x: 3000, y: 2000, z: 2500 },
        width: 400,
        height: 250,
        levelId: 'lvl_0',
      };

      drawMepElements(
        mock.ctx,
        transform,
        {
          ducts: { d1: duct },
          mepSystems: {
            sys_air: {
              id: 'sys_air',
              name: 'Soufflage',
              systemType: 'supply_air',
              elementIds: ['d1'],
            },
          },
        },
        { mode: 'double-line' },
      );

      const fillCalls = mock.calls.filter((c) => c.method === 'fill');
      expect(fillCalls.length).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Chemin de câbles (CableTray)
  // --------------------------------------------------------------------------
  describe('Chemin de câbles (CableTray)', () => {
    it('trace les deux rives latérales et les barreaux d\'échelle transversaux', () => {
      const tray: CableTrayFor2D = {
        id: 'tray_1',
        start: { x: 0, y: 0, z: 2800 },
        end: { x: 2000, y: 0, z: 2800 },
        width: 200,
        height: 50,
        levelId: 'lvl_0',
      };

      drawMepElements(
        mock.ctx,
        transform,
        { cableTrays: { tray_1: tray } },
      );

      const moveToCalls = mock.calls.filter((c) => c.method === 'moveTo');
      // Deux rives + plusieurs barreaux transversaux
      expect(moveToCalls.length).toBeGreaterThanOrEqual(3);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Pastilles de ports ouverts vs connectés
  // --------------------------------------------------------------------------
  describe('Pastilles de ports libres vs connectés', () => {
    it('affiche une pastille évidée sur un port libre et la masque s\'il est raccordé', () => {
      const pipe1: PipeFor2D = {
        id: 'pipe1',
        start: { x: 0, y: 0, z: 500 },
        end: { x: 1000, y: 0, z: 500 },
        diameter: 32,
        ports: [
          {
            id: 'port_1a',
            elementId: 'pipe1',
            position: { x: 0, y: 0, z: 500 },
            direction: { x: -1, y: 0, z: 0 },
          },
          {
            id: 'port_1b',
            elementId: 'pipe1',
            position: { x: 1000, y: 0, z: 500 },
            direction: { x: 1, y: 0, z: 0 },
          },
        ],
      };

      const pipe2: PipeFor2D = {
        id: 'pipe2',
        start: { x: 1000, y: 0, z: 500 },
        end: { x: 2000, y: 0, z: 500 },
        diameter: 32,
        ports: [
          {
            id: 'port_2a',
            elementId: 'pipe2',
            position: { x: 1000, y: 0, z: 500 },
            direction: { x: -1, y: 0, z: 0 },
          },
          {
            id: 'port_2b',
            elementId: 'pipe2',
            position: { x: 2000, y: 0, z: 500 },
            direction: { x: 1, y: 0, z: 0 },
          },
        ],
      };

      // Connecteur unissant port_1b et port_2a
      const conn: ConnectorFor2D = {
        id: 'conn_1',
        portAId: 'port_1b',
        portBId: 'port_2a',
      };

      drawMepElements(
        mock.ctx,
        transform,
        {
          pipes: { pipe1, pipe2 },
          mepConnectors: { conn_1: conn },
        },
        { showOpenPortMarkers: true },
      );

      // Des arcs sont tracés pour les 2 ports ouverts (port_1a et port_2b), mais pas pour le joint connecté
      const arcCalls = mock.calls.filter((c) => c.method === 'arc');
      expect(arcCalls.length).toBe(2);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Raccords et Équipements
  // --------------------------------------------------------------------------
  describe('Raccords (Fittings) et Équipements', () => {
    it('trace un raccord coude et un équipement avec son symbole et ses ports', () => {
      const fitting: MepFittingFor2D = {
        id: 'fit_1',
        fittingType: 'elbow',
        position: { x: 1000, y: 1000, z: 500 },
        ports: [
          {
            id: 'fp0',
            elementId: 'fit_1',
            position: { x: 900, y: 1000, z: 500 },
            direction: { x: -1, y: 0, z: 0 },
          },
          {
            id: 'fp1',
            elementId: 'fit_1',
            position: { x: 1000, y: 1100, z: 500 },
            direction: { x: 0, y: 1, z: 0 },
          },
        ],
      };

      const eq: MepEquipmentFor2D = {
        id: 'eq_1',
        family: 'boiler',
        position: { x: 2000, y: 2000, z: 0 },
        width: 600,
        depth: 400,
        height: 900,
        ports: [
          {
            id: 'eq_p0',
            elementId: 'eq_1',
            position: { x: 1900, y: 2000, z: 800 },
            direction: { x: 0, y: -1, z: 0 },
            systemType: 'domestic_hot_water',
          },
        ],
      };

      drawMepElements(
        mock.ctx,
        transform,
        {
          mepFittings: { fit_1: fitting },
          mepEquipments: { eq_1: eq },
        },
      );

      const rectCalls = mock.calls.filter((c) => c.method === 'fillRect');
      expect(rectCalls.length).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // 6. Filtrage par niveau (Level Filtering)
  // --------------------------------------------------------------------------
  describe('Filtrage par niveau (effectiveLevelId)', () => {
    it('n\'affiche que les éléments MEP du niveau actif', () => {
      const pipeRdc: PipeFor2D = {
        id: 'pipe_rdc',
        start: { x: 0, y: 0, z: 500 },
        end: { x: 1000, y: 0, z: 500 },
        diameter: 32,
        levelId: 'lvl_rdc',
      };
      const pipeR1: PipeFor2D = {
        id: 'pipe_r1',
        start: { x: 0, y: 0, z: 3500 },
        end: { x: 1000, y: 0, z: 3500 },
        diameter: 32,
        levelId: 'lvl_r1',
      };

      // Rendu avec filtre niveau RDC
      drawMepElements(
        mock.ctx,
        transform,
        { pipes: { pipe_rdc: pipeRdc, pipe_r1: pipeR1 } },
        undefined,
        { effectiveLevelId: 'lvl_rdc' },
      );

      const strokeCountRdc = mock.calls.filter((c) => c.method === 'stroke').length;
      expect(strokeCountRdc).toBe(1);

      // Réinitialisation du canvas et rendu avec filtre R1
      mock.clearCalls();
      drawMepElements(
        mock.ctx,
        transform,
        { pipes: { pipe_rdc: pipeRdc, pipe_r1: pipeR1 } },
        undefined,
        { effectiveLevelId: 'lvl_r1' },
      );

      const strokeCountR1 = mock.calls.filter((c) => c.method === 'stroke').length;
      expect(strokeCountR1).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // 7. Indexation spatiale et Frustum Culling
  // --------------------------------------------------------------------------
  describe('Indexation spatiale SpatialGrid2D & Culling', () => {
    it('indexe les entités MEP et filtre les éléments hors champ', () => {
      const mockDoc: DocumentFor2D = {
        getState: () => ({
          walls: {},
          wallTypes: {},
          pipes: {
            p_visible: {
              id: 'p_visible',
              start: { x: 2000, y: 1500, z: 500 },
              end: { x: 2500, y: 1500, z: 500 },
              diameter: 32,
              levelId: 'lvl_rdc',
            },
            p_far_away: {
              id: 'p_far_away',
              start: { x: 100000, y: 100000, z: 500 },
              end: { x: 101000, y: 100000, z: 500 },
              diameter: 32,
              levelId: 'lvl_rdc',
            },
          },
          ducts: {
            d_visible: {
              id: 'd_visible',
              shape: 'round',
              start: { x: 2000, y: 1200, z: 2500 },
              end: { x: 2600, y: 1200, z: 2500 },
              diameter: 200,
              levelId: 'lvl_rdc',
            },
          },
        }),
      };

      const grid = buildSpatialIndex(mockDoc);
      const queryBounds = transform.getVisibleWorldBounds();
      const visibleIds = grid.queryIds(queryBounds, 'lvl_rdc');

      expect(visibleIds.has('p_visible')).toBe(true);
      expect(visibleIds.has('d_visible')).toBe(true);
      expect(visibleIds.has('p_far_away')).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 8. Intégration globale renderPlanView
  // --------------------------------------------------------------------------
  describe('Intégration globale renderPlanView', () => {
    it('dessine harmonieusement l\'architecture et les réseaux MEP', () => {
      const doc: DocumentFor2D = {
        getState: () => ({
          walls: {
            w1: {
              id: 'w1',
              start: { x: 0, y: 0 },
              end: { x: 4000, y: 0 },
              typeId: 'wt1',
              levelId: 'lvl_rdc',
            },
          },
          wallTypes: {
            wt1: { thickness: 200 },
          },
          levels: {
            lvl_rdc: { id: 'lvl_rdc', name: 'RDC', elevation: 0 },
          },
          pipes: {
            pipe_water: {
              id: 'pipe_water',
              start: { x: 500, y: 100, z: 500 },
              end: { x: 3500, y: 100, z: 500 },
              diameter: 32,
              levelId: 'lvl_rdc',
            },
          },
        }),
      };

      renderPlanView(
        mock.ctx,
        transform,
        doc,
        new Set(),
        {},
        'lvl_rdc',
      );

      // Le canvas a reçu les tracés des murs ET du tuyau
      const strokeCalls = mock.calls.filter((c) => c.method === 'stroke');
      expect(strokeCalls.length).toBeGreaterThan(0);
    });
  });
});
