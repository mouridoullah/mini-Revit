/**
 * components/types — interfaces partagees par tous les sous-modules components
 *
 * Reprend exactement ComponentMeshInput et ComponentTypeMeshInput de components-3d.ts
 * pour que les sous-modules soient autonomes sans import circulaire.
 */

export interface ComponentMeshInput {
  readonly id: string;
  readonly placement: {
    readonly x: number;
    readonly y: number;
    readonly rotation?: number | undefined;
    readonly elevationOffset?: number | undefined;
  };
  readonly widthOverride?: number | undefined;
  readonly depthOverride?: number | undefined;
  readonly heightOverride?: number | undefined;
}

export interface ComponentTypeMeshInput {
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly subType: string;
  readonly defaultElevationOffset?: number | undefined;
}
