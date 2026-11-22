/**
 * Export IFC4 des dalles (IfcSlab, IfcExtrudedAreaSolid, IfcArbitraryProfileDefWithVoids, Qto_SlabBaseQuantities).
 * Intègre les réservations manuelles et les trémies dérivées d'escaliers (computeStairShaft / ADR-048 & ADR-071).
 */

import { signedArea, type Vec2 } from '@tabax/geometry';
import { computeStairShaft } from '../stairs.js';
import { createIfcGuid } from './guid.js';
import { escapeStepString } from './step-writer.js';
import type { IfcContext } from './types.js';

export function exportSlabs(ctx: IfcContext): void {
  const { state, writer, ownerHistory, geomSubContext, placementWorld3D, dirZ, dirX, storeyMap, storeyElementsMap, defaultStoreyId } = ctx;

  if (!state.slabs || Object.keys(state.slabs).length === 0) return;

  const defaultStorey = storeyMap.get(defaultStoreyId);

  for (const slab of Object.values(state.slabs)) {
    if (!slab.boundary || slab.boundary.length < 3) continue;

    const slabType = state.slabTypes?.[slab.slabTypeId];
    const thickness = slabType?.thickness ?? 200;
    const baseOffset = slab.baseOffset ?? 0;

    const storeyInfo = storeyMap.get(slab.levelId) || defaultStorey;
    if (!storeyInfo) continue;

    // La dalle s'étend vers le bas de Z_sup = baseOffset à Z_inf = baseOffset - thickness
    const zBottom = baseOffset - thickness;
    const ptSlab = writer.add(`IFCCARTESIANPOINT((0.,0.,${zBottom.toFixed(2)}))`);
    const placementSlab3D = writer.add(`IFCAXIS2PLACEMENT3D(#${ptSlab},#${dirZ},#${dirX})`);
    const slabPlacement = writer.add(
      `IFCLOCALPLACEMENT(#${storeyInfo.placementId},#${placementSlab3D})`,
    );

    // Polygone extérieur (boundary)
    const boundaryPoints = slab.boundary.map((p) =>
      writer.add(`IFCCARTESIANPOINT((${p.x.toFixed(2)},${p.y.toFixed(2)}))`),
    );
    const firstBoundPoint = boundaryPoints[0];
    if (firstBoundPoint !== undefined) {
      boundaryPoints.push(firstBoundPoint); // Fermeture
    }
    const boundaryPolyline = writer.add(
      `IFCPOLYLINE((${boundaryPoints.map((id) => `#${id}`).join(',')}))`,
    );

    // Collecte des réservations manuelles et des trémies d'escalier débouchant sur ce niveau
    const allHoles: (readonly Vec2[])[] = [
      ...(slab.holes ?? []),
      ...(slab.openings ?? []),
    ];

    // Trémies d'escaliers dérivées (ADR-048 & ADR-071) : escaliers arrivant au niveau de cette dalle
    if (state.stairs) {
      for (const stair of Object.values(state.stairs)) {
        if (stair.topLevelId === slab.levelId) {
          const shaft = computeStairShaft(stair, state);
          if (shaft && shaft.length >= 3) {
            allHoles.push(shaft);
          }
        }
      }
    }

    const validHoles = allHoles.filter((h) => h && h.length >= 3);

    let profile: number;
    if (validHoles.length > 0) {
      const holePolylineIds: number[] = [];
      for (const hole of validHoles) {
        const holePoints = hole.map((p) =>
          writer.add(`IFCCARTESIANPOINT((${p.x.toFixed(2)},${p.y.toFixed(2)}))`),
        );
        const firstHolePoint = holePoints[0];
        if (firstHolePoint !== undefined) {
          holePoints.push(firstHolePoint);
        }
        holePolylineIds.push(
          writer.add(`IFCPOLYLINE((${holePoints.map((id) => `#${id}`).join(',')}))`),
        );
      }
      profile = writer.add(
        `IFCARBITRARYPROFILEDEFWITHVOIDS(.AREA.,'SlabProfileWithVoids',#${boundaryPolyline},(${holePolylineIds.map((id) => `#${id}`).join(',')}))`,
      );
    } else {
      profile = writer.add(
        `IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,'SlabProfile',#${boundaryPolyline})`,
      );
    }

    const slabSolid = writer.add(
      `IFCEXTRUDEDAREASOLID(#${profile},#${placementWorld3D},#${dirZ},${thickness.toFixed(2)})`,
    );
    const slabShapeRep = writer.add(
      `IFCSHAPEREPRESENTATION(#${geomSubContext},'Body','SweptSolid',(#${slabSolid}))`,
    );
    const slabProdShape = writer.add(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${slabShapeRep}))`);

    const slabGuid = createIfcGuid(`slab:${slab.id}`);
    const ifcSlab = writer.add(
      `IFCSLAB('${slabGuid}',#${ownerHistory},'${escapeStepString(slab.name || slab.id)}',$,'Slab',#${slabPlacement},#${slabProdShape},$,.FLOOR.)`,
    );

    // Quantités de dalle normalisées (Qto_SlabBaseQuantities)
    const grossAreaMm2 = Math.abs(signedArea(slab.boundary));
    let holesAreaMm2 = 0;
    for (const hole of validHoles) {
      holesAreaMm2 += Math.abs(signedArea(hole));
    }
    const netAreaMm2 = Math.max(0, grossAreaMm2 - holesAreaMm2);
    const grossAreaM2 = grossAreaMm2 / 1e6;
    const netAreaM2 = netAreaMm2 / 1e6;
    const grossVolumeM3 = (netAreaMm2 * thickness) / 1e9;

    const qSlabGrossArea = writer.add(
      `IFCQUANTITYAREA('GrossArea','Gross area of the slab',$,${grossAreaM2.toFixed(3)})`,
    );
    const qSlabNetArea = writer.add(
      `IFCQUANTITYAREA('NetArea','Net area of the slab',$,${netAreaM2.toFixed(3)})`,
    );
    const qSlabGrossVol = writer.add(
      `IFCQUANTITYVOLUME('GrossVolume','Gross volume of the slab',$,${grossVolumeM3.toFixed(3)})`,
    );
    const slabQuantities = writer.add(
      `IFCELEMENTQUANTITY('${createIfcGuid(`slab-qto:${slab.id}`)}',#${ownerHistory},'BaseQuantities',$,'Qto_SlabBaseQuantities',(#${qSlabGrossArea},#${qSlabNetArea},#${qSlabGrossVol}))`,
    );
    writer.add(
      `IFCRELDEFINESBYPROPERTIES('${createIfcGuid(`slab-rel-qto:${slab.id}`)}',#${ownerHistory},$,$,(#${ifcSlab}),#${slabQuantities})`,
    );

    const elementsList =
      storeyElementsMap.get(slab.levelId) || storeyElementsMap.get(defaultStoreyId);
    if (elementsList) {
      elementsList.push(ifcSlab);
    }
  }
}
