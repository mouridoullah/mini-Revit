/**
 * Export IFC4 des murs (IfcWall, IfcExtrudedAreaSolid, Qto_WallBaseQuantities, Pset_WallCommon).
 */

import { type ElementId } from '../types.js';
import { resolveWallGeometry } from '../walls/resolve.js';
import { createIfcGuid } from './guid.js';
import { escapeStepString } from './step-writer.js';
import type { IfcContext } from './types.js';

export interface WallInfo {
  readonly id: number;
  readonly placementId: number;
  readonly length: number;
  readonly height: number;
  readonly thickness: number;
}

export function exportWalls(ctx: IfcContext): Map<ElementId, WallInfo> {
  const { state, writer, ownerHistory, geomSubContext, placementWorld3D, dirZ, dirX, storeyMap, storeyElementsMap, defaultStoreyId } = ctx;
  const wallMap = new Map<ElementId, WallInfo>();

  // Pré-indexation des ouvertures par mur hôte pour le calcul exact des surfaces/volumes nets
  const wallOpeningsMap = new Map<ElementId, { areaMm2: number }>();
  for (const door of Object.values(state.doors || {})) {
    const dt = state.doorTypes?.[door.doorTypeId];
    const w = dt?.width ?? 900;
    const h = dt?.height ?? 2100;
    const cur = wallOpeningsMap.get(door.hostWallId) ?? { areaMm2: 0 };
    cur.areaMm2 += w * h;
    wallOpeningsMap.set(door.hostWallId, cur);
  }
  for (const win of Object.values(state.windows || {})) {
    const wt = state.windowTypes?.[win.windowTypeId];
    const w = wt?.width ?? 1200;
    const h = wt?.height ?? 1400;
    const cur = wallOpeningsMap.get(win.hostWallId) ?? { areaMm2: 0 };
    cur.areaMm2 += w * h;
    wallOpeningsMap.set(win.hostWallId, cur);
  }

  const defaultStorey = storeyMap.get(defaultStoreyId);

  for (const [wallId, wall] of Object.entries(state.walls)) {
    const wallType = state.wallTypes[wall.typeId];
    const thickness = wallType?.thickness ?? 200;
    const resolved = resolveWallGeometry(wall, state);
    const height = resolved.height;

    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const length = Math.hypot(dx, dy);
    if (length < 1e-4) continue;

    const cos = dx / length;
    const sin = dy / length;

    const storeyInfo = storeyMap.get(wall.levelId) || defaultStorey;
    if (!storeyInfo) continue;

    // Placement du mur au niveau de storey
    const baseOffset = wall.baseOffset ?? 0;
    const ptWall = writer.add(
      `IFCCARTESIANPOINT((${wall.start.x.toFixed(2)},${wall.start.y.toFixed(2)},${baseOffset.toFixed(2)}))`,
    );
    const dirWallU = writer.add(`IFCDIRECTION((${cos.toFixed(6)},${sin.toFixed(6)},0.))`);
    const placementWall3D = writer.add(`IFCAXIS2PLACEMENT3D(#${ptWall},#${dirZ},#${dirWallU})`);
    const wallPlacement = writer.add(
      `IFCLOCALPLACEMENT(#${storeyInfo.placementId},#${placementWall3D})`,
    );

    // Profil du mur : biseauté sous toiture (GableWallProfile) ou rectangulaire standard (WallProfile)
    const halfT = thickness / 2;
    const tp = resolved.topProfile;
    const isNonRectangular =
      tp &&
      (tp.length > 2 ||
        (tp.length === 2 && Math.abs((tp[0]?.y ?? 0) - (tp[1]?.y ?? 0)) > 0.5));

    let solid: number;

    if (isNonRectangular && tp) {
      // Profil en chevron ou trapèze : IfcArbitraryClosedProfileDef dans le plan longitudinal-vertical du mur
      const profilePts2D = [
        { u: 0, relZ: 0 },
        { u: length, relZ: 0 },
        ...[...tp].reverse().map((p) => ({ u: p.x, relZ: p.y - resolved.zBase })),
      ];

      // Points 2D IFC dans le plan de section du mur (X = longitudinal, Y = vertical)
      const ptIds = profilePts2D.map((p) =>
        writer.add(`IFCCARTESIANPOINT((${p.u.toFixed(2)},${p.relZ.toFixed(2)}))`),
      );
      const closedPl = writer.add(
        `IFCPOLYLINE((${ptIds.map((id) => `#${id}`).join(',')},#${ptIds[0]}))`,
      );
      const profileId = writer.add(
        `IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,'GableWallProfile',#${closedPl})`,
      );

      const ptProfile = writer.add(`IFCCARTESIANPOINT((0.,${halfT.toFixed(2)},0.))`);
      const dirProfileNormal = writer.add(`IFCDIRECTION((0.,-1.,0.))`);
      const profilePlacement = writer.add(
        `IFCAXIS2PLACEMENT3D(#${ptProfile},#${dirProfileNormal},#${dirX})`,
      );

      solid = writer.add(
        `IFCEXTRUDEDAREASOLID(#${profileId},#${profilePlacement},#${dirZ},${thickness.toFixed(2)})`,
      );
    } else {
      // Profil rectangulaire standard
      const p1 = writer.add(`IFCCARTESIANPOINT((0.,${(-halfT).toFixed(2)}))`);
      const p2 = writer.add(`IFCCARTESIANPOINT((${length.toFixed(2)},${(-halfT).toFixed(2)}))`);
      const p3 = writer.add(`IFCCARTESIANPOINT((${length.toFixed(2)},${halfT.toFixed(2)}))`);
      const p4 = writer.add(`IFCCARTESIANPOINT((0.,${halfT.toFixed(2)}))`);
      const polyline = writer.add(`IFCPOLYLINE((#${p1},#${p2},#${p3},#${p4},#${p1}))`);
      const profile = writer.add(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,'WallProfile',#${polyline})`);

      solid = writer.add(
        `IFCEXTRUDEDAREASOLID(#${profile},#${placementWorld3D},#${dirZ},${height.toFixed(2)})`,
      );
    }
    const shapeRep = writer.add(
      `IFCSHAPEREPRESENTATION(#${geomSubContext},'Body','SweptSolid',(#${solid}))`,
    );
    const prodShape = writer.add(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${shapeRep}))`);

    const wallGuid = createIfcGuid(`wall:${wall.id}`);
    const ifcWall = writer.add(
      `IFCWALL('${wallGuid}',#${ownerHistory},'${escapeStepString(wall.id)}',$,'Wall',#${wallPlacement},#${prodShape},$,$)`,
    );

    // Quantités de base normalisées (Qto_WallBaseQuantities)
    const openingsArea = wallOpeningsMap.get(wallId)?.areaMm2 ?? 0;
    const grossSideAreaM2 = resolved.grossAreaMm2 / 1e6;
    const netSideAreaM2 = Math.max(0, (resolved.grossAreaMm2 - openingsArea) / 1e6);
    const grossVolumeM3 = (resolved.grossAreaMm2 * thickness) / 1e9;
    const netVolumeM3 = Math.max(0, (resolved.grossAreaMm2 * thickness - openingsArea * thickness) / 1e9);

    const qLength = writer.add(
      `IFCQUANTITYLENGTH('Length','Length of the wall',$,${length.toFixed(2)})`,
    );
    const qWidth = writer.add(
      `IFCQUANTITYLENGTH('Width','Width of the wall',$,${thickness.toFixed(2)})`,
    );
    const qHeight = writer.add(
      `IFCQUANTITYLENGTH('Height','Height of the wall',$,${height.toFixed(2)})`,
    );
    const qGrossArea = writer.add(
      `IFCQUANTITYAREA('GrossSideArea','Gross side area of the wall',$,${grossSideAreaM2.toFixed(3)})`,
    );
    const qNetArea = writer.add(
      `IFCQUANTITYAREA('NetSideArea','Net side area of the wall',$,${netSideAreaM2.toFixed(3)})`,
    );
    const qGrossVol = writer.add(
      `IFCQUANTITYVOLUME('GrossVolume','Gross volume of the wall',$,${grossVolumeM3.toFixed(3)})`,
    );
    const qNetVol = writer.add(
      `IFCQUANTITYVOLUME('NetVolume','Net volume of the wall',$,${netVolumeM3.toFixed(3)})`,
    );
    const wallQuantities = writer.add(
      `IFCELEMENTQUANTITY('${createIfcGuid(`wall-qto:${wall.id}`)}',#${ownerHistory},'BaseQuantities',$,'Qto_WallBaseQuantities',(#${qLength},#${qWidth},#${qHeight},#${qGrossArea},#${qNetArea},#${qGrossVol},#${qNetVol}))`,
    );
    writer.add(
      `IFCRELDEFINESBYPROPERTIES('${createIfcGuid(`wall-rel-qto:${wall.id}`)}',#${ownerHistory},$,$,(#${ifcWall}),#${wallQuantities})`,
    );

    // Propriétés standardisées (Pset_WallCommon)
    const pRef = writer.add(
      `IFCPROPERTYSINGLEVALUE('Reference',$,IFCLABEL('${escapeStepString(wallType?.name ?? 'Standard Wall')}'),$)`,
    );
    const wallCommonPropIds: number[] = [pRef];

    const explicitLoadBearing = wall.loadBearing ?? wallType?.loadBearing;
    if (explicitLoadBearing !== undefined) {
      const pLoadBearing = writer.add(
        `IFCPROPERTYSINGLEVALUE('LoadBearing',$,IFCBOOLEAN(${explicitLoadBearing ? '.T.' : '.F.'}),$)`,
      );
      wallCommonPropIds.push(pLoadBearing);
    }

    const explicitIsExternal = wall.isExternal ?? wallType?.isExternal;
    if (explicitIsExternal !== undefined) {
      const pIsExternal = writer.add(
        `IFCPROPERTYSINGLEVALUE('IsExternal',$,IFCBOOLEAN(${explicitIsExternal ? '.T.' : '.F.'}),$)`,
      );
      wallCommonPropIds.push(pIsExternal);
    }

    const wallPset = writer.add(
      `IFCPROPERTYSET('${createIfcGuid(`wall-pset:${wall.id}`)}',#${ownerHistory},'Pset_WallCommon',$,(#${wallCommonPropIds.join(',#')}))`,
    );
    writer.add(
      `IFCRELDEFINESBYPROPERTIES('${createIfcGuid(`wall-rel-pset:${wall.id}`)}',#${ownerHistory},$,$,(#${ifcWall}),#${wallPset})`,
    );

    wallMap.set(wallId, {
      id: ifcWall,
      placementId: wallPlacement,
      length,
      height,
      thickness,
    });

    const elementsList =
      storeyElementsMap.get(wall.levelId) || storeyElementsMap.get(defaultStoreyId);
    if (elementsList) {
      elementsList.push(ifcWall);
    }
  }

  return wallMap;
}
