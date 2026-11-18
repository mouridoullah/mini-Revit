import { type Vec2, vec2 } from '@mini-bim/geometry';
import { type BimState, type Wall, type ElementId, type Roof } from '../types.js';
import { computeWallVerticalBounds } from '../walls.js';
import { computeWallTopProfile, isWallCoveredByRoof } from '../roofs/top-profile.js';

export interface ResolvedOpening {
  readonly id: ElementId;
  readonly kind: 'door' | 'window';
  readonly offsetAlong: number;
  readonly width: number;
  readonly height: number;
  readonly sillHeight: number; // Hauteur d'allège (0 pour porte, sillHeight pour fenêtre)
  readonly sillZAbsolute: number; // zBase + sillHeight
  readonly lintelZAbsolute: number; // zBase + sillHeight + height
}

export interface ResolvedWall {
  readonly wallId: ElementId;
  readonly zBase: number; // level.elevation + (wall.baseOffset ?? 0)
  readonly zTop: number; // max(topProfile.y)
  readonly height: number; // zTop - zBase (>= 0)
  readonly grossAreaMm2: number; // surface latérale brute exacte de la face du mur en mm² (intégration polygonale sous topProfile)
  readonly heightSource: 'override' | 'constraint' | 'nominal'; // conservé pour rétrocompatibilité
  readonly wallHeightSource: 'override' | 'level' | 'roof'; // ADR-053 [D2]
  readonly limitingSlabId?: ElementId;
  readonly limitingRoofId?: ElementId;
  readonly openings: readonly ResolvedOpening[];
  readonly topProfile: readonly Vec2[]; // polyligne (offsetAlong, zAbsolu) de u = 0 à u = L
}

/**
 * Calcule la surface latérale brute exacte (en mm²) d'une face de mur définie par
 * son arase inférieure zBase et son profil supérieur polygonal topProfile.
 */
export function computeWallPolygonalSideArea(topProfile: readonly Vec2[], zBase: number): number {
  if (topProfile.length < 2) return 0;
  let totalArea = 0;
  for (let i = 0; i < topProfile.length - 1; i++) {
    const p1 = topProfile[i];
    const p2 = topProfile[i + 1];
    if (p1 && p2) {
      const du = Math.abs(p2.x - p1.x);
      const h1 = Math.max(0, p1.y - zBase);
      const h2 = Math.max(0, p2.y - zBase);
      totalArea += du * ((h1 + h2) / 2);
    }
  }
  return totalArea;
}

/**
 * Calcule le dégagement vertical minimal (hauteur libre locale en mm au-dessus de zBase)
 * disponible pour une baie hébergée sur l'intervalle [offsetAlong, offsetAlong + width].
 *
 * Pour un mur rectangulaire, cette valeur est constante et égale à height.
 * Pour un mur sous toiture ou biseauté, c'est le minimum altimétrique sous la pente
 * sur toute la largeur de l'ouverture.
 */
export function getWallLocalHeadroom(
  topProfile: readonly Vec2[],
  offsetAlong: number,
  width: number,
  zBase: number,
): number {
  if (topProfile.length < 2) return 0;

  const uStart = Math.max(0, offsetAlong);
  const uEnd = uStart + width;

  function evalZ(u: number): number {
    const first = topProfile[0];
    const last = topProfile[topProfile.length - 1];
    if (!first || !last) return zBase;
    if (u <= first.x) return first.y;
    if (u >= last.x) return last.y;

    for (let i = 0; i < topProfile.length - 1; i++) {
      const p1 = topProfile[i];
      const p2 = topProfile[i + 1];
      if (p1 && p2 && u >= p1.x && u <= p2.x) {
        const span = p2.x - p1.x;
        if (span <= 1e-6) return Math.min(p1.y, p2.y);
        const t = (u - p1.x) / span;
        return p1.y + t * (p2.y - p1.y);
      }
    }
    return last.y;
  }

  let minZ = Math.min(evalZ(uStart), evalZ(uEnd));
  for (let i = 0; i < topProfile.length; i++) {
    const pt = topProfile[i];
    if (pt && pt.x > uStart && pt.x < uEnd) {
      if (pt.y < minZ) {
        minZ = pt.y;
      }
    }
  }

  return Math.max(0, minZ - zBase);
}

/**
 * Résout la géométrie altimétrique, le profil supérieur (topProfile) et les ouvertures d'un mur architectural
 * (ADR-049 / ADR-053).
 *
 * Source unique de vérité pour :
 * - zBase : arase inférieure absolue (niveau + baseOffset)
 * - zTop : arase supérieure maximale absolue (max topProfile)
 * - height : hauteur libre effective maximale (zTop - zBase)
 * - topProfile : profil polygonal du sommet du mur (biseauté sous toiture ou rectangulaire)
 * - openings : liste ordonnée des ouvertures avec cotes absolues
 *
 * @param wall Mur hôte
 * @param state État global du document BIM
 * @returns Géométrie résolue du mur
 */
export function resolveWallGeometry(wall: Wall, state: BimState): ResolvedWall {
  const currentLevel = state.levels[wall.levelId];
  const zBase = (currentLevel?.elevation ?? 0) + (wall.baseOffset ?? 0);
  const wallType = state.wallTypes[wall.typeId];
  const defaultHeight = wallType?.height ?? 2800;

  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const wallLength = Math.hypot(dx, dy);

  let zTop: number;
  let height: number;
  let heightSource: 'override' | 'constraint' | 'nominal';
  let wallHeightSource: 'override' | 'level' | 'roof';
  let limitingSlabId: ElementId | undefined;
  let limitingRoofId: ElementId | undefined;
  let topProfile: Vec2[];

  // 1. Priorité 1 : Surcharge manuelle explicite (heightOverride)
  if (wall.heightOverride !== undefined && Number.isFinite(wall.heightOverride)) {
    height = Math.max(0, wall.heightOverride);
    zTop = zBase + height;
    heightSource = 'override';
    wallHeightSource = 'override';
    topProfile = [vec2(0, zTop), vec2(wallLength, zTop)];
  }
  // 2. Priorité 2 : Contrainte explicite de niveau (topConstraint.kind === 'level')
  else if (wall.topConstraint?.kind === 'level') {
    const bounds = computeWallVerticalBounds(wall, state);
    zTop = bounds.zTop;
    height = bounds.heightEff;
    heightSource = bounds.heightSource;
    wallHeightSource = 'level';
    limitingSlabId = bounds.limitingSlabId;
    topProfile = [vec2(0, zTop), vec2(wallLength, zTop)];
  }
  // 3. Priorité 3 : Contrainte explicite de toiture (topConstraint.kind === 'roof')
  else if (wall.topConstraint?.kind === 'roof') {
    let targetRoof: Roof | undefined;
    if (wall.topConstraint.roofId && state.roofs) {
      targetRoof = state.roofs[wall.topConstraint.roofId];
    }
    if (!targetRoof && state.roofs) {
      // Auto-détection si roofId omis
      targetRoof = Object.values(state.roofs).find((r) => isWallCoveredByRoof(wall, r));
    }

    if (targetRoof) {
      topProfile = computeWallTopProfile(wall, targetRoof, state);
      zTop = Math.max(...topProfile.map((p) => p.y));
      height = Math.max(0, zTop - zBase);
      heightSource = 'constraint';
      wallHeightSource = 'roof';
      limitingRoofId = targetRoof.id;
    } else {
      // Fallback nominal si le toit n'est pas trouvé
      zTop = zBase + defaultHeight;
      height = defaultHeight;
      heightSource = 'nominal';
      wallHeightSource = 'level';
      topProfile = [vec2(0, zTop), vec2(wallLength, zTop)];
    }
  }
  // 4. Priorité 4 : Contrainte de niveau legacy ({ levelId } sans kind)
  else if (wall.topConstraint?.levelId) {
    const bounds = computeWallVerticalBounds(wall, state);
    zTop = bounds.zTop;
    height = bounds.heightEff;
    heightSource = bounds.heightSource;
    wallHeightSource = 'level';
    limitingSlabId = bounds.limitingSlabId;
    topProfile = [vec2(0, zTop), vec2(wallLength, zTop)];
  }
  // 5. Priorité 5 : Détection automatique sous toiture (ADR-053 [D8])
  else {
    let autoRoof: Roof | undefined;
    if (state.roofs) {
      autoRoof = Object.values(state.roofs).find((r) => isWallCoveredByRoof(wall, r));
    }

    if (autoRoof) {
      topProfile = computeWallTopProfile(wall, autoRoof, state);
      zTop = Math.max(...topProfile.map((p) => p.y));
      height = Math.max(0, zTop - zBase);
      heightSource = 'constraint';
      wallHeightSource = 'roof';
      limitingRoofId = autoRoof.id;
    } else {
      // Aucun toit ni contrainte : nominal
      zTop = zBase + defaultHeight;
      height = defaultHeight;
      heightSource = 'nominal';
      wallHeightSource = 'level';
      topProfile = [vec2(0, zTop), vec2(wallLength, zTop)];
    }
  }

  // 6. Résolution des ouvertures hébergées
  const openings: ResolvedOpening[] = [];

  if (state.doors) {
    for (const door of Object.values(state.doors)) {
      if (door.hostWallId === wall.id) {
        const dt = state.doorTypes?.[door.doorTypeId];
        const width = dt?.width ?? 900;
        const doorHeight = dt?.height ?? 2100;
        const sillHeight = 0;
        const sillZAbsolute = zBase + sillHeight;
        const lintelZAbsolute = sillZAbsolute + doorHeight;

        openings.push({
          id: door.id,
          kind: 'door',
          offsetAlong: door.offsetAlong,
          width,
          height: doorHeight,
          sillHeight,
          sillZAbsolute,
          lintelZAbsolute,
        });
      }
    }
  }

  if (state.windows) {
    for (const win of Object.values(state.windows)) {
      if (win.hostWallId === wall.id) {
        const wt = state.windowTypes?.[win.windowTypeId];
        const width = wt?.width ?? 1200;
        const winHeight = wt?.height ?? 1400;
        const sillHeight = win.sillHeight ?? 0;
        const sillZAbsolute = zBase + sillHeight;
        const lintelZAbsolute = sillZAbsolute + winHeight;

        openings.push({
          id: win.id,
          kind: 'window',
          offsetAlong: win.offsetAlong,
          width,
          height: winHeight,
          sillHeight,
          sillZAbsolute,
          lintelZAbsolute,
        });
      }
    }
  }

  openings.sort((a, b) => a.offsetAlong - b.offsetAlong);

  const grossAreaMm2 = computeWallPolygonalSideArea(topProfile, zBase);

  return {
    wallId: wall.id,
    zBase,
    zTop,
    height,
    grossAreaMm2,
    heightSource,
    wallHeightSource,
    ...(limitingSlabId ? { limitingSlabId } : {}),
    ...(limitingRoofId ? { limitingRoofId } : {}),
    openings,
    topProfile,
  };
}
