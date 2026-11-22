/**
 * @tabax/core/mep/routing
 *
 * Moteur de routage géométrique déterministe 3D pour réseaux techniques MEP (Sous-phase 9.3.3).
 *
 * Principes stricts :
 * 1. Zéro dépendance vers le DOM, React ou Three.js (purement fonctionnel, ADR-009).
 * 2. Déterminisme en temps constant O(1) : pas d'algorithme A* ni de voxels (réservés à la Phase 9.4).
 * 3. Prise en charge des configurations orthogonales :
 *    - Trajet direct (aligné) avec réduction automatique si sections différentes
 *    - Coude en L (90° et 45°, avec bascule d'orientation flipOrientation)
 *    - Déport en Z / baïonnette (deux coudes parallèles)
 *    - Colonne montante / descendante (changement d'altitude ΔZ)
 * 4. Garde-fous géométriques stricts évitant tout micro-segment dégénéré (< 50 mm).
 */

import type { ElementId } from '../types.js';
import { generateId } from '../ids.js';
import type {
  Port,
  Point3D,
  Vector3D,
  MepDomain,
  MepSystemType,
  PortShape,
  MepFittingType,
} from './types.js';
import { MEP_TOLERANCES } from './tolerances.js';
import {
  point3D,
  distance3D,
  normalize3D,
  dotProduct3D,
  directionBetweenPoints,
  arePointsCoincident3D,
  areDirectionsOpposed3D,
} from './math3d.js';
import { createPort } from './catalog.js';

// ============================================================================
// Constantes de routage
// ============================================================================

export const MEP_ROUTING_CONSTANTS = {
  /** Longueur minimale d'un segment physique en mm pour éviter tout micro-tronçon dégénéré */
  MIN_SEGMENT_LENGTH_MM: 50,
  /** Encombrement d'accostage minimal réservé par embout de raccord (mm) */
  MIN_FITTING_CLEARANCE_MM: 25,
} as const;

// ============================================================================
// Types du Route Solver
// ============================================================================

export type RouteEndpoint =
  | { readonly kind: 'port'; readonly port: Port }
  | {
      readonly kind: 'point';
      readonly point: Point3D;
      readonly direction?: Vector3D | undefined;
      readonly diameter?: number | undefined;
      readonly width?: number | undefined;
      readonly height?: number | undefined;
    };

export interface RouteConstraints {
  readonly anglePreference?: 90 | 45 | undefined;
  readonly flipOrientation?: boolean | undefined;
  readonly minSegmentLengthMm?: number | undefined;
  readonly slope?: number | undefined; // Pente hydraulique si gravitaire (ex: 0.01 = 1%)
}

export interface RouteRequest {
  readonly start: RouteEndpoint;
  readonly end: RouteEndpoint;
  readonly category: 'pipe' | 'duct' | 'cableTray';
  readonly domain: MepDomain;
  readonly systemType: MepSystemType;
  readonly systemId?: ElementId | undefined;
  readonly levelId: ElementId;
  readonly shape?: PortShape | undefined;
  readonly diameter?: number | undefined;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  readonly constraints?: RouteConstraints | undefined;
}

export type RouteWaypointRole =
  | 'start'
  | 'turn'
  | 'elevation_change'
  | 'transition'
  | 'end';

export interface RouteWaypoint {
  readonly point: Point3D;
  readonly role: RouteWaypointRole;
}

export interface RouteSegmentPlan {
  readonly id: ElementId;
  readonly category: 'pipe' | 'duct' | 'cableTray';
  readonly start: Point3D;
  readonly end: Point3D;
  readonly diameter?: number | undefined;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  readonly shape?: PortShape | undefined;
  readonly systemId?: ElementId | undefined;
  readonly levelId: ElementId;
  readonly domain: MepDomain;
  readonly systemType: MepSystemType;
  readonly port0Id: ElementId;
  readonly port1Id: ElementId;
}

export interface RouteFittingPlan {
  readonly id: ElementId;
  readonly fittingType: MepFittingType;
  readonly position: Point3D;
  readonly domain: MepDomain;
  readonly systemType: MepSystemType;
  readonly systemId?: ElementId | undefined;
  readonly levelId: ElementId;
  readonly ports: readonly Port[];
  readonly angleDeg?: number | undefined;
}

export interface RouteConnectorPlan {
  readonly id: ElementId;
  readonly portAId: ElementId;
  readonly portBId: ElementId;
}

export type RouteDiagnosticCode =
  | 'VALID'
  | 'INCOMPATIBLE_PORTS'
  | 'SEGMENT_TOO_SHORT'
  | 'ROUTE_INSUFFICIENT_SPACE'
  | 'UNALIGNED_AXES'
  | 'NO_VALID_ROUTE'
  | 'COINCIDENT_ENDPOINTS';

export interface RouteDiagnostics {
  readonly status: 'valid' | 'rejected';
  readonly code: RouteDiagnosticCode;
  readonly message: string;
}

export interface RoutePlan {
  readonly request: RouteRequest;
  readonly waypoints: readonly RouteWaypoint[];
  readonly segments: readonly RouteSegmentPlan[];
  readonly fittings: readonly RouteFittingPlan[];
  readonly connectors: readonly RouteConnectorPlan[];
  readonly totalLengthMm: number;
  readonly diagnostics: RouteDiagnostics;
}

// ============================================================================
// Helpers internes
// ============================================================================

function getEndpointPosition(ep: RouteEndpoint): Point3D {
  return ep.kind === 'port' ? ep.port.position : ep.point;
}

function getEndpointDirection(ep: RouteEndpoint): Vector3D | null {
  if (ep.kind === 'port') {
    return normalize3D(ep.port.direction);
  }
  return ep.direction ? normalize3D(ep.direction) : null;
}

function getEndpointDimensions(ep: RouteEndpoint, req: RouteRequest): {
  diameter?: number | undefined;
  width?: number | undefined;
  height?: number | undefined;
  shape: PortShape;
} {
  if (ep.kind === 'port') {
    return {
      diameter: ep.port.diameter,
      width: ep.port.width,
      height: ep.port.height,
      shape: ep.port.shape,
    };
  }
  return {
    diameter: ep.diameter ?? req.diameter,
    width: ep.width ?? req.width,
    height: ep.height ?? req.height,
    shape: req.shape ?? (req.category === 'pipe' ? 'round' : 'rectangular'),
  };
}

function areEndpointDimensionsEqual(
  dimA: ReturnType<typeof getEndpointDimensions>,
  dimB: ReturnType<typeof getEndpointDimensions>,
): boolean {
  if (dimA.shape !== dimB.shape) return false;
  if (dimA.shape === 'round') {
    const da = dimA.diameter ?? 0;
    const db = dimB.diameter ?? 0;
    return Math.abs(da - db) <= MEP_TOLERANCES.DIMENSION_MM;
  }
  const wa = dimA.width ?? 0;
  const wb = dimB.width ?? 0;
  const ha = dimA.height ?? 0;
  const hb = dimB.height ?? 0;
  return (
    Math.abs(wa - wb) <= MEP_TOLERANCES.DIMENSION_MM &&
    Math.abs(ha - hb) <= MEP_TOLERANCES.DIMENSION_MM
  );
}

// ============================================================================
// Solveur de Routage Déterministe
// ============================================================================

/**
 * Calcule un plan de routage géométrique 3D déterministe entre deux extrémités MEP.
 *
 * @param request Spécification du trajet à calculer (ports/points, catégorie, contraintes)
 * @returns Plan de routage immuable avec waypoints, segments, raccords et diagnostics
 */
export function solveMepRoute(request: RouteRequest): RoutePlan {
  const pA = getEndpointPosition(request.start);
  const pB = getEndpointPosition(request.end);
  const minSegLen =
    request.constraints?.minSegmentLengthMm ??
    MEP_ROUTING_CONSTANTS.MIN_SEGMENT_LENGTH_MM;

  // 1. Validation de compatibilité préliminaire si les deux extrémités sont des ports
  if (request.start.kind === 'port' && request.end.kind === 'port') {
    const portA = request.start.port;
    const portB = request.end.port;

    if (portA.domain !== portB.domain) {
      return createRejectedPlan(
        request,
        'INCOMPATIBLE_PORTS',
        `Domaines MEP incompatibles : ${portA.domain} vs ${portB.domain}`,
      );
    }
    if (portA.systemType !== portB.systemType) {
      return createRejectedPlan(
        request,
        'INCOMPATIBLE_PORTS',
        `Systèmes fluides incompatibles : ${portA.systemType} vs ${portB.systemType}`,
      );
    }
  }

  // 2. Détection de points coïncidents
  if (arePointsCoincident3D(pA, pB, MEP_TOLERANCES.POSITION_MM)) {
    return createRejectedPlan(
      request,
      'COINCIDENT_ENDPOINTS',
      'Les extrémités de départ et d’arrivée sont confondues.',
    );
  }

  const dimA = getEndpointDimensions(request.start, request);
  const dimB = getEndpointDimensions(request.end, request);
  const needsTransition = !areEndpointDimensionsEqual(dimA, dimB);

  const dirA = getEndpointDirection(request.start);
  const dirB = getEndpointDirection(request.end);

  const delta = {
    x: pB.x - pA.x,
    y: pB.y - pA.y,
    z: pB.z - pA.z,
  };
  const distTotal = distance3D(pA, pB);

  // ==========================================================================
  // Cas 1 : Trajet direct rectiligne (Straight run)
  // ==========================================================================
  const dirAB = directionBetweenPoints(pA, pB);
  const isAlignedStart = !dirA || dotProduct3D(dirA, dirAB) >= 1.0 - MEP_TOLERANCES.ANGLE_RAD;
  const isAlignedEnd = !dirB || areDirectionsOpposed3D(dirAB, dirB, MEP_TOLERANCES.ANGLE_RAD);

  const isAxiallyAligned =
    (Math.abs(delta.y) <= MEP_TOLERANCES.POSITION_MM && Math.abs(delta.z) <= MEP_TOLERANCES.POSITION_MM) ||
    (Math.abs(delta.x) <= MEP_TOLERANCES.POSITION_MM && Math.abs(delta.z) <= MEP_TOLERANCES.POSITION_MM) ||
    (Math.abs(delta.x) <= MEP_TOLERANCES.POSITION_MM && Math.abs(delta.y) <= MEP_TOLERANCES.POSITION_MM);

  const isDirectStraight = dirA || dirB
    ? isAlignedStart && isAlignedEnd
    : isAxiallyAligned;

  if (isDirectStraight) {
    if (distTotal < minSegLen) {
      return createRejectedPlan(
        request,
        'SEGMENT_TOO_SHORT',
        `Distance entre les ports (${Math.round(distTotal)} mm) inférieure au minimum requis (${minSegLen} mm).`,
      );
    }

    return buildDirectRoutePlan(request, pA, pB, dimA, dimB, needsTransition);
  }

  // ==========================================================================
  // Cas 2 : Changement d'élévation vertical (Riser / Colonne montante)
  // ==========================================================================
  if (Math.abs(delta.z) > MEP_TOLERANCES.POSITION_MM) {
    // Si décalage vertical et horizontal combinés
    const isPlanarHorizontal = Math.hypot(delta.x, delta.y) >= minSegLen;
    if (isPlanarHorizontal && Math.abs(delta.z) >= minSegLen) {
      return buildRiserRoutePlan(request, pA, pB, dimA, dimB, minSegLen);
    }
  }

  // ==========================================================================
  // Cas 3 : Configuration orthogonale en plan (L-bend ou Z-jog)
  // ==========================================================================
  const anglePref = request.constraints?.anglePreference ?? 90;
  const flip = request.constraints?.flipOrientation ?? false;

  // Calcul du tracé en L (1 coude à 90° ou 45°)
  const lPlan = tryBuildLRoutePlan(request, pA, pB, dirA, dirB, dimA, dimB, minSegLen, anglePref, flip);
  if (lPlan) {
    return lPlan;
  }

  // Calcul du tracé en Z / baïonnette (2 coudes)
  const zPlan = tryBuildZRoutePlan(request, pA, pB, dirA, dirB, dimA, dimB, minSegLen, flip);
  if (zPlan) {
    return zPlan;
  }

  // Aucune solution géométrique orthogonale standard trouvée
  return createRejectedPlan(
    request,
    'NO_VALID_ROUTE',
    'Aucun trajet orthogonal continu valide trouvé satisfaisant les contraintes d’alignement et de longueur minimale.',
  );
}

// ============================================================================
// Constructeurs spécialisés de plans de routage
// ============================================================================

function buildDirectRoutePlan(
  req: RouteRequest,
  pA: Point3D,
  pB: Point3D,
  dimA: ReturnType<typeof getEndpointDimensions>,
  dimB: ReturnType<typeof getEndpointDimensions>,
  needsTransition: boolean,
): RoutePlan {
  const segments: RouteSegmentPlan[] = [];
  const fittings: RouteFittingPlan[] = [];
  const connectors: RouteConnectorPlan[] = [];
  const waypoints: RouteWaypoint[] = [];

  const totalLen = distance3D(pA, pB);

  if (!needsTransition) {
    // Tronçon unique direct
    const segId = generateId();
    const port0Id = generateId();
    const port1Id = generateId();
    segments.push({
      id: segId,
      category: req.category,
      start: pA,
      end: pB,
      diameter: dimA.diameter,
      width: dimA.width,
      height: dimA.height,
      shape: dimA.shape,
      systemId: req.systemId,
      levelId: req.levelId,
      domain: req.domain,
      systemType: req.systemType,
      port0Id,
      port1Id,
    });

    waypoints.push({ point: pA, role: 'start' });
    waypoints.push({ point: pB, role: 'end' });

    if (req.start.kind === 'port') {
      connectors.push({
        id: generateId(),
        portAId: req.start.port.id,
        portBId: port0Id,
      });
    }
    if (req.end.kind === 'port') {
      connectors.push({
        id: generateId(),
        portAId: port1Id,
        portBId: req.end.port.id,
      });
    }
  } else {
    // Insertion d'un raccord transition à mi-parcours
    const midX = (pA.x + pB.x) / 2;
    const midY = (pA.y + pB.y) / 2;
    const midZ = (pA.z + pB.z) / 2;
    const pMid = point3D(midX, midY, midZ);

    const fittingId = generateId();
    const seg1Id = generateId();
    const seg1Port0Id = generateId();
    const seg1Port1Id = generateId();
    const seg2Id = generateId();
    const seg2Port0Id = generateId();
    const seg2Port1Id = generateId();

    const dirForward = directionBetweenPoints(pA, pB);
    const dirBackward = directionBetweenPoints(pB, pA);

    // Ports de la transition
    const portTrans0 = createPort({
      elementId: fittingId,
      position: pMid,
      direction: dirBackward,
      domain: req.domain,
      systemType: req.systemType,
      shape: dimA.shape,
      diameter: dimA.diameter,
      width: dimA.width,
      height: dimA.height,
    });

    const portTrans1 = createPort({
      elementId: fittingId,
      position: pMid,
      direction: dirForward,
      domain: req.domain,
      systemType: req.systemType,
      shape: dimB.shape,
      diameter: dimB.diameter,
      width: dimB.width,
      height: dimB.height,
    });

    fittings.push({
      id: fittingId,
      fittingType: 'transition',
      position: pMid,
      domain: req.domain,
      systemType: req.systemType,
      systemId: req.systemId,
      levelId: req.levelId,
      ports: [portTrans0, portTrans1],
    });

    segments.push({
      id: seg1Id,
      category: req.category,
      start: pA,
      end: pMid,
      diameter: dimA.diameter,
      width: dimA.width,
      height: dimA.height,
      shape: dimA.shape,
      systemId: req.systemId,
      levelId: req.levelId,
      domain: req.domain,
      systemType: req.systemType,
      port0Id: seg1Port0Id,
      port1Id: seg1Port1Id,
    });

    segments.push({
      id: seg2Id,
      category: req.category,
      start: pMid,
      end: pB,
      diameter: dimB.diameter,
      width: dimB.width,
      height: dimB.height,
      shape: dimB.shape,
      systemId: req.systemId,
      levelId: req.levelId,
      domain: req.domain,
      systemType: req.systemType,
      port0Id: seg2Port0Id,
      port1Id: seg2Port1Id,
    });

    // Connexions internes avec le raccord transition
    connectors.push({
      id: generateId(),
      portAId: seg1Port1Id,
      portBId: portTrans0.id,
    });
    connectors.push({
      id: generateId(),
      portAId: portTrans1.id,
      portBId: seg2Port0Id,
    });

    // Connexions aux extrémités si applicables
    if (req.start.kind === 'port') {
      connectors.push({
        id: generateId(),
        portAId: req.start.port.id,
        portBId: seg1Port0Id,
      });
    }
    if (req.end.kind === 'port') {
      connectors.push({
        id: generateId(),
        portAId: seg2Port1Id,
        portBId: req.end.port.id,
      });
    }

    waypoints.push({ point: pA, role: 'start' });
    waypoints.push({ point: pMid, role: 'transition' });
    waypoints.push({ point: pB, role: 'end' });
  }

  return {
    request: req,
    waypoints,
    segments,
    fittings,
    connectors,
    totalLengthMm: Math.round(totalLen),
    diagnostics: {
      status: 'valid',
      code: 'VALID',
      message: 'Trajet direct calculé avec succès.',
    },
  };
}

function tryBuildLRoutePlan(
  req: RouteRequest,
  pA: Point3D,
  pB: Point3D,
  dirA: Vector3D | null,
  dirB: Vector3D | null,
  dimA: ReturnType<typeof getEndpointDimensions>,
  dimB: ReturnType<typeof getEndpointDimensions>,
  minLen: number,
  anglePref: 90 | 45,
  flip: boolean,
): RoutePlan | null {
  const dx = pB.x - pA.x;
  const dy = pB.y - pA.y;

  if (Math.abs(dx) < minLen && Math.abs(dy) < minLen) {
    return null;
  }

  // Détermination du point de virage W
  let pW: Point3D;
  let effectiveAngleDeg = anglePref;

  if (anglePref === 45) {
    if (Math.abs(dx) >= Math.abs(dy) + minLen && Math.abs(dy) >= minLen) {
      const d45 = Math.abs(dy);
      pW = flip
        ? point3D(pA.x + Math.sign(dx) * d45, pB.y, pA.z)
        : point3D(pB.x - Math.sign(dx) * d45, pA.y, pA.z);
    } else if (Math.abs(dy) >= Math.abs(dx) + minLen && Math.abs(dx) >= minLen) {
      const d45 = Math.abs(dx);
      pW = flip
        ? point3D(pB.x, pA.y + Math.sign(dy) * d45, pA.z)
        : point3D(pA.x, pB.y - Math.sign(dy) * d45, pA.z);
    } else {
      effectiveAngleDeg = 90;
      pW = flip ? point3D(pA.x, pB.y, pA.z) : point3D(pB.x, pA.y, pA.z);
    }
  } else {
    if (!dirA) {
      pW = flip ? point3D(pA.x, pB.y, pA.z) : point3D(pB.x, pA.y, pA.z);
    } else {
      if (Math.abs(dirA.x) > Math.abs(dirA.y)) {
        if (Math.sign(dirA.x) !== Math.sign(dx)) return null;
        pW = point3D(pB.x, pA.y, pA.z);
      } else {
        if (Math.sign(dirA.y) !== Math.sign(dy)) return null;
        pW = point3D(pA.x, pB.y, pA.z);
      }
    }
  }

  const len1 = distance3D(pA, pW);
  const len2 = distance3D(pW, pB);
  if (len1 < minLen || len2 < minLen) {
    return null;
  }

  // Si dirB est spécifié, le second segment [pW, pB] doit arriver face au port B
  if (dirB) {
    const dir2Out = directionBetweenPoints(pW, pB);
    if (!areDirectionsOpposed3D(dir2Out, dirB, MEP_TOLERANCES.ANGLE_RAD)) {
      return null;
    }
  }

  const segments: RouteSegmentPlan[] = [];
  const fittings: RouteFittingPlan[] = [];
  const connectors: RouteConnectorPlan[] = [];
  const waypoints: RouteWaypoint[] = [];

  const elbowId = generateId();
  const seg1Id = generateId();
  const seg1Port0Id = generateId();
  const seg1Port1Id = generateId();
  const seg2Id = generateId();
  const seg2Port0Id = generateId();
  const seg2Port1Id = generateId();

  const dir1In = directionBetweenPoints(pW, pA);
  const dir2Out = directionBetweenPoints(pW, pB);

  // Ports du coude en pW
  const portElbow0 = createPort({
    elementId: elbowId,
    position: pW,
    direction: dir1In,
    domain: req.domain,
    systemType: req.systemType,
    shape: dimA.shape,
    diameter: dimA.diameter,
    width: dimA.width,
    height: dimA.height,
  });

  const portElbow1 = createPort({
    elementId: elbowId,
    position: pW,
    direction: dir2Out,
    domain: req.domain,
    systemType: req.systemType,
    shape: dimB.shape,
    diameter: dimB.diameter,
    width: dimB.width,
    height: dimB.height,
  });

  fittings.push({
    id: elbowId,
    fittingType: 'elbow',
    position: pW,
    domain: req.domain,
    systemType: req.systemType,
    systemId: req.systemId,
    levelId: req.levelId,
    ports: [portElbow0, portElbow1],
    angleDeg: effectiveAngleDeg,
  });

  segments.push({
    id: seg1Id,
    category: req.category,
    start: pA,
    end: pW,
    diameter: dimA.diameter,
    width: dimA.width,
    height: dimA.height,
    shape: dimA.shape,
    systemId: req.systemId,
    levelId: req.levelId,
    domain: req.domain,
    systemType: req.systemType,
    port0Id: seg1Port0Id,
    port1Id: seg1Port1Id,
  });

  segments.push({
    id: seg2Id,
    category: req.category,
    start: pW,
    end: pB,
    diameter: dimB.diameter,
    width: dimB.width,
    height: dimB.height,
    shape: dimB.shape,
    systemId: req.systemId,
    levelId: req.levelId,
    domain: req.domain,
    systemType: req.systemType,
    port0Id: seg2Port0Id,
    port1Id: seg2Port1Id,
  });

  // Connexions entre segments et raccord coude
  connectors.push({
    id: generateId(),
    portAId: seg1Port1Id,
    portBId: portElbow0.id,
  });
  connectors.push({
    id: generateId(),
    portAId: portElbow1.id,
    portBId: seg2Port0Id,
  });

  // Connexions d'extrémités si ports
  if (req.start.kind === 'port') {
    connectors.push({
      id: generateId(),
      portAId: req.start.port.id,
      portBId: seg1Port0Id,
    });
  }
  if (req.end.kind === 'port') {
    connectors.push({
      id: generateId(),
      portAId: seg2Port1Id,
      portBId: req.end.port.id,
    });
  }

  waypoints.push({ point: pA, role: 'start' });
  waypoints.push({ point: pW, role: 'turn' });
  waypoints.push({ point: pB, role: 'end' });

  return {
    request: req,
    waypoints,
    segments,
    fittings,
    connectors,
    totalLengthMm: Math.round(len1 + len2),
    diagnostics: {
      status: 'valid',
      code: 'VALID',
      message: `Trajet en L (${effectiveAngleDeg}°) calculé avec succès.`,
    },
  };
}

function tryBuildZRoutePlan(
  req: RouteRequest,
  pA: Point3D,
  pB: Point3D,
  dirA: Vector3D | null,
  dirB: Vector3D | null,
  dimA: ReturnType<typeof getEndpointDimensions>,
  dimB: ReturnType<typeof getEndpointDimensions>,
  minLen: number,
  _flip: boolean,
): RoutePlan | null {
  const dx = pB.x - pA.x;
  const dy = pB.y - pA.y;

  // Baïonnette le long de l'axe X (ports orientés en X)
  const isXAligned =
    dirA &&
    dirB &&
    Math.abs(dirA.x) > 0.9 &&
    Math.abs(dirB.x) > 0.9 &&
    Math.abs(dy) >= minLen;

  // Baïonnette le long de l'axe Y (ports orientés en Y)
  const isYAligned =
    dirA &&
    dirB &&
    Math.abs(dirA.y) > 0.9 &&
    Math.abs(dirB.y) > 0.9 &&
    Math.abs(dx) >= minLen;

  let pW1: Point3D;
  let pW2: Point3D;

  if (isXAligned) {
    const midX = pA.x + dx / 2;
    if (Math.abs(midX - pA.x) < minLen || Math.abs(pB.x - midX) < minLen) {
      return null;
    }
    pW1 = point3D(midX, pA.y, pA.z);
    pW2 = point3D(midX, pB.y, pA.z);
  } else if (isYAligned) {
    const midY = pA.y + dy / 2;
    if (Math.abs(midY - pA.y) < minLen || Math.abs(pB.y - midY) < minLen) {
      return null;
    }
    pW1 = point3D(pA.x, midY, pA.z);
    pW2 = point3D(pB.x, midY, pA.z);
  } else {
    // Baïonnette libre en l'absence de contrainte axiale stricte
    if (Math.abs(dx) >= minLen * 2 && Math.abs(dy) >= minLen) {
      const midX = pA.x + dx / 2;
      pW1 = point3D(midX, pA.y, pA.z);
      pW2 = point3D(midX, pB.y, pA.z);
    } else {
      return null;
    }
  }

  const len1 = distance3D(pA, pW1);
  const len2 = distance3D(pW1, pW2);
  const len3 = distance3D(pW2, pB);

  if (len1 < minLen || len2 < minLen || len3 < minLen) {
    return null;
  }

  const segments: RouteSegmentPlan[] = [];
  const fittings: RouteFittingPlan[] = [];
  const connectors: RouteConnectorPlan[] = [];
  const waypoints: RouteWaypoint[] = [];

  const elbow1Id = generateId();
  const elbow2Id = generateId();
  const seg1Id = generateId();
  const seg1Port0Id = generateId();
  const seg1Port1Id = generateId();
  const seg2Id = generateId();
  const seg2Port0Id = generateId();
  const seg2Port1Id = generateId();
  const seg3Id = generateId();
  const seg3Port0Id = generateId();
  const seg3Port1Id = generateId();

  // Coude 1 en pW1
  const portE1_0 = createPort({
    elementId: elbow1Id,
    position: pW1,
    direction: directionBetweenPoints(pW1, pA),
    domain: req.domain,
    systemType: req.systemType,
    shape: dimA.shape,
    diameter: dimA.diameter,
    width: dimA.width,
    height: dimA.height,
  });
  const portE1_1 = createPort({
    elementId: elbow1Id,
    position: pW1,
    direction: directionBetweenPoints(pW1, pW2),
    domain: req.domain,
    systemType: req.systemType,
    shape: dimA.shape,
    diameter: dimA.diameter,
    width: dimA.width,
    height: dimA.height,
  });

  fittings.push({
    id: elbow1Id,
    fittingType: 'elbow',
    position: pW1,
    domain: req.domain,
    systemType: req.systemType,
    systemId: req.systemId,
    levelId: req.levelId,
    ports: [portE1_0, portE1_1],
    angleDeg: 90,
  });

  // Coude 2 en pW2
  const portE2_0 = createPort({
    elementId: elbow2Id,
    position: pW2,
    direction: directionBetweenPoints(pW2, pW1),
    domain: req.domain,
    systemType: req.systemType,
    shape: dimB.shape,
    diameter: dimB.diameter,
    width: dimB.width,
    height: dimB.height,
  });
  const portE2_1 = createPort({
    elementId: elbow2Id,
    position: pW2,
    direction: directionBetweenPoints(pW2, pB),
    domain: req.domain,
    systemType: req.systemType,
    shape: dimB.shape,
    diameter: dimB.diameter,
    width: dimB.width,
    height: dimB.height,
  });

  fittings.push({
    id: elbow2Id,
    fittingType: 'elbow',
    position: pW2,
    domain: req.domain,
    systemType: req.systemType,
    systemId: req.systemId,
    levelId: req.levelId,
    ports: [portE2_0, portE2_1],
    angleDeg: 90,
  });

  // 3 segments
  segments.push({
    id: seg1Id,
    category: req.category,
    start: pA,
    end: pW1,
    diameter: dimA.diameter,
    width: dimA.width,
    height: dimA.height,
    shape: dimA.shape,
    systemId: req.systemId,
    levelId: req.levelId,
    domain: req.domain,
    systemType: req.systemType,
    port0Id: seg1Port0Id,
    port1Id: seg1Port1Id,
  });

  segments.push({
    id: seg2Id,
    category: req.category,
    start: pW1,
    end: pW2,
    diameter: dimA.diameter,
    width: dimA.width,
    height: dimA.height,
    shape: dimA.shape,
    systemId: req.systemId,
    levelId: req.levelId,
    domain: req.domain,
    systemType: req.systemType,
    port0Id: seg2Port0Id,
    port1Id: seg2Port1Id,
  });

  segments.push({
    id: seg3Id,
    category: req.category,
    start: pW2,
    end: pB,
    diameter: dimB.diameter,
    width: dimB.width,
    height: dimB.height,
    shape: dimB.shape,
    systemId: req.systemId,
    levelId: req.levelId,
    domain: req.domain,
    systemType: req.systemType,
    port0Id: seg3Port0Id,
    port1Id: seg3Port1Id,
  });

  // Connecteurs internes
  connectors.push({
    id: generateId(),
    portAId: seg1Port1Id,
    portBId: portE1_0.id,
  });
  connectors.push({
    id: generateId(),
    portAId: portE1_1.id,
    portBId: seg2Port0Id,
  });
  connectors.push({
    id: generateId(),
    portAId: seg2Port1Id,
    portBId: portE2_0.id,
  });
  connectors.push({
    id: generateId(),
    portAId: portE2_1.id,
    portBId: seg3Port0Id,
  });

  // Connecteurs d'extrémités
  if (req.start.kind === 'port') {
    connectors.push({
      id: generateId(),
      portAId: req.start.port.id,
      portBId: seg1Port0Id,
    });
  }
  if (req.end.kind === 'port') {
    connectors.push({
      id: generateId(),
      portAId: seg3Port1Id,
      portBId: req.end.port.id,
    });
  }

  waypoints.push({ point: pA, role: 'start' });
  waypoints.push({ point: pW1, role: 'turn' });
  waypoints.push({ point: pW2, role: 'turn' });
  waypoints.push({ point: pB, role: 'end' });

  return {
    request: req,
    waypoints,
    segments,
    fittings,
    connectors,
    totalLengthMm: Math.round(len1 + len2 + len3),
    diagnostics: {
      status: 'valid',
      code: 'VALID',
      message: 'Trajet en baïonnette / Z calculé avec succès.',
    },
  };
}

function buildRiserRoutePlan(
  req: RouteRequest,
  pA: Point3D,
  pB: Point3D,
  dimA: ReturnType<typeof getEndpointDimensions>,
  dimB: ReturnType<typeof getEndpointDimensions>,
  _minLen: number,
): RoutePlan {
  // Colonne montante : départ horizontal -> coude vertical à pW1 -> montée vers pW2 -> arrivée horizontale vers pB
  const pW1 = point3D(pB.x, pB.y, pA.z);
  const pW2 = point3D(pB.x, pB.y, pB.z);

  const lenHoriz = distance3D(pA, pW1);
  const lenVert = distance3D(pW1, pW2);

  const segments: RouteSegmentPlan[] = [];
  const fittings: RouteFittingPlan[] = [];
  const connectors: RouteConnectorPlan[] = [];
  const waypoints: RouteWaypoint[] = [];

  const elbow1Id = generateId();
  const seg1Id = generateId();
  const seg1Port0Id = generateId();
  const seg1Port1Id = generateId();
  const seg2Id = generateId();
  const seg2Port0Id = generateId();
  const seg2Port1Id = generateId();

  // Segment horizontal [pA, pW1]
  segments.push({
    id: seg1Id,
    category: req.category,
    start: pA,
    end: pW1,
    diameter: dimA.diameter,
    width: dimA.width,
    height: dimA.height,
    shape: dimA.shape,
    systemId: req.systemId,
    levelId: req.levelId,
    domain: req.domain,
    systemType: req.systemType,
    port0Id: seg1Port0Id,
    port1Id: seg1Port1Id,
  });

  // Coude vertical en pW1 raccordant horizontal et vertical
  const portE0 = createPort({
    elementId: elbow1Id,
    position: pW1,
    direction: directionBetweenPoints(pW1, pA),
    domain: req.domain,
    systemType: req.systemType,
    shape: dimA.shape,
    diameter: dimA.diameter,
    width: dimA.width,
    height: dimA.height,
  });
  const portE1 = createPort({
    elementId: elbow1Id,
    position: pW1,
    direction: directionBetweenPoints(pW1, pW2),
    domain: req.domain,
    systemType: req.systemType,
    shape: dimA.shape,
    diameter: dimA.diameter,
    width: dimA.width,
    height: dimA.height,
  });

  fittings.push({
    id: elbow1Id,
    fittingType: 'elbow',
    position: pW1,
    domain: req.domain,
    systemType: req.systemType,
    systemId: req.systemId,
    levelId: req.levelId,
    ports: [portE0, portE1],
    angleDeg: 90,
  });

  // Segment vertical [pW1, pW2]
  segments.push({
    id: seg2Id,
    category: req.category,
    start: pW1,
    end: pW2,
    diameter: dimB.diameter,
    width: dimB.width,
    height: dimB.height,
    shape: dimB.shape,
    systemId: req.systemId,
    levelId: req.levelId,
    domain: req.domain,
    systemType: req.systemType,
    port0Id: seg2Port0Id,
    port1Id: seg2Port1Id,
  });

  // Connecteurs internes
  connectors.push({
    id: generateId(),
    portAId: seg1Port1Id,
    portBId: portE0.id,
  });
  connectors.push({
    id: generateId(),
    portAId: portE1.id,
    portBId: seg2Port0Id,
  });

  // Connecteurs d'extrémités
  if (req.start.kind === 'port') {
    connectors.push({
      id: generateId(),
      portAId: req.start.port.id,
      portBId: seg1Port0Id,
    });
  }
  if (req.end.kind === 'port') {
    connectors.push({
      id: generateId(),
      portAId: seg2Port1Id,
      portBId: req.end.port.id,
    });
  }

  waypoints.push({ point: pA, role: 'start' });
  waypoints.push({ point: pW1, role: 'elevation_change' });
  waypoints.push({ point: pW2, role: 'end' });

  return {
    request: req,
    waypoints,
    segments,
    fittings,
    connectors,
    totalLengthMm: Math.round(lenHoriz + lenVert),
    diagnostics: {
      status: 'valid',
      code: 'VALID',
      message: 'Colonne montante/descendante calculée avec succès.',
    },
  };
}

function createRejectedPlan(
  req: RouteRequest,
  code: RouteDiagnosticCode,
  message: string,
): RoutePlan {
  return {
    request: req,
    waypoints: [],
    segments: [],
    fittings: [],
    connectors: [],
    totalLengthMm: 0,
    diagnostics: {
      status: 'rejected',
      code,
      message,
    },
  };
}
