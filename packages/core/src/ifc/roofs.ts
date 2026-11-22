/**
 * Export IFC4 des toitures et versants inclinés (IfcRoof, IfcSlab.ROOF., IfcAxis2Placement3D, IfcRelAggregates).
 * Conforme à ISO 16739 / ADR-053 & ADR-071 : versants 3D inclinés avec normale orthogonale et extrusion exacte.
 */

import { signedArea, type Vec2, vec2 } from '@tabax/geometry';
import { computeRoofSlopes } from '../roofs/slopes.js';
import { createIfcGuid } from './guid.js';
import { escapeStepString } from './step-writer.js';
import type { IfcContext } from './types.js';

export function exportRoofs(ctx: IfcContext): void {
  const { state, writer, ownerHistory, geomSubContext, placementWorld3D, dirZ, storeyMap, storeyElementsMap, defaultStoreyId } = ctx;

  if (!state.roofs || Object.keys(state.roofs).length === 0) return;

  const defaultStorey = storeyMap.get(defaultStoreyId);

  for (const roof of Object.values(state.roofs)) {
    if (!roof.footprint || roof.footprint.length < 3) continue;

    const roofType = state.roofTypes?.[roof.roofTypeId];
    const thickness = roofType?.thickness ?? 200;
    const isGable = roofType?.family === 'gable';

    const storeyInfo = storeyMap.get(roof.levelId) || defaultStorey;
    if (!storeyInfo) continue;

    const storeyElev = state.levels[roof.levelId]?.elevation ?? 0;
    const roofPlacement = writer.add(
      `IFCLOCALPLACEMENT(#${storeyInfo.placementId},#${ctx.placementWorld3D})`,
    );

    const slopes = computeRoofSlopes(roof, state);
    const aggregatedSlabIds: number[] = [];

    for (let sIdx = 0; sIdx < slopes.length; sIdx++) {
      const slope = slopes[sIdx];
      if (!slope || slope.polygon.length < 3) continue;

      const { a, b, c, d } = slope.plane;
      const nLen = Math.hypot(a, b, c) || 1.0;
      // Normale unitaire au plan du versant (pointant vers le haut)
      const nx = a / nLen;
      const ny = b / nLen;
      const nz = c / nLen;

      // Vecteur unitaire horizontal dans le plan du versant (le long de l'égout / faîtage)
      const horizLen = Math.hypot(a, b);
      let ux: number;
      let uy: number;
      let uz: number;

      if (horizLen < 1e-6) {
        // Toit plat : repère standard horizontal
        ux = 1;
        uy = 0;
        uz = 0;
      } else {
        // Perpendiculaire horizontale au gradient (a, b) : (-b, a, 0)
        ux = -b / horizLen;
        uy = a / horizLen;
        uz = 0;
      }

      // Vecteur unitaire orthogonal dans le plan du versant : V = N x U
      const vx = ny * uz - nz * uy;
      const vy = nz * ux - nx * uz;
      const vz = nx * uy - ny * ux;

      // Origine de référence sur la face supérieure du versant
      const p0_2d = slope.polygon[0] ?? { x: 0, y: 0 };
      const p0_z_abs = c !== 0 ? -(a * p0_2d.x + b * p0_2d.y + d) / c : 0;
      const p0_z = p0_z_abs - storeyElev;

      // Décalage de l'origine vers la sous-face du versant pour une extrusion le long de +N vers la face supérieure
      const originX = p0_2d.x - thickness * nx;
      const originY = p0_2d.y - thickness * ny;
      const originZ = p0_z - thickness * nz;

      // Projection isométrique des sommets 3D du versant dans le plan local 2D (U, V)
      const local2DPts: Vec2[] = [];
      for (const p of slope.polygon) {
        const pz = c !== 0 ? -(a * p.x + b * p.y + d) / c : 0;
        const dx = p.x - p0_2d.x;
        const dy = p.y - p0_2d.y;
        const dz = pz - p0_z;
        const uCoord = dx * ux + dy * uy + dz * uz;
        const vCoord = dx * vx + dy * vy + dz * vz;
        local2DPts.push(vec2(uCoord, vCoord));
      }

      // S'assurer que le contour est CCW (aire positive)
      if (signedArea(local2DPts) < 0) {
        local2DPts.reverse();
      }

      // Points 2D du profil local
      const ptIds = local2DPts.map((p) =>
        writer.add(`IFCCARTESIANPOINT((${p.x.toFixed(2)},${p.y.toFixed(2)}))`),
      );
      const firstPtId = ptIds[0];
      if (firstPtId !== undefined) {
        ptIds.push(firstPtId); // Fermeture
      }
      const polyline = writer.add(`IFCPOLYLINE((${ptIds.map((id) => `#${id}`).join(',')}))`);
      const slopeProfile = writer.add(
        `IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,'RoofSlabProfile_${sIdx}',#${polyline})`,
      );

      // Repère 3D local orienté selon le versant : Axis = N (extrusion), RefDirection = U
      const ptSlopeOrigin = writer.add(
        `IFCCARTESIANPOINT((${originX.toFixed(2)},${originY.toFixed(2)},${originZ.toFixed(2)}))`,
      );
      const dirNormal = writer.add(`IFCDIRECTION((${nx.toFixed(6)},${ny.toFixed(6)},${nz.toFixed(6)}))`);
      const dirRef = writer.add(`IFCDIRECTION((${ux.toFixed(6)},${uy.toFixed(6)},${uz.toFixed(6)}))`);
      const slopePlacement3D = writer.add(
        `IFCAXIS2PLACEMENT3D(#${ptSlopeOrigin},#${dirNormal},#${dirRef})`,
      );
      const slabLocalPlacement = writer.add(
        `IFCLOCALPLACEMENT(#${roofPlacement},#${slopePlacement3D})`,
      );

      // Extrusion solide le long de la normale N sur l'épaisseur du versant
      const slopeSolid = writer.add(
        `IFCEXTRUDEDAREASOLID(#${slopeProfile},#${placementWorld3D},#${dirZ},${thickness.toFixed(2)})`,
      );
      const slopeShapeRep = writer.add(
        `IFCSHAPEREPRESENTATION(#${geomSubContext},'Body','SweptSolid',(#${slopeSolid}))`,
      );
      const slopeProdShape = writer.add(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${slopeShapeRep}))`);

      const slabGuid = createIfcGuid(`roof-slab:${roof.id}:${sIdx}`);
      const slabName = `${roof.name || roof.id} Versant ${sIdx + 1}`;
      const ifcSlab = writer.add(
        `IFCSLAB('${slabGuid}',#${ownerHistory},'${escapeStepString(slabName)}',$,'RoofSlab',#${slabLocalPlacement},#${slopeProdShape},$,.ROOF.)`,
      );
      aggregatedSlabIds.push(ifcSlab);
    }

    // Entité IfcRoof conteneur
    const roofGuid = createIfcGuid(`roof:${roof.id}`);
    const predefinedType = isGable ? '.GABLE_ROOF.' : '.FLAT_ROOF.';
    const ifcRoof = writer.add(
      `IFCROOF('${roofGuid}',#${ownerHistory},'${escapeStepString(roof.name || roof.id)}',$,'Roof',#${roofPlacement},$,$,${predefinedType})`,
    );

    if (aggregatedSlabIds.length > 0) {
      const relGuid = createIfcGuid(`rel-roof-slabs:${roof.id}`);
      writer.add(
        `IFCRELAGGREGATES('${relGuid}',#${ownerHistory},'RoofSlabAggregation',$,#${ifcRoof},(${aggregatedSlabIds.map((id) => `#${id}`).join(',')}))`,
      );
    }

    const elementsList =
      storeyElementsMap.get(roof.levelId) || storeyElementsMap.get(defaultStoreyId);
    if (elementsList) {
      elementsList.push(ifcRoof);
    }
  }
}
