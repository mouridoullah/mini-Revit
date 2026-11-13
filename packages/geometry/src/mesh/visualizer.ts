import { type RawMeshData } from './types.js';
import { type WallPiece } from '../openings/types.js';

/**
 * Exporte un ou plusieurs maillages RawMeshData au format standard Wavefront OBJ.
 *
 * Directement ouvrable et inspectable dans Blender, MeshLab, Rhino, ou visionneuses 3D web.
 */
export function exportMeshToObj(meshes: RawMeshData | readonly RawMeshData[]): string {
  const meshList = Array.isArray(meshes) ? meshes : [meshes];
  const lines: string[] = [
    '# Mini-BIM Geometric Engine - 3D Mesh OBJ Export',
    '# Units: millimeters (mm), Z-up',
    '',
  ];

  let vertexOffset = 1; // 1-based indexing in OBJ

  for (let mIdx = 0; mIdx < meshList.length; mIdx++) {
    const mesh = meshList[mIdx];
    if (!mesh || mesh.positions.length === 0) continue;

    lines.push(`o ${mesh.elementId}_${mesh.role}`);
    lines.push(`g ${mesh.role}`);

    const vertexCount = mesh.positions.length / 3;

    // 1. Sommets (v x y z)
    for (let i = 0; i < vertexCount; i++) {
      const x = mesh.positions[i * 3];
      const y = mesh.positions[i * 3 + 1];
      const z = mesh.positions[i * 3 + 2];
      lines.push(`v ${x?.toFixed(4)} ${y?.toFixed(4)} ${z?.toFixed(4)}`);
    }

    // 2. Normales (vn nx ny nz)
    for (let i = 0; i < vertexCount; i++) {
      const nx = mesh.normals[i * 3];
      const ny = mesh.normals[i * 3 + 1];
      const nz = mesh.normals[i * 3 + 2];
      lines.push(`vn ${nx?.toFixed(4)} ${ny?.toFixed(4)} ${nz?.toFixed(4)}`);
    }

    // 3. Coordonnées de texture UV (vt u v) si présentes
    const hasUVs = mesh.uvs && mesh.uvs.length === vertexCount * 2;
    if (hasUVs && mesh.uvs) {
      for (let i = 0; i < vertexCount; i++) {
        const u = mesh.uvs[i * 2];
        const v = mesh.uvs[i * 2 + 1];
        lines.push(`vt ${u?.toFixed(4)} ${v?.toFixed(4)}`);
      }
    }

    // 4. Faces triangulaires (f v1/vt1/vn1 v2/vt2/vn2 v3/vt3/vn3)
    const triangleCount = mesh.indices.length / 3;
    for (let t = 0; t < triangleCount; t++) {
      const i0 = mesh.indices[t * 3];
      const i1 = mesh.indices[t * 3 + 1];
      const i2 = mesh.indices[t * 3 + 2];

      if (i0 !== undefined && i1 !== undefined && i2 !== undefined) {
        const idx0 = vertexOffset + i0;
        const idx1 = vertexOffset + i1;
        const idx2 = vertexOffset + i2;

        if (hasUVs) {
          lines.push(`f ${idx0}/${idx0}/${idx0} ${idx1}/${idx1}/${idx1} ${idx2}/${idx2}/${idx2}`);
        } else {
          lines.push(`f ${idx0}//${idx0} ${idx1}//${idx1} ${idx2}//${idx2}`);
        }
      }
    }

    lines.push('');
    vertexOffset += vertexCount;
  }

  return lines.join('\n');
}

/**
 * Exporte une vue vectorielle SVG montrant la triangulation interne de la face supérieure du maillage.
 */
export function exportMeshTriangulationSvg(
  piece: WallPiece,
  mesh: RawMeshData,
  options?: { width?: number; height?: number },
): string {
  const width = options?.width ?? 800;
  const height = options?.height ?? 300;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const v of piece.poly2D) {
    if (v.x < minX) minX = v.x;
    if (v.x > maxX) maxX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.y > maxY) maxY = v.y;
  }

  const margin = 50;
  const boundW = maxX - minX || 1;
  const boundH = maxY - minY || 1;
  const scale = Math.min((width - 2 * margin) / boundW, (height - 2 * margin) / boundH);

  const tx = (x: number) => margin + (x - minX) * scale;
  const ty = (y: number) => height - (margin + (y - minY) * scale);

  const polyPts = piece.poly2D.map((p) => `${tx(p.x).toFixed(1)},${ty(p.y).toFixed(1)}`).join(' ');

  // Tracer les arêtes des triangles
  const triangleLines: string[] = [];
  const triangleCount = mesh.indices.length / 3;

  for (let t = 0; t < triangleCount; t++) {
    const i0 = mesh.indices[t * 3];
    const i1 = mesh.indices[t * 3 + 1];
    const i2 = mesh.indices[t * 3 + 2];

    if (i0 !== undefined && i1 !== undefined && i2 !== undefined) {
      const z0 = mesh.positions[i0 * 3 + 2];
      const z1 = mesh.positions[i1 * 3 + 2];
      const z2 = mesh.positions[i2 * 3 + 2];

      // Ne tracer que les triangles de la face supérieure (Z = piece.z1)
      if (
        Math.abs((z0 ?? 0) - piece.z1) < 1e-3 &&
        Math.abs((z1 ?? 0) - piece.z1) < 1e-3 &&
        Math.abs((z2 ?? 0) - piece.z1) < 1e-3
      ) {
        const x0 = tx(mesh.positions[i0 * 3] ?? 0);
        const y0 = ty(mesh.positions[i0 * 3 + 1] ?? 0);
        const x1 = tx(mesh.positions[i1 * 3] ?? 0);
        const y1 = ty(mesh.positions[i1 * 3 + 1] ?? 0);
        const x2 = tx(mesh.positions[i2 * 3] ?? 0);
        const y2 = ty(mesh.positions[i2 * 3 + 1] ?? 0);

        triangleLines.push(
          `<polygon points="${x0.toFixed(1)},${y0.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}" fill="#e2e8f0" stroke="#3b82f6" stroke-width="1.5" stroke-dasharray="4,4" opacity="0.8" />`,
        );
      }
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%">
  <rect width="100%" height="100%" fill="#ffffff" />
  <g>
    <!-- Polygone de contour -->
    <polygon points="${polyPts}" fill="none" stroke="#1e293b" stroke-width="3" />
    <!-- Triangulation interne -->
    ${triangleLines.join('\n    ')}
  </g>
  <text x="20" y="30" font-family="sans-serif" font-size="14" font-weight="bold" fill="#0f172a">
    Triangulation 2.5D : ${piece.id} (${piece.role}) - Z = ${piece.z1} mm
  </text>
</svg>`;
}
