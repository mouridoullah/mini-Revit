/**
 * Export IFC4 des composants d'aménagement et mobilier (IfcFurniture, IfcSanitaryTerminal, etc.).
 */

import { type ElementId } from '../types.js';
import { getComponentEffectiveDimensions } from '../components/dimensions.js';
import { createIfcGuid } from './guid.js';
import { escapeStepString } from './step-writer.js';
import type { IfcContext } from './types.js';
import type { WallInfo } from './walls.js';

export function exportComponents(ctx: IfcContext, wallMap: Map<ElementId, WallInfo>): void {
  const { state, writer, ownerHistory, geomSubContext, placementWorld3D, dirZ, dirX, storeyMap, storeyElementsMap, defaultStoreyId } = ctx;

  if (!state.components || Object.keys(state.components).length === 0) return;

  const defaultStorey = storeyMap.get(defaultStoreyId);
  const typeIfcMap = new Map<ElementId, { typeId: number; occurrences: number[] }>();

  // 1. Définition des types IFC4 (IfcTypeProduct) pour chaque famille utilisée
  for (const comp of Object.values(state.components)) {
    const type = state.componentTypes?.[comp.typeId];
    if (!type || typeIfcMap.has(type.id)) continue;

    const typeGuid = createIfcGuid(`type:${type.id}`);
    const typeName = escapeStepString(type.name);
    const entity = type.ifcEntity || (type.family === 'sanitary' ? 'IfcSanitaryTerminal' : 'IfcFurniture');

    let ifcTypeId: number;
    if (entity === 'IfcSanitaryTerminal') {
      const predType = type.ifcPredefinedType ? `.${type.ifcPredefinedType}.` : '.NOTDEFINED.';
      ifcTypeId = writer.add(
        `IFCSANITARYTERMINALTYPE('${typeGuid}',#${ownerHistory},'${typeName}',$,$,$,$,$,$,${predType})`,
      );
    } else if (entity === 'IfcSystemFurnitureElement') {
      const predType = type.ifcPredefinedType ? `.${type.ifcPredefinedType}.` : '.USERDEFINED.';
      const elemType = type.subType.toUpperCase();
      ifcTypeId = writer.add(
        `IFCSYSTEMFURNITUREELEMENTTYPE('${typeGuid}',#${ownerHistory},'${typeName}',$,$,$,$,$,'${elemType}',${predType})`,
      );
    } else if (entity === 'IfcDoor') {
      const opType = type.subType === 'sliding_door' ? '.DOUBLE_DOOR_SLIDING.' : '.USERDEFINED.';
      ifcTypeId = writer.add(
        `IFCDOORTYPE('${typeGuid}',#${ownerHistory},'${typeName}',$,$,$,$,$,'${typeName}',.DOOR.,${opType},$,$)`,
      );
    } else if (entity === 'IfcWindow') {
      const partType = type.subType === 'french_window' ? '.DOUBLE_PANEL_VERTICAL.' : '.NOTDEFINED.';
      ifcTypeId = writer.add(
        `IFCWINDOWTYPE('${typeGuid}',#${ownerHistory},'${typeName}',$,$,$,$,$,'${typeName}',.WINDOW.,${partType},$,$)`,
      );
    } else {
      let predType = type.ifcPredefinedType ? `.${type.ifcPredefinedType}.` : '.NOTDEFINED.';
      if (!type.ifcPredefinedType) {
        if (type.subType === 'chair') predType = '.CHAIR.';
        else if (type.subType === 'table') predType = '.TABLE.';
        else if (type.subType === 'sofa') predType = '.SOFA.';
        else if (type.subType === 'bed') predType = '.BED.';
        else if (type.subType === 'cabinet') predType = '.SHELF.';
      }
      const elemType = type.subType.toUpperCase();

      ifcTypeId = writer.add(
        `IFCFURNITURETYPE('${typeGuid}',#${ownerHistory},'${typeName}',$,$,$,$,$,'${elemType}',.NOTDEFINED.,${predType})`,
      );
    }

    typeIfcMap.set(type.id, { typeId: ifcTypeId, occurrences: [] });
  }

  // 2. Instanciation des occurrences et solides géométriques
  for (const comp of Object.values(state.components)) {
    const type = state.componentTypes?.[comp.typeId];
    if (!type) continue;

    const storeyInfo = storeyMap.get(comp.levelId) || defaultStorey;
    if (!storeyInfo) continue;

    const effDims = getComponentEffectiveDimensions(comp, type);
    const effW = effDims.width;
    const effD = effDims.depth;
    const effH = effDims.height;

    const elevationOffset = comp.placement.elevationOffset ?? type.defaultElevationOffset ?? 0;
    const rotation = comp.placement.rotation ?? 0;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);

    const ptComp = writer.add(
      `IFCCARTESIANPOINT((${comp.placement.x.toFixed(2)},${comp.placement.y.toFixed(2)},${elevationOffset.toFixed(2)}))`,
    );
    const dirU = writer.add(`IFCDIRECTION((${cos.toFixed(6)},${sin.toFixed(6)},0.))`);
    const placementComp3D = writer.add(`IFCAXIS2PLACEMENT3D(#${ptComp},#${dirZ},#${dirU})`);
    const compPlacement = writer.add(
      `IFCLOCALPLACEMENT(#${storeyInfo.placementId},#${placementComp3D})`,
    );

    const halfW = effW / 2;
    const halfD = effD / 2;
    const p1 = writer.add(`IFCCARTESIANPOINT((${(-halfW).toFixed(2)},${(-halfD).toFixed(2)}))`);
    const p2 = writer.add(`IFCCARTESIANPOINT((${halfW.toFixed(2)},${(-halfD).toFixed(2)}))`);
    const p3 = writer.add(`IFCCARTESIANPOINT((${halfW.toFixed(2)},${halfD.toFixed(2)}))`);
    const p4 = writer.add(`IFCCARTESIANPOINT((${(-halfW).toFixed(2)},${halfD.toFixed(2)}))`);
    const polyline = writer.add(`IFCPOLYLINE((#${p1},#${p2},#${p3},#${p4},#${p1}))`);
    const profile = writer.add(
      `IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,'${escapeStepString(type.name)}Profile',#${polyline})`,
    );
    const solid = writer.add(
      `IFCEXTRUDEDAREASOLID(#${profile},#${placementWorld3D},#${dirZ},${effH.toFixed(2)})`,
    );
    const shapeRep = writer.add(
      `IFCSHAPEREPRESENTATION(#${geomSubContext},'Body','SweptSolid',(#${solid}))`,
    );
    const prodShape = writer.add(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${shapeRep}))`);

    const compGuid = createIfcGuid(`comp:${comp.id}`);
    const compName = escapeStepString(comp.name || type.name);
    const typeName = escapeStepString(type.name);

    let ifcElemId: number;
    const entity = type.ifcEntity || (type.family === 'sanitary' ? 'IfcSanitaryTerminal' : 'IfcFurniture');

    if (entity === 'IfcSanitaryTerminal') {
      const predType = type.ifcPredefinedType ? `.${type.ifcPredefinedType}.` : '.NOTDEFINED.';
      ifcElemId = writer.add(
        `IFCSANITARYTERMINAL('${compGuid}',#${ownerHistory},'${compName}',$,'${typeName}',#${compPlacement},#${prodShape},$,${predType})`,
      );
    } else if (entity === 'IfcSystemFurnitureElement') {
      const predType = type.ifcPredefinedType ? `.${type.ifcPredefinedType}.` : '.USERDEFINED.';
      const objType = type.subType.toUpperCase();
      ifcElemId = writer.add(
        `IFCSYSTEMFURNITUREELEMENT('${compGuid}',#${ownerHistory},'${compName}',$,'${objType}',#${compPlacement},#${prodShape},$,${predType})`,
      );
    } else if (entity === 'IfcDoor') {
      const opType = type.subType === 'sliding_door' ? '.DOUBLE_DOOR_SLIDING.' : '.USERDEFINED.';
      ifcElemId = writer.add(
        `IFCDOOR('${compGuid}',#${ownerHistory},'${compName}',$,'${typeName}',#${compPlacement},#${prodShape},$,${effH.toFixed(2)},${effW.toFixed(2)},.DOOR.,${opType},$)`,
      );
    } else if (entity === 'IfcWindow') {
      const partType = type.subType === 'french_window' ? '.DOUBLE_PANEL_VERTICAL.' : '.NOTDEFINED.';
      ifcElemId = writer.add(
        `IFCWINDOW('${compGuid}',#${ownerHistory},'${compName}',$,'${typeName}',#${compPlacement},#${prodShape},$,${effH.toFixed(2)},${effW.toFixed(2)},.WINDOW.,${partType},$)`,
      );
    } else {
      let predType = type.ifcPredefinedType ? `.${type.ifcPredefinedType}.` : '.NOTDEFINED.';
      if (!type.ifcPredefinedType) {
        if (type.subType === 'chair') predType = '.CHAIR.';
        else if (type.subType === 'table') predType = '.TABLE.';
        else if (type.subType === 'sofa') predType = '.SOFA.';
        else if (type.subType === 'bed') predType = '.BED.';
        else if (type.subType === 'cabinet') predType = '.SHELF.';
      }
      const objType = type.ifcPredefinedType === 'USERDEFINED' ? type.subType.toUpperCase() : typeName;

      ifcElemId = writer.add(
        `IFCFURNITURE('${compGuid}',#${ownerHistory},'${compName}',$,'${objType}',#${compPlacement},#${prodShape},$,${predType})`,
      );
    }

    typeIfcMap.get(type.id)?.occurrences.push(ifcElemId);

    // Si le composant est une menuiserie adossée à un mur hôte, générer la réservation IfcOpeningElement
    if (
      comp.placement.hostWallId &&
      (type.family === 'glazing' || entity === 'IfcDoor' || entity === 'IfcWindow' || comp.openingId)
    ) {
      const hostInfo = wallMap.get(comp.placement.hostWallId);
      const hostWall = state.walls[comp.placement.hostWallId];
      if (hostInfo && hostWall) {
        const dx = hostWall.end.x - hostWall.start.x;
        const dy = hostWall.end.y - hostWall.start.y;
        const wallLen = Math.hypot(dx, dy);
        const pVec = { x: comp.placement.x - hostWall.start.x, y: comp.placement.y - hostWall.start.y };
        const projDist = wallLen > 0 ? (pVec.x * dx + pVec.y * dy) / wallLen : 0;
        const opOffset = projDist - effW / 2;

        const ptOp = writer.add(`IFCCARTESIANPOINT((${opOffset.toFixed(2)},0.,${elevationOffset.toFixed(2)}))`);
        const placementOp3D = writer.add(`IFCAXIS2PLACEMENT3D(#${ptOp},#${dirZ},#${dirX})`);
        const opPlacement = writer.add(`IFCLOCALPLACEMENT(#${hostInfo.placementId},#${placementOp3D})`);

        const cutT = hostInfo.thickness * 1.2;
        const halfCutT = cutT / 2;
        const opP1 = writer.add(`IFCCARTESIANPOINT((0.,${(-halfCutT).toFixed(2)}))`);
        const opP2 = writer.add(`IFCCARTESIANPOINT((${effW.toFixed(2)},${(-halfCutT).toFixed(2)}))`);
        const opP3 = writer.add(`IFCCARTESIANPOINT((${effW.toFixed(2)},${halfCutT.toFixed(2)}))`);
        const opP4 = writer.add(`IFCCARTESIANPOINT((0.,${halfCutT.toFixed(2)}))`);
        const opPolyline = writer.add(`IFCPOLYLINE((#${opP1},#${opP2},#${opP3},#${opP4},#${opP1}))`);
        const opProfile = writer.add(
          `IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,'OpeningProfile_${escapeStepString(comp.id)}',#${opPolyline})`,
        );
        const opSolid = writer.add(
          `IFCEXTRUDEDAREASOLID(#${opProfile},#${placementWorld3D},#${dirZ},${effH.toFixed(2)})`,
        );
        const opShapeRep = writer.add(
          `IFCSHAPEREPRESENTATION(#${geomSubContext},'Body','SweptSolid',(#${opSolid}))`,
        );
        const opProdShape = writer.add(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${opShapeRep}))`);

        const openingGuid = createIfcGuid(`comp-opening:${comp.id}`);
        const ifcOpening = writer.add(
          `IFCOPENINGELEMENT('${openingGuid}',#${ownerHistory},'Opening_${escapeStepString(comp.id)}',$,$,#${opPlacement},#${opProdShape},$,.OPENING.)`,
        );

        writer.add(
          `IFCRELVOIDSELEMENT('${createIfcGuid(`comp-rel-voids:${hostInfo.id}:${comp.id}`)}',#${ownerHistory},$,$,#${hostInfo.id},#${ifcOpening})`,
        );
        writer.add(
          `IFCRELFILLSELEMENT('${createIfcGuid(`comp-rel-fills:${comp.id}`)}',#${ownerHistory},$,$,#${ifcOpening},#${ifcElemId})`,
        );
      }
    }

    const elementsList =
      storeyElementsMap.get(comp.levelId) || storeyElementsMap.get(defaultStoreyId);
    if (elementsList) {
      elementsList.push(ifcElemId);
    }
  }

  // 3. Liaison Type <-> Occurrences (IfcRelDefinesByType)
  for (const [tId, { typeId, occurrences }] of typeIfcMap) {
    if (occurrences.length > 0) {
      const refs = occurrences.map((id) => `#${id}`).join(',');
      writer.add(
        `IFCRELDEFINESBYTYPE('${createIfcGuid(`rel-defines-by-type:${tId}`)}',#${ownerHistory},$,$,(${refs}),#${typeId})`,
      );
    }
  }
}
