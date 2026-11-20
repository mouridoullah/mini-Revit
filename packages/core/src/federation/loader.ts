/**
 * Chargeur et parseur IFC en lecture seule basé sur WebIFC.
 * Conforme à ADR-001 (Zéro mutation de BimState), ADR-003 (Repère millimètres Z-up),
 * et discipline mémoire WASM stricte (try / finally avec CloseModel).
 */

import * as WebIFC from 'web-ifc';
import {
  type FederatedModel,
  type FederatedEntity,
  type FederatedMeshBuffer,
  type FederatedModelOptions,
  type FederatedPropertySet,
} from './types.js';
import { detectIfcUnits } from './units.js';
import { transformVertexToMiniBim, transformNormalToMiniBim } from './coordinates.js';
import { type AABB3D } from '../clash/types.js';

let ifcApiSingleton: WebIFC.IfcAPI | null = null;

/**
 * Initialise l'instance singleton WebIFC de manière idempotente.
 */
export async function getInitializedIfcApi(wasmPath?: string): Promise<WebIFC.IfcAPI> {
  if (ifcApiSingleton) {
    return ifcApiSingleton;
  }

  const api = new WebIFC.IfcAPI();
  if (wasmPath) {
    api.SetWasmPath(wasmPath);
  }
  await api.Init();
  ifcApiSingleton = api;
  return api;
}

/**
 * Charge et extrait une maquette IFC externe de manière pure et déterministe.
 *
 * @param buffer Contenu binaire du fichier IFC.
 * @param options Paramètres d'extraction et métadonnées.
 */
export async function loadFederatedIfc(
  buffer: Uint8Array | ArrayBuffer,
  options: FederatedModelOptions = {},
): Promise<FederatedModel> {
  const modelIdStr = options.modelId ?? `ifc_fed_${Date.now()}`;
  const modelName = options.name ?? 'Modèle de Référence IFC';
  const api = await getInitializedIfcApi(options.wasmPath);

  const uint8Data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const openModelId = api.OpenModel(uint8Data);

  try {
    // 1. Détection du schéma IFC et des unités de longueur
    const schema = api.GetModelSchema(openModelId) || 'IFC4';
    const units = detectIfcUnits(api, openModelId);

    // 2. Extraction des métadonnées et PropertySets
    const propertySetsByEntity = options.extractProperties !== false
      ? extractAllPropertySets(api, openModelId)
      : new Map<number, FederatedPropertySet[]>();

    const entities: Record<number, FederatedEntity> = {};
    const meshes: FederatedMeshBuffer[] = [];

    let globalMinX = Infinity;
    let globalMinY = Infinity;
    let globalMinZ = Infinity;
    let globalMaxX = -Infinity;
    let globalMaxY = -Infinity;
    let globalMaxZ = -Infinity;

    // 3. Extraction géométrique via StreamAllMeshes (applyLinearScalingFactor = false)
    api.StreamAllMeshes(
      openModelId,
      (flatMesh) => {
        const expressId = flatMesh.expressID;
        const geomCount = flatMesh.geometries.size();
        if (geomCount === 0) return;

        let totalVerts = 0;
        let totalIndices = 0;

        for (let g = 0; g < geomCount; g++) {
          const placedGeom = flatMesh.geometries.get(g);
          const geom = api.GetGeometry(openModelId, placedGeom.geometryExpressID);
          totalVerts += geom.GetVertexDataSize() / 6;
          totalIndices += geom.GetIndexDataSize();
        }

        if (totalVerts === 0) return;

        const positions = new Float32Array(totalVerts * 3);
        const normals = new Float32Array(totalVerts * 3);
        const indices = new Uint32Array(totalIndices);

        let entityMinX = Infinity;
        let entityMinY = Infinity;
        let entityMinZ = Infinity;
        let entityMaxX = -Infinity;
        let entityMaxY = -Infinity;
        let entityMaxZ = -Infinity;

        let vertOffset = 0;
        let indexOffset = 0;
        let firstColor = { r: 0.8, g: 0.8, b: 0.8, a: 1.0 };

        for (let g = 0; g < geomCount; g++) {
          const placedGeom = flatMesh.geometries.get(g);
          const geom = api.GetGeometry(openModelId, placedGeom.geometryExpressID);

          const vertData = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
          const indexData = api.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());
          const matrix = placedGeom.flatTransformation;

          if (g === 0 && placedGeom.color) {
            firstColor = {
              r: placedGeom.color.x ?? 0.8,
              g: placedGeom.color.y ?? 0.8,
              b: placedGeom.color.z ?? 0.8,
              a: placedGeom.color.w ?? 1.0,
            };
          }

          const baseVertexIndex = vertOffset;

          // Traitement des sommets (stride 6 : lx, ly, lz, lnx, lny, lnz)
          for (let v = 0; v < vertData.length; v += 6) {
            const lx = vertData[v] ?? 0;
            const ly = vertData[v + 1] ?? 0;
            const lz = vertData[v + 2] ?? 0;
            const lnx = vertData[v + 3] ?? 0;
            const lny = vertData[v + 4] ?? 0;
            const lnz = vertData[v + 5] ?? 0;

            const pos = transformVertexToMiniBim(lx, ly, lz, matrix, units.scaleToMm);
            const norm = transformNormalToMiniBim(lnx, lny, lnz, matrix);

            const pIdx = vertOffset * 3;
            positions[pIdx] = pos.x;
            positions[pIdx + 1] = pos.y;
            positions[pIdx + 2] = pos.z;

            normals[pIdx] = norm.x;
            normals[pIdx + 1] = norm.y;
            normals[pIdx + 2] = norm.z;

            if (pos.x < entityMinX) entityMinX = pos.x;
            if (pos.y < entityMinY) entityMinY = pos.y;
            if (pos.z < entityMinZ) entityMinZ = pos.z;
            if (pos.x > entityMaxX) entityMaxX = pos.x;
            if (pos.y > entityMaxY) entityMaxY = pos.y;
            if (pos.z > entityMaxZ) entityMaxZ = pos.z;

            vertOffset++;
          }

          // Traitement des indices
          for (let idx = 0; idx < indexData.length; idx++) {
            indices[indexOffset++] = baseVertexIndex + (indexData[idx] ?? 0);
          }
        }

        const entityAABB: AABB3D = {
          min: { x: entityMinX, y: entityMinY, z: entityMinZ },
          max: { x: entityMaxX, y: entityMaxY, z: entityMaxZ },
        };

        if (entityMinX < globalMinX) globalMinX = entityMinX;
        if (entityMinY < globalMinY) globalMinY = entityMinY;
        if (entityMinZ < globalMinZ) globalMinZ = entityMinZ;
        if (entityMaxX > globalMaxX) globalMaxX = entityMaxX;
        if (entityMaxY > globalMaxY) globalMaxY = entityMaxY;
        if (entityMaxZ > globalMaxZ) globalMaxZ = entityMaxZ;

        // Lecture des métadonnées de l'entité
        let lineInfo: { type?: number; GlobalId?: { value?: string }; Name?: { value?: string }; Description?: { value?: string } } | null = null;
        try {
          lineInfo = api.GetLine(openModelId, expressId) as unknown as {
            type?: number;
            GlobalId?: { value?: string };
            Name?: { value?: string };
            Description?: { value?: string };
          };
        } catch {
          // Si la ligne n'est pas lisible
        }

        const ifcType = (lineInfo?.type !== undefined ? api.GetNameFromTypeCode(lineInfo.type) : 'IfcProduct') || 'IfcProduct';
        const globalId = lineInfo?.GlobalId?.value;
        const name = lineInfo?.Name?.value;
        const description = lineInfo?.Description?.value;

        const entity: FederatedEntity = {
          expressId,
          globalId,
          ifcType,
          name,
          description,
          modelId: modelIdStr,
          aabb: entityAABB,
          propertySets: propertySetsByEntity.get(expressId),
        };

        entities[expressId] = entity;

        meshes.push({
          expressId,
          positions,
          normals,
          indices,
          color: firstColor,
        });
      },
      false, // applyLinearScalingFactor = false pour préserver les coordonnées exactes du fichier
    );

    const globalAABB: AABB3D = {
      min: {
        x: globalMinX === Infinity ? 0 : globalMinX,
        y: globalMinY === Infinity ? 0 : globalMinY,
        z: globalMinZ === Infinity ? 0 : globalMinZ,
      },
      max: {
        x: globalMaxX === -Infinity ? 0 : globalMaxX,
        y: globalMaxY === -Infinity ? 0 : globalMaxY,
        z: globalMaxZ === -Infinity ? 0 : globalMaxZ,
      },
    };

    return {
      id: modelIdStr,
      name: modelName,
      schema,
      units,
      globalAABB,
      entities,
      meshes,
      entityCount: Object.keys(entities).length,
    };
  } finally {
    // DISCIPLINE MÉMOIRE STRICTE : fermeture garantie du modèle WASM
    api.CloseModel(openModelId);
  }
}

/**
 * Extrait l'ensemble des PropertySets et Quantités associées aux entités du modèle.
 */
function extractAllPropertySets(api: WebIFC.IfcAPI, modelId: number): Map<number, FederatedPropertySet[]> {
  const result = new Map<number, FederatedPropertySet[]>();

  try {
    const relIds = api.GetLineIDsWithType(modelId, WebIFC.IFCRELDEFINESBYPROPERTIES);
    const count = relIds.size();

    for (let r = 0; r < count; r++) {
      const relId = relIds.get(r);
      const rel = api.GetLine(modelId, relId) as {
        RelatedObjects?: Array<{ value: number }>;
        RelatingPropertyDefinition?: { value: number };
      };

      if (!rel?.RelatedObjects || !rel.RelatingPropertyDefinition) continue;

      const psetLineId = rel.RelatingPropertyDefinition.value;
      const psetLine = api.GetLine(modelId, psetLineId) as {
        type?: number;
        Name?: { value?: string };
        HasProperties?: Array<{ value: number }>;
        Quantities?: Array<{ value: number }>;
      };

      if (!psetLine) continue;

      const psetName = psetLine.Name?.value ?? (psetLine.type ? api.GetNameFromTypeCode(psetLine.type) : 'PropertySet');
      const props: Record<string, string | number | boolean | null> = {};

      // Extraction des propriétés simples (IfcPropertySingleValue)
      if (Array.isArray(psetLine.HasProperties)) {
        for (const propHandle of psetLine.HasProperties) {
          try {
            const prop = api.GetLine(modelId, propHandle.value) as {
              Name?: { value?: string };
              NominalValue?: { value?: string | number | boolean; _representationValue?: string | number | boolean };
            };
            if (prop?.Name?.value) {
              const val = prop.NominalValue?._representationValue ?? prop.NominalValue?.value ?? null;
              props[prop.Name.value] = val;
            }
          } catch {
            // Continuer
          }
        }
      }

      // Extraction des quantités (IfcQuantityLength, IfcQuantityArea, etc.)
      if (Array.isArray(psetLine.Quantities)) {
        for (const qHandle of psetLine.Quantities) {
          try {
            const q = api.GetLine(modelId, qHandle.value) as {
              Name?: { value?: string };
              LengthValue?: { value?: string | number | boolean; _representationValue?: string | number | boolean };
              AreaValue?: { value?: string | number | boolean; _representationValue?: string | number | boolean };
              VolumeValue?: { value?: string | number | boolean; _representationValue?: string | number | boolean };
              CountValue?: { value?: string | number | boolean; _representationValue?: string | number | boolean };
            };
            if (q?.Name?.value) {
              const val =
                q.LengthValue?._representationValue ?? q.LengthValue?.value ??
                q.AreaValue?._representationValue ?? q.AreaValue?.value ??
                q.VolumeValue?._representationValue ?? q.VolumeValue?.value ??
                q.CountValue?._representationValue ?? q.CountValue?.value ?? null;
              props[q.Name.value] = val;
            }
          } catch {
            // Continuer
          }
        }
      }

      // Association à chaque entité cible
      for (const objHandle of rel.RelatedObjects) {
        const entityId = objHandle.value;
        let list = result.get(entityId);
        if (!list) {
          list = [];
          result.set(entityId, list);
        }
        list.push({ name: psetName, properties: props });
      }
    }
  } catch {
    // Si la recherche de relations échoue
  }

  return result;
}
