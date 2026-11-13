import * as THREE from 'three';
import { type RawMeshData } from '@mini-bim/geometry';

/**
 * Adaptateur de géométrie reliant le noyau géométrique pur @mini-bim/geometry
 * et le moteur de rendu Three.js.
 */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class MeshAdapter {
  /**
   * Convertit un conteneur RawMeshData en THREE.BufferGeometry.
   *
   * RÈGLES CRITIQUES :
   * 1. Zéro recalcul de normales : computeVertexNormals() n'est JAMAIS appelé,
   *    les normales franches unitaires sont injectées directement depuis le buffer.
   * 2. Zéro recalcul de boîte englobante : boundingBox est directement initialisée
   *    à partir du BoundingBox3D pré-calculé en amont.
   * 3. Préservation des métadonnées BIM dans userData (elementId, role).
   */
  public static fromRawMeshData(data: RawMeshData): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();

    // 1. Injection directe des buffers de sommets et de normales unitaires
    geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));

    // 2. Coordonnées de texture UV optionnelles
    if (data.uvs) {
      geometry.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2));
    }

    // 3. Indexation des triangles CCW
    geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));

    // 4. Bounding box explicite sans recalcul GPU/CPU lourd
    geometry.boundingBox = new THREE.Box3(
      new THREE.Vector3(data.boundingBox.min.x, data.boundingBox.min.y, data.boundingBox.min.z),
      new THREE.Vector3(data.boundingBox.max.x, data.boundingBox.max.y, data.boundingBox.max.z),
    );

    // 5. Attachement des métadonnées architecturales
    geometry.userData = {
      elementId: data.elementId,
      role: data.role,
    };

    return geometry;
  }
}
