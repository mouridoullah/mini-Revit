/**
 * @tabax/view-2d/renderer/mep
 *
 * Moteur de rendu graphique 2D pour les entités du génie technique (MEP) :
 * Tuyauteries, gaines aérauliques, chemins de câbles, raccords et équipements.
 *
 * Supporte :
 * - Mode unifilaire (single-line) et bifilaire (double-line)
 * - Palette normalisée de couleurs de fluides et systèmes
 * - Repérage visuel distinctif des ports ouverts (libres) vs connectés
 * - Filtrage par niveau et Frustum Culling
 * - Surbrillance de sélection
 */

import { type Transform2D } from '../transform.js';
import { vec2, type Vec2 } from '@tabax/geometry';
import type {
  MepRenderConfig,
  PipeFor2D,
  DuctFor2D,
  CableTrayFor2D,
  MepFittingFor2D,
  MepEquipmentFor2D,
  ConnectorFor2D,
  MepSystemFor2D,
} from '../types.js';

export const MEP_2D_SYSTEM_COLORS: Record<string, string> = {
  domestic_cold_water: '#2563eb', // Bleu cobalt (EF)
  domestic_hot_water: '#dc2626', // Rouge vif (ECS)
  drainage_waste: '#78716c', // Gris chaud (EU)
  drainage_soil: '#44403c', // Brun sombre (EV)
  supply_air: '#0284c7', // Cyan azur
  return_air: '#ea580c', // Orange vif
  exhaust_air: '#65a30d', // Vert chartreuse
  hydronic_supply: '#0891b2', // Turquoise
  hydronic_return: '#be185d', // Rose carmin
  power: '#f59e0b', // Ambre soutenu
  telecom: '#8b5cf6', // Violet
};

export const DEFAULT_MEP_2D_COLOR = '#64748b';

export interface DrawMepElementsOptions {
  readonly effectiveLevelId?: string | null | undefined;
  readonly selectedIds?: ReadonlySet<string> | undefined;
  readonly spatialVisibleIds?: ReadonlySet<string> | null | undefined;
}

export interface MepElementsState {
  readonly pipes?: Record<string, PipeFor2D> | undefined;
  readonly ducts?: Record<string, DuctFor2D> | undefined;
  readonly cableTrays?: Record<string, CableTrayFor2D> | undefined;
  readonly mepFittings?: Record<string, MepFittingFor2D> | undefined;
  readonly mepEquipments?: Record<string, MepEquipmentFor2D> | undefined;
  readonly mepConnectors?: Record<string, ConnectorFor2D> | undefined;
  readonly mepSystems?: Record<string, MepSystemFor2D> | undefined;
}

function resolveSystemColor(
  systemId: string | undefined,
  systems: Record<string, MepSystemFor2D> | undefined,
  systemType?: string,
  config?: MepRenderConfig,
): string {
  if (systemId && systems?.[systemId]) {
    const sys = systems[systemId];
    if (sys.color) return sys.color;
    if (sys.systemType) {
      const c = MEP_2D_SYSTEM_COLORS[sys.systemType];
      if (c) return c;
    }
  }
  if (systemType) {
    const c = MEP_2D_SYSTEM_COLORS[systemType];
    if (c) return c;
  }
  return config?.defaultColor ?? DEFAULT_MEP_2D_COLOR;
}

function isElementVisible(
  elementId: string,
  elementLevelId: string | undefined,
  effectiveLevelId: string | null | undefined,
  spatialVisibleIds: ReadonlySet<string> | null | undefined,
): boolean {
  if (effectiveLevelId !== null && effectiveLevelId !== undefined) {
    if (elementLevelId && elementLevelId !== effectiveLevelId) {
      return false;
    }
  }
  if (spatialVisibleIds && !spatialVisibleIds.has(elementId)) {
    return false;
  }
  return true;
}

/**
 * Dessine une pastille visuelle de port ouvert (anneau circulaire).
 */
function drawOpenPortBadge(
  ctx: CanvasRenderingContext2D,
  screenPos: Vec2,
  color: string,
  radius: number,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(screenPos.x, screenPos.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.restore();
}

/**
 * Dessine l'ensemble des réseaux et équipements MEP dans la vue en plan 2D Canvas.
 */
export function drawMepElements(
  ctx: CanvasRenderingContext2D,
  transform: Transform2D,
  state: MepElementsState,
  config?: MepRenderConfig,
  options?: DrawMepElementsOptions,
): void {
  const mode = config?.mode ?? 'single-line';
  const effectiveLevelId = options?.effectiveLevelId;
  const selectedIds = options?.selectedIds ?? new Set<string>();
  const spatialVisibleIds = options?.spatialVisibleIds ?? null;
  const showOpenPorts = config?.showOpenPortMarkers ?? true;
  const openPortRadius = config?.openPortMarkerRadius ?? 4;
  const defaultLineWidth = config?.lineWidth ?? 2;
  const selStrokeColor = config?.selectedStrokeColor ?? '#2563eb';
  const selStrokeWidth = config?.selectedStrokeWidth ?? 3;

  // 1. Recensement des ports connectés
  const connectedPortIds = new Set<string>();
  if (state.mepConnectors) {
    for (const conn of Object.values(state.mepConnectors)) {
      if (conn.portAId) connectedPortIds.add(conn.portAId);
      if (conn.portBId) connectedPortIds.add(conn.portBId);
    }
  }

  // ==========================================================================
  // 2. Tuyauteries (Pipes)
  // ==========================================================================
  if (state.pipes) {
    for (const pipe of Object.values(state.pipes)) {
      if (!isElementVisible(pipe.id, pipe.levelId, effectiveLevelId, spatialVisibleIds)) {
        continue;
      }

      const p1Screen = transform.worldToScreen(vec2(pipe.start.x, pipe.start.y));
      const p2Screen = transform.worldToScreen(vec2(pipe.end.x, pipe.end.y));
      const isSelected = selectedIds.has(pipe.id);
      const color = resolveSystemColor(pipe.systemId, state.mepSystems, undefined, config);

      ctx.save();

      // Surbrillance de sélection
      if (isSelected) {
        ctx.strokeStyle = selStrokeColor;
        ctx.lineWidth = defaultLineWidth + selStrokeWidth + 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p1Screen.x, p1Screen.y);
        ctx.lineTo(p2Screen.x, p2Screen.y);
        ctx.stroke();
      }

      if (mode === 'single-line') {
        // Mode unifilaire : axe continu coloré
        ctx.strokeStyle = color;
        ctx.lineWidth = defaultLineWidth;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p1Screen.x, p1Screen.y);
        ctx.lineTo(p2Screen.x, p2Screen.y);
        ctx.stroke();
      } else {
        // Mode bifilaire : contours extérieurs + axe en pointillé
        const dx = p2Screen.x - p1Screen.x;
        const dy = p2Screen.y - p1Screen.y;
        const lenPx = Math.hypot(dx, dy);

        if (lenPx > 1e-3) {
          const nx = -dy / lenPx;
          const ny = dx / lenPx;
          const rPx = Math.max(2, (pipe.diameter / 2) * transform.scale);

          // Contours de rive
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(p1Screen.x + nx * rPx, p1Screen.y + ny * rPx);
          ctx.lineTo(p2Screen.x + nx * rPx, p2Screen.y + ny * rPx);
          ctx.moveTo(p1Screen.x - nx * rPx, p1Screen.y - ny * rPx);
          ctx.lineTo(p2Screen.x - nx * rPx, p2Screen.y - ny * rPx);
          ctx.stroke();

          // Axe central pointillé fin
          ctx.setLineDash(config?.centerlineDash ?? [4, 4]);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p1Screen.x, p1Screen.y);
          ctx.lineTo(p2Screen.x, p2Screen.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      ctx.restore();

      // Pastilles de ports ouverts
      if (showOpenPorts && pipe.ports && pipe.ports.length >= 2) {
        const port0 = pipe.ports[0];
        const port1 = pipe.ports[1];
        if (port0 && !connectedPortIds.has(port0.id)) {
          drawOpenPortBadge(ctx, p1Screen, color, openPortRadius);
        }
        if (port1 && !connectedPortIds.has(port1.id)) {
          drawOpenPortBadge(ctx, p2Screen, color, openPortRadius);
        }
      }
    }
  }

  // ==========================================================================
  // 3. Gaines de ventilation (Ducts)
  // ==========================================================================
  if (state.ducts) {
    for (const duct of Object.values(state.ducts)) {
      if (!isElementVisible(duct.id, duct.levelId, effectiveLevelId, spatialVisibleIds)) {
        continue;
      }

      const p1Screen = transform.worldToScreen(vec2(duct.start.x, duct.start.y));
      const p2Screen = transform.worldToScreen(vec2(duct.end.x, duct.end.y));
      const isSelected = selectedIds.has(duct.id);
      const color = resolveSystemColor(duct.systemId, state.mepSystems, undefined, config);

      ctx.save();

      // Surbrillance
      if (isSelected) {
        ctx.strokeStyle = selStrokeColor;
        ctx.lineWidth = defaultLineWidth + selStrokeWidth + 2;
        ctx.beginPath();
        ctx.moveTo(p1Screen.x, p1Screen.y);
        ctx.lineTo(p2Screen.x, p2Screen.y);
        ctx.stroke();
      }

      if (mode === 'single-line') {
        ctx.strokeStyle = color;
        ctx.lineWidth = defaultLineWidth + 1;
        ctx.beginPath();
        ctx.moveTo(p1Screen.x, p1Screen.y);
        ctx.lineTo(p2Screen.x, p2Screen.y);
        ctx.stroke();
      } else {
        const dx = p2Screen.x - p1Screen.x;
        const dy = p2Screen.y - p1Screen.y;
        const lenPx = Math.hypot(dx, dy);

        if (lenPx > 1e-3) {
          const nx = -dy / lenPx;
          const ny = dx / lenPx;
          const halfWidthMm =
            duct.shape === 'round'
              ? (duct.diameter ?? 200) / 2
              : (duct.width ?? 300) / 2;
          const rPx = Math.max(3, halfWidthMm * transform.scale);

          // Remplissage léger translucide
          ctx.fillStyle = `${color}22`;
          ctx.beginPath();
          ctx.moveTo(p1Screen.x + nx * rPx, p1Screen.y + ny * rPx);
          ctx.lineTo(p2Screen.x + nx * rPx, p2Screen.y + ny * rPx);
          ctx.lineTo(p2Screen.x - nx * rPx, p2Screen.y - ny * rPx);
          ctx.lineTo(p1Screen.x - nx * rPx, p1Screen.y - ny * rPx);
          ctx.closePath();
          ctx.fill();

          // Contours extérieurs
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // Axe central pointillé
          ctx.setLineDash([4, 4]);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p1Screen.x, p1Screen.y);
          ctx.lineTo(p2Screen.x, p2Screen.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      ctx.restore();

      // Ports ouverts
      if (showOpenPorts && duct.ports && duct.ports.length >= 2) {
        const port0 = duct.ports[0];
        const port1 = duct.ports[1];
        if (port0 && !connectedPortIds.has(port0.id)) {
          drawOpenPortBadge(ctx, p1Screen, color, openPortRadius);
        }
        if (port1 && !connectedPortIds.has(port1.id)) {
          drawOpenPortBadge(ctx, p2Screen, color, openPortRadius);
        }
      }
    }
  }

  // ==========================================================================
  // 4. Chemins de câbles (CableTrays)
  // ==========================================================================
  if (state.cableTrays) {
    for (const tray of Object.values(state.cableTrays)) {
      if (!isElementVisible(tray.id, tray.levelId, effectiveLevelId, spatialVisibleIds)) {
        continue;
      }

      const p1Screen = transform.worldToScreen(vec2(tray.start.x, tray.start.y));
      const p2Screen = transform.worldToScreen(vec2(tray.end.x, tray.end.y));
      const isSelected = selectedIds.has(tray.id);
      const color =
        resolveSystemColor(tray.systemId, state.mepSystems, undefined, config) ||
        MEP_2D_SYSTEM_COLORS['power'] ||
        '#f59e0b';

      ctx.save();

      const dx = p2Screen.x - p1Screen.x;
      const dy = p2Screen.y - p1Screen.y;
      const lenPx = Math.hypot(dx, dy);

      if (lenPx > 1e-3) {
        const nx = -dy / lenPx;
        const ny = dx / lenPx;
        const ux = dx / lenPx;
        const uy = dy / lenPx;
        const halfWidthPx = Math.max(4, ((tray.width ?? 150) / 2) * transform.scale);

        // Surbrillance
        if (isSelected) {
          ctx.strokeStyle = selStrokeColor;
          ctx.lineWidth = halfWidthPx * 2 + 4;
          ctx.beginPath();
          ctx.moveTo(p1Screen.x, p1Screen.y);
          ctx.lineTo(p2Screen.x, p2Screen.y);
          ctx.stroke();
        }

        // Rives latérales parallèles (rails du chemin de câbles)
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p1Screen.x + nx * halfWidthPx, p1Screen.y + ny * halfWidthPx);
        ctx.lineTo(p2Screen.x + nx * halfWidthPx, p2Screen.y + ny * halfWidthPx);
        ctx.moveTo(p1Screen.x - nx * halfWidthPx, p1Screen.y - ny * halfWidthPx);
        ctx.lineTo(p2Screen.x - nx * halfWidthPx, p2Screen.y - ny * halfWidthPx);
        ctx.stroke();

        // Barreaux transversaux de l'échelle à câbles
        const rungStepMm = 300;
        const rungStepPx = rungStepMm * transform.scale;
        const numRungs = Math.max(1, Math.floor(lenPx / Math.max(10, rungStepPx)));
        const actualStep = lenPx / (numRungs + 1);

        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 1; i <= numRungs; i++) {
          const d = i * actualStep;
          const rx = p1Screen.x + ux * d;
          const ry = p1Screen.y + uy * d;
          ctx.moveTo(rx - nx * halfWidthPx, ry - ny * halfWidthPx);
          ctx.lineTo(rx + nx * halfWidthPx, ry + ny * halfWidthPx);
        }
        ctx.stroke();
      }

      ctx.restore();

      // Ports ouverts
      if (showOpenPorts && tray.ports && tray.ports.length >= 2) {
        const port0 = tray.ports[0];
        const port1 = tray.ports[1];
        if (port0 && !connectedPortIds.has(port0.id)) {
          drawOpenPortBadge(ctx, p1Screen, color, openPortRadius);
        }
        if (port1 && !connectedPortIds.has(port1.id)) {
          drawOpenPortBadge(ctx, p2Screen, color, openPortRadius);
        }
      }
    }
  }

  // ==========================================================================
  // 5. Raccords (MepFittings)
  // ==========================================================================
  if (state.mepFittings) {
    for (const fitting of Object.values(state.mepFittings)) {
      if (!isElementVisible(fitting.id, fitting.levelId, effectiveLevelId, spatialVisibleIds)) {
        continue;
      }

      const centerScreen = transform.worldToScreen(
        vec2(fitting.position.x, fitting.position.y),
      );
      const isSelected = selectedIds.has(fitting.id);
      const color = resolveSystemColor(fitting.systemId, state.mepSystems, undefined, config);

      ctx.save();

      // Surbrillance
      if (isSelected) {
        ctx.strokeStyle = selStrokeColor;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(centerScreen.x, centerScreen.y, 8, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Dessin des liaisons vers les ports du raccord
      ctx.strokeStyle = color;
      ctx.lineWidth = defaultLineWidth;
      ctx.lineCap = 'round';
      ctx.beginPath();

      if (fitting.ports && fitting.ports.length > 0) {
        for (const port of fitting.ports) {
          const portScreen = transform.worldToScreen(
            vec2(port.position.x, port.position.y),
          );
          ctx.moveTo(centerScreen.x, centerScreen.y);
          ctx.lineTo(portScreen.x, portScreen.y);
        }
      } else {
        ctx.arc(centerScreen.x, centerScreen.y, 4, 0, Math.PI * 2);
      }
      ctx.stroke();

      ctx.restore();

      // Ports ouverts du raccord
      if (showOpenPorts && fitting.ports) {
        for (const port of fitting.ports) {
          if (!connectedPortIds.has(port.id)) {
            const pScreen = transform.worldToScreen(
              vec2(port.position.x, port.position.y),
            );
            drawOpenPortBadge(ctx, pScreen, color, openPortRadius);
          }
        }
      }
    }
  }

  // ==========================================================================
  // 6. Équipements techniques (MepEquipments)
  // ==========================================================================
  if (state.mepEquipments) {
    for (const eq of Object.values(state.mepEquipments)) {
      if (!isElementVisible(eq.id, eq.levelId, effectiveLevelId, spatialVisibleIds)) {
        continue;
      }

      const centerScreen = transform.worldToScreen(vec2(eq.position.x, eq.position.y));
      const widthPx = Math.max(12, eq.width * transform.scale);
      const depthPx = Math.max(12, eq.depth * transform.scale);
      const rot = -(eq.rotation ?? 0); // Rotation écran inverse (Y-down)
      const isSelected = selectedIds.has(eq.id);

      ctx.save();
      ctx.translate(centerScreen.x, centerScreen.y);
      ctx.rotate(rot);

      // Surbrillance
      if (isSelected) {
        ctx.strokeStyle = selStrokeColor;
        ctx.lineWidth = 4;
        ctx.strokeRect(-widthPx / 2 - 2, -depthPx / 2 - 2, widthPx + 4, depthPx + 4);
      }

      // Enveloppe de l'équipement
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(-widthPx / 2, -depthPx / 2, widthPx, depthPx);
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-widthPx / 2, -depthPx / 2, widthPx, depthPx);

      // Symbole intérieur : croix diagonale en trait fin
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-widthPx / 2, -depthPx / 2);
      ctx.lineTo(widthPx / 2, depthPx / 2);
      ctx.moveTo(-widthPx / 2, depthPx / 2);
      ctx.lineTo(widthPx / 2, -depthPx / 2);
      ctx.stroke();

      ctx.restore();

      // Ports de l'équipement
      if (eq.ports && eq.ports.length > 0) {
        for (const port of eq.ports) {
          const portScreen = transform.worldToScreen(
            vec2(port.position.x, port.position.y),
          );
          const portColor =
            (port.systemType ? MEP_2D_SYSTEM_COLORS[port.systemType] : undefined) ??
            '#3b82f6';

          if (!connectedPortIds.has(port.id) && showOpenPorts) {
            drawOpenPortBadge(ctx, portScreen, portColor, openPortRadius);
          } else {
            // Port connecté : petit repère plein
            ctx.save();
            ctx.fillStyle = portColor;
            ctx.beginPath();
            ctx.arc(portScreen.x, portScreen.y, 2.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }
      }
    }
  }
}
