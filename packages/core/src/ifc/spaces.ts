/**
 * Export IFC4 des pièces et espaces intérieurs (IfcSpace, Qto_SpaceBaseQuantities).
 */

import { isPointInPolygon, type Vec2 } from '@tabax/geometry';
import { detectRooms } from '../rooms/detect.js';
import type { ElementId, Room } from '../types.js';
import { createIfcGuid } from './guid.js';
import { escapeStepString } from './step-writer.js';
import type { IfcContext } from './types.js';

export function exportSpaces(ctx: IfcContext): void {
  const { state, writer, ownerHistory, geomSubContext, placementWorld3D, dirZ, storeyMap, storeyElementsMap, defaultStoreyId } = ctx;

  if (!state.rooms || Object.keys(state.rooms).length === 0) return;

  const defaultStorey = storeyMap.get(defaultStoreyId);

  // Groupement des pièces par niveau
  const levelRoomsMap = new Map<ElementId, Room[]>();
  for (const room of Object.values(state.rooms)) {
    const list = levelRoomsMap.get(room.levelId) || [];
    list.push(room);
    levelRoomsMap.set(room.levelId, list);
  }

  for (const [lvlId, roomsOnLevel] of levelRoomsMap.entries()) {
    const detected = detectRooms(state, lvlId);
    const storeyInfo = storeyMap.get(lvlId) || defaultStorey;
    if (!storeyInfo) continue;
    const lvl = state.levels[lvlId];
    const spaceHeight = lvl?.height ?? 2800;

    for (const room of roomsOnLevel) {
      const match = detected.find((d) => isPointInPolygon(room.seed, d.polygon));
      if (!match) continue;

      // Polygone extérieur
      const polyPoints = match.polygon.map((p) =>
        writer.add(`IFCCARTESIANPOINT((${p.x.toFixed(2)},${p.y.toFixed(2)}))`),
      );
      const firstPolyPoint = polyPoints[0];
      if (firstPolyPoint !== undefined) {
        polyPoints.push(firstPolyPoint); // Fermeture
      }
      const polyline = writer.add(`IFCPOLYLINE((${polyPoints.map((id) => `#${id}`).join(',')}))`);

      let profile = writer.add(
        `IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,'SpaceProfile',#${polyline})`,
      );

      // Si des îlots intérieurs existent (poteaux, cours intérieures)
      if (match.holes && match.holes.length > 0) {
        const islandPolylineIds: number[] = [];
        for (const island of match.holes) {
          const islandPoints = island.map((p: Vec2) =>
            writer.add(`IFCCARTESIANPOINT((${p.x.toFixed(2)},${p.y.toFixed(2)}))`),
          );
          const firstIslandPoint = islandPoints[0];
          if (firstIslandPoint !== undefined) {
            islandPoints.push(firstIslandPoint);
          }
          islandPolylineIds.push(
            writer.add(`IFCPOLYLINE((${islandPoints.map((id: number) => `#${id}`).join(',')}))`),
          );
        }
        profile = writer.add(
          `IFCARBITRARYPROFILEDEFWITHVOIDS(.AREA.,'SpaceProfileWithVoids',#${polyline},(${islandPolylineIds.map((id: number) => `#${id}`).join(',')}))`,
        );
      }

      const spaceSolid = writer.add(
        `IFCEXTRUDEDAREASOLID(#${profile},#${placementWorld3D},#${dirZ},${spaceHeight.toFixed(2)})`,
      );
      const spaceShapeRep = writer.add(
        `IFCSHAPEREPRESENTATION(#${geomSubContext},'Body','SweptSolid',(#${spaceSolid}))`,
      );
      const spaceProdShape = writer.add(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${spaceShapeRep}))`);

      const spaceGuid = createIfcGuid(`space:${room.id}`);
      const ifcSpace = writer.add(
        `IFCSPACE('${spaceGuid}',#${ownerHistory},'${escapeStepString(room.name)}',$,$,#${storeyInfo.placementId},#${spaceProdShape},$,.INTERNAL.,.ELEMENT.,$)`,
      );

      // Quantités IFC (Qto_SpaceBaseQuantities)
      const areaM2 = match.areaMm2 / 1e6;
      const volumeM3 = (match.areaMm2 * spaceHeight) / 1e9;
      const qArea = writer.add(
        `IFCQUANTITYAREA('NetFloorArea','Net floor area',$,${areaM2.toFixed(3)})`,
      );
      const qVolume = writer.add(
        `IFCQUANTITYVOLUME('NetVolume','Net volume',$,${volumeM3.toFixed(3)})`,
      );
      const elementQuantity = writer.add(
        `IFCELEMENTQUANTITY('${createIfcGuid(`space-qto:${room.id}`)}',#${ownerHistory},'BaseQuantities',$,'Qto_SpaceBaseQuantities',(#${qArea},#${qVolume}))`,
      );
      writer.add(
        `IFCRELDEFINESBYPROPERTIES('${createIfcGuid(`space-rel-qto:${room.id}`)}',#${ownerHistory},$,$,(#${ifcSpace}),#${elementQuantity})`,
      );

      const elementsList = storeyElementsMap.get(lvlId) || storeyElementsMap.get(defaultStoreyId);
      if (elementsList) {
        elementsList.push(ifcSpace);
      }
    }
  }
}
