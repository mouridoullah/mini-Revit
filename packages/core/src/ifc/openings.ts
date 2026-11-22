/**
 * Export IFC4 des ouvertures (IfcDoor, IfcWindow, IfcOpeningElement, IfcRelVoidsElement, IfcRelFillsElement).
 */

import { type ElementId, type Door, type Window } from '../types.js';
import { createIfcGuid } from './guid.js';
import { escapeStepString } from './step-writer.js';
import type { IfcContext } from './types.js';
import type { WallInfo } from './walls.js';

export function exportOpenings(ctx: IfcContext, wallMap: Map<ElementId, WallInfo>): void {
  const { state, writer, ownerHistory, geomSubContext, placementWorld3D, dirZ, dirX } = ctx;

  const openings: Array<{
    element: Door | Window;
    kind: 'door' | 'window';
  }> = [
    ...Object.values(state.doors || {}).map((d) => ({ element: d, kind: 'door' as const })),
    ...Object.values(state.windows || {}).map((w) => ({ element: w, kind: 'window' as const })),
  ];

  for (const op of openings) {
    const item = op.element;
    const hostInfo = wallMap.get(item.hostWallId);
    if (!hostInfo) continue;

    const sill = (item as Window).sillHeight ?? 0;
    let opWidth = 900;
    let opHeight = 2100;
    if (op.kind === 'door') {
      const door = item as Door;
      const dt = state.doorTypes?.[door.doorTypeId];
      opWidth = dt?.width ?? 900;
      opHeight = dt?.height ?? 2100;
    } else {
      const win = item as Window;
      const wt = state.windowTypes?.[win.windowTypeId];
      opWidth = wt?.width ?? 1200;
      opHeight = wt?.height ?? 1400;
    }
    const opOffset = item.offsetAlong;

    // Réservation (IfcOpeningElement)
    const ptOp = writer.add(`IFCCARTESIANPOINT((${opOffset.toFixed(2)},0.,${sill.toFixed(2)}))`);
    const placementOp3D = writer.add(`IFCAXIS2PLACEMENT3D(#${ptOp},#${dirZ},#${dirX})`);
    const opPlacement = writer.add(`IFCLOCALPLACEMENT(#${hostInfo.placementId},#${placementOp3D})`);

    // Profil de découpe (largeur W, épaisseur T*1.2 pour perçage net)
    const cutT = hostInfo.thickness * 1.2;
    const halfCutT = cutT / 2;
    const opP1 = writer.add(`IFCCARTESIANPOINT((0.,${(-halfCutT).toFixed(2)}))`);
    const opP2 = writer.add(`IFCCARTESIANPOINT((${opWidth.toFixed(2)},${(-halfCutT).toFixed(2)}))`);
    const opP3 = writer.add(`IFCCARTESIANPOINT((${opWidth.toFixed(2)},${halfCutT.toFixed(2)}))`);
    const opP4 = writer.add(`IFCCARTESIANPOINT((0.,${halfCutT.toFixed(2)}))`);
    const opPolyline = writer.add(`IFCPOLYLINE((#${opP1},#${opP2},#${opP3},#${opP4},#${opP1}))`);
    const opProfile = writer.add(
      `IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,'OpeningProfile',#${opPolyline})`,
    );
    const opSolid = writer.add(
      `IFCEXTRUDEDAREASOLID(#${opProfile},#${placementWorld3D},#${dirZ},${opHeight.toFixed(2)})`,
    );
    const opShapeRep = writer.add(
      `IFCSHAPEREPRESENTATION(#${geomSubContext},'Body','SweptSolid',(#${opSolid}))`,
    );
    const opProdShape = writer.add(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${opShapeRep}))`);

    const openingGuid = createIfcGuid(`opening:${item.id}`);
    const ifcOpening = writer.add(
      `IFCOPENINGELEMENT('${openingGuid}',#${ownerHistory},'Opening_${escapeStepString(item.id)}',$,$,#${opPlacement},#${opProdShape},$,.OPENING.)`,
    );

    // Liaison Mur -> Réservation (IfcRelVoidsElement)
    writer.add(
      `IFCRELVOIDSELEMENT('${createIfcGuid(`rel-voids:${hostInfo.id}:${item.id}`)}',#${ownerHistory},$,$,#${hostInfo.id},#${ifcOpening})`,
    );

    // Élément menuiserie : IfcDoor ou IfcWindow
    let fillingElementId: number;
    if (op.kind === 'door') {
      const door = item as Door;
      const doorGuid = createIfcGuid(`door:${door.id}`);
      const opType = door.swing.side === 'left' ? '.SINGLE_SWING_LEFT.' : '.SINGLE_SWING_RIGHT.';
      fillingElementId = writer.add(
        `IFCDOOR('${doorGuid}',#${ownerHistory},'${escapeStepString(door.id)}',$,'Door',#${opPlacement},#${opProdShape},$,${opHeight.toFixed(2)},${opWidth.toFixed(2)},.DOOR.,${opType},$)`,
      );
    } else {
      const win = item as Window;
      const winGuid = createIfcGuid(`win:${win.id}`);
      fillingElementId = writer.add(
        `IFCWINDOW('${winGuid}',#${ownerHistory},'${escapeStepString(win.id)}',$,'Window',#${opPlacement},#${opProdShape},$,${opHeight.toFixed(2)},${opWidth.toFixed(2)},.WINDOW.,$,$)`,
      );
    }

    // Liaison Réservation -> Menuiserie (IfcRelFillsElement)
    writer.add(
      `IFCRELFILLSELEMENT('${createIfcGuid(`rel-fills:${item.id}`)}',#${ownerHistory},$,$,#${ifcOpening},#${fillingElementId})`,
    );

    // Quantités de base normalisées (Qto_DoorBaseQuantities / Qto_WindowBaseQuantities)
    const opAreaM2 = (opWidth * opHeight) / 1e6;
    const qOpW = writer.add(
      `IFCQUANTITYLENGTH('Width','Width of the opening',$,${opWidth.toFixed(2)})`,
    );
    const qOpH = writer.add(
      `IFCQUANTITYLENGTH('Height','Height of the opening',$,${opHeight.toFixed(2)})`,
    );
    const qOpArea = writer.add(
      `IFCQUANTITYAREA('Area','Area of the opening',$,${opAreaM2.toFixed(3)})`,
    );
    const qtoName = op.kind === 'door' ? 'Qto_DoorBaseQuantities' : 'Qto_WindowBaseQuantities';
    const opQuantities = writer.add(
      `IFCELEMENTQUANTITY('${createIfcGuid(`op-qto:${item.id}`)}',#${ownerHistory},'BaseQuantities',$,'${qtoName}',(#${qOpW},#${qOpH},#${qOpArea}))`,
    );
    writer.add(
      `IFCRELDEFINESBYPROPERTIES('${createIfcGuid(`op-rel-qto:${item.id}`)}',#${ownerHistory},$,$,(#${fillingElementId}),#${opQuantities})`,
    );
  }
}
