/**
 * @mini-bim/core/mep/rules
 *
 * Règles de validation métier et d'intégrité pour les entités MEP.
 * Intégrées au mécanisme différentiel validateDirty (ADR-041 / Phase 9.2).
 *
 * GARANTIE DE PERFORMANCE (Phase 9.1 / 9.2) :
 * - Complexité locale stricte O(1) par élément dirty.
 * - ZÉRO boucle O(N^2) globale d'interférence 3D (réservée à la Phase 9.4 BVH/OBB).
 */

import type { BimState, ElementId } from '../types.js';
import type { RuleViolation } from '../rules/types.js';
import type {
  Pipe,
  Duct,
  CableTray,
  MepFitting,
  MepEquipment,
  MepSystem,
  Connector,
  Port,
} from './types.js';
import { MEP_TOLERANCES } from './tolerances.js';
import { distance3D } from './math3d.js';

export function checkPipeViolations(pipe: Pipe, state: BimState): readonly RuleViolation[] {
  const violations: RuleViolation[] = [];

  if (!Number.isFinite(pipe.diameter) || pipe.diameter <= 0) {
    violations.push({
      code: 'MEP_INVALID_PIPE_DIAMETER',
      severity: 'error',
      message: `Tuyauterie "${pipe.id}" : le diamètre nominal doit être strictement positif (${pipe.diameter} mm).`,
      offendingIds: [pipe.id],
    });
  }

  if (!state.levels[pipe.levelId]) {
    violations.push({
      code: 'MEP_UNKNOWN_LEVEL',
      severity: 'error',
      message: `Tuyauterie "${pipe.id}" : niveau de référence introuvable "${pipe.levelId}".`,
      offendingIds: [pipe.id],
    });
  }

  if (pipe.systemId && (!state.mepSystems || !state.mepSystems[pipe.systemId])) {
    violations.push({
      code: 'MEP_UNKNOWN_SYSTEM',
      severity: 'error',
      message: `Tuyauterie "${pipe.id}" : système MEP introuvable "${pipe.systemId}".`,
      offendingIds: [pipe.id],
    });
  }

  const len = distance3D(pipe.start, pipe.end);
  if (len < MEP_TOLERANCES.POSITION_MM) {
    violations.push({
      code: 'MEP_DEGENERATE_PIPE_LENGTH',
      severity: 'error',
      message: `Tuyauterie "${pipe.id}" : longueur dégénérée inférieure à la tolérance (${len.toFixed(2)} mm).`,
      offendingIds: [pipe.id],
    });
  }

  if (!pipe.ports || pipe.ports.length !== 2) {
    violations.push({
      code: 'MEP_INVALID_PORT_COUNT',
      severity: 'error',
      message: `Tuyauterie "${pipe.id}" : doit comporter exactement 2 ports d'extrémité.`,
      offendingIds: [pipe.id],
    });
  }

  return violations;
}

export function checkDuctViolations(duct: Duct, state: BimState): readonly RuleViolation[] {
  const violations: RuleViolation[] = [];

  if (duct.shape === 'round') {
    if (!duct.diameter || duct.diameter <= 0) {
      violations.push({
        code: 'MEP_INVALID_DUCT_DIMENSION',
        severity: 'error',
        message: `Gaine circulaire "${duct.id}" : diamètre nominal invalide ou non spécifié.`,
        offendingIds: [duct.id],
      });
    }
  } else if (duct.shape === 'rectangular') {
    if (!duct.width || duct.width <= 0 || !duct.height || duct.height <= 0) {
      violations.push({
        code: 'MEP_INVALID_DUCT_DIMENSION',
        severity: 'error',
        message: `Gaine rectangulaire "${duct.id}" : dimensions (largeur/hauteur) doivent être strictement positives.`,
        offendingIds: [duct.id],
      });
    }
  }

  if (!state.levels[duct.levelId]) {
    violations.push({
      code: 'MEP_UNKNOWN_LEVEL',
      severity: 'error',
      message: `Gaine "${duct.id}" : niveau introuvable "${duct.levelId}".`,
      offendingIds: [duct.id],
    });
  }

  if (duct.systemId && (!state.mepSystems || !state.mepSystems[duct.systemId])) {
    violations.push({
      code: 'MEP_UNKNOWN_SYSTEM',
      severity: 'error',
      message: `Gaine "${duct.id}" : système MEP introuvable "${duct.systemId}".`,
      offendingIds: [duct.id],
    });
  }

  const len = distance3D(duct.start, duct.end);
  if (len < MEP_TOLERANCES.POSITION_MM) {
    violations.push({
      code: 'MEP_DEGENERATE_DUCT_LENGTH',
      severity: 'error',
      message: `Gaine "${duct.id}" : longueur dégénérée inférieure à la tolérance (${len.toFixed(2)} mm).`,
      offendingIds: [duct.id],
    });
  }

  if (!duct.ports || duct.ports.length !== 2) {
    violations.push({
      code: 'MEP_INVALID_PORT_COUNT',
      severity: 'error',
      message: `Gaine "${duct.id}" : doit comporter exactement 2 ports d'extrémité.`,
      offendingIds: [duct.id],
    });
  }

  return violations;
}

export function checkCableTrayViolations(tray: CableTray, state: BimState): readonly RuleViolation[] {
  const violations: RuleViolation[] = [];

  if (!Number.isFinite(tray.width) || tray.width <= 0 || !Number.isFinite(tray.height) || tray.height <= 0) {
    violations.push({
      code: 'MEP_INVALID_TRAY_DIMENSIONS',
      severity: 'error',
      message: `Chemin de câbles "${tray.id}" : largeur et hauteur de rebord doivent être strictement positives.`,
      offendingIds: [tray.id],
    });
  }

  if (!state.levels[tray.levelId]) {
    violations.push({
      code: 'MEP_UNKNOWN_LEVEL',
      severity: 'error',
      message: `Chemin de câbles "${tray.id}" : niveau introuvable "${tray.levelId}".`,
      offendingIds: [tray.id],
    });
  }

  const len = distance3D(tray.start, tray.end);
  if (len < MEP_TOLERANCES.POSITION_MM) {
    violations.push({
      code: 'MEP_DEGENERATE_TRAY_LENGTH',
      severity: 'error',
      message: `Chemin de câbles "${tray.id}" : longueur dégénérée inférieure à la tolérance.`,
      offendingIds: [tray.id],
    });
  }

  return violations;
}

export function checkMepFittingViolations(fitting: MepFitting, state: BimState): readonly RuleViolation[] {
  const violations: RuleViolation[] = [];

  if (!state.levels[fitting.levelId]) {
    violations.push({
      code: 'MEP_UNKNOWN_LEVEL',
      severity: 'error',
      message: `Raccord "${fitting.id}" : niveau introuvable "${fitting.levelId}".`,
      offendingIds: [fitting.id],
    });
  }

  const expectedMinPorts: Record<MepFitting['fittingType'], number> = {
    cap: 1,
    elbow: 2,
    transition: 2,
    tee: 3,
    cross: 4,
  };

  const minExpected = expectedMinPorts[fitting.fittingType];
  if (!fitting.ports || fitting.ports.length < minExpected) {
    violations.push({
      code: 'MEP_INVALID_FITTING_PORTS',
      severity: 'error',
      message: `Raccord "${fitting.id}" de type "${fitting.fittingType}" : nécessite au moins ${minExpected} ports (trouvé: ${fitting.ports?.length ?? 0}).`,
      offendingIds: [fitting.id],
    });
  }

  return violations;
}

export function checkMepEquipmentViolations(eq: MepEquipment, state: BimState): readonly RuleViolation[] {
  const violations: RuleViolation[] = [];

  if (!state.levels[eq.levelId]) {
    violations.push({
      code: 'MEP_UNKNOWN_LEVEL',
      severity: 'error',
      message: `Équipement "${eq.id}" : niveau introuvable "${eq.levelId}".`,
      offendingIds: [eq.id],
    });
  }

  if (eq.width <= 0 || eq.depth <= 0 || eq.height <= 0) {
    violations.push({
      code: 'MEP_INVALID_EQUIPMENT_SIZE',
      severity: 'error',
      message: `Équipement "${eq.id}" : encombrement 3D (largeur, profondeur, hauteur) doit être strictement positif.`,
      offendingIds: [eq.id],
    });
  }

  return violations;
}

export function checkMepSystemViolations(sys: MepSystem): readonly RuleViolation[] {
  const violations: RuleViolation[] = [];

  if (!sys.name || sys.name.trim().length === 0) {
    violations.push({
      code: 'MEP_EMPTY_SYSTEM_NAME',
      severity: 'error',
      message: `Système MEP "${sys.id}" : le nom du système ne peut être vide.`,
      offendingIds: [sys.id],
    });
  }

  return violations;
}

export function findPortInState(portId: ElementId, state: BimState): Port | undefined {
  if (state.pipes) {
    for (const p of Object.values(state.pipes)) {
      if (p) {
        for (const port of p.ports) {
          if (port.id === portId) return port;
        }
      }
    }
  }
  if (state.ducts) {
    for (const d of Object.values(state.ducts)) {
      if (d) {
        for (const port of d.ports) {
          if (port.id === portId) return port;
        }
      }
    }
  }
  if (state.cableTrays) {
    for (const ct of Object.values(state.cableTrays)) {
      if (ct) {
        for (const port of ct.ports) {
          if (port.id === portId) return port;
        }
      }
    }
  }
  if (state.mepFittings) {
    for (const f of Object.values(state.mepFittings)) {
      if (f) {
        for (const port of f.ports) {
          if (port.id === portId) return port;
        }
      }
    }
  }
  if (state.mepEquipments) {
    for (const eq of Object.values(state.mepEquipments)) {
      if (eq) {
        for (const port of eq.ports) {
          if (port.id === portId) return port;
        }
      }
    }
  }
  return undefined;
}

export function checkConnectorViolations(connector: Connector, state: BimState): readonly RuleViolation[] {
  const violations: RuleViolation[] = [];

  const portA = findPortInState(connector.portAId, state);
  const portB = findPortInState(connector.portBId, state);

  if (!portA || !portB) {
    violations.push({
      code: 'MEP_CONNECTOR_PORT_NOT_FOUND',
      severity: 'error',
      message: `Connexion "${connector.id}" : l'un des ports raccordés est introuvable (${!portA ? connector.portAId : connector.portBId}).`,
      offendingIds: [connector.id],
    });
    return violations;
  }

  if (portA.elementId === portB.elementId) {
    violations.push({
      code: 'MEP_SAME_ELEMENT_CONNECTION',
      severity: 'error',
      message: `Connexion "${connector.id}" : impossible de relier deux ports appartenant au même élément "${portA.elementId}".`,
      offendingIds: [connector.id, portA.elementId],
    });
  }

  if (portA.domain !== portB.domain) {
    violations.push({
      code: 'MEP_DOMAIN_MISMATCH',
      severity: 'error',
      message: `Connexion "${connector.id}" : incompatibilité de domaine (${portA.domain} vs ${portB.domain}).`,
      offendingIds: [connector.id],
    });
  }

  if (portA.systemType !== portB.systemType) {
    violations.push({
      code: 'MEP_SYSTEM_TYPE_MISMATCH',
      severity: 'error',
      message: `Connexion "${connector.id}" : incompatibilité de fluide/service (${portA.systemType} vs ${portB.systemType}).`,
      offendingIds: [connector.id],
    });
  }

  if (portA.shape !== portB.shape) {
    violations.push({
      code: 'MEP_SHAPE_MISMATCH',
      severity: 'error',
      message: `Connexion "${connector.id}" : incompatibilité de section (${portA.shape} vs ${portB.shape}).`,
      offendingIds: [connector.id],
    });
  }

  return violations;
}
