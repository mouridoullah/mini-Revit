/**
 * @tabax/core/ifc/generator
 *
 * Moteur d'exportation OpenBIM IFC4 (ISO 10303-21 STEP) conforme buildingSMART.
 *
 * Découpé en sous-modules étanches selon ADR-071 :
 * - step-writer.ts : Sérialiseur STEP et échappement normalisé
 * - guid.ts : Générateur de GUIDs 100% déterministes
 * - walls.ts : Murs porteurs et cloisons (IfcWall, biseautage sous toiture)
 * - openings.ts : Baies, portes et fenêtres (IfcDoor, IfcWindow, IfcOpeningElement)
 * - slabs.ts : Dalles et planchers avec trémies dérivées (IfcSlab, IfcArbitraryProfileDefWithVoids)
 * - roofs.ts : Versants de toiture 3D inclinés exacts (IfcRoof, IfcSlab.ROOF.)
 * - stairs.ts : Escaliers crénelés en crémaillère (IfcStair, IfcStairFlight)
 * - spaces.ts : Pièces et volumes intérieurs (IfcSpace, Qto_SpaceBaseQuantities)
 * - components.ts : Mobilier et équipements architecturaux (IfcFurniture, etc.)
 * - mep.ts : Réseaux fluides et électriques (IfcPipeSegment, IfcDuctSegment, etc.)
 */

import { type BimState, type ElementId, type Level } from '../types.js';
import { createIfcGuid } from './guid.js';
import { StepWriter, escapeStepString } from './step-writer.js';
import type { IfcExportOptions, IfcContext, StoreyInfo } from './types.js';
import { exportWalls } from './walls.js';
import { exportOpenings } from './openings.js';
import { exportSlabs } from './slabs.js';
import { exportRoofs } from './roofs.js';
import { exportStairs } from './stairs.js';
import { exportSpaces } from './spaces.js';
import { exportComponents } from './components.js';
import { exportMep } from './mep.js';

export type { IfcExportOptions } from './types.js';
export { createIfcGuid, hashStringTo16Bytes } from './guid.js';
export { StepWriter, escapeStepString, escapeIfcString } from './step-writer.js';

/**
 * Exporte un état BIM complet au format IFC4 (ISO 10303-21 STEP).
 *
 * 100% déterministe, reproductible bit-à-bit et compatible avec web-ifc, BlenderBIM et BIMcollab.
 */
export function exportToIfc(state: BimState, options: IfcExportOptions = {}): string {
  const writer = new StepWriter();

  const projectName = escapeStepString(options.projectName || 'Tabax Project');
  const author = escapeStepString(options.author || 'Tabax Architect');
  const org = escapeStepString(options.organization || 'Tabax Studio');
  const filename = escapeStepString(options.filename || 'export.ifc');
  const timestamp = options.timestamp !== undefined ? options.timestamp : 1700000000;
  const now = new Date(timestamp * 1000).toISOString();

  // -------------------------------------------------------------------------
  // Entités de base et Contexte
  // -------------------------------------------------------------------------
  const person = writer.add(`IFCPERSON($,'${author}',$,$,$,$,$,$)`);
  const organization = writer.add(`IFCORGANIZATION($,'${org}',$,$,$)`);
  const personAndOrg = writer.add(`IFCPERSONANDORGANIZATION(#${person},#${organization},$)`);
  const application = writer.add(`IFCAPPLICATION(#${organization},'1.0.0','Tabax','tabax')`);
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
  const projectGuid = createIfcGuid(`project:${projectName}`);
  const project = writer.add(
    `IFCPROJECT('${projectGuid}',#${ownerHistory},'${projectName}',$,$,$,$,(#${geomContext}),#${unitAssignment})`,
  );

  // Site
  const sitePlacement = writer.add(`IFCLOCALPLACEMENT($,#${placementWorld3D})`);
  const siteGuid = createIfcGuid(`site:${projectName}`);
  const site = writer.add(
    `IFCSITE('${siteGuid}',#${ownerHistory},'Default Site',$,$,#${sitePlacement},$,$,.ELEMENT.,$,$,$,$,$)`,
  );
  writer.add(
    `IFCRELAGGREGATES('${createIfcGuid(`rel:project:site:${projectName}`)}',#${ownerHistory},'ProjectSite',$,#${project},(#${site}))`,
  );

  // Bâtiment
  const bldgPlacement = writer.add(`IFCLOCALPLACEMENT(#${sitePlacement},#${placementWorld3D})`);
  const bldgGuid = createIfcGuid(`building:${projectName}`);
  const building = writer.add(
    `IFCBUILDING('${bldgGuid}',#${ownerHistory},'Main Building',$,$,#${bldgPlacement},$,$,.ELEMENT.,$,$,$)`,
  );
  writer.add(
    `IFCRELAGGREGATES('${createIfcGuid(`rel:site:building:${projectName}`)}',#${ownerHistory},'SiteBuilding',$,#${site},(#${building}))`,
  );

  // -------------------------------------------------------------------------
  // Niveaux (IfcBuildingStorey)
  // -------------------------------------------------------------------------
  const storeyMap = new Map<ElementId, StoreyInfo>();
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
    const storeyGuid = createIfcGuid(`storey:${lvl.id}`);
    const storey = writer.add(
      `IFCBUILDINGSTOREY('${storeyGuid}',#${ownerHistory},'${escapeStepString(lvl.name)}',$,$,#${storeyPlacement},$,$,.ELEMENT.,${lvl.elevation.toFixed(2)})`,
    );
    storeyMap.set(lvl.id, { id: storey, placementId: storeyPlacement });
    storeyIds.push(storey);
    storeyElementsMap.set(lvl.id, []);
  }

  if (storeyIds.length > 0) {
    const storeysRefs = storeyIds.map((id) => `#${id}`).join(',');
    writer.add(
      `IFCRELAGGREGATES('${createIfcGuid(`rel:building:storeys:${projectName}`)}',#${ownerHistory},'BuildingStoreys',$,#${building},(${storeysRefs}))`,
    );
  }

  // Contexte partagé pour les sous-modules de domaine
  const ctx: IfcContext = {
    state,
    writer,
    ownerHistory,
    geomContext,
    geomSubContext,
    placementWorld3D,
    dirZ,
    dirX,
    storeyMap,
    storeyElementsMap,
    defaultStoreyId: defaultLevel.id,
  };

  // 1. Murs
  const wallMap = exportWalls(ctx);

  // 2. Ouvertures
  exportOpenings(ctx, wallMap);

  // 3. Dalles
  exportSlabs(ctx);

  // 4. Escaliers
  exportStairs(ctx);

  // 5. Toitures
  exportRoofs(ctx);

  // 6. Espaces / Pièces
  exportSpaces(ctx);

  // 7. Composants & Mobilier
  exportComponents(ctx, wallMap);

  // 8. Réseaux MEP
  exportMep(ctx);

  // -------------------------------------------------------------------------
  // Rattachement spatial global (IfcRelContainedInSpatialStructure)
  // -------------------------------------------------------------------------
  for (const [lvlId, elemIds] of storeyElementsMap.entries()) {
    if (elemIds.length === 0) continue;
    const storeyInfo = storeyMap.get(lvlId) || storeyMap.get(defaultLevel.id);
    if (!storeyInfo) continue;
    const refs = elemIds.map((id) => `#${id}`).join(',');
    writer.add(
      `IFCRELCONTAINEDINSPATIALSTRUCTURE('${createIfcGuid(`rel-contained:${lvlId}`)}',#${ownerHistory},'StoreyElements',$,(${refs}),#${storeyInfo.id})`,
    );
  }

  // -------------------------------------------------------------------------
  // En-tête STEP ISO 10303-21
  // -------------------------------------------------------------------------
  const header = [
    `FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');`,
    `FILE_NAME('${filename}','${now}',('${author}'),('${org}'),'Tabax OpenBIM Engine','Tabax','');`,
    `FILE_SCHEMA(('IFC4'));`,
  ].join('\n');

  return writer.toString(header);
}
