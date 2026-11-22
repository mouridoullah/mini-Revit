import type {
  Component,
  ComponentType,
  ComponentFamily,
  BimState,
  ElementId,
} from '../types.js';
import type { RuleViolation } from './types.js';
import { BimValidationError } from './types.js';
import {
  type Vec2,
  vec2,
  computeWallFootprint2d,
} from '@tabax/geometry';
import { getComponentEffectiveDimensions } from '../components/dimensions.js';

/**
 * Vérifie les contraintes métier sur un ComponentType (Phase 8).
 */
export function checkComponentTypeViolations(componentType: ComponentType): RuleViolation[] {
  const violations: RuleViolation[] = [];
  if (!componentType.name || componentType.name.trim() === '') {
    violations.push({
      code: 'INVALID_COMPONENT_NAME',
      message: `ComponentType "${componentType.id}" has an empty name.`,
      offendingIds: [componentType.id],
    });
  }
  if (
    !Number.isFinite(componentType.width) ||
    componentType.width <= 0 ||
    !Number.isFinite(componentType.depth) ||
    componentType.depth <= 0 ||
    !Number.isFinite(componentType.height) ||
    componentType.height <= 0
  ) {
    violations.push({
      code: 'INVALID_COMPONENT_DIMENSIONS',
      message: `ComponentType "${componentType.id}" dimensions must be strictly positive finite numbers.`,
      offendingIds: [componentType.id],
    });
  }
  const validFamilies: ComponentFamily[] = ['sanitary', 'kitchen', 'furniture', 'glazing'];
  if (!validFamilies.includes(componentType.family)) {
    violations.push({
      code: 'INVALID_COMPONENT_FAMILY',
      message: `ComponentType "${componentType.id}" has invalid family "${componentType.family}".`,
      offendingIds: [componentType.id],
    });
  }
  if (componentType.minWidth !== undefined && (!Number.isFinite(componentType.minWidth) || componentType.minWidth <= 0)) {
    violations.push({
      code: 'INVALID_COMPONENT_DIMENSIONS',
      message: `ComponentType "${componentType.id}" minWidth must be a strictly positive finite number.`,
      offendingIds: [componentType.id],
    });
  }
  if (componentType.maxWidth !== undefined && (!Number.isFinite(componentType.maxWidth) || componentType.maxWidth <= 0)) {
    violations.push({
      code: 'INVALID_COMPONENT_DIMENSIONS',
      message: `ComponentType "${componentType.id}" maxWidth must be a strictly positive finite number.`,
      offendingIds: [componentType.id],
    });
  }
  if (
    componentType.minWidth !== undefined &&
    componentType.maxWidth !== undefined &&
    componentType.minWidth > componentType.maxWidth
  ) {
    violations.push({
      code: 'INVALID_COMPONENT_DIMENSIONS',
      message: `ComponentType "${componentType.id}" minWidth (${componentType.minWidth}) cannot exceed maxWidth (${componentType.maxWidth}).`,
      offendingIds: [componentType.id],
    });
  }
  if (componentType.minDepth !== undefined && (!Number.isFinite(componentType.minDepth) || componentType.minDepth <= 0)) {
    violations.push({
      code: 'INVALID_COMPONENT_DIMENSIONS',
      message: `ComponentType "${componentType.id}" minDepth must be a strictly positive finite number.`,
      offendingIds: [componentType.id],
    });
  }
  if (componentType.maxDepth !== undefined && (!Number.isFinite(componentType.maxDepth) || componentType.maxDepth <= 0)) {
    violations.push({
      code: 'INVALID_COMPONENT_DIMENSIONS',
      message: `ComponentType "${componentType.id}" maxDepth must be a strictly positive finite number.`,
      offendingIds: [componentType.id],
    });
  }
  if (
    componentType.minDepth !== undefined &&
    componentType.maxDepth !== undefined &&
    componentType.minDepth > componentType.maxDepth
  ) {
    violations.push({
      code: 'INVALID_COMPONENT_DIMENSIONS',
      message: `ComponentType "${componentType.id}" minDepth (${componentType.minDepth}) cannot exceed maxDepth (${componentType.maxDepth}).`,
      offendingIds: [componentType.id],
    });
  }
  return violations;
}

export function validateComponentType(componentType: ComponentType): void {
  const violations = checkComponentTypeViolations(componentType);
  if (violations.length > 0) {
    const v = violations[0];
    if (v) {
      throw new BimValidationError(v.code, v.message, { offendingIds: v.offendingIds });
    }
  }
}

/**
 * Teste l'intersection de deux polygones convexes 2D par le théorème des axes séparateurs (SAT).
 * Retourne true si les polygones se chevauchent de plus de toleranceMm.
 */
export function doConvexPolygonsIntersect(
  polyA: readonly Vec2[],
  polyB: readonly Vec2[],
  toleranceMm: number = 0.5,
): boolean {
  if (polyA.length < 3 || polyB.length < 3) return false;
  for (const currentPoly of [polyA, polyB]) {
    for (let i = 0; i < currentPoly.length; i++) {
      const p1 = currentPoly[i];
      const p2 = currentPoly[(i + 1) % currentPoly.length];
      if (!p1 || !p2) continue;
      const nx = -(p2.y - p1.y);
      const ny = p2.x - p1.x;
      const nLen = Math.hypot(nx, ny);
      if (nLen < 1e-6) continue;
      const unx = nx / nLen;
      const uny = ny / nLen;

      let minA = Infinity;
      let maxA = -Infinity;
      for (const pt of polyA) {
        const proj = pt.x * unx + pt.y * uny;
        if (proj < minA) minA = proj;
        if (proj > maxA) maxA = proj;
      }

      let minB = Infinity;
      let maxB = -Infinity;
      for (const pt of polyB) {
        const proj = pt.x * unx + pt.y * uny;
        if (proj < minB) minB = proj;
        if (proj > maxB) maxB = proj;
      }

      if (maxA - minB < toleranceMm || maxB - minA < toleranceMm) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Calcule les 4 sommets CCW de l'emprise 2D (OBB) d'un composant dans le repère global.
 */
export function getComponentObbVertices(comp: Component, state: BimState): Vec2[] {
  const type = state.componentTypes ? state.componentTypes[comp.typeId] : undefined;
  const dims = type
    ? getComponentEffectiveDimensions(comp, type)
    : {
        width: comp.widthOverride ?? 600,
        depth: comp.depthOverride ?? 600,
        height: comp.heightOverride ?? 800,
      };
  const halfW = dims.width / 2;
  const halfD = dims.depth / 2;
  const rot = comp.placement.rotation ?? 0;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const cx = comp.placement.x;
  const cy = comp.placement.y;

  const localCorners: [number, number][] = [
    [-halfW, -halfD],
    [halfW, -halfD],
    [halfW, halfD],
    [-halfW, halfD],
  ];

  return localCorners.map(([lx, ly]) =>
    vec2(cx + lx * cos - ly * sin, cy + lx * sin + ly * cos),
  );
}

/**
 * Calcule les 4 sommets CCW de la zone de dégagement fonctionnel d'un composant dans le repère global.
 * Retourne null si le type ne définit pas de dégagement (clearanceDepth <= 0).
 */
export function getComponentClearanceVertices(comp: Component, state: BimState): Vec2[] | null {
  const type = state.componentTypes ? state.componentTypes[comp.typeId] : undefined;
  if (!type) return null;
  const clearance = type.clearanceDepth ?? 0;
  if (clearance <= 0) return null;

  const dims = getComponentEffectiveDimensions(comp, type);
  const halfW = dims.width / 2;
  const halfD = dims.depth / 2;
  const rot = comp.placement.rotation ?? 0;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const cx = comp.placement.x;
  const cy = comp.placement.y;

  // Zone de dégagement en avant du composant : Y local dans [-halfD - clearance, -halfD]
  const localCorners: [number, number][] = [
    [-halfW, -halfD - clearance],
    [halfW, -halfD - clearance],
    [halfW, -halfD],
    [-halfW, -halfD],
  ];

  return localCorners.map(([lx, ly]) =>
    vec2(cx + lx * cos - ly * sin, cy + lx * sin + ly * cos),
  );
}

/**
 * Détecte les collisions physiques (2D / 3D OBB) d'un composant avec les autres composants
 * et les murs du même niveau (en ignorant le mur hôte s'il est hébergé).
 */
export function checkComponentCollisions(component: Component, state: BimState): RuleViolation[] {
  const violations: RuleViolation[] = [];
  const ct = state.componentTypes ? state.componentTypes[component.typeId] : undefined;
  if (!ct) return violations;

  const compDims = getComponentEffectiveDimensions(component, ct);
  const compLevel = state.levels[component.levelId];
  const compZBase = (compLevel?.elevation ?? 0) + (component.placement.elevationOffset ?? ct.defaultElevationOffset ?? 0);
  const compZTop = compZBase + compDims.height;
  const compPoly = getComponentObbVertices(component, state);

  // 1. Collisions contre les autres composants du même niveau
  if (state.components) {
    for (const other of Object.values(state.components)) {
      if (other.id === component.id) continue;
      if (other.levelId !== component.levelId) continue;
      const otherType = state.componentTypes ? state.componentTypes[other.typeId] : undefined;
      if (!otherType) continue;

      const otherDims = getComponentEffectiveDimensions(other, otherType);
      const otherLevel = state.levels[other.levelId];
      const otherZBase = (otherLevel?.elevation ?? 0) + (other.placement.elevationOffset ?? otherType.defaultElevationOffset ?? 0);
      const otherZTop = otherZBase + otherDims.height;

      // Chevauchement vertical strict
      if (Math.max(compZBase, otherZBase) < Math.min(compZTop, otherZTop) - 1) {
        const otherPoly = getComponentObbVertices(other, state);
        if (doConvexPolygonsIntersect(compPoly, otherPoly, 1)) {
          violations.push({
            code: 'COMPONENT_COLLISION',
            message: `Component "${component.id}" collides with component "${other.id}".`,
            offendingIds: [component.id, other.id],
            severity: 'warning',
          });
        }
      }
    }
  }

  // 2. Collisions contre les murs du même niveau (sauf le mur hôte)
  if (state.walls) {
    for (const wall of Object.values(state.walls)) {
      if (wall.levelId !== component.levelId) continue;
      if (component.placement.hostWallId === wall.id) continue;

      const wallType = state.wallTypes[wall.typeId];
      const thickness = wallType?.thickness ?? 200;
      const fp = computeWallFootprint2d({
        start: wall.start,
        end: wall.end,
        thickness,
        locationLine: 'center',
      });

      if (doConvexPolygonsIntersect(compPoly, fp.vertices, 1)) {
        violations.push({
          code: 'COMPONENT_COLLISION',
          message: `Component "${component.id}" collides with wall "${wall.id}".`,
          offendingIds: [component.id, wall.id],
          severity: 'warning',
        });
      }
    }
  }

  return violations;
}

/**
 * Analyse si la zone de dégagement fonctionnel recommandé d'un composant est obstruée
 * par un autre composant ou un mur.
 */
export function checkFunctionalClearance(
  component: Component,
  state: BimState,
): { isObstructed: boolean; obstacles: ElementId[] } {
  const clearancePoly = getComponentClearanceVertices(component, state);
  if (!clearancePoly) {
    return { isObstructed: false, obstacles: [] };
  }

  const obstacles: ElementId[] = [];

  // 1. Obstacles composants
  if (state.components) {
    for (const other of Object.values(state.components)) {
      if (other.id === component.id) continue;
      if (other.levelId !== component.levelId) continue;
      const otherPoly = getComponentObbVertices(other, state);
      if (doConvexPolygonsIntersect(clearancePoly, otherPoly, 1)) {
        obstacles.push(other.id);
      }
    }
  }

  // 2. Obstacles murs
  if (state.walls) {
    for (const wall of Object.values(state.walls)) {
      if (wall.levelId !== component.levelId) continue;
      if (component.placement.hostWallId === wall.id) continue;
      const wallType = state.wallTypes[wall.typeId];
      const thickness = wallType?.thickness ?? 200;
      const fp = computeWallFootprint2d({
        start: wall.start,
        end: wall.end,
        thickness,
        locationLine: 'center',
      });
      if (doConvexPolygonsIntersect(clearancePoly, fp.vertices, 1)) {
        obstacles.push(wall.id);
      }
    }
  }

  return { isObstructed: obstacles.length > 0, obstacles };
}

/**
 * Vérifie les contraintes métier sur une instance de composant (Phase 8).
 */
export function checkComponentViolations(component: Component, state: BimState): RuleViolation[] {
  const violations: RuleViolation[] = [];

  // 1. Intégrité du type
  if (!state.componentTypes || !state.componentTypes[component.typeId]) {
    violations.push({
      code: 'UNKNOWN_COMPONENT_TYPE',
      message: `Component "${component.id}" references non-existent ComponentType ID: "${component.typeId}".`,
      offendingIds: [component.id],
    });
  }

  // 2. Intégrité du niveau
  if (!state.levels[component.levelId]) {
    violations.push({
      code: 'UNKNOWN_LEVEL',
      message: `Component "${component.id}" references non-existent Level ID: "${component.levelId}".`,
      offendingIds: [component.id],
    });
  }

  // 3. Intégrité de placement
  if (!Number.isFinite(component.placement.x) || !Number.isFinite(component.placement.y)) {
    violations.push({
      code: 'MALFORMED_COMPONENT',
      message: `Component "${component.id}" has non-finite placement coordinates.`,
      offendingIds: [component.id],
    });
  }

  // 4. Intégrité et géométrie du mur hôte si spécifié (Phase 8.5)
  if (component.placement.hostWallId) {
    const hostWall = state.walls[component.placement.hostWallId];
    if (!hostWall) {
      violations.push({
        code: 'UNKNOWN_HOST_WALL',
        message: `Component "${component.id}" references non-existent host wall ID: "${component.placement.hostWallId}".`,
        offendingIds: [component.id],
      });
    } else {
      const dx = hostWall.end.x - hostWall.start.x;
      const dy = hostWall.end.y - hostWall.start.y;
      const wallLen = Math.hypot(dx, dy);
      if (wallLen > 1e-4) {
        const ux = dx / wallLen;
        const uy = dy / wallLen;
        const px = component.placement.x - hostWall.start.x;
        const py = component.placement.y - hostWall.start.y;
        const s = px * ux + py * uy;
        const dPerp = Math.abs(-px * uy + py * ux);
        const wallType = state.wallTypes[hostWall.typeId];
        const thickness = wallType?.thickness ?? 200;
        const maxDist = thickness / 2 + 50;

        const ct = state.componentTypes ? state.componentTypes[component.typeId] : undefined;
        const isGlazing =
          ct &&
          (ct.family === 'glazing' ||
            ct.ifcEntity === 'IfcDoor' ||
            ct.ifcEntity === 'IfcWindow' ||
            ct.subType === 'sliding_door' ||
            ct.subType === 'french_window' ||
            Boolean(component.openingId));

        if (ct && isGlazing) {
          // Contrôle de distance orthogonale à l'axe du mur pour les menuiseries hôtes encastrées
          if (dPerp > maxDist) {
            violations.push({
              code: 'INVALID_HOST_WALL_DISTANCE',
              message: `Component "${component.id}" is placed too far from host wall centerline (${dPerp.toFixed(1)} mm > ${maxDist.toFixed(1)} mm).`,
              offendingIds: [component.id, hostWall.id],
            });
          }

          const dims = getComponentEffectiveDimensions(component, ct);
          const offsetAlong = s - dims.width / 2;

          // Contrôle strict des bornes longitudinales sans clampage silencieux
          if (offsetAlong < 0 || offsetAlong + dims.width > wallLen) {
            violations.push({
              code: 'INVALID_OPENING_POSITION',
              message: `Component "${component.id}" opening bounds [${offsetAlong.toFixed(1)}, ${(offsetAlong + dims.width).toFixed(1)}] exceed host wall length ${wallLen.toFixed(1)} mm.`,
              offendingIds: [component.id, hostWall.id],
            });
          }

          // Détection des chevauchements d'ouvertures (OPENING_OVERLAP)
          if (state.doors) {
            for (const d of Object.values(state.doors)) {
              if (d.hostWallId === hostWall.id && d.id !== component.id) {
                const dt = state.doorTypes?.[d.doorTypeId];
                const dw = dt?.width ?? 900;
                const dStart = d.offsetAlong;
                const dEnd = dStart + dw;
                const overlap = Math.min(offsetAlong + dims.width, dEnd) - Math.max(offsetAlong, dStart);
                if (overlap > 1) {
                  violations.push({
                    code: 'OPENING_OVERLAP',
                    message: `Component "${component.id}" opening overlaps existing door "${d.id}" on wall "${hostWall.id}".`,
                    offendingIds: [component.id, d.id, hostWall.id],
                  });
                }
              }
            }
          }

          if (state.windows) {
            for (const w of Object.values(state.windows)) {
              if (w.hostWallId === hostWall.id && w.id !== component.id) {
                const wt = state.windowTypes?.[w.windowTypeId];
                const ww = wt?.width ?? 1200;
                const wStart = w.offsetAlong;
                const wEnd = wStart + ww;
                const overlap = Math.min(offsetAlong + dims.width, wEnd) - Math.max(offsetAlong, wStart);
                if (overlap > 1) {
                  violations.push({
                    code: 'OPENING_OVERLAP',
                    message: `Component "${component.id}" opening overlaps existing window "${w.id}" on wall "${hostWall.id}".`,
                    offendingIds: [component.id, w.id, hostWall.id],
                  });
                }
              }
            }
          }

          if (state.components) {
            for (const other of Object.values(state.components)) {
              if (other.id !== component.id && other.placement.hostWallId === hostWall.id) {
                const otherType = state.componentTypes?.[other.typeId];
                const otherIsGlazing =
                  otherType &&
                  (otherType.family === 'glazing' ||
                    otherType.ifcEntity === 'IfcDoor' ||
                    otherType.ifcEntity === 'IfcWindow' ||
                    otherType.subType === 'sliding_door' ||
                    otherType.subType === 'french_window' ||
                    Boolean(other.openingId));
                if (otherType && otherIsGlazing) {
                  const otherDims = getComponentEffectiveDimensions(other, otherType);
                  const otherPx = other.placement.x - hostWall.start.x;
                  const otherPy = other.placement.y - hostWall.start.y;
                  const otherS = otherPx * ux + otherPy * uy;
                  const otherOffset = otherS - otherDims.width / 2;
                  const overlap =
                    Math.min(offsetAlong + dims.width, otherOffset + otherDims.width) -
                    Math.max(offsetAlong, otherOffset);
                  if (overlap > 1) {
                    violations.push({
                      code: 'OPENING_OVERLAP',
                      message: `Component "${component.id}" opening overlaps existing component opening "${other.id}" on wall "${hostWall.id}".`,
                      offendingIds: [component.id, other.id, hostWall.id],
                    });
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  // 5. Validation des surcharges dimensionnelles (Phase 8.4)
  const compType = state.componentTypes ? state.componentTypes[component.typeId] : undefined;
  if (compType) {
    if (component.widthOverride !== undefined) {
      if (!Number.isFinite(component.widthOverride) || component.widthOverride <= 0) {
        violations.push({
          code: 'INVALID_COMPONENT_DIMENSIONS',
          message: `Component "${component.id}" widthOverride must be a strictly positive finite number.`,
          offendingIds: [component.id],
        });
      } else {
        if (compType.minWidth !== undefined && component.widthOverride < compType.minWidth) {
          violations.push({
            code: 'INVALID_COMPONENT_DIMENSIONS',
            message: `Component "${component.id}" widthOverride (${component.widthOverride}) is below minimum allowed (${compType.minWidth}).`,
            offendingIds: [component.id],
          });
        }
        if (compType.maxWidth !== undefined && component.widthOverride > compType.maxWidth) {
          violations.push({
            code: 'INVALID_COMPONENT_DIMENSIONS',
            message: `Component "${component.id}" widthOverride (${component.widthOverride}) exceeds maximum allowed (${compType.maxWidth}).`,
            offendingIds: [component.id],
          });
        }
        if (
          compType.allowedWidths &&
          compType.allowedWidths.length > 0 &&
          !compType.allowedWidths.includes(component.widthOverride)
        ) {
          violations.push({
            code: 'INVALID_COMPONENT_DIMENSIONS',
            message: `Component "${component.id}" widthOverride (${component.widthOverride}) is not in allowed list [${compType.allowedWidths.join(', ')}].`,
            offendingIds: [component.id],
          });
        }
      }
    }

    if (component.depthOverride !== undefined) {
      if (!Number.isFinite(component.depthOverride) || component.depthOverride <= 0) {
        violations.push({
          code: 'INVALID_COMPONENT_DIMENSIONS',
          message: `Component "${component.id}" depthOverride must be a strictly positive finite number.`,
          offendingIds: [component.id],
        });
      } else {
        if (compType.minDepth !== undefined && component.depthOverride < compType.minDepth) {
          violations.push({
            code: 'INVALID_COMPONENT_DIMENSIONS',
            message: `Component "${component.id}" depthOverride (${component.depthOverride}) is below minimum allowed (${compType.minDepth}).`,
            offendingIds: [component.id],
          });
        }
        if (compType.maxDepth !== undefined && component.depthOverride > compType.maxDepth) {
          violations.push({
            code: 'INVALID_COMPONENT_DIMENSIONS',
            message: `Component "${component.id}" depthOverride (${component.depthOverride}) exceeds maximum allowed (${compType.maxDepth}).`,
            offendingIds: [component.id],
          });
        }
      }
    }

    if (component.heightOverride !== undefined) {
      if (!Number.isFinite(component.heightOverride) || component.heightOverride <= 0) {
        violations.push({
          code: 'INVALID_COMPONENT_DIMENSIONS',
          message: `Component "${component.id}" heightOverride must be a strictly positive finite number.`,
          offendingIds: [component.id],
        });
      } else {
        if (compType.minHeight !== undefined && component.heightOverride < compType.minHeight) {
          violations.push({
            code: 'INVALID_COMPONENT_DIMENSIONS',
            message: `Component "${component.id}" heightOverride (${component.heightOverride}) is below minimum allowed (${compType.minHeight}).`,
            offendingIds: [component.id],
          });
        }
        if (compType.maxHeight !== undefined && component.heightOverride > compType.maxHeight) {
          violations.push({
            code: 'INVALID_COMPONENT_DIMENSIONS',
            message: `Component "${component.id}" heightOverride (${component.heightOverride}) exceeds maximum allowed (${compType.maxHeight}).`,
            offendingIds: [component.id],
          });
        }
      }
    }
  }

  return violations;
}

export function validateComponent(component: Component, state: BimState): void {
  const violations = checkComponentViolations(component, state);
  if (violations.length > 0) {
    const v = violations[0];
    if (v) {
      throw new BimValidationError(v.code, v.message, { offendingIds: v.offendingIds });
    }
  }
}

export function canDeleteComponentType(
  componentTypeId: ElementId,
  state: BimState,
): { readonly allowed: boolean; readonly reason?: string } {
  if (!state.componentTypes?.[componentTypeId]) {
    return { allowed: false, reason: `ComponentType "${componentTypeId}" does not exist.` };
  }
  const attached = Object.values(state.components ?? {}).filter((c) => c.typeId === componentTypeId);
  if (attached.length > 0) {
    return {
      allowed: false,
      reason: `ComponentType "${componentTypeId}" is referenced by ${attached.length} component(s).`,
    };
  }
  return { allowed: true };
}
