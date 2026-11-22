/**
 * @tabax/core/mep/catalog
 *
 * Fabriques et modèles de référence pour l'instanciation cohérente des éléments MEP
 * avec calcul automatique des ports orientés vers l'extérieur.
 */

import type { ElementId } from '../types.js';
import { generateId } from '../ids.js';
import type {
  Pipe,
  Duct,
  CableTray,
  MepFitting,
  MepEquipment,
  MepSystem,
  Port,
  Point3D,
  Vector3D,
  MepDomain,
  MepSystemType,
  PlumbingSystemType,
  HvacSystemType,
  HydronicSystemType,
  ElectricalSystemType,
  PortShape,
  FlowDirection,
  MepFittingType,
  MepEquipmentFamily,
} from './types.js';
import { directionBetweenPoints } from './math3d.js';

export interface CreatePortOptions {
  readonly id?: ElementId | undefined;
  readonly elementId: ElementId;
  readonly position: Point3D;
  readonly direction: Vector3D;
  readonly domain: MepDomain;
  readonly systemType: MepSystemType;
  readonly shape: PortShape;
  readonly diameter?: number | undefined;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  readonly flowDirection?: FlowDirection | undefined;
  readonly label?: string | undefined;
}

export function createPort(opts: CreatePortOptions): Port {
  return {
    id: opts.id ?? generateId(),
    elementId: opts.elementId,
    position: opts.position,
    direction: opts.direction,
    domain: opts.domain,
    systemType: opts.systemType,
    shape: opts.shape,
    ...(opts.diameter !== undefined ? { diameter: opts.diameter } : {}),
    ...(opts.width !== undefined ? { width: opts.width } : {}),
    ...(opts.height !== undefined ? { height: opts.height } : {}),
    ...(opts.flowDirection ? { flowDirection: opts.flowDirection } : {}),
    ...(opts.label ? { label: opts.label } : {}),
  };
}

export interface CreatePipeOptions {
  readonly id?: ElementId | undefined;
  readonly levelId: ElementId;
  readonly systemId?: ElementId | undefined;
  readonly start: Point3D;
  readonly end: Point3D;
  readonly diameter: number;
  readonly systemType?: PlumbingSystemType | HydronicSystemType | undefined;
  readonly domain?: 'plumbing' | 'hydronic' | undefined;
  readonly thickness?: number | undefined;
  readonly material?: string | undefined;
  readonly slope?: number | undefined;
  readonly name?: string | undefined;
  readonly port0Id?: ElementId | undefined;
  readonly port1Id?: ElementId | undefined;
}

export function createPipe(opts: CreatePipeOptions): Pipe {
  const pipeId = opts.id ?? generateId();
  const domain = opts.domain ?? 'plumbing';
  const systemType = opts.systemType ?? (domain === 'hydronic' ? 'hydronic_supply' : 'domestic_cold_water');

  // Port 0 à start, pointant vers l'extérieur (opposé à start -> end)
  const port0Direction = directionBetweenPoints(opts.end, opts.start);
  // Port 1 à end, pointant vers l'extérieur (dans le sens start -> end)
  const port1Direction = directionBetweenPoints(opts.start, opts.end);

  const port0 = createPort({
    id: opts.port0Id,
    elementId: pipeId,
    position: opts.start,
    direction: port0Direction,
    domain,
    systemType,
    shape: 'round',
    diameter: opts.diameter,
    label: 'PIPE_START',
    flowDirection: 'bidirectional',
  });

  const port1 = createPort({
    id: opts.port1Id,
    elementId: pipeId,
    position: opts.end,
    direction: port1Direction,
    domain,
    systemType,
    shape: 'round',
    diameter: opts.diameter,
    label: 'PIPE_END',
    flowDirection: 'bidirectional',
  });

  return {
    id: pipeId,
    category: 'pipe',
    levelId: opts.levelId,
    ...(opts.systemId ? { systemId: opts.systemId } : {}),
    start: opts.start,
    end: opts.end,
    diameter: opts.diameter,
    ...(opts.thickness !== undefined ? { thickness: opts.thickness } : {}),
    ...(opts.material ? { material: opts.material } : {}),
    ...(opts.slope !== undefined ? { slope: opts.slope } : {}),
    ports: [port0, port1],
    ...(opts.name ? { name: opts.name } : {}),
  };
}

export interface CreateDuctOptions {
  readonly id?: ElementId | undefined;
  readonly levelId: ElementId;
  readonly systemId?: ElementId | undefined;
  readonly start: Point3D;
  readonly end: Point3D;
  readonly shape: PortShape;
  readonly diameter?: number | undefined;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  readonly systemType?: HvacSystemType | undefined;
  readonly insulationThickness?: number | undefined;
  readonly name?: string | undefined;
  readonly port0Id?: ElementId | undefined;
  readonly port1Id?: ElementId | undefined;
}

export function createDuct(opts: CreateDuctOptions): Duct {
  const ductId = opts.id ?? generateId();
  const systemType = opts.systemType ?? 'supply_air';

  const port0Direction = directionBetweenPoints(opts.end, opts.start);
  const port1Direction = directionBetweenPoints(opts.start, opts.end);

  const port0 = createPort({
    id: opts.port0Id,
    elementId: ductId,
    position: opts.start,
    direction: port0Direction,
    domain: 'hvac',
    systemType,
    shape: opts.shape,
    ...(opts.diameter !== undefined ? { diameter: opts.diameter } : {}),
    ...(opts.width !== undefined ? { width: opts.width } : {}),
    ...(opts.height !== undefined ? { height: opts.height } : {}),
    label: 'DUCT_START',
    flowDirection: 'bidirectional',
  });

  const port1 = createPort({
    id: opts.port1Id,
    elementId: ductId,
    position: opts.end,
    direction: port1Direction,
    domain: 'hvac',
    systemType,
    shape: opts.shape,
    ...(opts.diameter !== undefined ? { diameter: opts.diameter } : {}),
    ...(opts.width !== undefined ? { width: opts.width } : {}),
    ...(opts.height !== undefined ? { height: opts.height } : {}),
    label: 'DUCT_END',
    flowDirection: 'bidirectional',
  });

  return {
    id: ductId,
    category: 'duct',
    levelId: opts.levelId,
    ...(opts.systemId ? { systemId: opts.systemId } : {}),
    start: opts.start,
    end: opts.end,
    shape: opts.shape,
    ...(opts.diameter !== undefined ? { diameter: opts.diameter } : {}),
    ...(opts.width !== undefined ? { width: opts.width } : {}),
    ...(opts.height !== undefined ? { height: opts.height } : {}),
    ...(opts.insulationThickness !== undefined ? { insulationThickness: opts.insulationThickness } : {}),
    ports: [port0, port1],
    ...(opts.name ? { name: opts.name } : {}),
  };
}

export interface CreateCableTrayOptions {
  readonly id?: ElementId | undefined;
  readonly levelId: ElementId;
  readonly systemId?: ElementId | undefined;
  readonly start: Point3D;
  readonly end: Point3D;
  readonly width: number;
  readonly height: number;
  readonly systemType?: ElectricalSystemType | undefined;
  readonly name?: string | undefined;
  readonly port0Id?: ElementId | undefined;
  readonly port1Id?: ElementId | undefined;
}

export function createCableTray(opts: CreateCableTrayOptions): CableTray {
  const trayId = opts.id ?? generateId();
  const systemType = opts.systemType ?? 'power';

  const port0Direction = directionBetweenPoints(opts.end, opts.start);
  const port1Direction = directionBetweenPoints(opts.start, opts.end);

  const port0 = createPort({
    id: opts.port0Id,
    elementId: trayId,
    position: opts.start,
    direction: port0Direction,
    domain: 'electrical',
    systemType,
    shape: 'rectangular',
    width: opts.width,
    height: opts.height,
    label: 'TRAY_START',
    flowDirection: 'bidirectional',
  });

  const port1 = createPort({
    id: opts.port1Id,
    elementId: trayId,
    position: opts.end,
    direction: port1Direction,
    domain: 'electrical',
    systemType,
    shape: 'rectangular',
    width: opts.width,
    height: opts.height,
    label: 'TRAY_END',
    flowDirection: 'bidirectional',
  });

  return {
    id: trayId,
    category: 'cableTray',
    levelId: opts.levelId,
    ...(opts.systemId ? { systemId: opts.systemId } : {}),
    start: opts.start,
    end: opts.end,
    width: opts.width,
    height: opts.height,
    ports: [port0, port1],
    ...(opts.name ? { name: opts.name } : {}),
  };
}

export interface CreateMepFittingOptions {
  readonly id?: ElementId | undefined;
  readonly levelId: ElementId;
  readonly systemId?: ElementId | undefined;
  readonly fittingType: MepFittingType;
  readonly domain: MepDomain;
  readonly systemType: MepSystemType;
  readonly position: Point3D;
  readonly ports: readonly Port[];
  readonly name?: string | undefined;
}

export function createMepFitting(opts: CreateMepFittingOptions): MepFitting {
  const fittingId = opts.id ?? generateId();
  return {
    id: fittingId,
    category: 'mepFitting',
    levelId: opts.levelId,
    ...(opts.systemId ? { systemId: opts.systemId } : {}),
    fittingType: opts.fittingType,
    domain: opts.domain,
    systemType: opts.systemType,
    position: opts.position,
    ports: opts.ports.map((p) => ({ ...p, elementId: fittingId })),
    ...(opts.name ? { name: opts.name } : {}),
  };
}

export interface CreateMepEquipmentOptions {
  readonly id?: ElementId | undefined;
  readonly levelId: ElementId;
  readonly systemId?: ElementId | undefined;
  readonly family: MepEquipmentFamily;
  readonly position: Point3D;
  readonly rotation?: number | undefined;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly ports: readonly Port[];
  readonly name?: string | undefined;
}

export function createMepEquipment(opts: CreateMepEquipmentOptions): MepEquipment {
  const equipmentId = opts.id ?? generateId();
  return {
    id: equipmentId,
    category: 'mepEquipment',
    levelId: opts.levelId,
    ...(opts.systemId ? { systemId: opts.systemId } : {}),
    family: opts.family,
    position: opts.position,
    ...(opts.rotation !== undefined ? { rotation: opts.rotation } : {}),
    width: opts.width,
    depth: opts.depth,
    height: opts.height,
    ports: opts.ports.map((p) => ({ ...p, elementId: equipmentId })),
    ...(opts.name ? { name: opts.name } : {}),
  };
}

export interface CreateMepSystemOptions {
  readonly id?: ElementId | undefined;
  readonly name: string;
  readonly domain: MepDomain;
  readonly systemType: MepSystemType;
  readonly elementIds?: readonly ElementId[] | undefined;
  readonly color?: string | undefined;
}

export function createMepSystem(opts: CreateMepSystemOptions): MepSystem {
  return {
    id: opts.id ?? generateId(),
    category: 'mepSystem',
    name: opts.name,
    domain: opts.domain,
    systemType: opts.systemType,
    elementIds: opts.elementIds ?? [],
    ...(opts.color ? { color: opts.color } : {}),
  };
}
