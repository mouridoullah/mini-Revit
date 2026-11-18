export interface EffectiveDimensions {
  readonly width: number;
  readonly depth: number;
  readonly height: number;
}

/**
 * Calcule les dimensions effectives d'un composant en résolvant les surcharges dimensionnelles
 * d'instance par rapport aux dimensions nominales déclarées sur le type (Phase 8.4).
 */
export function getComponentEffectiveDimensions(
  comp: {
    readonly widthOverride?: number | undefined;
    readonly depthOverride?: number | undefined;
    readonly heightOverride?: number | undefined;
  },
  compType: {
    readonly width: number;
    readonly depth: number;
    readonly height: number;
  },
): EffectiveDimensions {
  return {
    width: comp.widthOverride ?? compType.width,
    depth: comp.depthOverride ?? compType.depth,
    height: comp.heightOverride ?? compType.height,
  };
}
