/**
 * Export IFC4 des escaliers paramétriques (IfcStair, IfcStairFlight, IfcExtrudedAreaSolid, IfcRelAggregates).
 * Conforme à ADR-048 & ADR-071 : profil longitudinal en crémaillère (marches + girons + paillasse)
 * extrudé latéralement sur la largeur utile de volée.
 */

import { computeStairGeometry } from '../stairs.js';
import { createIfcGuid } from './guid.js';
import { escapeStepString } from './step-writer.js';
import type { IfcContext } from './types.js';

export function exportStairs(ctx: IfcContext): void {
  const { state, writer, ownerHistory, geomSubContext, placementWorld3D, dirZ, storeyMap, storeyElementsMap, defaultStoreyId } = ctx;

  if (!state.stairs || Object.keys(state.stairs).length === 0) return;

  const defaultStorey = storeyMap.get(defaultStoreyId);

  for (const stair of Object.values(state.stairs)) {
    const stairType = state.stairTypes?.[stair.stairTypeId];
    const width = stair.widthOverride ?? stairType?.width ?? 900;
    const geom = computeStairGeometry(stair, state);

    const dx = stair.end.x - stair.start.x;
    const dy = stair.end.y - stair.start.y;
    const len = Math.hypot(dx, dy);
    const cos = len > 1e-4 ? dx / len : 1;
    const sin = len > 1e-4 ? dy / len : 0;

    const storeyInfo = storeyMap.get(stair.bottomLevelId) || defaultStorey;
    if (!storeyInfo) continue;

    // Vecteur directeur unitaire longitudinal u et normale latérale n
    const ux = cos;
    const uy = sin;
    const nx = -uy;
    const ny = ux;

    // Repère local de la volée :
    // On positionne l'origine au bord latéral droit (+n * width/2)
    // et on extrude le profil selon -n sur la largeur de la volée.
    // Dans ce repère, l'axe X local est orienté selon u (longitudinal)
    // et l'axe Y local = (-n) x u = (0, 0, 1) est orienté selon Z (vertical).
    const halfW = width / 2;
    const originX = stair.start.x + nx * halfW;
    const originY = stair.start.y + ny * halfW;
    const originZ = 0;

    const ptStairOrigin = writer.add(
      `IFCCARTESIANPOINT((${originX.toFixed(2)},${originY.toFixed(2)},${originZ.toFixed(2)}))`,
    );
    const dirExtrudeAxis = writer.add(`IFCDIRECTION((${(-nx).toFixed(6)},${(-ny).toFixed(6)},0.))`);
    const dirRefRun = writer.add(`IFCDIRECTION((${ux.toFixed(6)},${uy.toFixed(6)},0.))`);
    const placementFlight3D = writer.add(
      `IFCAXIS2PLACEMENT3D(#${ptStairOrigin},#${dirExtrudeAxis},#${dirRefRun})`,
    );
    const flightPlacement = writer.add(
      `IFCLOCALPLACEMENT(#${storeyInfo.placementId},#${placementFlight3D})`,
    );

    // Construction du profil en crémaillère 2D (u, z) dans le repère local :
    // X = progression horizontale u dans la volée [0, len]
    // Y = altimétrie verticale z dans la volée [0, totalRise]
    // Parcours CCW (aire positive) :
    // 1. Départ à (0, 0)
    // 2. Ligne de paillasse sous-face vers (len, totalRise - 150)
    // 3. Montée verticale jusqu'à l'arrivée (len, totalRise)
    // 4. Crénelage des marches de haut en bas (girons et contremarches) jusqu'à (0, 0)
    const N = geom.numberOfSteps;
    const g = geom.stepDepth;
    const h = geom.stepHeight;
    const totalRise = geom.totalRise;
    const waistThickness = Math.min(150, Math.max(80, totalRise * 0.15));

    const profilePts: Array<{ u: number; z: number }> = [
      { u: 0, z: 0 },
      { u: len, z: Math.max(0, totalRise - waistThickness) },
      { u: len, z: totalRise },
    ];

    for (let k = N - 1; k >= 0; k--) {
      profilePts.push({ u: k * g, z: (k + 1) * h });
      if (k > 0) {
        profilePts.push({ u: k * g, z: k * h });
      }
    }

    const polyPtIds = profilePts.map((p) =>
      writer.add(`IFCCARTESIANPOINT((${p.u.toFixed(2)},${p.z.toFixed(2)}))`),
    );
    const firstPolyPt = polyPtIds[0];
    if (firstPolyPt !== undefined) {
      polyPtIds.push(firstPolyPt); // Fermeture
    }

    const polyline = writer.add(`IFCPOLYLINE((${polyPtIds.map((id) => `#${id}`).join(',')}))`);
    const flightProfile = writer.add(
      `IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,'StairFlightCremaillereProfile',#${polyline})`,
    );

    // Extrusion latérale sur l'épaisseur de la volée
    const flightSolid = writer.add(
      `IFCEXTRUDEDAREASOLID(#${flightProfile},#${placementWorld3D},#${dirZ},${width.toFixed(2)})`,
    );
    const flightShapeRep = writer.add(
      `IFCSHAPEREPRESENTATION(#${geomSubContext},'Body','SweptSolid',(#${flightSolid}))`,
    );
    const flightProdShape = writer.add(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${flightShapeRep}))`);

    const flightGuid = createIfcGuid(`flight:${stair.id}`);
    const ifcStairFlight = writer.add(
      `IFCSTAIRFLIGHT('${flightGuid}',#${ownerHistory},'${escapeStepString((stair.name || stair.id) + ' Volée')}',$,'Flight',#${flightPlacement},#${flightProdShape},$,${geom.numberOfSteps},${geom.numberOfSteps},${geom.stepHeight.toFixed(2)},${geom.stepDepth.toFixed(2)},.STRAIGHT.)`,
    );

    // Entité IfcStair conteneur
    const stairPlacement = writer.add(
      `IFCLOCALPLACEMENT(#${storeyInfo.placementId},#${ctx.placementWorld3D})`,
    );
    const stairGuid = createIfcGuid(`stair:${stair.id}`);
    const ifcStair = writer.add(
      `IFCSTAIR('${stairGuid}',#${ownerHistory},'${escapeStepString(stair.name || stair.id)}',$,'Stair',#${stairPlacement},$,$,.STRAIGHT_RUN_STAIR.)`,
    );

    // Liaison d'agrégation IfcRelAggregates entre IfcStair et IfcStairFlight
    const relGuid = createIfcGuid(`rel-stair-flight:${stair.id}`);
    writer.add(
      `IFCRELAGGREGATES('${relGuid}',#${ownerHistory},'StairFlightAggregation',$,#${ifcStair},(#${ifcStairFlight}))`,
    );

    const elementsList =
      storeyElementsMap.get(stair.bottomLevelId) || storeyElementsMap.get(defaultStoreyId);
    if (elementsList) {
      elementsList.push(ifcStair);
    }
  }
}
