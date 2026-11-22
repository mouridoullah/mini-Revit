/**
 * @tabax/web/tools/mepSnap
 *
 * Accrochage magnétique intelligent (magnetic port snapping) sur les connecteurs ouverts MEP.
 * Conforme à l'ADR-047 (tolérance en pixels écran proportionnelle au zoom).
 */

import { type Vec2, findMepPortAtScreen, type Transform2D } from '@tabax/view-2d';
import type { BimDocument } from '@tabax/core';
import type { MepToolConfig, SnappedPortTarget, SnappedSegmentBodyTarget } from './types.js';

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

export interface EvaluateMepSegmentBodySnapOptions {
  readonly screenPos: Vec2;
  readonly transform: Transform2D;
  readonly doc: BimDocument;
  readonly config: MepToolConfig;
  readonly activeLevelId: string;
  readonly hitTolerancePx?: number; // défaut 14 px
  readonly minEndDistanceMm?: number; // défaut 50 mm (MIN_SEGMENT_LENGTH_MM)
}

/**
 * Détecte si le curseur se trouve sur le corps d'un tronçon MEP hôte pour une dérivation en Té.
 * Tolérance en pixels écran proportionnelle au zoom (ADR-047).
 */
export function evaluateMepSegmentBodySnap(
  opts: EvaluateMepSegmentBodySnapOptions,
): SnappedSegmentBodyTarget | null {
  const hitTolerancePx = opts.hitTolerancePx ?? 14;
  const minEndDistMm = opts.minEndDistanceMm ?? 50;
  const state = opts.doc.getState();

  const candidateSegments: Array<{
    id: string;
    levelId?: string | undefined;
    category: 'pipe' | 'duct' | 'cableTray';
    startPoint: { x: number; y: number; z: number };
    endPoint: { x: number; y: number; z: number };
    diameter?: number | undefined;
    width?: number | undefined;
    height?: number | undefined;
  }> = [
    ...Object.values(state.pipes ?? {})
      .filter((p): p is NonNullable<typeof p> => Boolean(p && p.start && p.end))
      .map((p) => ({
        id: p.id,
        levelId: p.levelId,
        category: 'pipe' as const,
        startPoint: p.start,
        endPoint: p.end,
        diameter: p.diameter,
      })),
    ...Object.values(state.ducts ?? {})
      .filter((d): d is NonNullable<typeof d> => Boolean(d && d.start && d.end))
      .map((d) => ({
        id: d.id,
        levelId: d.levelId,
        category: 'duct' as const,
        startPoint: d.start,
        endPoint: d.end,
        diameter: d.diameter,
        width: d.width,
        height: d.height,
      })),
    ...Object.values(state.cableTrays ?? {})
      .filter((c): c is NonNullable<typeof c> => Boolean(c && c.start && c.end))
      .map((c) => ({
        id: c.id,
        levelId: c.levelId,
        category: 'cableTray' as const,
        startPoint: c.start,
        endPoint: c.end,
        width: c.width,
        height: c.height,
      })),
  ];

  let bestSnap: SnappedSegmentBodyTarget | null = null;
  let minScreenDist = hitTolerancePx;

  for (const seg of candidateSegments) {
    if (opts.activeLevelId && seg.levelId && seg.levelId !== opts.activeLevelId) {
      continue;
    }
    if (seg.category !== opts.config.category) {
      continue;
    }

    const sStart = opts.transform.worldToScreen({ x: seg.startPoint.x, y: seg.startPoint.y });
    const sEnd = opts.transform.worldToScreen({ x: seg.endPoint.x, y: seg.endPoint.y });

    const vx = sEnd.x - sStart.x;
    const vy = sEnd.y - sStart.y;
    const lenSq = vx * vx + vy * vy;
    if (lenSq < 1e-4) {
      continue;
    }

    const px = opts.screenPos.x - sStart.x;
    const py = opts.screenPos.y - sStart.y;
    const t = Math.max(0, Math.min(1, (px * vx + py * vy) / lenSq));

    const projScreenX = sStart.x + t * vx;
    const projScreenY = sStart.y + t * vy;
    const distPx = Math.hypot(opts.screenPos.x - projScreenX, opts.screenPos.y - projScreenY);

    if (distPx <= minScreenDist) {
      const wx = seg.startPoint.x + t * (seg.endPoint.x - seg.startPoint.x);
      const wy = seg.startPoint.y + t * (seg.endPoint.y - seg.startPoint.y);
      const wz = seg.startPoint.z + t * (seg.endPoint.z - seg.startPoint.z);

      const distToStartMm = Math.hypot(wx - seg.startPoint.x, wy - seg.startPoint.y, wz - seg.startPoint.z);
      const distToEndMm = Math.hypot(seg.endPoint.x - wx, seg.endPoint.y - wy, seg.endPoint.z - wz);

      const validForTee = distToStartMm >= minEndDistMm && distToEndMm >= minEndDistMm;

      minScreenDist = distPx;
      bestSnap = {
        segmentId: seg.id,
        point: { x: Math.round(wx), y: Math.round(wy), z: Math.round(wz) },
        category: seg.category,
        diameter: seg.diameter,
        width: seg.width,
        height: seg.height,
        validForTee,
      };
    }
  }

  return bestSnap;
}
