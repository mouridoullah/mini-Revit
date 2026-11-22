/**
 * Export IFC4 des réseaux techniques MEP (Mechanical, Electrical & Plumbing).
 * Conforme à ISO 16739 / ADR-056 & ADR-071 :
 * - Pipe -> IfcPipeSegment (.RIGIDSEGMENT.)
 * - Duct -> IfcDuctSegment (.RIGIDSEGMENT.)
 * - CableTray -> IfcCableCarrierSegment (.CABLETRAYSEGMENT.)
 * - MepFitting -> IfcPipeFitting / IfcDuctFitting / IfcCableCarrierFitting
 * - MepEquipment -> IfcDistributionFlowElement
 * - MepSystem -> IfcDistributionSystem + IfcRelAssignsToGroup
 */

import { type ElementId } from '../types.js';
import type { MepFitting, MepEquipment } from '../mep/types.js';
import { createIfcGuid } from './guid.js';
import { escapeStepString } from './step-writer.js';
import type { IfcContext } from './types.js';

export function exportMep(ctx: IfcContext): void {
  const { state, writer, ownerHistory, geomSubContext, placementWorld3D, dirZ, storeyMap, storeyElementsMap, defaultStoreyId } = ctx;

  const defaultStorey = storeyMap.get(defaultStoreyId);
  const mepElementsToIfcId = new Map<ElementId, number>();

  /**
   * Helper pour créer un repère 3D extrudé orienté le long du segment (start -> end).
   */
  function createSegmentPlacementAndSolid(
    start: { x: number; y: number; z: number },
    end: { x: number; y: number; z: number },
    levelId: ElementId,
    profileId: number,
  ): { placementId: number; shapeRepId: number } | null {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dz = end.z - start.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-4) return null;

    const storeyInfo = storeyMap.get(levelId) || defaultStorey;
    if (!storeyInfo) return null;

    const storeyElev = state.levels[levelId]?.elevation ?? 0;
    const relStartX = start.x;
    const relStartY = start.y;
    const relStartZ = start.z - storeyElev;

    // Vecteur unitaire longitudinal Uz le long du conduit
    const uzX = dx / len;
    const uzY = dy / len;
    const uzZ = dz / len;

    // Vecteur unitaire orthogonal transversal Ux
    let uxX: number;
    let uxY: number;
    let uxZ: number;

    if (Math.abs(uzZ) < 0.99) {
      const hLen = Math.hypot(uzX, uzY) || 1.0;
      uxX = -uzY / hLen;
      uxY = uzX / hLen;
      uxZ = 0;
    } else {
      uxX = 1;
      uxY = 0;
      uxZ = 0;
    }

    const ptStart = writer.add(
      `IFCCARTESIANPOINT((${relStartX.toFixed(2)},${relStartY.toFixed(2)},${relStartZ.toFixed(2)}))`,
    );
    const dirUz = writer.add(
      `IFCDIRECTION((${uzX.toFixed(6)},${uzY.toFixed(6)},${uzZ.toFixed(6)}))`,
    );
    const dirUx = writer.add(
      `IFCDIRECTION((${uxX.toFixed(6)},${uxY.toFixed(6)},${uxZ.toFixed(6)}))`,
    );
    const placement3D = writer.add(
      `IFCAXIS2PLACEMENT3D(#${ptStart},#${dirUz},#${dirUx})`,
    );
    const localPlacement = writer.add(
      `IFCLOCALPLACEMENT(#${storeyInfo.placementId},#${placement3D})`,
    );

    const solid = writer.add(
      `IFCEXTRUDEDAREASOLID(#${profileId},#${placementWorld3D},#${dirZ},${len.toFixed(2)})`,
    );
    const shapeRep = writer.add(
      `IFCSHAPEREPRESENTATION(#${geomSubContext},'Body','SweptSolid',(#${solid}))`,
    );

    return { placementId: localPlacement, shapeRepId: shapeRep };
  }

  // -------------------------------------------------------------------------
  // 1. Tuyauterie (IfcPipeSegment)
  // -------------------------------------------------------------------------
  if (state.pipes) {
    for (const pipe of Object.values(state.pipes)) {
      const radius = (pipe.diameter ?? 32) * 0.5;
      const profile = writer.add(
        `IFCCIRCLEPROFILEDEF(.AREA.,$,$,${radius.toFixed(2)})`,
      );

      const placed = createSegmentPlacementAndSolid(pipe.start, pipe.end, pipe.levelId, profile);
      if (!placed) continue;

      const prodShape = writer.add(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${placed.shapeRepId}))`);
      const pipeGuid = createIfcGuid(`pipe:${pipe.id}`);
      const ifcPipe = writer.add(
        `IFCPIPESEGMENT('${pipeGuid}',#${ownerHistory},'${escapeStepString(pipe.name || pipe.id)}',$,'Pipe',#${placed.placementId},#${prodShape},$,.RIGIDSEGMENT.)`,
      );

      mepElementsToIfcId.set(pipe.id, ifcPipe);
      const elementsList =
        storeyElementsMap.get(pipe.levelId) || storeyElementsMap.get(defaultStoreyId);
      if (elementsList) {
        elementsList.push(ifcPipe);
      }
    }
  }

  // -------------------------------------------------------------------------
  // 2. Gaines Aérauliques (IfcDuctSegment)
  // -------------------------------------------------------------------------
  if (state.ducts) {
    for (const duct of Object.values(state.ducts)) {
      let profile: number;
      if (duct.shape === 'round' || (duct.diameter !== undefined && duct.shape !== 'rectangular')) {
        const radius = (duct.diameter ?? 200) * 0.5;
        profile = writer.add(`IFCCIRCLEPROFILEDEF(.AREA.,$,$,${radius.toFixed(2)})`);
      } else {
        const w = duct.width ?? 300;
        const h = duct.height ?? 200;
        profile = writer.add(`IFCRECTANGLEPROFILEDEF(.AREA.,$,$,${w.toFixed(2)},${h.toFixed(2)})`);
      }

      const placed = createSegmentPlacementAndSolid(duct.start, duct.end, duct.levelId, profile);
      if (!placed) continue;

      const prodShape = writer.add(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${placed.shapeRepId}))`);
      const ductGuid = createIfcGuid(`duct:${duct.id}`);
      const ifcDuct = writer.add(
        `IFCDUCTSEGMENT('${ductGuid}',#${ownerHistory},'${escapeStepString(duct.name || duct.id)}',$,'Duct',#${placed.placementId},#${prodShape},$,.RIGIDSEGMENT.)`,
      );

      mepElementsToIfcId.set(duct.id, ifcDuct);
      const elementsList =
        storeyElementsMap.get(duct.levelId) || storeyElementsMap.get(defaultStoreyId);
      if (elementsList) {
        elementsList.push(ifcDuct);
      }
    }
  }

  // -------------------------------------------------------------------------
  // 3. Chemins de Câbles (IfcCableCarrierSegment)
  // -------------------------------------------------------------------------
  if (state.cableTrays) {
    for (const tray of Object.values(state.cableTrays)) {
      const w = tray.width ?? 200;
      const h = tray.height ?? 60;
      const profile = writer.add(`IFCRECTANGLEPROFILEDEF(.AREA.,$,$,${w.toFixed(2)},${h.toFixed(2)})`);

      const placed = createSegmentPlacementAndSolid(tray.start, tray.end, tray.levelId, profile);
      if (!placed) continue;

      const prodShape = writer.add(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${placed.shapeRepId}))`);
      const trayGuid = createIfcGuid(`cable-tray:${tray.id}`);
      const ifcTray = writer.add(
        `IFCCABLECARRIERSEGMENT('${trayGuid}',#${ownerHistory},'${escapeStepString(tray.name || tray.id)}',$,'CableTray',#${placed.placementId},#${prodShape},$,.CABLETRAYSEGMENT.)`,
      );

      mepElementsToIfcId.set(tray.id, ifcTray);
      const elementsList =
        storeyElementsMap.get(tray.levelId) || storeyElementsMap.get(defaultStoreyId);
      if (elementsList) {
        elementsList.push(ifcTray);
      }
    }
  }

  // -------------------------------------------------------------------------
  // 4. Raccords MEP (IfcPipeFitting / IfcDuctFitting / IfcCableCarrierFitting)
  // -------------------------------------------------------------------------
  const fittings: Record<string, MepFitting> | undefined =
    state.mepFittings ?? (state as unknown as { fittings?: Record<string, MepFitting> }).fittings;
  if (fittings) {
    for (const fitting of Object.values(fittings)) {
      const storeyInfo = storeyMap.get(fitting.levelId) || defaultStorey;
      if (!storeyInfo) continue;

      const storeyElev = state.levels[fitting.levelId]?.elevation ?? 0;
      const relX = fitting.position.x;
      const relY = fitting.position.y;
      const relZ = fitting.position.z - storeyElev;

      const ptFitting = writer.add(
        `IFCCARTESIANPOINT((${relX.toFixed(2)},${relY.toFixed(2)},${relZ.toFixed(2)}))`,
      );
      const placement3D = writer.add(
        `IFCAXIS2PLACEMENT3D(#${ptFitting},#${dirZ},#${ctx.dirX})`,
      );
      const localPlacement = writer.add(
        `IFCLOCALPLACEMENT(#${storeyInfo.placementId},#${placement3D})`,
      );

      // Encombrement compact selon diamètre
      let maxDim = 80;
      for (const p of fitting.ports) {
        if (p.diameter && p.diameter > maxDim) maxDim = p.diameter;
        if (p.width && p.width > maxDim) maxDim = p.width;
      }
      const boxSize = maxDim * 1.1;
      const profile = writer.add(
        `IFCRECTANGLEPROFILEDEF(.AREA.,$,$,${boxSize.toFixed(2)},${boxSize.toFixed(2)})`,
      );
      const solid = writer.add(
        `IFCEXTRUDEDAREASOLID(#${profile},#${placementWorld3D},#${dirZ},${boxSize.toFixed(2)})`,
      );
      const shapeRep = writer.add(
        `IFCSHAPEREPRESENTATION(#${geomSubContext},'Body','SweptSolid',(#${solid}))`,
      );
      const prodShape = writer.add(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${shapeRep}))`);

      const fitGuid = createIfcGuid(`fitting:${fitting.id}`);
      let ifcEntityName = 'IFCDISTRIBUTIONFLOWELEMENT';
      if (fitting.domain === 'plumbing' || fitting.domain === 'hydronic') {
        ifcEntityName = 'IFCPIPEFITTING';
      } else if (fitting.domain === 'hvac') {
        ifcEntityName = 'IFCDUCTFITTING';
      } else if (fitting.domain === 'electrical') {
        ifcEntityName = 'IFCCABLECARRIERFITTING';
      }

      const ifcFitting = writer.add(
        `${ifcEntityName}('${fitGuid}',#${ownerHistory},'${escapeStepString(fitting.name || fitting.id)}',$,'${fitting.fittingType}',#${localPlacement},#${prodShape},$)`,
      );

      mepElementsToIfcId.set(fitting.id, ifcFitting);
      const elementsList =
        storeyElementsMap.get(fitting.levelId) || storeyElementsMap.get(defaultStoreyId);
      if (elementsList) {
        elementsList.push(ifcFitting);
      }
    }
  }

  // -------------------------------------------------------------------------
  // 5. Équipements Techniques (IfcDistributionFlowElement)
  // -------------------------------------------------------------------------
  const mepEquipments: Record<string, MepEquipment> | undefined =
    state.mepEquipments ?? (state as unknown as { equipments?: Record<string, MepEquipment> }).equipments;
  if (mepEquipments) {
    for (const eq of Object.values(mepEquipments)) {
      const storeyInfo = storeyMap.get(eq.levelId) || defaultStorey;
      if (!storeyInfo) continue;

      const storeyElev = state.levels[eq.levelId]?.elevation ?? 0;
      const relX = eq.position.x;
      const relY = eq.position.y;
      const relZ = eq.position.z - storeyElev;

      const rot = eq.rotation ?? 0;
      const cosR = Math.cos(rot);
      const sinR = Math.sin(rot);

      const ptEq = writer.add(
        `IFCCARTESIANPOINT((${relX.toFixed(2)},${relY.toFixed(2)},${relZ.toFixed(2)}))`,
      );
      const dirUx = writer.add(
        `IFCDIRECTION((${cosR.toFixed(6)},${sinR.toFixed(6)},0.))`,
      );
      const placement3D = writer.add(
        `IFCAXIS2PLACEMENT3D(#${ptEq},#${dirZ},#${dirUx})`,
      );
      const localPlacement = writer.add(
        `IFCLOCALPLACEMENT(#${storeyInfo.placementId},#${placement3D})`,
      );

      const w = eq.width ?? 600;
      const d = eq.depth ?? 600;
      const h = eq.height ?? 800;

      const profile = writer.add(
        `IFCRECTANGLEPROFILEDEF(.AREA.,$,$,${w.toFixed(2)},${d.toFixed(2)})`,
      );
      const solid = writer.add(
        `IFCEXTRUDEDAREASOLID(#${profile},#${placementWorld3D},#${dirZ},${h.toFixed(2)})`,
      );
      const shapeRep = writer.add(
        `IFCSHAPEREPRESENTATION(#${geomSubContext},'Body','SweptSolid',(#${solid}))`,
      );
      const prodShape = writer.add(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${shapeRep}))`);

      const eqGuid = createIfcGuid(`equipment:${eq.id}`);
      const ifcEquipment = writer.add(
        `IFCDISTRIBUTIONFLOWELEMENT('${eqGuid}',#${ownerHistory},'${escapeStepString(eq.name || eq.id)}',$,'${eq.family}',#${localPlacement},#${prodShape},$)`,
      );

      mepElementsToIfcId.set(eq.id, ifcEquipment);
      const elementsList =
        storeyElementsMap.get(eq.levelId) || storeyElementsMap.get(defaultStoreyId);
      if (elementsList) {
        elementsList.push(ifcEquipment);
      }
    }
  }

  // -------------------------------------------------------------------------
  // 6. Systèmes MEP (IfcDistributionSystem & IfcRelAssignsToGroup)
  // -------------------------------------------------------------------------
  const systems = state.mepSystems ?? (state as unknown as { systems?: Record<string, import('../mep/types.js').MepSystem> }).systems;
  if (systems) {
    for (const sys of Object.values(systems)) {
      const sysGuid = createIfcGuid(`system:${sys.id}`);
      const ifcSystem = writer.add(
        `IFCDISTRIBUTIONSYSTEM('${sysGuid}',#${ownerHistory},'${escapeStepString(sys.name)}',$,'${sys.systemType}',$,$,$,.NOTDEFINED.)`,
      );

      // Collecter les éléments membres qui ont été exportés
      const memberIfcIds: number[] = [];
      for (const elemId of sys.elementIds ?? []) {
        const ifcId = mepElementsToIfcId.get(elemId);
        if (ifcId !== undefined) {
          memberIfcIds.push(ifcId);
        }
      }

      if (memberIfcIds.length > 0) {
        const relGuid = createIfcGuid(`rel-group:${sys.id}`);
        writer.add(
          `IFCRELASSIGNSTOGROUP('${relGuid}',#${ownerHistory},'${escapeStepString(sys.name)} Group',$,(${memberIfcIds.map((id) => `#${id}`).join(',')}),$,#${ifcSystem})`,
        );
      }
    }
  }
}
