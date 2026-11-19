/**
 * @mini-bim/web/tools/mepSnap
 *
 * Accrochage magnétique intelligent (magnetic port snapping) sur les connecteurs ouverts MEP.
 * Conforme à l'ADR-047 (tolérance en pixels écran proportionnelle au zoom).
 */

import { type Vec2, findMepPortAtScreen, type Transform2D } from '@mini-bim/view-2d';
import type { BimDocument } from '@mini-bim/core';
import type { MepToolConfig, SnappedPortTarget } from './types.js';

export interface EvaluateMepPortSnapOptions {
  readonly screenPos: Vec2;
  readonly transform: Transform2D;
  readonly doc: BimDocument;
  readonly config: MepToolConfig;
  readonly activeLevelId: string;
  readonly hitTolerancePx?: number; // défaut 14 px
  readonly maxToleranceMm?: number; // défaut 300 mm
  readonly currentStartWorld?: Vec2 | undefined;
}

/**
 * Recherche et qualifie la compatibilité d'un port MEP sous le curseur selon l'ADR-047.
 */
export function evaluateMepPortSnap(opts: EvaluateMepPortSnapOptions): SnappedPortTarget | null {
  const hitResult = findMepPortAtScreen(opts.screenPos, opts.transform, opts.doc, {
    hitTolerancePx: opts.hitTolerancePx ?? 14,
    maxToleranceMm: opts.maxToleranceMm ?? 300,
    activeLevelId: opts.activeLevelId,
  });

  if (!hitResult) {
    return null;
  }

  const { port, elementId } = hitResult;
  const state = opts.doc.getState();

  // 1. Vérification de disponibilité : le port ne doit pas être déjà connecté
  let isOccupied = false;
  if (state.mepConnectors) {
    for (const conn of Object.values(state.mepConnectors)) {
      if (conn && (conn.portAId === port.id || conn.portBId === port.id)) {
        isOccupied = true;
        break;
      }
    }
  }

  if (isOccupied) {
    return {
      port,
      elementId,
      compatible: false,
      reason: 'PORT_OCCUPIED',
    };
  }

  // 2. Vérification de domaine
  const targetDomain = opts.config.domain ?? getDefaultDomain(opts.config.category);
  if (port.domain !== targetDomain) {
    return {
      port,
      elementId,
      compatible: false,
      reason: 'DOMAIN_MISMATCH',
    };
  }

  // 3. Vérification de forme et dimensions
  if (opts.config.shape === 'rectangular' || port.shape === 'rectangular') {
    if (opts.config.width !== undefined && port.width !== undefined) {
      if (Math.abs(opts.config.width - port.width) > 2) {
        return {
          port,
          elementId,
          compatible: false,
          reason: 'DIMENSION_MISMATCH',
        };
      }
    }
    if (opts.config.height !== undefined && port.height !== undefined) {
      if (Math.abs(opts.config.height - port.height) > 2) {
        return {
          port,
          elementId,
          compatible: false,
          reason: 'DIMENSION_MISMATCH',
        };
      }
    }
  } else {
    // Circulaire
    if (opts.config.diameter !== undefined && port.diameter !== undefined) {
      if (Math.abs(opts.config.diameter - port.diameter) > 2) {
        return {
          port,
          elementId,
          compatible: false,
          reason: 'DIMENSION_MISMATCH',
        };
      }
    }
  }

  // 4. Vérification de système/fluide si précisé
  if (opts.config.systemType && port.systemType) {
    if (opts.config.systemType !== port.systemType) {
      return {
        port,
        elementId,
        compatible: false,
        reason: 'SYSTEM_TYPE_MISMATCH',
      };
    }
  }

  return {
    port,
    elementId,
    compatible: true,
  };
}

function getDefaultDomain(category: 'pipe' | 'duct' | 'cableTray'): string {
  switch (category) {
    case 'pipe':
      return 'plumbing';
    case 'duct':
      return 'hvac';
    case 'cableTray':
      return 'electrical';
  }
}
