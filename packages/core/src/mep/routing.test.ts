/**
 * @mini-bim/core/mep/routing.test
 *
 * Tests de qualification du solveur de routage géométrique déterministe MEP
 * et des commandes transactionnelles d'assemblage paramétrique (Sous-phase 9.3.3).
 */

import { describe, it, expect } from 'vitest';
import { BimDocument } from '../document.js';
import { BimValidationError } from '../rules/types.js';
import {
  point3D,
  vector3D,
  distance3D,
  createPort,
  createPipe,
  createMepSystem,
  AddPipeCommand,
  CreateMepSystemCommand,
  solveMepRoute,
  RouteMepPathCommand,
  InsertTeeBranchCommand,
  ConnectWithTransitionCommand,
  type RouteRequest,
} from './index.js';

describe('Sous-phase 9.3.3 — Routage géométrique déterministe & Raccords MEP', () => {
  function setupDoc(): { doc: BimDocument; levelId: string } {
    const doc = BimDocument.createDefaultProject();
    const state = doc.getState();
    const levelId = Object.keys(state.levels)[0]!;
    return { doc, levelId };
  }

  const defaultLevelId = setupDoc().levelId;

  // ==========================================================================
  // 1. Solveur de routage géométrique déterministe (routing.ts)
  // ==========================================================================
  describe('1. Pure 3D Route Solver (solveMepRoute)', () => {
    it('calcule un trajet direct rectiligne continu (mêmes dimensions)', () => {
      const pA = point3D(0, 0, 500);
      const pB = point3D(2000, 0, 500);

      const req: RouteRequest = {
        start: { kind: 'point', point: pA },
        end: { kind: 'point', point: pB },
        category: 'pipe',
        domain: 'plumbing',
        systemType: 'domestic_cold_water',
        diameter: 32,
        levelId: defaultLevelId,
      };

      const plan = solveMepRoute(req);

      expect(plan.diagnostics.status).toBe('valid');
      expect(plan.diagnostics.code).toBe('VALID');
      expect(plan.segments).toHaveLength(1);
      expect(plan.fittings).toHaveLength(0);
      expect(plan.totalLengthMm).toBe(2000);
      expect(plan.segments[0]!.start).toEqual(pA);
      expect(plan.segments[0]!.end).toEqual(pB);
      expect(plan.segments[0]!.diameter).toBe(32);
    });

    it('insère automatiquement un raccord transition si les diamètres diffèrent sur un trajet aligné', () => {
      const pA = point3D(0, 0, 0);
      const pB = point3D(3000, 0, 0);

      const portA = createPort({
        elementId: 'source-eq',
        position: pA,
        direction: vector3D(1, 0, 0), // sort vers +X
        domain: 'plumbing',
        systemType: 'domestic_cold_water',
        shape: 'round',
        diameter: 50,
      });

      const portB = createPort({
        elementId: 'target-eq',
        position: pB,
        direction: vector3D(-1, 0, 0), // sort vers -X (face à l'arrivée)
        domain: 'plumbing',
        systemType: 'domestic_cold_water',
        shape: 'round',
        diameter: 32,
      });

      const req: RouteRequest = {
        start: { kind: 'port', port: portA },
        end: { kind: 'port', port: portB },
        category: 'pipe',
        domain: 'plumbing',
        systemType: 'domestic_cold_water',
        levelId: defaultLevelId,
      };

      const plan = solveMepRoute(req);

      expect(plan.diagnostics.status).toBe('valid');
      expect(plan.segments).toHaveLength(2);
      expect(plan.fittings).toHaveLength(1);
      expect(plan.fittings[0]!.fittingType).toBe('transition');
      expect(plan.fittings[0]!.position).toEqual(point3D(1500, 0, 0));
      expect(plan.segments[0]!.diameter).toBe(50);
      expect(plan.segments[1]!.diameter).toBe(32);
      expect(plan.connectors).toHaveLength(4); // portA-seg1, seg1-trans, trans-seg2, seg2-portB
    });

    it('calcule un coude en L à 90° et bascule l’orientation avec flipOrientation', () => {
      const pA = point3D(0, 0, 0);
      const pB = point3D(2000, 1500, 0);

      // Cas standard (flip: false) -> virage en (2000, 0, 0)
      const reqStandard: RouteRequest = {
        start: { kind: 'point', point: pA },
        end: { kind: 'point', point: pB },
        category: 'pipe',
        domain: 'plumbing',
        systemType: 'domestic_cold_water',
        diameter: 32,
        levelId: defaultLevelId,
        constraints: { flipOrientation: false },
      };

      const planStandard = solveMepRoute(reqStandard);
      expect(planStandard.diagnostics.status).toBe('valid');
      expect(planStandard.segments).toHaveLength(2);
      expect(planStandard.fittings).toHaveLength(1);
      expect(planStandard.fittings[0]!.fittingType).toBe('elbow');
      expect(planStandard.fittings[0]!.position).toEqual(point3D(2000, 0, 0));
      expect(planStandard.fittings[0]!.angleDeg).toBe(90);

      // Cas inversé (flip: true) -> virage en (0, 1500, 0)
      const reqFlipped: RouteRequest = {
        ...reqStandard,
        constraints: { flipOrientation: true },
      };

      const planFlipped = solveMepRoute(reqFlipped);
      expect(planFlipped.diagnostics.status).toBe('valid');
      expect(planFlipped.fittings[0]!.position).toEqual(point3D(0, 1500, 0));
    });

    it('calcule un coude en L à 45° avec anglePreference: 45', () => {
      const pA = point3D(0, 0, 0);
      const pB = point3D(2000, 500, 0); // dx = 2000, dy = 500

      const req45: RouteRequest = {
        start: { kind: 'point', point: pA },
        end: { kind: 'point', point: pB },
        category: 'pipe',
        domain: 'plumbing',
        systemType: 'domestic_cold_water',
        diameter: 32,
        levelId: defaultLevelId,
        constraints: { anglePreference: 45, flipOrientation: false },
      };

      const plan45 = solveMepRoute(req45);
      expect(plan45.diagnostics.status).toBe('valid');
      expect(plan45.fittings).toHaveLength(1);
      expect(plan45.fittings[0]!.fittingType).toBe('elbow');
      expect(plan45.fittings[0]!.angleDeg).toBe(45);
      // Virage calculé à (2000 - 500, 0, 0) = (1500, 0, 0)
      expect(plan45.fittings[0]!.position).toEqual(point3D(1500, 0, 0));
      expect(plan45.segments[0]!.end).toEqual(point3D(1500, 0, 0));
      expect(plan45.segments[1]!.start).toEqual(point3D(1500, 0, 0));
    });

    it('calcule un tracé en baïonnette / déport en Z (double coude)', () => {
      const pA = point3D(0, 0, 0);
      const pB = point3D(3000, 800, 0);

      // Ports axés tous deux selon l'axe X
      const portA = createPort({
        elementId: 'eq1',
        position: pA,
        direction: vector3D(1, 0, 0),
        domain: 'hvac',
        systemType: 'supply_air',
        shape: 'rectangular',
        width: 300,
        height: 200,
      });

      const portB = createPort({
        elementId: 'eq2',
        position: pB,
        direction: vector3D(-1, 0, 0),
        domain: 'hvac',
        systemType: 'supply_air',
        shape: 'rectangular',
        width: 300,
        height: 200,
      });

      const req: RouteRequest = {
        start: { kind: 'port', port: portA },
        end: { kind: 'port', port: portB },
        category: 'duct',
        domain: 'hvac',
        systemType: 'supply_air',
        levelId: defaultLevelId,
      };

      const plan = solveMepRoute(req);
      expect(plan.diagnostics.status).toBe('valid');
      expect(plan.segments).toHaveLength(3);
      expect(plan.fittings).toHaveLength(2);
      expect(plan.fittings[0]!.fittingType).toBe('elbow');
      expect(plan.fittings[1]!.fittingType).toBe('elbow');
      expect(plan.waypoints).toHaveLength(4);
    });

    it('calcule une colonne montante (changement d’altitude ΔZ vertical)', () => {
      const pA = point3D(0, 0, 0);
      const pB = point3D(1500, 0, 2800); // 2.8 m de montée verticale

      const req: RouteRequest = {
        start: { kind: 'point', point: pA },
        end: { kind: 'point', point: pB },
        category: 'pipe',
        domain: 'hydronic',
        systemType: 'hydronic_supply',
        diameter: 40,
        levelId: defaultLevelId,
      };

      const plan = solveMepRoute(req);
      expect(plan.diagnostics.status).toBe('valid');
      expect(plan.segments).toHaveLength(2);
      expect(plan.fittings).toHaveLength(1);
      expect(plan.fittings[0]!.fittingType).toBe('elbow');
      expect(plan.fittings[0]!.position).toEqual(point3D(1500, 0, 0));
      expect(plan.waypoints[1]!.role).toBe('elevation_change');
      expect(plan.totalLengthMm).toBe(1500 + 2800);
    });

    it('rejette les requêtes avec domaines fluides incompatibles', () => {
      const portA = createPort({
        elementId: 'pipe-source',
        position: point3D(0, 0, 0),
        direction: vector3D(1, 0, 0),
        domain: 'plumbing',
        systemType: 'domestic_cold_water',
        shape: 'round',
        diameter: 32,
      });

      const portB = createPort({
        elementId: 'duct-target',
        position: point3D(2000, 0, 0),
        direction: vector3D(-1, 0, 0),
        domain: 'hvac',
        systemType: 'supply_air',
        shape: 'rectangular',
        width: 200,
        height: 100,
      });

      const req: RouteRequest = {
        start: { kind: 'port', port: portA },
        end: { kind: 'port', port: portB },
        category: 'pipe',
        domain: 'plumbing',
        systemType: 'domestic_cold_water',
        levelId: defaultLevelId,
      };

      const plan = solveMepRoute(req);
      expect(plan.diagnostics.status).toBe('rejected');
      expect(plan.diagnostics.code).toBe('INCOMPATIBLE_PORTS');
    });

    it('rejette les requêtes avec micro-segment inférieur à 50 mm', () => {
      const req: RouteRequest = {
        start: { kind: 'point', point: point3D(0, 0, 0) },
        end: { kind: 'point', point: point3D(30, 0, 0) }, // 30 mm < 50 mm
        category: 'pipe',
        domain: 'plumbing',
        systemType: 'domestic_cold_water',
        diameter: 25,
        levelId: defaultLevelId,
      };

      const plan = solveMepRoute(req);
      expect(plan.diagnostics.status).toBe('rejected');
      expect(plan.diagnostics.code).toBe('SEGMENT_TOO_SHORT');
    });
  });

  // ==========================================================================
  // 2. Commande transactionnelle RouteMepPathCommand
  // ==========================================================================
  describe('2. RouteMepPathCommand (Transaction atomique réversible)', () => {
    it('instancie un parcours complet avec connecteurs et permet un Undo/Redo parfait', () => {
      const { doc, levelId } = setupDoc();

      const req: RouteRequest = {
        start: { kind: 'point', point: point3D(0, 0, 0) },
        end: { kind: 'point', point: point3D(2000, 1000, 0) },
        category: 'pipe',
        domain: 'plumbing',
        systemType: 'domestic_cold_water',
        diameter: 32,
        levelId,
      };

      const plan = solveMepRoute(req);
      expect(plan.diagnostics.status).toBe('valid');

      // Exécution de la commande
      doc.execute(new RouteMepPathCommand(plan));

      const pipes = Object.values(doc.getState().pipes ?? {});
      const fittings = Object.values(doc.getState().mepFittings ?? {});
      const connectors = Object.values(doc.getState().mepConnectors ?? {});

      expect(pipes).toHaveLength(2);
      expect(fittings).toHaveLength(1);
      expect(connectors).toHaveLength(2); // segment 1 -> coude -> segment 2

      // Vérification Undo
      doc.undo();
      expect(Object.keys(doc.getState().pipes ?? {})).toHaveLength(0);
      expect(Object.keys(doc.getState().mepFittings ?? {})).toHaveLength(0);
      expect(Object.keys(doc.getState().mepConnectors ?? {})).toHaveLength(0);

      // Vérification Redo
      doc.redo();
      expect(Object.keys(doc.getState().pipes ?? {})).toHaveLength(2);
      expect(Object.keys(doc.getState().mepFittings ?? {})).toHaveLength(1);
      expect(Object.keys(doc.getState().mepConnectors ?? {})).toHaveLength(2);
    });
  });

  // ==========================================================================
  // 3. Piquage en Té Atomique InsertTeeBranchCommand
  // ==========================================================================
  describe('3. InsertTeeBranchCommand (Piquage en Té & Découpe de segment)', () => {
    it('découpe un segment hôte en 2, insère le Té, crée la dérivation et préserve le système', () => {
      const { doc, levelId } = setupDoc();

      // Création du système fluide
      const sysId = 'sys-ecs-1';
      doc.execute(
        new CreateMepSystemCommand(
          createMepSystem({
            id: sysId,
            name: 'Distribution ECS RDC',
            domain: 'plumbing',
            systemType: 'domestic_hot_water',
          }),
        ),
      );

      // Création d'un tuyau principal de 3 000 mm
      const hostPipe = createPipe({
        levelId,
        systemId: sysId,
        start: point3D(0, 0, 0),
        end: point3D(3000, 0, 0),
        diameter: 50,
        domain: 'plumbing',
        systemType: 'domestic_hot_water',
      });
      doc.execute(new AddPipeCommand(hostPipe));

      expect(doc.getState().pipes?.[hostPipe.id]).toBeDefined();
      expect(doc.getState().mepSystems?.[sysId]?.elementIds).toContain(hostPipe.id);

      // Piquage en Té à X = 1200 mm avec branche latérale vers (1200, 1000, 0)
      const splitPoint = point3D(1200, 0, 0);
      const branchEnd = point3D(1200, 1000, 0);

      const teeCmd = new InsertTeeBranchCommand({
        hostSegmentId: hostPipe.id,
        splitPoint,
        branchData: {
          endPoint: branchEnd,
          diameter: 32,
        },
      });

      doc.execute(teeCmd);

      // 1. Le tuyau d'origine doit être supprimé
      expect(doc.getState().pipes?.[hostPipe.id]).toBeUndefined();

      // 2. Exactement 3 tuyaux doivent exister (sous-segment 1, sous-segment 2, et branche)
      const pipes = Object.values(doc.getState().pipes ?? {});
      expect(pipes).toHaveLength(3);

      const sub1 = pipes.find((p) => distance3D(p.start, point3D(0, 0, 0)) < 1);
      const sub2 = pipes.find((p) => distance3D(p.end, point3D(3000, 0, 0)) < 1);
      const branch = pipes.find((p) => distance3D(p.end, branchEnd) < 1);

      expect(sub1).toBeDefined();
      expect(sub2).toBeDefined();
      expect(branch).toBeDefined();
      expect(distance3D(sub1!.end, splitPoint)).toBeLessThan(1);
      expect(distance3D(sub2!.start, splitPoint)).toBeLessThan(1);
      expect(branch!.diameter).toBe(32);

      // 3. Le raccord Té doit exister en splitPoint avec 3 ports
      const fittings = Object.values(doc.getState().mepFittings ?? {});
      expect(fittings).toHaveLength(1);
      const tee = fittings[0]!;
      expect(tee.fittingType).toBe('tee');
      expect(distance3D(tee.position, splitPoint)).toBeLessThan(1);
      expect(tee.ports).toHaveLength(3);

      // 4. Les 3 connecteurs doivent être correctement établis
      const connectors = Object.values(doc.getState().mepConnectors ?? {});
      expect(connectors).toHaveLength(3);

      // 5. Le système doit avoir mis à jour ses références (remplacement de l'hôte par les nouveaux éléments)
      const sys = doc.getState().mepSystems![sysId]!;
      expect(sys.elementIds).not.toContain(hostPipe.id);
      expect(sys.elementIds).toContain(sub1!.id);
      expect(sys.elementIds).toContain(sub2!.id);
      expect(sys.elementIds).toContain(tee.id);
      expect(sys.elementIds).toContain(branch!.id);

      // 6. Test d'atomicité Undo / Redo
      doc.undo();
      // Après Undo : l'hôte est ressuscité avec son ID exact, les sous-segments et le Té disparaissent
      expect(doc.getState().pipes?.[hostPipe.id]).toBeDefined();
      expect(Object.keys(doc.getState().pipes ?? {})).toHaveLength(1);
      expect(Object.keys(doc.getState().mepFittings ?? {})).toHaveLength(0);
      expect(Object.keys(doc.getState().mepConnectors ?? {})).toHaveLength(0);
      expect(doc.getState().mepSystems?.[sysId]?.elementIds).toEqual([hostPipe.id]);

      // Redo : tout réapparaît fidèlement
      doc.redo();
      expect(doc.getState().pipes?.[hostPipe.id]).toBeUndefined();
      expect(Object.keys(doc.getState().pipes ?? {})).toHaveLength(3);
      expect(Object.keys(doc.getState().mepFittings ?? {})).toHaveLength(1);
      expect(Object.keys(doc.getState().mepConnectors ?? {})).toHaveLength(3);
    });

    it('rejette le piquage si le point est trop proche d’une extrémité (< 50 mm)', () => {
      const { doc, levelId } = setupDoc();
      const hostPipe = createPipe({
        levelId,
        start: point3D(0, 0, 0),
        end: point3D(2000, 0, 0),
        diameter: 32,
      });
      doc.execute(new AddPipeCommand(hostPipe));

      // Piquage à 20 mm du début (< 50 mm)
      const invalidCmd = new InsertTeeBranchCommand({
        hostSegmentId: hostPipe.id,
        splitPoint: point3D(20, 0, 0),
      });

      expect(() => doc.execute(invalidCmd)).toThrowError(BimValidationError);
      expect(() => doc.execute(invalidCmd)).toThrow(/TEE_TOO_CLOSE_TO_ENDPOINT/);

      // L'état documentaire reste intact
      expect(doc.getState().pipes?.[hostPipe.id]).toBeDefined();
      expect(Object.keys(doc.getState().mepFittings ?? {})).toHaveLength(0);
    });
  });

  // ==========================================================================
  // 4. Commande ConnectWithTransitionCommand
  // ==========================================================================
  describe('4. ConnectWithTransitionCommand', () => {
    it('insère un raccord transition entre deux ports de diamètres distincts', () => {
      const { doc, levelId } = setupDoc();

      const pipe1 = createPipe({
        levelId,
        start: point3D(0, 0, 0),
        end: point3D(1000, 0, 0),
        diameter: 63,
      });
      const pipe2 = createPipe({
        levelId,
        start: point3D(1000, 0, 0),
        end: point3D(2000, 0, 0),
        diameter: 32,
      });

      doc.execute(new AddPipeCommand(pipe1));
      doc.execute(new AddPipeCommand(pipe2));

      const portA = pipe1.ports[1]!; // à (1000, 0, 0), diam 63
      const portB = pipe2.ports[0]!; // à (1000, 0, 0), diam 32

      doc.execute(new ConnectWithTransitionCommand(portA.id, portB.id));

      const fittings = Object.values(doc.getState().mepFittings ?? {});
      expect(fittings).toHaveLength(1);
      expect(fittings[0]!.fittingType).toBe('transition');

      const connectors = Object.values(doc.getState().mepConnectors ?? {});
      expect(connectors).toHaveLength(2);

      // Undo supprime la transition et les connecteurs
      doc.undo();
      expect(Object.keys(doc.getState().mepFittings ?? {})).toHaveLength(0);
      expect(Object.keys(doc.getState().mepConnectors ?? {})).toHaveLength(0);
    });
  });
});
