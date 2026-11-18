import {
  type BimState,
  type ElementId,
  type Door,
  type Window,
  type Room,
  type Level,
} from '../types.js';
import { detectRooms } from '../rooms/detect.js';
import { computeStairGeometry } from '../stairs.js';
import { computeRoofSlopes } from '../roofs/slopes.js';
import { resolveWallGeometry } from '../walls/resolve.js';
import { isPointInPolygon, signedArea, type Vec2 } from '@mini-bim/geometry';
import { createIfcGuid, escapeIfcString } from './guid.js';

/**
 * Options d'exportation IFC4.
 */
export interface IfcExportOptions {
  readonly projectName?: string;
  readonly author?: string;
  readonly organization?: string;
  readonly filename?: string;
}

/**
 * Constructeur de fichier STEP ISO 10303-21 pour IFC4.
 */
class StepWriter {
  private idCounter = 0;
  private readonly lines: string[] = [];

  public nextId(): number {
    return ++this.idCounter;
  }

  public add(entity: string): number {
    const id = ++this.idCounter;
    this.lines.push(`#${id}=${entity};`);
    return id;
  }

  public toString(header: string): string {
    return [
      'ISO-10303-21;',
      'HEADER;',
      header,
      'ENDSEC;',
      'DATA;',
      ...this.lines,
      'ENDSEC;',
      'END-ISO-10303-21;',
      '',
    ].join('\n');
  }
}

/**
 * Exporte un état BIM complet au format IFC4 (ISO 10303-21 STEP).
 *
 * Supporte :
 * - Hiérarchie spatiale : IfcProject -> IfcSite -> IfcBuilding -> IfcBuildingStorey
 * - Murs linéaires : IfcWall avec IfcExtrudedAreaSolid
 * - Réservations et baies : IfcOpeningElement relié par IfcRelVoidsElement
 * - Portes et Fenêtres : IfcDoor, IfcWindow reliés par IfcRelFillsElement
 * - Espaces / Pièces : IfcSpace avec polygones fermés et quantités Qto_SpaceBaseQuantities (Area, Volume)
 * - Rattachement spatial : IfcRelContainedInSpatialStructure
 */
export function exportToIfc(state: BimState, options: IfcExportOptions = {}): string {
  const writer = new StepWriter();

  const projectName = escapeIfcString(options.projectName || 'Mini-BIM Project');
  const author = escapeIfcString(options.author || 'Mini-BIM Architect');
  const org = escapeIfcString(options.organization || 'Mini-BIM Team');
  const filename = escapeIfcString(options.filename || 'export.ifc');
  const now = new Date().toISOString();
  const timestamp = Math.floor(Date.now() / 1000);

  // -------------------------------------------------------------------------
  // Entités génériques et contexte
  // -------------------------------------------------------------------------
  const person = writer.add(`IFCPERSON($,'${author}',$,$,$,$,$,$)`);
  const organization = writer.add(`IFCORGANIZATION($,'${org}',$,$,$)`);
  const personAndOrg = writer.add(`IFCPERSONANDORGANIZATION(#${person},#${organization},$)`);
  const application = writer.add(`IFCAPPLICATION(#${organization},'1.0.0','Mini-BIM','mini-bim')`);
  const ownerHistory = writer.add(
    `IFCOWNERHISTORY(#${personAndOrg},#${application},$,.ADDED.,$,$,$,${timestamp})`,
  );

  // Unités métriques (Millimètres pour la longueur, m² pour la surface, m³ pour le volume)
  const lengthUnit = writer.add(`IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.)`);
  const areaUnit = writer.add(`IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)`);
  const volumeUnit = writer.add(`IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)`);
  const angleUnit = writer.add(`IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)`);
  const unitAssignment = writer.add(
    `IFCUNITASSIGNMENT((#${lengthUnit},#${areaUnit},#${volumeUnit},#${angleUnit}))`,
  );

  // Repère géométrique 3D
  const ptOrigin3D = writer.add(`IFCCARTESIANPOINT((0.,0.,0.))`);
  const dirZ = writer.add(`IFCDIRECTION((0.,0.,1.))`);
  const dirX = writer.add(`IFCDIRECTION((1.,0.,0.))`);
  const placementWorld3D = writer.add(`IFCAXIS2PLACEMENT3D(#${ptOrigin3D},#${dirZ},#${dirX})`);
  const geomContext = writer.add(
    `IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#${placementWorld3D},$)`,
  );
  const geomSubContext = writer.add(
    `IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,#${geomContext},$,.MODEL_VIEW.,$)`,
  );

  // Projet racine
  const projectGuid = createIfcGuid();
  const project = writer.add(
    `IFCPROJECT('${projectGuid}',#${ownerHistory},'${projectName}',$,$,$,$,(#${geomContext}),#${unitAssignment})`,
  );

  // Site
  const sitePlacement = writer.add(`IFCLOCALPLACEMENT($,#${placementWorld3D})`);
  const siteGuid = createIfcGuid();
  const site = writer.add(
    `IFCSITE('${siteGuid}',#${ownerHistory},'Default Site',$,$,#${sitePlacement},$,$,.ELEMENT.,$,$,$,$,$)`,
  );
  writer.add(
    `IFCRELAGGREGATES('${createIfcGuid()}',#${ownerHistory},'ProjectSite',$,#${project},(#${site}))`,
  );

  // Bâtiment
  const bldgPlacement = writer.add(`IFCLOCALPLACEMENT(#${sitePlacement},#${placementWorld3D})`);
  const bldgGuid = createIfcGuid();
  const building = writer.add(
    `IFCBUILDING('${bldgGuid}',#${ownerHistory},'Main Building',$,$,#${bldgPlacement},$,$,.ELEMENT.,$,$,$)`,
  );
  writer.add(
    `IFCRELAGGREGATES('${createIfcGuid()}',#${ownerHistory},'SiteBuilding',$,#${site},(#${building}))`,
  );

  // -------------------------------------------------------------------------
  // Niveaux (IfcBuildingStorey)
  // -------------------------------------------------------------------------
  const storeyMap = new Map<ElementId, { id: number; placementId: number }>();
  const storeyIds: number[] = [];
  const storeyElementsMap = new Map<ElementId, number[]>();

  const levels = Object.values(state.levels);
  const defaultLevel: Level = levels[0] || { id: 'default_lvl', name: 'Niveau 0', elevation: 0 };

  for (const lvl of levels.length > 0 ? levels : [defaultLevel]) {
    const ptStorey = writer.add(`IFCCARTESIANPOINT((0.,0.,${lvl.elevation.toFixed(2)}))`);
    const placementStorey3D = writer.add(`IFCAXIS2PLACEMENT3D(#${ptStorey},#${dirZ},#${dirX})`);
    const storeyPlacement = writer.add(
      `IFCLOCALPLACEMENT(#${bldgPlacement},#${placementStorey3D})`,
    );
    const storeyGuid = createIfcGuid();
    const storey = writer.add(
      `IFCBUILDINGSTOREY('${storeyGuid}',#${ownerHistory},'${escapeIfcString(lvl.name)}',$,$,#${storeyPlacement},$,$,.ELEMENT.,${lvl.elevation.toFixed(2)})`,
    );
    storeyMap.set(lvl.id, { id: storey, placementId: storeyPlacement });
    storeyIds.push(storey);
    storeyElementsMap.set(lvl.id, []);
  }

  if (storeyIds.length > 0) {
    const storeysRefs = storeyIds.map((id) => `#${id}`).join(',');
    writer.add(
      `IFCRELAGGREGATES('${createIfcGuid()}',#${ownerHistory},'BuildingStoreys',$,#${building},(${storeysRefs}))`,
    );
  }

  // -------------------------------------------------------------------------
  // Murs (IfcWall) et Ouvertures (IfcDoor, IfcWindow, IfcOpeningElement)
  // -------------------------------------------------------------------------
  const wallMap = new Map<
    ElementId,
    { id: number; placementId: number; length: number; height: number; thickness: number }
  >();

  // Pré-indexation des ouvertures par mur hôte pour le calcul exact des quantités nettes
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

    const defaultStorey = storeyMap.get(defaultLevel.id);
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
      // Sens anti-horaire : coins bas gauche -> coins bas droite -> crête droite vers gauche
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

      // Le profil 2D est dans le plan longitudinal-vertical du mur (X = axe mur, Y = Z vertical)
      // En coordonnées locales du mur, la face avant est à Y = +halfT, avec normale vers -Y : (0, -1, 0)
      // L'extrusion le long de cette normale par 'thickness' couvre l'intervalle Y in [+halfT, -halfT]
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

      // Solide extrudé vertical
      solid = writer.add(
        `IFCEXTRUDEDAREASOLID(#${profile},#${placementWorld3D},#${dirZ},${height.toFixed(2)})`,
      );
    }
    const shapeRep = writer.add(
      `IFCSHAPEREPRESENTATION(#${geomSubContext},'Body','SweptSolid',(#${solid}))`,
    );
    const prodShape = writer.add(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${shapeRep}))`);

    const wallGuid = createIfcGuid();
    const ifcWall = writer.add(
      `IFCWALL('${wallGuid}',#${ownerHistory},'${escapeIfcString(wall.id)}',$,'Wall',#${wallPlacement},#${prodShape},$,$)`,
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
      `IFCELEMENTQUANTITY('${createIfcGuid()}',#${ownerHistory},'BaseQuantities',$,'Qto_WallBaseQuantities',(#${qLength},#${qWidth},#${qHeight},#${qGrossArea},#${qNetArea},#${qGrossVol},#${qNetVol}))`,
    );
    writer.add(
      `IFCRELDEFINESBYPROPERTIES('${createIfcGuid()}',#${ownerHistory},$,$,(#${ifcWall}),#${wallQuantities})`,
    );

    // Propriétés standardisées (Pset_WallCommon)
    // Règle d'or BIM : aucune inférence arbitraire basée sur l'épaisseur géométrique.
    // Seules les propriétés explicitement définies (sur l'instance ou sur le type) sont exportées.
    const pRef = writer.add(
      `IFCPROPERTYSINGLEVALUE('Reference',$,IFCLABEL('${escapeIfcString(wallType?.name ?? 'Standard Wall')}'),$)`,
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
      `IFCPROPERTYSET('${createIfcGuid()}',#${ownerHistory},'Pset_WallCommon',$,(#${wallCommonPropIds.join(',#')}))`,
    );
    writer.add(
      `IFCRELDEFINESBYPROPERTIES('${createIfcGuid()}',#${ownerHistory},$,$,(#${ifcWall}),#${wallPset})`,
    );

    wallMap.set(wallId, {
      id: ifcWall,
      placementId: wallPlacement,
      length,
      height,
      thickness,
    });

    // Enregistrer le mur sous son niveau
    const elementsList =
      storeyElementsMap.get(wall.levelId) || storeyElementsMap.get(defaultLevel.id);
    if (elementsList) {
      elementsList.push(ifcWall);
    }
  }

  // -------------------------------------------------------------------------
  // Ouvertures : Portes (IfcDoor) et Fenêtres (IfcWindow)
  // -------------------------------------------------------------------------
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
    // Coordonnées locales relatives au repère du mur
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

    const openingGuid = createIfcGuid();
    const ifcOpening = writer.add(
      `IFCOPENINGELEMENT('${openingGuid}',#${ownerHistory},'Opening_${escapeIfcString(item.id)}',$,$,#${opPlacement},#${opProdShape},$,.OPENING.)`,
    );

    // Liaison Mur -> Réservation (IfcRelVoidsElement)
    writer.add(
      `IFCRELVOIDSELEMENT('${createIfcGuid()}',#${ownerHistory},$,$,#${hostInfo.id},#${ifcOpening})`,
    );

    // Élément menuiserie : IfcDoor ou IfcWindow
    let fillingElementId: number;
    if (op.kind === 'door') {
      const door = item as Door;
      const doorGuid = createIfcGuid();
      const opType = door.swing.side === 'left' ? '.SINGLE_SWING_LEFT.' : '.SINGLE_SWING_RIGHT.';
      fillingElementId = writer.add(
        `IFCDOOR('${doorGuid}',#${ownerHistory},'${escapeIfcString(door.id)}',$,'Door',#${opPlacement},#${opProdShape},$,${opHeight.toFixed(2)},${opWidth.toFixed(2)},.DOOR.,${opType},$)`,
      );
    } else {
      const win = item as Window;
      const winGuid = createIfcGuid();
      fillingElementId = writer.add(
        `IFCWINDOW('${winGuid}',#${ownerHistory},'${escapeIfcString(win.id)}',$,'Window',#${opPlacement},#${opProdShape},$,${opHeight.toFixed(2)},${opWidth.toFixed(2)},.WINDOW.,$,$)`,
      );
    }

    // Liaison Réservation -> Menuiserie (IfcRelFillsElement)
    writer.add(
      `IFCRELFILLSELEMENT('${createIfcGuid()}',#${ownerHistory},$,$,#${ifcOpening},#${fillingElementId})`,
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
      `IFCELEMENTQUANTITY('${createIfcGuid()}',#${ownerHistory},'BaseQuantities',$,'${qtoName}',(#${qOpW},#${qOpH},#${qOpArea}))`,
    );
    writer.add(
      `IFCRELDEFINESBYPROPERTIES('${createIfcGuid()}',#${ownerHistory},$,$,(#${fillingElementId}),#${opQuantities})`,
    );
  }

  // -------------------------------------------------------------------------
  // Dalles Horizontales (IfcSlab)
  // -------------------------------------------------------------------------
  if (state.slabs && Object.keys(state.slabs).length > 0) {
    for (const slab of Object.values(state.slabs)) {
      if (!slab.boundary || slab.boundary.length < 3) continue;

      const slabType = state.slabTypes?.[slab.slabTypeId];
      const thickness = slabType?.thickness ?? 200;
      const baseOffset = slab.baseOffset ?? 0;

      const defaultStorey = storeyMap.get(defaultLevel.id);
      const storeyInfo = storeyMap.get(slab.levelId) || defaultStorey;
      if (!storeyInfo) continue;

      // Placement de la dalle au niveau de l'étage
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

      const allHoles = [...(slab.holes ?? []), ...(slab.openings ?? [])].filter(
        (h) => h && h.length >= 3,
      );

      let profile: number;
      if (allHoles.length > 0) {
        const holePolylineIds: number[] = [];
        for (const hole of allHoles) {
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

      const slabGuid = createIfcGuid();
      const ifcSlab = writer.add(
        `IFCSLAB('${slabGuid}',#${ownerHistory},'${escapeIfcString(slab.name || slab.id)}',$,'Slab',#${slabPlacement},#${slabProdShape},$,.FLOOR.)`,
      );

      // Quantités de dalle normalisées (Qto_SlabBaseQuantities)
      const grossAreaMm2 = Math.abs(signedArea(slab.boundary));
      let holesAreaMm2 = 0;
      for (const hole of allHoles) {
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
        `IFCELEMENTQUANTITY('${createIfcGuid()}',#${ownerHistory},'BaseQuantities',$,'Qto_SlabBaseQuantities',(#${qSlabGrossArea},#${qSlabNetArea},#${qSlabGrossVol}))`,
      );
      writer.add(
        `IFCRELDEFINESBYPROPERTIES('${createIfcGuid()}',#${ownerHistory},$,$,(#${ifcSlab}),#${slabQuantities})`,
      );

      // Rattachement au niveau (IfcRelContainedInSpatialStructure)
      const elementsList =
        storeyElementsMap.get(slab.levelId) || storeyElementsMap.get(defaultLevel.id);
      if (elementsList) {
        elementsList.push(ifcSlab);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Escaliers droits paramétriques (IfcStair & IfcStairFlight - ADR-048)
  // -------------------------------------------------------------------------
  if (state.stairs && Object.keys(state.stairs).length > 0) {
    for (const stair of Object.values(state.stairs)) {
      const stairType = state.stairTypes?.[stair.stairTypeId];
      const width = stair.widthOverride ?? stairType?.width ?? 900;
      const geom = computeStairGeometry(stair, state);

      const dx = stair.end.x - stair.start.x;
      const dy = stair.end.y - stair.start.y;
      const len = Math.hypot(dx, dy);
      const cos = len > 1e-4 ? dx / len : 1;
      const sin = len > 1e-4 ? dy / len : 0;

      const defaultStorey = storeyMap.get(defaultLevel.id);
      const storeyInfo = storeyMap.get(stair.bottomLevelId) || defaultStorey;
      if (!storeyInfo) continue;

      // Placement de l'escalier à son point de départ au niveau bas
      const ptStair = writer.add(
        `IFCCARTESIANPOINT((${stair.start.x.toFixed(2)},${stair.start.y.toFixed(2)},0.))`,
      );
      const dirStairU = writer.add(`IFCDIRECTION((${cos.toFixed(6)},${sin.toFixed(6)},0.))`);
      const placementStair3D = writer.add(`IFCAXIS2PLACEMENT3D(#${ptStair},#${dirZ},#${dirStairU})`);
      const stairPlacement = writer.add(
        `IFCLOCALPLACEMENT(#${storeyInfo.placementId},#${placementStair3D})`,
      );

      // Profil de la volée : rectangle centré sur Y de -halfW à +halfW, de X=0 à X=L
      const halfW = width / 2;
      const p1 = writer.add(`IFCCARTESIANPOINT((0.,${(-halfW).toFixed(2)}))`);
      const p2 = writer.add(`IFCCARTESIANPOINT((${len.toFixed(2)},${(-halfW).toFixed(2)}))`);
      const p3 = writer.add(`IFCCARTESIANPOINT((${len.toFixed(2)},${halfW.toFixed(2)}))`);
      const p4 = writer.add(`IFCCARTESIANPOINT((0.,${halfW.toFixed(2)}))`);
      const polyline = writer.add(`IFCPOLYLINE((#${p1},#${p2},#${p3},#${p4},#${p1}))`);
      const flightProfile = writer.add(
        `IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,'StairFlightProfile',#${polyline})`,
      );

      const flightSolid = writer.add(
        `IFCEXTRUDEDAREASOLID(#${flightProfile},#${placementWorld3D},#${dirZ},${geom.totalRise.toFixed(2)})`,
      );
      const flightShapeRep = writer.add(
        `IFCSHAPEREPRESENTATION(#${geomSubContext},'Body','SweptSolid',(#${flightSolid}))`,
      );
      const flightProdShape = writer.add(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${flightShapeRep}))`);

      const flightPlacement = writer.add(
        `IFCLOCALPLACEMENT(#${stairPlacement},#${placementWorld3D})`,
      );
      const flightGuid = createIfcGuid();
      const ifcStairFlight = writer.add(
        `IFCSTAIRFLIGHT('${flightGuid}',#${ownerHistory},'${escapeIfcString((stair.name || stair.id) + ' Volée')}',$,'Flight',#${flightPlacement},#${flightProdShape},$,${geom.numberOfSteps},${geom.numberOfSteps},${geom.stepHeight.toFixed(2)},${geom.stepDepth.toFixed(2)},.STRAIGHT.)`,
      );

      const stairGuid = createIfcGuid();
      const ifcStair = writer.add(
        `IFCSTAIR('${stairGuid}',#${ownerHistory},'${escapeIfcString(stair.name || stair.id)}',$,'Stair',#${stairPlacement},$,$,.STRAIGHT_RUN_STAIR.)`,
      );

      // Relation d'agrégation IfcRelAggregates entre IfcStair et IfcStairFlight
      const relGuid = createIfcGuid();
      writer.add(
        `IFCRELAGGREGATES('${relGuid}',#${ownerHistory},'StairFlightAggregation',$,#${ifcStair},(#${ifcStairFlight}))`,
      );

      // Rattachement au niveau bas dans IfcRelContainedInSpatialStructure
      const elementsList =
        storeyElementsMap.get(stair.bottomLevelId) || storeyElementsMap.get(defaultLevel.id);
      if (elementsList) {
        elementsList.push(ifcStair);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Toitures (IfcRoof agrégeant IfcSlab .ROOF. - ADR-053 [D6])
  // -------------------------------------------------------------------------
  if (state.roofs && Object.keys(state.roofs).length > 0) {
    for (const roof of Object.values(state.roofs)) {
      if (!roof.footprint || roof.footprint.length < 3) continue;

      const roofType = state.roofTypes?.[roof.roofTypeId];
      const isGable = roofType?.family === 'gable';
      const thickness = roofType?.thickness ?? 250;
      const baseOffset = roof.baseOffset ?? 0;

      const defaultStorey = storeyMap.get(defaultLevel.id);
      const storeyInfo = storeyMap.get(roof.levelId) || defaultStorey;
      if (!storeyInfo) continue;

      // Placement de la toiture au niveau d'assise + baseOffset
      const ptRoof = writer.add(
        `IFCCARTESIANPOINT((0.,0.,${baseOffset.toFixed(2)}))`,
      );
      const placementRoof3D = writer.add(`IFCAXIS2PLACEMENT3D(#${ptRoof},#${dirZ},#${dirX})`);
      const roofPlacement = writer.add(
        `IFCLOCALPLACEMENT(#${storeyInfo.placementId},#${placementRoof3D})`,
      );

      // Calcul des versants de toiture
      const slopes = computeRoofSlopes(roof, state);
      const aggregatedSlabIds: number[] = [];

      for (let sIdx = 0; sIdx < slopes.length; sIdx++) {
        const slope = slopes[sIdx];
        if (!slope || slope.polygon.length < 3) continue;

        // Contour 2D du versant
        const polyPoints = slope.polygon.map((p) =>
          writer.add(`IFCCARTESIANPOINT((${p.x.toFixed(2)},${p.y.toFixed(2)}))`),
        );
        const firstPoint = polyPoints[0];
        if (firstPoint !== undefined) {
          polyPoints.push(firstPoint); // Fermeture CCW
        }
        const polyline = writer.add(`IFCPOLYLINE((${polyPoints.map((id) => `#${id}`).join(',')}))`);
        const slopeProfile = writer.add(
          `IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,'RoofSlabProfile_${sIdx}',#${polyline})`,
        );

        // Extrusion solide
        const slopeSolid = writer.add(
          `IFCEXTRUDEDAREASOLID(#${slopeProfile},#${placementWorld3D},#${dirZ},${thickness.toFixed(2)})`,
        );
        const slopeShapeRep = writer.add(
          `IFCSHAPEREPRESENTATION(#${geomSubContext},'Body','SweptSolid',(#${slopeSolid}))`,
        );
        const slopeProdShape = writer.add(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${slopeShapeRep}))`);

        const slabPlacement = writer.add(
          `IFCLOCALPLACEMENT(#${roofPlacement},#${placementWorld3D})`,
        );
        const slabGuid = createIfcGuid();
        const slabName = `${roof.name || roof.id} Versant ${sIdx + 1}`;
        const ifcSlab = writer.add(
          `IFCSLAB('${slabGuid}',#${ownerHistory},'${escapeIfcString(slabName)}',$,'RoofSlab',#${slabPlacement},#${slopeProdShape},$,.ROOF.)`,
        );
        aggregatedSlabIds.push(ifcSlab);
      }

      // Entité IfcRoof
      const roofGuid = createIfcGuid();
      const predefinedType = isGable ? '.GABLE_ROOF.' : '.FLAT_ROOF.';
      const ifcRoof = writer.add(
        `IFCROOF('${roofGuid}',#${ownerHistory},'${escapeIfcString(roof.name || roof.id)}',$,'Roof',#${roofPlacement},$,$,${predefinedType})`,
      );

      // Agrégation IfcRelAggregates
      if (aggregatedSlabIds.length > 0) {
        const relGuid = createIfcGuid();
        writer.add(
          `IFCRELAGGREGATES('${relGuid}',#${ownerHistory},'RoofSlabAggregation',$,#${ifcRoof},(${aggregatedSlabIds.map((id) => `#${id}`).join(',')}))`,
        );
      }

      // Rattachement au niveau (IfcRelContainedInSpatialStructure)
      const elementsList =
        storeyElementsMap.get(roof.levelId) || storeyElementsMap.get(defaultLevel.id);
      if (elementsList) {
        elementsList.push(ifcRoof);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Pièces et Espaces (IfcSpace)
  // -------------------------------------------------------------------------
  if (state.rooms && Object.keys(state.rooms).length > 0) {
    // Calcul de la détection de pièces par niveau
    const levelRoomsMap = new Map<ElementId, Room[]>();
    for (const room of Object.values(state.rooms)) {
      const list = levelRoomsMap.get(room.levelId) || [];
      list.push(room);
      levelRoomsMap.set(room.levelId, list);
    }

    for (const [lvlId, roomsOnLevel] of levelRoomsMap.entries()) {
      const detected = detectRooms(state, lvlId);
      const defaultStorey = storeyMap.get(defaultLevel.id);
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

        const spaceGuid = createIfcGuid();
        const ifcSpace = writer.add(
          `IFCSPACE('${spaceGuid}',#${ownerHistory},'${escapeIfcString(room.name)}',$,$,#${storeyInfo.placementId},#${spaceProdShape},$,.INTERNAL.,.ELEMENT.,$)`,
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
          `IFCELEMENTQUANTITY('${createIfcGuid()}',#${ownerHistory},'BaseQuantities',$,'Qto_SpaceBaseQuantities',(#${qArea},#${qVolume}))`,
        );
        writer.add(
          `IFCRELDEFINESBYPROPERTIES('${createIfcGuid()}',#${ownerHistory},$,$,(#${ifcSpace}),#${elementQuantity})`,
        );

        // Rattachement au niveau
        const elementsList = storeyElementsMap.get(lvlId) || storeyElementsMap.get(defaultLevel.id);
        if (elementsList) {
          elementsList.push(ifcSpace);
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Rattachement spatial : IfcRelContainedInSpatialStructure
  // -------------------------------------------------------------------------
  for (const [lvlId, elemIds] of storeyElementsMap.entries()) {
    if (elemIds.length === 0) continue;
    const storeyInfo = storeyMap.get(lvlId);
    if (!storeyInfo) continue;

    const refs = elemIds.map((id) => `#${id}`).join(',');
    writer.add(
      `IFCRELCONTAINEDINSPATIALSTRUCTURE('${createIfcGuid()}',#${ownerHistory},'StoreyElements',$,(${refs}),#${storeyInfo.id})`,
    );
  }

  // -------------------------------------------------------------------------
  // En-tête STEP ISO 10303-21
  // -------------------------------------------------------------------------
  const header = [
    `FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');`,
    `FILE_NAME('${filename}','${now}',('${author}'),('${org}'),'Mini-BIM IFC4 Generator','Mini-BIM','');`,
    `FILE_SCHEMA(('IFC4'));`,
  ].join('\n');

  return writer.toString(header);
}
