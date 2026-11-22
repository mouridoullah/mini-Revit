import {
  vec2,
  type Vec2,
  sub,
  dot,
  createSectionFrame2D,
  projectPointToSectionFrame,
  sliceSegmentWithPolygon,
  sliceSegmentWithPolygonWithHoles,
  computeWallFootprint2d,
  computeEffectiveSlabPolygon,
} from '@tabax/geometry';
import type { BimState, SectionCut, ElementId } from '../types.js';
import type {
  SectionScene,
  SectionLevelDatum,
  SectionCutItem,
  SectionProjectedItem,
  SectionDimension,
} from './types.js';
import { resolveWallGeometry } from '../walls/resolve.js';
import { computeRoofSlopes } from '../roofs/slopes.js';
import { computeStairGeometry } from '../stairs.js';

const DEFAULT_MEP_SYSTEM_COLORS: Record<string, string> = {
  domestic_cold_water: '#2563eb',
  domestic_hot_water: '#dc2626',
  drainage_waste: '#78716c',
  drainage_soil: '#44403c',
  supply_air: '#0284c7',
  return_air: '#ea580c',
  exhaust_air: '#65a30d',
  hydronic_supply: '#0891b2',
  hydronic_return: '#be185d',
  power: '#f59e0b',
  telecom: '#8b5cf6',
};

/**
 * Calcule analytiquement la scène de coupe ou d'élévation 2.5D (ADR-063).
 *
 * Fonction pure et immuable. Retourne une structure SectionScene neutre
 * contenant les niveaux, les éléments sectionnés à d=0 (pochés en traits forts)
 * et les éléments projetés en arrière-plan (0 < d <= depth en traits fins).
 */
export function computeSectionScene(state: BimState, cut: SectionCut): SectionScene {
  const frame = createSectionFrame2D(cut.start, cut.end, cut.viewDirection, cut.depth);
  const cutLen = frame.length;

  // 1. Niveaux du projet triés par élévation Z
  const sortedLevels = Object.values(state.levels).sort((a, b) => a.elevation - b.elevation);
  const levels: SectionLevelDatum[] = sortedLevels.map((lvl) => ({
    id: lvl.id,
    name: lvl.name,
    elevation: lvl.elevation,
  }));

  let zMin = levels.length > 0 ? (levels[0]?.elevation ?? 0) - 600 : -1000;
  let zMax = levels.length > 0 ? (levels[levels.length - 1]?.elevation ?? 2800) + 3000 : 4000;
  if (cut.zMin !== undefined) zMin = Math.min(zMin, cut.zMin);
  if (cut.zMax !== undefined) zMax = Math.max(zMax, cut.zMax);

  const cutItems: SectionCutItem[] = [];
  const projectedItems: SectionProjectedItem[] = [];

  // 2. Murs (Walls) : Coupés et Projetés
  const walls = Object.values(state.walls);
  for (const wall of walls) {
    const wallType = state.wallTypes[wall.typeId];
    const thickness = wallType?.thickness ?? 200;
    const footprint = computeWallFootprint2d({
      start: wall.start,
      end: wall.end,
      thickness,
      locationLine: 'center',
    });
    const wallPoly2d = footprint.vertices;

    const resolved = resolveWallGeometry(wall, state);

    // A. Éléments coupés par le segment de coupe [start, end]
    const slices = sliceSegmentWithPolygon(cut.start, cut.end, wallPoly2d);
    for (const slice of slices) {
      if (slice.endS - slice.startS < 1) continue;

      const sIn = slice.startS;
      const sOut = slice.endS;

      // Calcul des altitudes zTop en tenant compte du topProfile éventuel
      let zTopIn = resolved.zTop;
      let zTopOut = resolved.zTop;

      if (resolved.topProfile && resolved.topProfile.length >= 2) {
        const wallDx = wall.end.x - wall.start.x;
        const wallDy = wall.end.y - wall.start.y;
        const wallLen = Math.hypot(wallDx, wallDy);
        const wallU = wallLen > 1e-4 ? vec2(wallDx / wallLen, wallDy / wallLen) : vec2(1, 0);

        const uIn = dot(sub(slice.startPt, wall.start), wallU);
        const uOut = dot(sub(slice.endPt, wall.start), wallU);

        const interpolateProfileZ = (uVal: number): number => {
          const prof = resolved.topProfile;
          if (!prof || prof.length === 0) return resolved.zTop;
          if (uVal <= (prof[0]?.x ?? 0)) return prof[0]?.y ?? resolved.zTop;
          const last = prof[prof.length - 1];
          if (uVal >= (last?.x ?? wallLen)) return last?.y ?? resolved.zTop;

          for (let i = 0; i < prof.length - 1; i++) {
            const p1 = prof[i];
            const p2 = prof[i + 1];
            if (p1 && p2 && uVal >= p1.x && uVal <= p2.x) {
              const span = p2.x - p1.x;
              const t = span > 1e-4 ? (uVal - p1.x) / span : 0;
              return p1.y + t * (p2.y - p1.y);
            }
          }
          return resolved.zTop;
        };

        zTopIn = interpolateProfileZ(uIn);
        zTopOut = interpolateProfileZ(uOut);
      }

      zMin = Math.min(zMin, resolved.zBase - 200);
      zMax = Math.max(zMax, Math.max(zTopIn, zTopOut) + 500);

      // Vérifier si une ouverture résolue dans le mur est traversée
      let intersectedOpening = false;
      const wallDx = wall.end.x - wall.start.x;
      const wallDy = wall.end.y - wall.start.y;
      const wallLen = Math.hypot(wallDx, wallDy);
      const wallU = wallLen > 1e-4 ? vec2(wallDx / wallLen, wallDy / wallLen) : vec2(1, 0);

      for (const op of resolved.openings) {
        const opU1 = op.offsetAlong;
        const opU2 = op.offsetAlong + op.width;

        const uIn = dot(sub(slice.startPt, wall.start), wallU);
        const uOut = dot(sub(slice.endPt, wall.start), wallU);
        const uMinSlice = Math.min(uIn, uOut);
        const uMaxSlice = Math.max(uIn, uOut);

        const overlapU1 = Math.max(uMinSlice, opU1);
        const overlapU2 = Math.min(uMaxSlice, opU2);

        if (overlapU2 - overlapU1 > 5) {
          intersectedOpening = true;

          // Fraction de l'ouverture
          const t1 = (overlapU1 - uMinSlice) / (uMaxSlice - uMinSlice);
          const t2 = (overlapU2 - uMinSlice) / (uMaxSlice - uMinSlice);
          const sOp1 = sIn + t1 * (sOut - sIn);
          const sOp2 = sIn + t2 * (sOut - sIn);

          const opSMin = Math.min(sOp1, sOp2);
          const opSMax = Math.max(sOp1, sOp2);

          // Allège sous l'ouverture (si fenêtre avec allège > 50 mm)
          if (op.sillZAbsolute - resolved.zBase > 50) {
            cutItems.push({
              id: `${wall.id}_sill_${op.id}`,
              category: 'wall',
              polygon: [
                vec2(opSMin, resolved.zBase),
                vec2(opSMax, resolved.zBase),
                vec2(opSMax, op.sillZAbsolute),
                vec2(opSMin, op.sillZAbsolute),
              ],
              materialId: wallType?.layers?.[0]?.materialId,
              style: {
                fill: '#d1d5db',
                stroke: '#111827',
                strokeWidth: 2,
                hatch: wallType?.isExternal ? 'masonry' : 'concrete',
              },
            });
          }

          // Linteau au-dessus de l'ouverture
          const zLintelTopIn = zTopIn;
          const zLintelTopOut = zTopOut;
          if (Math.min(zLintelTopIn, zLintelTopOut) - op.lintelZAbsolute > 50) {
            cutItems.push({
              id: `${wall.id}_lintel_${op.id}`,
              category: 'wall',
              polygon: [
                vec2(opSMin, op.lintelZAbsolute),
                vec2(opSMax, op.lintelZAbsolute),
                vec2(opSMax, zLintelTopOut),
                vec2(opSMin, zLintelTopIn),
              ],
              materialId: wallType?.layers?.[0]?.materialId,
              style: {
                fill: '#d1d5db',
                stroke: '#111827',
                strokeWidth: 2,
                hatch: wallType?.isExternal ? 'masonry' : 'concrete',
              },
            });
          }

          // Tranches résiduelles de mur avant et après l'ouverture
          if (opSMin - sIn > 5) {
            cutItems.push({
              id: `${wall.id}_pre_${op.id}`,
              category: 'wall',
              polygon: [
                vec2(sIn, resolved.zBase),
                vec2(opSMin, resolved.zBase),
                vec2(opSMin, zTopIn),
                vec2(sIn, zTopIn),
              ],
              style: {
                fill: '#d1d5db',
                stroke: '#111827',
                strokeWidth: 2,
                hatch: wallType?.isExternal ? 'masonry' : 'concrete',
              },
            });
          }
          if (sOut - opSMax > 5) {
            cutItems.push({
              id: `${wall.id}_post_${op.id}`,
              category: 'wall',
              polygon: [
                vec2(opSMax, resolved.zBase),
                vec2(sOut, resolved.zBase),
                vec2(sOut, zTopOut),
                vec2(opSMax, zTopOut),
              ],
              style: {
                fill: '#d1d5db',
                stroke: '#111827',
                strokeWidth: 2,
                hatch: wallType?.isExternal ? 'masonry' : 'concrete',
              },
            });
          }
          break;
        }
      }

      if (!intersectedOpening) {
        cutItems.push({
          id: `${wall.id}_cut_${Math.round(sIn)}`,
          category: 'wall',
          polygon: [
            vec2(sIn, resolved.zBase),
            vec2(sOut, resolved.zBase),
            vec2(sOut, zTopOut),
            vec2(sIn, zTopIn),
          ],
          materialId: wallType?.layers?.[0]?.materialId,
          style: {
            fill: '#d1d5db',
            stroke: '#111827',
            strokeWidth: 2,
            hatch: wallType?.isExternal ? 'masonry' : 'concrete',
          },
        });
      }
    }

    // B. Murs projetés en arrière-plan (0 < d <= depth)
    const p1Proj = projectPointToSectionFrame(wall.start, frame);
    const p2Proj = projectPointToSectionFrame(wall.end, frame);

    const minD = Math.min(p1Proj.d, p2Proj.d);
    const maxD = Math.max(p1Proj.d, p2Proj.d);
    const minS = Math.min(p1Proj.s, p2Proj.s);
    const maxS = Math.max(p1Proj.s, p2Proj.s);

    if (minD > 10 && maxD <= cut.depth && maxS >= 0 && minS <= cutLen) {
      // Clamper s aux limites de la vue
      const clampedS1 = Math.max(0, Math.min(cutLen, p1Proj.s));
      const clampedS2 = Math.max(0, Math.min(cutLen, p2Proj.s));

      if (Math.abs(clampedS2 - clampedS1) > 10) {
        const sLeft = Math.min(clampedS1, clampedS2);
        const sRight = Math.max(clampedS1, clampedS2);
        const avgDepth = (p1Proj.d + p2Proj.d) / 2;
        const isElev = cut.kind === 'elevation';

        projectedItems.push({
          id: `${wall.id}_proj`,
          category: 'wall',
          depth: avgDepth,
          polygon: [
            vec2(sLeft, resolved.zBase),
            vec2(sRight, resolved.zBase),
            vec2(sRight, resolved.zTop),
            vec2(sLeft, resolved.zTop),
          ],
          style: {
            stroke: isElev ? '#334155' : '#6b7280',
            strokeWidth: isElev ? 1.2 : 1,
            fill: isElev ? '#f8fafc' : 'rgba(243, 244, 246, 0.4)',
            opacity: isElev ? 1 : 0.85,
          },
        });

        // Projeter les ouvertures de ce mur en arrière-plan
        for (const op of resolved.openings) {
          const wallLen = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
          if (wallLen > 1e-4) {
            const frac1 = op.offsetAlong / wallLen;
            const frac2 = (op.offsetAlong + op.width) / wallLen;
            const sOp1 = p1Proj.s + frac1 * (p2Proj.s - p1Proj.s);
            const sOp2 = p1Proj.s + frac2 * (p2Proj.s - p1Proj.s);

            const opLeft = Math.min(sOp1, sOp2);
            const opRight = Math.max(sOp1, sOp2);

            if (opRight >= 0 && opLeft <= cutLen) {
              const lines: [Vec2, Vec2][] = [];
              const w = Math.abs(opRight - opLeft);
              const h = Math.abs(op.lintelZAbsolute - op.sillZAbsolute);

              if (isElev) {
                if (op.kind === 'window') {
                  // Châssis intérieur (décalage de 40mm)
                  const dF = Math.min(40, w * 0.1, h * 0.1);
                  const sIn1 = opLeft + dF;
                  const sIn2 = opRight - dF;
                  const zIn1 = op.sillZAbsolute + dF;
                  const zIn2 = op.lintelZAbsolute - dF;
                  if (sIn2 > sIn1 && zIn2 > zIn1) {
                    lines.push([vec2(sIn1, zIn1), vec2(sIn2, zIn1)]);
                    lines.push([vec2(sIn2, zIn1), vec2(sIn2, zIn2)]);
                    lines.push([vec2(sIn2, zIn2), vec2(sIn1, zIn2)]);
                    lines.push([vec2(sIn1, zIn2), vec2(sIn1, zIn1)]);
                  }

                  // Meneau vertical au milieu si fenêtre large (> 700mm)
                  if (w >= 700) {
                    const sMid = (opLeft + opRight) / 2;
                    lines.push([vec2(sMid, op.sillZAbsolute), vec2(sMid, op.lintelZAbsolute)]);
                  }
                  // Traverse horizontale si fenêtre haute (> 1200mm)
                  if (h >= 1200) {
                    const zTrans = op.lintelZAbsolute - 400;
                    lines.push([vec2(opLeft, zTrans), vec2(opRight, zTrans)]);
                  }
                } else {
                  // Porte : cadre dormant et poignée
                  const dF = Math.min(50, w * 0.08);
                  const sIn1 = opLeft + dF;
                  const sIn2 = opRight - dF;
                  const zIn2 = op.lintelZAbsolute - dF;
                  if (sIn2 > sIn1 && zIn2 > op.sillZAbsolute) {
                    lines.push([vec2(sIn1, op.sillZAbsolute), vec2(sIn1, zIn2)]);
                    lines.push([vec2(sIn1, zIn2), vec2(sIn2, zIn2)]);
                    lines.push([vec2(sIn2, zIn2), vec2(sIn2, op.sillZAbsolute)]);
                  }

                  // Poignée à Z = sill + 1050
                  const zHandle = op.sillZAbsolute + 1050;
                  const isRight = state.doors?.[op.id]?.swing?.side === 'right';
                  const sHandle = opLeft + (isRight ? 70 : Math.max(70, w - 70));
                  lines.push([vec2(sHandle - 15, zHandle), vec2(sHandle + 15, zHandle)]);
                }
              }

              projectedItems.push({
                id: `${op.id}_proj`,
                category: op.kind === 'door' ? 'door' : 'window',
                depth: avgDepth - 1,
                polygon: [
                  vec2(Math.max(0, opLeft), op.sillZAbsolute),
                  vec2(Math.min(cutLen, opRight), op.sillZAbsolute),
                  vec2(Math.min(cutLen, opRight), op.lintelZAbsolute),
                  vec2(Math.max(0, opLeft), op.lintelZAbsolute),
                ],
                lines: lines.length > 0 ? lines : undefined,
                style: {
                  stroke: op.kind === 'door' ? '#78350f' : '#1e40af',
                  strokeWidth: isElev ? 1.4 : 1.2,
                  fill:
                    op.kind === 'door'
                      ? isElev
                        ? '#fef3c7'
                        : 'rgba(254, 243, 199, 0.6)'
                      : isElev
                        ? '#dbeafe'
                        : 'rgba(219, 234, 254, 0.6)',
                  opacity: 1,
                },
              });
            }
          }
        }
      }
    }
  }

  // 3. Dalles (Slabs)
  const slabs = Object.values(state.slabs ?? {});
  for (const slab of slabs) {
    const slabType = state.slabTypes[slab.slabTypeId];
    const thickness = slabType?.thickness ?? 200;
    const level = state.levels[slab.levelId];
    const zLevel = (level?.elevation ?? 0) + (slab.baseOffset ?? 0);

    const effSlab = computeEffectiveSlabPolygon({
      boundary: slab.boundary,
      holes: slab.holes,
      openings: slab.openings,
    });
    const slices = sliceSegmentWithPolygonWithHoles(
      cut.start,
      cut.end,
      effSlab.outer,
      effSlab.holes,
    );

    for (const slice of slices) {
      if (slice.endS - slice.startS < 5) continue;
      cutItems.push({
        id: `${slab.id}_cut_${Math.round(slice.startS)}`,
        category: 'slab',
        polygon: [
          vec2(slice.startS, zLevel - thickness),
          vec2(slice.endS, zLevel - thickness),
          vec2(slice.endS, zLevel),
          vec2(slice.startS, zLevel),
        ],
        style: {
          fill: '#cbd5e1',
          stroke: '#0f172a',
          strokeWidth: 2,
          hatch: 'concrete',
        },
      });
    }

    // Projeté en arrière-plan si la dalle a un bord visible
    const pCenter = projectPointToSectionFrame(
      effSlab.outer[0] ?? vec2(0, 0),
      frame,
    );
    if (pCenter.d > 10 && pCenter.d <= cut.depth) {
      projectedItems.push({
        id: `${slab.id}_proj`,
        category: 'slab',
        depth: pCenter.d,
        polygon: [
          vec2(0, zLevel - thickness),
          vec2(cutLen, zLevel - thickness),
          vec2(cutLen, zLevel),
          vec2(0, zLevel),
        ],
        style: {
          stroke: '#94a3b8',
          strokeWidth: 1,
          fill: 'rgba(241, 245, 249, 0.3)',
        },
      });
    }
  }

  // 4. Toitures (Roofs)
  const roofs = Object.values(state.roofs ?? {});
  for (const roof of roofs) {
    const slopes = computeRoofSlopes(roof, state);
    for (const slope of slopes) {
      // Calcul des altitudes sur le plan de versant : z = -(a*x + b*y + d) / c
      const calcZ = (pt: Vec2): number => {
        if (Math.abs(slope.plane.c) < 1e-6) return slope.zRidge;
        return -(slope.plane.a * pt.x + slope.plane.b * pt.y + slope.plane.d) / slope.plane.c;
      };

      const slices = sliceSegmentWithPolygon(cut.start, cut.end, slope.polygon);
      for (const slice of slices) {
        if (slice.endS - slice.startS < 5) continue;

        const z1 = calcZ(slice.startPt);
        const z2 = calcZ(slice.endPt);
        const thickness = 220; // épaisseur nominale toiture/complexe isolant

        zMax = Math.max(zMax, z1 + 500, z2 + 500);

        cutItems.push({
          id: `${roof.id}_${slope.id}_cut`,
          category: 'roof',
          polygon: [
            vec2(slice.startS, z1 - thickness),
            vec2(slice.endS, z2 - thickness),
            vec2(slice.endS, z2),
            vec2(slice.startS, z1),
          ],
          style: {
            fill: '#fde68a',
            stroke: '#78350f',
            strokeWidth: 2,
            hatch: 'insulation',
          },
        });
      }

      // Projection du versant en arrière-plan (0 < d <= depth)
      if (slope.polygon.length >= 3) {
        const projectedPts = slope.polygon.map((pt) => {
          const pProj = projectPointToSectionFrame(pt, frame);
          const z = calcZ(pt);
          return { s: pProj.s, d: pProj.d, z };
        });

        const minD = Math.min(...projectedPts.map((p) => p.d));
        const maxD = Math.max(...projectedPts.map((p) => p.d));
        const minS = Math.min(...projectedPts.map((p) => p.s));
        const maxS = Math.max(...projectedPts.map((p) => p.s));

        if (minD > 10 && maxD <= cut.depth && maxS >= 0 && minS <= cutLen) {
          const avgD = projectedPts.reduce((acc, p) => acc + p.d, 0) / projectedPts.length;
          const poly2d = projectedPts.map((p) => vec2(p.s, p.z));

          for (const p of projectedPts) {
            zMax = Math.max(zMax, p.z + 500);
          }

          const isElev = cut.kind === 'elevation';
          projectedItems.push({
            id: `${roof.id}_${slope.id}_proj`,
            category: 'roof',
            depth: avgD,
            polygon: poly2d,
            style: {
              stroke: '#78350f',
              strokeWidth: isElev ? 1.4 : 1,
              fill: isElev ? '#fef3c7' : 'rgba(254, 243, 199, 0.4)',
              opacity: isElev ? 1 : 0.8,
            },
          });
        }
      }
    }
  }

  // 5. Escaliers (Stairs)
  const stairs = Object.values(state.stairs ?? {});
  for (const stair of stairs) {
    const stairGeom = computeStairGeometry(stair, state);
    const bottomLevel = state.levels[stair.bottomLevelId];
    const baseZ = bottomLevel?.elevation ?? 0;

    const pStartProj = projectPointToSectionFrame(stair.start, frame);
    const pEndProj = projectPointToSectionFrame(stair.end, frame);

    const minD = Math.min(pStartProj.d, pEndProj.d);
    const maxD = Math.max(pStartProj.d, pEndProj.d);

    // Si traversé ou proche
    if (minD <= 0 && maxD >= 0) {
      // Escalier coupé : profil en crémaillère
      const stepPoly: Vec2[] = [];
      const N = stairGeom.numberOfSteps;
      for (let i = 0; i <= N; i++) {
        const frac = i / N;
        const s = pStartProj.s + frac * (pEndProj.s - pStartProj.s);
        const z = baseZ + i * stairGeom.stepHeight;
        stepPoly.push(vec2(s, z));
      }
      stepPoly.push(vec2(pEndProj.s, baseZ));
      stepPoly.push(vec2(pStartProj.s, baseZ));

      cutItems.push({
        id: `${stair.id}_cut`,
        category: 'stair',
        polygon: stepPoly,
        style: {
          fill: '#e2e8f0',
          stroke: '#334155',
          strokeWidth: 1.8,
          hatch: 'concrete',
        },
      });
    } else if (minD > 0 && maxD <= cut.depth) {
      // Escalier en arrière-plan
      const lines: [Vec2, Vec2][] = [];
      const N = stairGeom.numberOfSteps;
      for (let i = 0; i < N; i++) {
        const frac1 = i / N;
        const frac2 = (i + 1) / N;
        const s1 = pStartProj.s + frac1 * (pEndProj.s - pStartProj.s);
        const s2 = pStartProj.s + frac2 * (pEndProj.s - pStartProj.s);
        const zStep = baseZ + (i + 1) * stairGeom.stepHeight;
        lines.push([vec2(s1, zStep), vec2(s2, zStep)]);
      }

      projectedItems.push({
        id: `${stair.id}_proj`,
        category: 'stair',
        depth: (minD + maxD) / 2,
        polygon: [
          vec2(pStartProj.s, baseZ),
          vec2(pEndProj.s, baseZ),
          vec2(pEndProj.s, baseZ + stairGeom.totalRise),
          vec2(pStartProj.s, baseZ),
        ],
        lines,
        style: {
          stroke: '#64748b',
          strokeWidth: 1.2,
          fill: 'rgba(226, 232, 240, 0.4)',
        },
      });
    }
  }

  // 6. Réseaux MEP (Pipes, Ducts, CableTrays)
  const processMepSegment = (
    id: ElementId,
    category: 'pipe' | 'duct' | 'cableTray',
    p1: { x: number; y: number; z: number },
    p2: { x: number; y: number; z: number },
    systemId?: string,
    dimensions?: { width?: number; height?: number; diameter?: number },
  ) => {
    const proj1 = projectPointToSectionFrame(vec2(p1.x, p1.y), frame);
    const proj2 = projectPointToSectionFrame(vec2(p2.x, p2.y), frame);

    const d1 = proj1.d;
    const d2 = proj2.d;
    const s1 = proj1.s;
    const s2 = proj2.s;
    const z1 = p1.z;
    const z2 = p2.z;

    // En élévation extérieure, masquer les réseaux MEP intérieurs
    if (cut.kind === 'elevation') {
      return;
    }

    const system = systemId ? state.mepSystems?.[systemId] : undefined;
    const color =
      system?.color ??
      (system?.systemType ? DEFAULT_MEP_SYSTEM_COLORS[system.systemType] : undefined) ??
      '#64748b';

    // A. Traversée du plan de coupe (d1 et d2 de signes opposés)
    if ((d1 <= 0 && d2 >= 0) || (d2 <= 0 && d1 >= 0)) {
      const spanD = d2 - d1;
      const t = Math.abs(spanD) > 1e-4 ? -d1 / spanD : 0.5;
      const sInt = s1 + t * (s2 - s1);
      const zInt = z1 + t * (z2 - z1);

      if (sInt >= -50 && sInt <= cutLen + 50) {
        if (category === 'pipe') {
          const r = Math.max(15, (dimensions?.diameter ?? 50) / 2);
          // Polygone octogonal approximant la section circulaire
          const oct: Vec2[] = [];
          for (let k = 0; k < 8; k++) {
            const ang = (k * Math.PI) / 4;
            oct.push(vec2(sInt + r * Math.cos(ang), zInt + r * Math.sin(ang)));
          }
          cutItems.push({
            id: `${id}_cut`,
            category: 'pipe',
            polygon: oct,
            style: {
              fill: color,
              stroke: '#0f172a',
              strokeWidth: 2,
              hatch: 'solid',
            },
            metadata: { systemId, diameter: dimensions?.diameter },
          });
        } else {
          const w = dimensions?.width ?? 200;
          const h = dimensions?.height ?? 100;
          cutItems.push({
            id: `${id}_cut`,
            category,
            polygon: [
              vec2(sInt - w / 2, zInt - h / 2),
              vec2(sInt + w / 2, zInt - h / 2),
              vec2(sInt + w / 2, zInt + h / 2),
              vec2(sInt - w / 2, zInt + h / 2),
            ],
            style: {
              fill: color,
              stroke: '#0f172a',
              strokeWidth: 2,
              hatch: 'metal',
            },
            metadata: { systemId, width: w, height: h },
          });
        }
      }
    }

    // B. Tronçon visible dans la profondeur (0 < d <= depth)
    const minD = Math.min(d1, d2);
    const maxD = Math.max(d1, d2);
    if (minD > 5 && maxD <= cut.depth && (Math.max(s1, s2) >= 0 || Math.min(s1, s2) <= cutLen)) {
      projectedItems.push({
        id: `${id}_proj`,
        category,
        depth: (d1 + d2) / 2,
        polygon: [vec2(s1, z1), vec2(s2, z2), vec2(s2, z2 + 20), vec2(s1, z1 + 20)],
        lines: [[vec2(s1, z1), vec2(s2, z2)]],
        style: {
          stroke: color,
          strokeWidth: 1.5,
          opacity: 0.85,
        },
      });
    }
  };

  for (const pipe of Object.values(state.pipes ?? {})) {
    processMepSegment(pipe.id, 'pipe', pipe.start, pipe.end, pipe.systemId, {
      diameter: pipe.diameter,
    });
  }
  for (const duct of Object.values(state.ducts ?? {})) {
    processMepSegment(duct.id, 'duct', duct.start, duct.end, duct.systemId, {
      width: duct.width ?? 300,
      height: duct.height ?? 200,
    });
  }
  for (const ct of Object.values(state.cableTrays ?? {})) {
    processMepSegment(ct.id, 'cableTray', ct.start, ct.end, ct.systemId, {
      width: ct.width ?? 200,
      height: ct.height ?? 60,
    });
  }

  // 7. Tri des éléments projetés par profondeur décroissante (peintre : fond vers premier plan)
  projectedItems.sort((a, b) => b.depth - a.depth);

  // 8. Cotations architecturales et chaînes altimétriques (ADR-069)
  const dimensions: SectionDimension[] = [];

  // A. Repères altimétriques de niveaux (s = -350 mm)
  for (const lvl of sortedLevels) {
    const elevM = (lvl.elevation / 1000).toFixed(2);
    const sign = lvl.elevation > 0 ? '+' : '';
    dimensions.push({
      id: `dim_lvl_${lvl.id}`,
      kind: 'level_marker',
      s: -350,
      z1: lvl.elevation,
      z2: lvl.elevation,
      offset: -350,
      valueMm: lvl.elevation,
      formattedValue: `${sign}${elevM}`,
      label: lvl.name,
      isExterior: true,
    });
  }

  // B. Chaîne de hauteurs d'étages fini-à-fini (s = -150 mm)
  for (let i = 0; i < sortedLevels.length - 1; i++) {
    const lvl1 = sortedLevels[i];
    const lvl2 = sortedLevels[i + 1];
    if (!lvl1 || !lvl2) continue;
    const hMm = Math.round(lvl2.elevation - lvl1.elevation);
    if (hMm > 100) {
      dimensions.push({
        id: `dim_floor_${lvl1.id}_${lvl2.id}`,
        kind: 'floor_height',
        s: -150,
        z1: lvl1.elevation,
        z2: lvl2.elevation,
        offset: -150,
        valueMm: hMm,
        formattedValue: `${(hMm / 1000).toFixed(2)} m`,
        label: 'H. Ét.',
        isExterior: true,
      });
    }
  }

  // C. Hauteur hors-tout totale (s = -550 mm)
  const firstLvl = sortedLevels[0];
  const lastLvl = sortedLevels[sortedLevels.length - 1];
  if (sortedLevels.length >= 2 && firstLvl && lastLvl) {
    const bottomZ = firstLvl.elevation;
    let topZ = lastLvl.elevation;
    for (const item of cutItems) {
      for (const pt of item.polygon) {
        if (pt.y > topZ) topZ = pt.y;
      }
    }
    for (const item of projectedItems) {
      for (const pt of item.polygon) {
        if (pt.y > topZ) topZ = pt.y;
      }
    }
    topZ = Math.round(topZ);
    const totalMm = topZ - bottomZ;
    if (totalMm > 500) {
      dimensions.push({
        id: 'dim_total_height',
        kind: 'total_height',
        s: -550,
        z1: bottomZ,
        z2: topZ,
        offset: -550,
        valueMm: totalMm,
        formattedValue: `${(totalMm / 1000).toFixed(2)} m`,
        label: 'Total',
        isExterior: true,
      });
    }
  }

  // D. Hauteur sous plafond H.S.P. intérieure (uniquement pour les coupes)
  if (cut.kind === 'section') {
    for (let i = 0; i < sortedLevels.length - 1; i++) {
      const lvl1 = sortedLevels[i];
      const lvl2 = sortedLevels[i + 1];
      if (!lvl1 || !lvl2) continue;
      const slabThick = 200;
      const hspMm = Math.round(lvl2.elevation - lvl1.elevation - slabThick);
      if (hspMm >= 1800) {
        dimensions.push({
          id: `dim_hsp_${lvl1.id}`,
          kind: 'ceiling_height',
          s: Math.round(cutLen / 2),
          z1: lvl1.elevation,
          z2: lvl1.elevation + hspMm,
          offset: 0,
          valueMm: hspMm,
          formattedValue: `${(hspMm / 1000).toFixed(2)} m`,
          label: 'H.S.P.',
          isExterior: false,
        });
      }
    }
  }

  // Calcul rigoureux des bornes horizontales sMin / sMax englobant la géométrie,
  // les cotations déportées (s < 0) et les repères altimétriques
  let sMin = 0;
  let sMax = cutLen;

  for (const item of cutItems) {
    for (const pt of item.polygon) {
      if (pt.x < sMin) sMin = pt.x;
      if (pt.x > sMax) sMax = pt.x;
    }
  }

  for (const item of projectedItems) {
    for (const pt of item.polygon) {
      if (pt.x < sMin) sMin = pt.x;
      if (pt.x > sMax) sMax = pt.x;
    }
  }

  for (const dim of dimensions) {
    const dimLeft = dim.s - 700; // Marge pour le texte de cote aligné à droite
    if (dimLeft < sMin) sMin = dimLeft;
    if (dim.s > sMax) sMax = dim.s;
  }

  if (sortedLevels.length > 0) {
    // Les lignes de niveaux s'étendent de s = -1200 (avec triangle et texte de niveau à gauche) à cutLen + 1000
    if (-1800 < sMin) sMin = -1800;
    if (cutLen + 1000 > sMax) sMax = cutLen + 1000;
  }

  return {
    cutId: cut.id,
    cutName: cut.name,
    cutLabel: cut.label,
    kind: cut.kind,
    cutLength: cutLen,
    depth: cut.depth,
    bounds: {
      sMin: Math.round(sMin),
      sMax: Math.round(sMax),
      zMin,
      zMax,
    },
    levels,
    cutItems,
    projectedItems,
    dimensions,
  };
}
