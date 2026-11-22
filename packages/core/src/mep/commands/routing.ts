/**
 * @tabax/core/mep/commands/routing
 *
 * Commandes transactionnelles de routage et de modifications géométriques complexes MEP :
 * RouteMepPathCommand, InsertTeeBranchCommand, ConnectWithTransitionCommand.
 */

import type { Command } from '../../commands/base.js';
import type { BimState, ElementId } from '../../types.js';
import { generateId } from '../../ids.js';
import { BimValidationError } from '../../rules/types.js';
import type {
  Pipe,
  Duct,
  CableTray,
  MepFitting,
  Connector,
  Point3D,
  Vector3D,
  Port,
} from '../types.js';
import {
  point3D,
  vector3D,
  distance3D,
  normalize3D,
  directionBetweenPoints,
} from '../math3d.js';
import {
  createPipe,
  createDuct,
  createCableTray,
  createMepFitting,
  createPort,
} from '../catalog.js';
import type { RoutePlan } from '../routing.js';
import { MEP_ROUTING_CONSTANTS } from '../routing.js';
import { MepNetworkGraph } from '../graph.js';
import { getMepElementKind } from './helpers.js';

// ============================================================================
// 9. Commandes de Routage et Insertion Paramétrique de Raccords (Sous-phase 9.3.3)
// ============================================================================

/**
 * Matérialise un tracé multi-tronçons calculé par le solveur de routage (RoutePlan)
 * en créant de façon transactionnelle tous les segments, raccords (elbow, transition)
 * et connecteurs requis.
 */
export class RouteMepPathCommand implements Command {
  public readonly name = 'RouteMepPath';
  private changedIds: ElementId[] = [];

  public constructor(public readonly plan: RoutePlan) {}

  public apply(draft: BimState): void {
    if (this.plan.diagnostics.status === 'rejected') {
      throw new BimValidationError(
        this.plan.diagnostics.code,
        `Cannot execute rejected route plan: ${this.plan.diagnostics.message}`,
      );
    }

    const changed = new Set<ElementId>();

    // 1. Instancier les segments du plan
    for (const seg of this.plan.segments) {
      changed.add(seg.id);
      if (seg.category === 'pipe') {
        const pipe = createPipe({
          id: seg.id,
          levelId: seg.levelId,
          ...(seg.systemId ? { systemId: seg.systemId } : {}),
          start: seg.start,
          end: seg.end,
          diameter: seg.diameter ?? 32,
          domain: seg.domain === 'hydronic' ? 'hydronic' : 'plumbing',
          systemType: seg.systemType as 'domestic_cold_water',
          port0Id: seg.port0Id,
          port1Id: seg.port1Id,
        });
        const pipes = ((draft as { pipes: Record<ElementId, Pipe> }).pipes ??= {});
        pipes[pipe.id] = pipe;
      } else if (seg.category === 'duct') {
        const duct = createDuct({
          id: seg.id,
          levelId: seg.levelId,
          ...(seg.systemId ? { systemId: seg.systemId } : {}),
          start: seg.start,
          end: seg.end,
          shape: seg.shape ?? 'rectangular',
          ...(seg.diameter !== undefined ? { diameter: seg.diameter } : {}),
          ...(seg.width !== undefined ? { width: seg.width } : {}),
          ...(seg.height !== undefined ? { height: seg.height } : {}),
          systemType: seg.systemType as 'supply_air',
          port0Id: seg.port0Id,
          port1Id: seg.port1Id,
        });
        const ducts = ((draft as { ducts: Record<ElementId, Duct> }).ducts ??= {});
        ducts[duct.id] = duct;
      } else if (seg.category === 'cableTray') {
        const tray = createCableTray({
          id: seg.id,
          levelId: seg.levelId,
          ...(seg.systemId ? { systemId: seg.systemId } : {}),
          start: seg.start,
          end: seg.end,
          width: seg.width ?? 150,
          height: seg.height ?? 50,
          systemType: seg.systemType as 'power',
          port0Id: seg.port0Id,
          port1Id: seg.port1Id,
        });
        const trays = ((draft as { cableTrays: Record<ElementId, CableTray> }).cableTrays ??= {});
        trays[tray.id] = tray;
      }

      // Enregistrement dans le système MEP
      if (seg.systemId && draft.mepSystems?.[seg.systemId]) {
        const sys = draft.mepSystems[seg.systemId];
        if (sys && !sys.elementIds.includes(seg.id)) {
          draft.mepSystems[seg.systemId] = {
            ...sys,
            elementIds: [...sys.elementIds, seg.id],
          };
          changed.add(seg.systemId);
        }
      }
    }

    // 2. Instancier les raccords
    for (const fit of this.plan.fittings) {
      changed.add(fit.id);
      const fitting = createMepFitting({
        id: fit.id,
        levelId: fit.levelId,
        ...(fit.systemId ? { systemId: fit.systemId } : {}),
        fittingType: fit.fittingType,
        domain: fit.domain,
        systemType: fit.systemType,
        position: fit.position,
        ports: fit.ports,
      });
      const mepFittings = ((draft as { mepFittings: Record<ElementId, MepFitting> }).mepFittings ??= {});
      mepFittings[fitting.id] = fitting;

      if (fit.systemId && draft.mepSystems?.[fit.systemId]) {
        const sys = draft.mepSystems[fit.systemId];
        if (sys && !sys.elementIds.includes(fit.id)) {
          draft.mepSystems[fit.systemId] = {
            ...sys,
            elementIds: [...sys.elementIds, fit.id],
          };
          changed.add(fit.systemId);
        }
      }
    }

    // 3. Instancier les connecteurs
    const mepConnectors = ((draft as { mepConnectors: Record<ElementId, Connector> }).mepConnectors ??= {});
    for (const conn of this.plan.connectors) {
      changed.add(conn.id);
      changed.add(conn.portAId);
      changed.add(conn.portBId);
      mepConnectors[conn.id] = {
        id: conn.id,
        category: 'mepConnector',
        portAId: conn.portAId,
        portBId: conn.portBId,
        ...(this.plan.request.systemId ? { systemId: this.plan.request.systemId } : {}),
      };
    }

    this.changedIds = Array.from(changed);
  }

  public getChangedIds(): readonly ElementId[] {
    return this.changedIds;
  }
}

export interface InsertTeeBranchOptions {
  readonly hostSegmentId: ElementId;
  readonly splitPoint: Point3D;
  readonly branchData?: {
    readonly endPoint: Point3D;
    readonly diameter?: number | undefined;
    readonly width?: number | undefined;
    readonly height?: number | undefined;
  } | undefined;
  readonly branchPortId?: ElementId | undefined;
  readonly teeId?: ElementId | undefined;
}

/**
 * Pique un Té de dérivation dans un segment linéaire existant (tuyau, gaine, chemin de câbles).
 * Découpe atomiquement le segment hôte en 2 sous-segments, insère le té, réassigne les connecteurs
 * incidents et met à jour l'appartenance au système fluide.
 */
export class InsertTeeBranchCommand implements Command {
  public readonly name = 'InsertTeeBranch';
  private changedIds: ElementId[] = [];

  public constructor(public readonly options: InsertTeeBranchOptions) {}

  public apply(draft: BimState): void {
    const { hostSegmentId, splitPoint } = this.options;
    const kind = getMepElementKind(draft, hostSegmentId);
    if (!kind || (kind !== 'pipe' && kind !== 'duct' && kind !== 'cableTray')) {
      throw new BimValidationError('ELEMENT_NOT_FOUND', `Linear MEP host segment "${hostSegmentId}" not found.`);
    }

    let hostStart: Point3D;
    let hostEnd: Point3D;
    let hostPorts: readonly Port[];
    let hostSystemId: ElementId | undefined;
    let hostLevelId: ElementId;

    if (kind === 'pipe') {
      const p = draft.pipes?.[hostSegmentId];
      if (!p) throw new BimValidationError('ELEMENT_NOT_FOUND', `Pipe "${hostSegmentId}" not found.`);
      hostStart = p.start;
      hostEnd = p.end;
      hostPorts = p.ports;
      hostSystemId = p.systemId;
      hostLevelId = p.levelId;
    } else if (kind === 'duct') {
      const d = draft.ducts?.[hostSegmentId];
      if (!d) throw new BimValidationError('ELEMENT_NOT_FOUND', `Duct "${hostSegmentId}" not found.`);
      hostStart = d.start;
      hostEnd = d.end;
      hostPorts = d.ports;
      hostSystemId = d.systemId;
      hostLevelId = d.levelId;
    } else {
      const c = draft.cableTrays?.[hostSegmentId];
      if (!c) throw new BimValidationError('ELEMENT_NOT_FOUND', `CableTray "${hostSegmentId}" not found.`);
      hostStart = c.start;
      hostEnd = c.end;
      hostPorts = c.ports;
      hostSystemId = c.systemId;
      hostLevelId = c.levelId;
    }

    // Projection de splitPoint sur l'axe du segment hôte
    const vx = hostEnd.x - hostStart.x;
    const vy = hostEnd.y - hostStart.y;
    const vz = hostEnd.z - hostStart.z;
    const lenSq = vx * vx + vy * vy + vz * vz;
    const len = Math.sqrt(lenSq);

    if (len < 1e-4) {
      throw new BimValidationError('SEGMENT_TOO_SHORT', 'Host segment is degenerate.');
    }

    const ux = splitPoint.x - hostStart.x;
    const uy = splitPoint.y - hostStart.y;
    const uz = splitPoint.z - hostStart.z;
    const t = (ux * vx + uy * vy + uz * vz) / lenSq;

    const projPoint = point3D(
      hostStart.x + t * vx,
      hostStart.y + t * vy,
      hostStart.z + t * vz,
    );

    const distStart = distance3D(projPoint, hostStart);
    const distEnd = distance3D(projPoint, hostEnd);
    const minSegLen = MEP_ROUTING_CONSTANTS.MIN_SEGMENT_LENGTH_MM;

    if (distStart < minSegLen || distEnd < minSegLen || t <= 0.001 || t >= 0.999) {
      throw new BimValidationError(
        'TEE_TOO_CLOSE_TO_ENDPOINT',
        `Split point is too close to host segment endpoints (${Math.round(distStart)} mm and ${Math.round(distEnd)} mm, minimum required: ${minSegLen} mm).`,
      );
    }

    const changed = new Set<ElementId>();
    changed.add(hostSegmentId);

    // Propriétés communes
    const domain = hostPorts[0]?.domain ?? 'plumbing';
    const systemType = hostPorts[0]?.systemType ?? 'domestic_cold_water';
    const shape = hostPorts[0]?.shape ?? 'round';
    const diameter = hostPorts[0]?.diameter;
    const width = hostPorts[0]?.width;
    const height = hostPorts[0]?.height;

    // Calcul de la direction de la branche latérale du Té
    let branchDir: Vector3D;
    if (this.options.branchData?.endPoint) {
      branchDir = directionBetweenPoints(projPoint, this.options.branchData.endPoint);
    } else if (this.options.branchPortId) {
      const graph = MepNetworkGraph.build(draft);
      const targetPort = graph.getPort(this.options.branchPortId);
      branchDir = targetPort
        ? directionBetweenPoints(projPoint, targetPort.position)
        : normalize3D(vector3D(-vy, vx, 0));
    } else {
      const horizNorm = Math.hypot(vx, vy);
      branchDir = horizNorm > 1e-4
        ? normalize3D(vector3D(-vy, vx, 0))
        : vector3D(1, 0, 0);
    }

    const dirRunStart = directionBetweenPoints(projPoint, hostStart);
    const dirRunEnd = directionBetweenPoints(projPoint, hostEnd);

    // 1. Création du Raccord Té
    const teeId = this.options.teeId ?? generateId();
    changed.add(teeId);

    const teePort0 = createPort({
      elementId: teeId,
      position: projPoint,
      direction: dirRunStart,
      domain,
      systemType,
      shape,
      ...(diameter !== undefined ? { diameter } : {}),
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {}),
      label: 'TEE_RUN_START',
    });

    const teePort1 = createPort({
      elementId: teeId,
      position: projPoint,
      direction: dirRunEnd,
      domain,
      systemType,
      shape,
      ...(diameter !== undefined ? { diameter } : {}),
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {}),
      label: 'TEE_RUN_END',
    });

    const teePort2 = createPort({
      elementId: teeId,
      position: projPoint,
      direction: branchDir,
      domain,
      systemType,
      shape,
      diameter: this.options.branchData?.diameter ?? diameter,
      width: this.options.branchData?.width ?? width,
      height: this.options.branchData?.height ?? height,
      label: 'TEE_BRANCH',
    });

    const teeFitting = createMepFitting({
      id: teeId,
      levelId: hostLevelId,
      ...(hostSystemId ? { systemId: hostSystemId } : {}),
      fittingType: 'tee',
      domain,
      systemType,
      position: projPoint,
      ports: [teePort0, teePort1, teePort2],
    });

    const mepFittings = ((draft as { mepFittings: Record<ElementId, MepFitting> }).mepFittings ??= {});
    mepFittings[teeId] = teeFitting;

    // 2. Création des 2 sous-segments
    const subSeg1Id = generateId();
    const subSeg2Id = generateId();
    changed.add(subSeg1Id);
    changed.add(subSeg2Id);

    let subSeg1Port0Id: ElementId;
    let subSeg1Port1Id: ElementId;
    let subSeg2Port0Id: ElementId;
    let subSeg2Port1Id: ElementId;

    if (kind === 'pipe') {
      const pipes = draft.pipes;
      if (!pipes) throw new BimValidationError('ELEMENT_NOT_FOUND', `Pipes collection not found.`);
      const origPipe = pipes[hostSegmentId];
      if (!origPipe) throw new BimValidationError('ELEMENT_NOT_FOUND', `Pipe "${hostSegmentId}" not found.`);
      const sub1 = createPipe({
        id: subSeg1Id,
        levelId: hostLevelId,
        ...(hostSystemId ? { systemId: hostSystemId } : {}),
        start: hostStart,
        end: projPoint,
        diameter: origPipe.diameter,
        domain: origPipe.ports[0]?.domain === 'hydronic' ? 'hydronic' : 'plumbing',
        systemType: origPipe.ports[0]?.systemType as 'domestic_cold_water',
        ...(origPipe.thickness !== undefined ? { thickness: origPipe.thickness } : {}),
        ...(origPipe.material ? { material: origPipe.material } : {}),
      });
      const sub2 = createPipe({
        id: subSeg2Id,
        levelId: hostLevelId,
        ...(hostSystemId ? { systemId: hostSystemId } : {}),
        start: projPoint,
        end: hostEnd,
        diameter: origPipe.diameter,
        domain: origPipe.ports[1]?.domain === 'hydronic' ? 'hydronic' : 'plumbing',
        systemType: origPipe.ports[1]?.systemType as 'domestic_cold_water',
        ...(origPipe.thickness !== undefined ? { thickness: origPipe.thickness } : {}),
        ...(origPipe.material ? { material: origPipe.material } : {}),
      });
      subSeg1Port0Id = sub1.ports[0]?.id ?? '';
      subSeg1Port1Id = sub1.ports[1]?.id ?? '';
      subSeg2Port0Id = sub2.ports[0]?.id ?? '';
      subSeg2Port1Id = sub2.ports[1]?.id ?? '';

      pipes[subSeg1Id] = sub1;
      pipes[subSeg2Id] = sub2;
      Reflect.deleteProperty(pipes, hostSegmentId);
    } else if (kind === 'duct') {
      const ducts = draft.ducts;
      if (!ducts) throw new BimValidationError('ELEMENT_NOT_FOUND', `Ducts collection not found.`);
      const origDuct = ducts[hostSegmentId];
      if (!origDuct) throw new BimValidationError('ELEMENT_NOT_FOUND', `Duct "${hostSegmentId}" not found.`);
      const sub1 = createDuct({
        id: subSeg1Id,
        levelId: hostLevelId,
        ...(hostSystemId ? { systemId: hostSystemId } : {}),
        start: hostStart,
        end: projPoint,
        shape: origDuct.shape,
        ...(origDuct.diameter !== undefined ? { diameter: origDuct.diameter } : {}),
        ...(origDuct.width !== undefined ? { width: origDuct.width } : {}),
        ...(origDuct.height !== undefined ? { height: origDuct.height } : {}),
        systemType: origDuct.ports[0]?.systemType as 'supply_air',
      });
      const sub2 = createDuct({
        id: subSeg2Id,
        levelId: hostLevelId,
        ...(hostSystemId ? { systemId: hostSystemId } : {}),
        start: projPoint,
        end: hostEnd,
        shape: origDuct.shape,
        ...(origDuct.diameter !== undefined ? { diameter: origDuct.diameter } : {}),
        ...(origDuct.width !== undefined ? { width: origDuct.width } : {}),
        ...(origDuct.height !== undefined ? { height: origDuct.height } : {}),
        systemType: origDuct.ports[1]?.systemType as 'supply_air',
      });
      subSeg1Port0Id = sub1.ports[0]?.id ?? '';
      subSeg1Port1Id = sub1.ports[1]?.id ?? '';
      subSeg2Port0Id = sub2.ports[0]?.id ?? '';
      subSeg2Port1Id = sub2.ports[1]?.id ?? '';

      ducts[subSeg1Id] = sub1;
      ducts[subSeg2Id] = sub2;
      Reflect.deleteProperty(ducts, hostSegmentId);
    } else {
      const cableTrays = draft.cableTrays;
      if (!cableTrays) throw new BimValidationError('ELEMENT_NOT_FOUND', `CableTrays collection not found.`);
      const origTray = cableTrays[hostSegmentId];
      if (!origTray) throw new BimValidationError('ELEMENT_NOT_FOUND', `CableTray "${hostSegmentId}" not found.`);
      const sub1 = createCableTray({
        id: subSeg1Id,
        levelId: hostLevelId,
        ...(hostSystemId ? { systemId: hostSystemId } : {}),
        start: hostStart,
        end: projPoint,
        width: origTray.width,
        height: origTray.height,
        systemType: origTray.ports[0]?.systemType as 'power',
      });
      const sub2 = createCableTray({
        id: subSeg2Id,
        levelId: hostLevelId,
        ...(hostSystemId ? { systemId: hostSystemId } : {}),
        start: projPoint,
        end: hostEnd,
        width: origTray.width,
        height: origTray.height,
        systemType: origTray.ports[1]?.systemType as 'power',
      });
      subSeg1Port0Id = sub1.ports[0]?.id ?? '';
      subSeg1Port1Id = sub1.ports[1]?.id ?? '';
      subSeg2Port0Id = sub2.ports[0]?.id ?? '';
      subSeg2Port1Id = sub2.ports[1]?.id ?? '';

      cableTrays[subSeg1Id] = sub1;
      cableTrays[subSeg2Id] = sub2;
      Reflect.deleteProperty(cableTrays, hostSegmentId);
    }

    // 3. Re-câblage des connecteurs incidents de l'ancien segment hôte
    const oldPort0Id = hostPorts[0]?.id;
    const oldPort1Id = hostPorts[1]?.id;

    if (draft.mepConnectors) {
      for (const [connId, conn] of Object.entries(draft.mepConnectors)) {
        if (!conn) continue;
        let touched = false;
        let newPortA = conn.portAId;
        let newPortB = conn.portBId;

        if (conn.portAId === oldPort0Id) {
          newPortA = subSeg1Port0Id;
          touched = true;
        } else if (conn.portAId === oldPort1Id) {
          newPortA = subSeg2Port1Id;
          touched = true;
        }

        if (conn.portBId === oldPort0Id) {
          newPortB = subSeg1Port0Id;
          touched = true;
        } else if (conn.portBId === oldPort1Id) {
          newPortB = subSeg2Port1Id;
          touched = true;
        }

        if (touched) {
          draft.mepConnectors[connId] = {
            ...conn,
            portAId: newPortA,
            portBId: newPortB,
          };
          changed.add(connId);
        }
      }
    }

    // 4. Connecteurs du Té
    const mepConnectors = ((draft as { mepConnectors: Record<ElementId, Connector> }).mepConnectors ??= {});

    const connTee1Id = generateId();
    mepConnectors[connTee1Id] = {
      id: connTee1Id,
      category: 'mepConnector',
      portAId: subSeg1Port1Id,
      portBId: teePort0.id,
      ...(hostSystemId ? { systemId: hostSystemId } : {}),
    };
    changed.add(connTee1Id);

    const connTee2Id = generateId();
    mepConnectors[connTee2Id] = {
      id: connTee2Id,
      category: 'mepConnector',
      portAId: teePort1.id,
      portBId: subSeg2Port0Id,
      ...(hostSystemId ? { systemId: hostSystemId } : {}),
    };
    changed.add(connTee2Id);

    // Branche latérale si spécifiée
    if (this.options.branchData) {
      const branchSegId = generateId();
      changed.add(branchSegId);

      let branchPort0Id: ElementId;
      if (kind === 'pipe') {
        const pipes = draft.pipes;
        if (!pipes) throw new BimValidationError('ELEMENT_NOT_FOUND', `Pipes collection not found.`);
        const branchPipe = createPipe({
          id: branchSegId,
          levelId: hostLevelId,
          ...(hostSystemId ? { systemId: hostSystemId } : {}),
          start: projPoint,
          end: this.options.branchData.endPoint,
          diameter: this.options.branchData.diameter ?? diameter ?? 32,
          domain: domain === 'hydronic' ? 'hydronic' : 'plumbing',
          systemType: systemType as 'domestic_cold_water',
        });
        branchPort0Id = branchPipe.ports[0]?.id ?? '';
        pipes[branchSegId] = branchPipe;
      } else if (kind === 'duct') {
        const ducts = draft.ducts;
        if (!ducts) throw new BimValidationError('ELEMENT_NOT_FOUND', `Ducts collection not found.`);
        const branchDuct = createDuct({
          id: branchSegId,
          levelId: hostLevelId,
          ...(hostSystemId ? { systemId: hostSystemId } : {}),
          start: projPoint,
          end: this.options.branchData.endPoint,
          shape,
          ...(this.options.branchData.diameter !== undefined ? { diameter: this.options.branchData.diameter } : {}),
          ...(this.options.branchData.width !== undefined ? { width: this.options.branchData.width } : {}),
          ...(this.options.branchData.height !== undefined ? { height: this.options.branchData.height } : {}),
          systemType: systemType as 'supply_air',
        });
        branchPort0Id = branchDuct.ports[0]?.id ?? '';
        ducts[branchSegId] = branchDuct;
      } else {
        const cableTrays = draft.cableTrays;
        if (!cableTrays) throw new BimValidationError('ELEMENT_NOT_FOUND', `CableTrays collection not found.`);
        const branchTray = createCableTray({
          id: branchSegId,
          levelId: hostLevelId,
          ...(hostSystemId ? { systemId: hostSystemId } : {}),
          start: projPoint,
          end: this.options.branchData.endPoint,
          width: this.options.branchData.width ?? width ?? 150,
          height: this.options.branchData.height ?? height ?? 50,
          systemType: systemType as 'power',
        });
        branchPort0Id = branchTray.ports[0]?.id ?? '';
        cableTrays[branchSegId] = branchTray;
      }

      const connBranchId = generateId();
      mepConnectors[connBranchId] = {
        id: connBranchId,
        category: 'mepConnector',
        portAId: teePort2.id,
        portBId: branchPort0Id,
        ...(hostSystemId ? { systemId: hostSystemId } : {}),
      };
      changed.add(connBranchId);

      if (hostSystemId && draft.mepSystems) {
        const sys = draft.mepSystems[hostSystemId];
        if (sys) {
          draft.mepSystems[hostSystemId] = {
            ...sys,
            elementIds: [...sys.elementIds, branchSegId],
          };
        }
      }
    } else if (this.options.branchPortId) {
      const connBranchId = generateId();
      mepConnectors[connBranchId] = {
        id: connBranchId,
        category: 'mepConnector',
        portAId: teePort2.id,
        portBId: this.options.branchPortId,
        ...(hostSystemId ? { systemId: hostSystemId } : {}),
      };
      changed.add(connBranchId);
      changed.add(this.options.branchPortId);
    }

    // 5. Mise à jour de l'appartenance au système
    if (hostSystemId && draft.mepSystems) {
      const sys = draft.mepSystems[hostSystemId];
      if (sys) {
        draft.mepSystems[hostSystemId] = {
          ...sys,
          elementIds: sys.elementIds
            .filter((id) => id !== hostSegmentId)
            .concat([subSeg1Id, subSeg2Id, teeId]),
        };
        changed.add(hostSystemId);
      }
    }

    this.changedIds = Array.from(changed);
  }

  public getChangedIds(): readonly ElementId[] {
    return this.changedIds;
  }
}

/**
 * Connecte deux ports de même domaine technique mais de sections ou diamètres différents
 * en insérant automatiquement un raccord paramétrique de type transition (réduction).
 */
export class ConnectWithTransitionCommand implements Command {
  public readonly name = 'ConnectWithTransition';
  private changedIds: ElementId[] = [];

  public constructor(
    public readonly portAId: ElementId,
    public readonly portBId: ElementId,
    public readonly options?: {
      readonly systemId?: ElementId | undefined;
      readonly levelId?: ElementId | undefined;
      readonly transitionId?: ElementId | undefined;
    } | undefined,
  ) {}

  public apply(draft: BimState): void {
    const graph = MepNetworkGraph.build(draft);
    const portA = graph.getPort(this.portAId);
    const portB = graph.getPort(this.portBId);

    if (!portA || !portB) {
      throw new BimValidationError('PORT_NOT_FOUND', 'One or both ports not found.');
    }

    if (portA.domain !== portB.domain) {
      throw new BimValidationError('DOMAIN_MISMATCH', `Incompatible domains: ${portA.domain} vs ${portB.domain}`);
    }

    if (portA.systemType !== portB.systemType) {
      throw new BimValidationError('SYSTEM_TYPE_MISMATCH', `Incompatible system types: ${portA.systemType} vs ${portB.systemType}`);
    }

    const midPoint = point3D(
      (portA.position.x + portB.position.x) / 2,
      (portA.position.y + portB.position.y) / 2,
      (portA.position.z + portB.position.z) / 2,
    );

    const dirAtoB = directionBetweenPoints(portA.position, portB.position);
    const dirBtoA = directionBetweenPoints(portB.position, portA.position);

    const hostA =
      draft.pipes?.[portA.elementId] ??
      draft.ducts?.[portA.elementId] ??
      draft.cableTrays?.[portA.elementId] ??
      draft.mepFittings?.[portA.elementId] ??
      draft.mepEquipments?.[portA.elementId];

    const hostB =
      draft.pipes?.[portB.elementId] ??
      draft.ducts?.[portB.elementId] ??
      draft.cableTrays?.[portB.elementId] ??
      draft.mepFittings?.[portB.elementId] ??
      draft.mepEquipments?.[portB.elementId];

    const levelId =
      this.options?.levelId ??
      hostA?.levelId ??
      hostB?.levelId ??
      Object.keys(draft.levels ?? {})[0] ??
      'level-0';

    const systemId =
      this.options?.systemId ??
      hostA?.systemId ??
      hostB?.systemId;

    const transitionId = this.options?.transitionId ?? generateId();

    const transPort0 = createPort({
      elementId: transitionId,
      position: midPoint,
      direction: dirBtoA,
      domain: portA.domain,
      systemType: portA.systemType,
      shape: portA.shape,
      ...(portA.diameter !== undefined ? { diameter: portA.diameter } : {}),
      ...(portA.width !== undefined ? { width: portA.width } : {}),
      ...(portA.height !== undefined ? { height: portA.height } : {}),
    });

    const transPort1 = createPort({
      elementId: transitionId,
      position: midPoint,
      direction: dirAtoB,
      domain: portB.domain,
      systemType: portB.systemType,
      shape: portB.shape,
      ...(portB.diameter !== undefined ? { diameter: portB.diameter } : {}),
      ...(portB.width !== undefined ? { width: portB.width } : {}),
      ...(portB.height !== undefined ? { height: portB.height } : {}),
    });

    const transitionFitting = createMepFitting({
      id: transitionId,
      levelId,
      ...(systemId ? { systemId } : {}),
      fittingType: 'transition',
      domain: portA.domain,
      systemType: portA.systemType,
      position: midPoint,
      ports: [transPort0, transPort1],
    });

    const mepFittings = ((draft as { mepFittings: Record<ElementId, MepFitting> }).mepFittings ??= {});
    mepFittings[transitionId] = transitionFitting;

    const conn1Id = generateId();
    const conn2Id = generateId();
    const mepConnectors = ((draft as { mepConnectors: Record<ElementId, Connector> }).mepConnectors ??= {});

    mepConnectors[conn1Id] = {
      id: conn1Id,
      category: 'mepConnector',
      portAId: this.portAId,
      portBId: transPort0.id,
      ...(systemId ? { systemId } : {}),
    };

    mepConnectors[conn2Id] = {
      id: conn2Id,
      category: 'mepConnector',
      portAId: transPort1.id,
      portBId: this.portBId,
      ...(systemId ? { systemId } : {}),
    };

    this.changedIds = [transitionId, conn1Id, conn2Id, this.portAId, this.portBId];
  }

  public getChangedIds(): readonly ElementId[] {
    return this.changedIds;
  }
}
