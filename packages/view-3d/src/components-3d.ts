import { vec2, type Vec2, type WallPiece, buildWallMeshAggregated, type RawMeshData } from '@mini-bim/geometry';

/**
 * Paramètres d'instance d'un composant pour la génération du maillage 3D.
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

/**
 * Paramètres de type / famille d'un composant pour la génération du maillage 3D.
 */
export interface ComponentTypeMeshInput {
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly subType: string;
  readonly defaultElevationOffset?: number | undefined;
}

/**
 * Crée un maillage 3D brut (RawMeshData) paramétrique et étanche pour un composant architectural ou un meuble.
 *
 * Règles :
 * - Géométrie fermée et étanche (Euler V - E + F = 2 sur chaque solide composant).
 * - Normales unitaires franches orientées vers l'extérieur.
 * - Enroulement CCW strict vu de l'extérieur.
 * - Positionnement spatial exact : rotation en lacet autour de Z, altitude zBase = levelElevation + elevationOffset.
 */
export function createComponentMesh(
  comp: ComponentMeshInput,
  compType: ComponentTypeMeshInput,
  levelElevation: number = 0,
): RawMeshData | null {
  const width = comp.widthOverride ?? compType.width;
  const depth = comp.depthOverride ?? compType.depth;
  const height = comp.heightOverride ?? compType.height;

  if (width <= 0 || depth <= 0 || height <= 0) {
    return null;
  }

  const elevationOffset = comp.placement.elevationOffset ?? compType.defaultElevationOffset ?? 0;
  const zBase = levelElevation + elevationOffset;
  const rotation = comp.placement.rotation ?? 0;

  const cx = comp.placement.x;
  const cy = comp.placement.y;

  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);

  // Vecteurs directeurs locaux exprimés dans le repère mondial
  const ux = cos;
  const uy = sin;
  const vx = -sin;
  const vy = cos;

  const halfW = width / 2;
  const halfD = depth / 2;

  // Fonction utilitaire créant une boîte orientée dans le repère local du composant
  const makeOrientedBox = (
    boxId: string,
    localMinX: number,
    localMinY: number,
    localMaxX: number,
    localMaxY: number,
    relZ0: number,
    relZ1: number,
  ): WallPiece => {
    // 4 sommets CCW vus du dessus
    const p0: Vec2 = vec2(
      cx + ux * localMinX + vx * localMinY,
      cy + uy * localMinX + vy * localMinY,
    );
    const p1: Vec2 = vec2(
      cx + ux * localMaxX + vx * localMinY,
      cy + uy * localMaxX + vy * localMinY,
    );
    const p2: Vec2 = vec2(
      cx + ux * localMaxX + vx * localMaxY,
      cy + uy * localMaxX + vy * localMaxY,
    );
    const p3: Vec2 = vec2(
      cx + ux * localMinX + vx * localMaxY,
      cy + uy * localMinX + vy * localMaxY,
    );

    const boxW = Math.max(1, localMaxX - localMinX);
    const boxD = Math.max(1, localMaxY - localMinY);

    return {
      id: boxId,
      wallId: comp.id,
      poly2D: [p0, p1, p2, p3],
      z0: zBase + relZ0,
      z1: zBase + relZ1,
      role: 'full',
      area2D: boxW * boxD,
      uInterval: [0, boxW],
    };
  };

  const pieces: WallPiece[] = [];

  switch (compType.subType) {
    // -------------------------------------------------------------------------
    // 1. SANITAIRES
    // -------------------------------------------------------------------------
    case 'toilet': {
      // Réservoir arrière
      const tankD = Math.min(180, depth * 0.35);
      pieces.push(
        makeOrientedBox(
          `${comp.id}_tank`,
          -halfW,
          halfD - tankD,
          halfW,
          halfD,
          0,
          height,
        ),
      );
      // Cuvette avant
      pieces.push(
        makeOrientedBox(
          `${comp.id}_bowl`,
          -halfW * 0.85,
          -halfD,
          halfW * 0.85,
          halfD - tankD,
          0,
          height * 0.85,
        ),
      );
      break;
    }

    case 'sink': {
      // Meuble vasque caisson bas
      pieces.push(
        makeOrientedBox(
          `${comp.id}_base`,
          -halfW,
          -halfD,
          halfW,
          halfD,
          0,
          height - 50,
        ),
      );
      // Plan vasque supérieur
      pieces.push(
        makeOrientedBox(
          `${comp.id}_top`,
          -halfW * 0.95,
          -halfD * 0.95,
          halfW * 0.95,
          halfD * 0.95,
          height - 50,
          height,
        ),
      );
      break;
    }

    case 'shower': {
      // Receveur plat
      pieces.push(
        makeOrientedBox(
          `${comp.id}_tray`,
          -halfW,
          -halfD,
          halfW,
          halfD,
          0,
          height,
        ),
      );
      break;
    }

    case 'bath': {
      // Baignoire pleine / tablier
      pieces.push(
        makeOrientedBox(
          `${comp.id}_tub`,
          -halfW,
          -halfD,
          halfW,
          halfD,
          0,
          height,
        ),
      );
      break;
    }

    // -------------------------------------------------------------------------
    // 2. CUISINE
    // -------------------------------------------------------------------------
    case 'kitchen_base':
    case 'sink_unit': {
      // Caisson meuble bas
      pieces.push(
        makeOrientedBox(
          `${comp.id}_base`,
          -halfW,
          -halfD,
          halfW,
          halfD,
          0,
          height - 40,
        ),
      );
      // Plan de travail
      pieces.push(
        makeOrientedBox(
          `${comp.id}_countertop`,
          -halfW - 10,
          -halfD - 20,
          halfW + 10,
          halfD,
          height - 40,
          height,
        ),
      );
      break;
    }

    case 'kitchen_wall':
    case 'appliance': {
      // Meuble haut ou électroménager
      pieces.push(
        makeOrientedBox(
          `${comp.id}_body`,
          -halfW,
          -halfD,
          halfW,
          halfD,
          0,
          height,
        ),
      );
      break;
    }

    // -------------------------------------------------------------------------
    // 3. MOBILIER
    // -------------------------------------------------------------------------
    case 'bed': {
      // Sommier / matelas
      pieces.push(
        makeOrientedBox(
          `${comp.id}_mattress`,
          -halfW,
          -halfD,
          halfW,
          halfD,
          0,
          height * 0.7,
        ),
      );
      // Tête de lit arrière
      const headD = Math.min(80, depth * 0.05);
      pieces.push(
        makeOrientedBox(
          `${comp.id}_headboard`,
          -halfW,
          halfD - headD,
          halfW,
          halfD,
          0,
          height,
        ),
      );
      break;
    }

    case 'table': {
      // Plateau de table
      pieces.push(
        makeOrientedBox(
          `${comp.id}_top`,
          -halfW,
          -halfD,
          halfW,
          halfD,
          height - 40,
          height,
        ),
      );
      // 4 pieds
      const legSize = Math.min(60, width * 0.08);
      const legHeight = height - 40;
      // Pied avant-gauche
      pieces.push(
        makeOrientedBox(
          `${comp.id}_leg_fl`,
          -halfW + 20,
          -halfD + 20,
          -halfW + 20 + legSize,
          -halfD + 20 + legSize,
          0,
          legHeight,
        ),
      );
      // Pied avant-droit
      pieces.push(
        makeOrientedBox(
          `${comp.id}_leg_fr`,
          halfW - 20 - legSize,
          -halfD + 20,
          halfW - 20,
          -halfD + 20 + legSize,
          0,
          legHeight,
        ),
      );
      // Pied arrière-gauche
      pieces.push(
        makeOrientedBox(
          `${comp.id}_leg_bl`,
          -halfW + 20,
          halfD - 20 - legSize,
          -halfW + 20 + legSize,
          halfD - 20,
          0,
          legHeight,
        ),
      );
      // Pied arrière-droit
      pieces.push(
        makeOrientedBox(
          `${comp.id}_leg_br`,
          halfW - 20 - legSize,
          halfD - 20 - legSize,
          halfW - 20,
          halfD - 20,
          0,
          legHeight,
        ),
      );
      break;
    }

    case 'chair': {
      // Assise
      const seatZ = height * 0.52;
      pieces.push(
        makeOrientedBox(
          `${comp.id}_seat`,
          -halfW,
          -halfD,
          halfW,
          halfD,
          seatZ - 30,
          seatZ,
        ),
      );
      // Dossier
      pieces.push(
        makeOrientedBox(
          `${comp.id}_back`,
          -halfW,
          halfD - 40,
          halfW,
          halfD,
          seatZ,
          height,
        ),
      );
      // 4 pieds
      const legSize = 35;
      pieces.push(
        makeOrientedBox(
          `${comp.id}_leg1`,
          -halfW + 10,
          -halfD + 10,
          -halfW + 10 + legSize,
          -halfD + 10 + legSize,
          0,
          seatZ - 30,
        ),
      );
      pieces.push(
        makeOrientedBox(
          `${comp.id}_leg2`,
          halfW - 10 - legSize,
          -halfD + 10,
          halfW - 10,
          -halfD + 10 + legSize,
          0,
          seatZ - 30,
        ),
      );
      pieces.push(
        makeOrientedBox(
          `${comp.id}_leg3`,
          -halfW + 10,
          halfD - 10 - legSize,
          -halfW + 10 + legSize,
          halfD - 10,
          0,
          seatZ - 30,
        ),
      );
      pieces.push(
        makeOrientedBox(
          `${comp.id}_leg4`,
          halfW - 10 - legSize,
          halfD - 10 - legSize,
          halfW - 10,
          halfD - 10,
          0,
          seatZ - 30,
        ),
      );
      break;
    }

    case 'sofa': {
      // Assise
      const seatH = height * 0.5;
      pieces.push(
        makeOrientedBox(
          `${comp.id}_seat`,
          -halfW,
          -halfD,
          halfW,
          halfD,
          0,
          seatH,
        ),
      );
      // Dossier
      const backD = Math.min(180, depth * 0.25);
      pieces.push(
        makeOrientedBox(
          `${comp.id}_back`,
          -halfW,
          halfD - backD,
          halfW,
          halfD,
          seatH,
          height,
        ),
      );
      // Accoudoirs
      const armW = Math.min(160, width * 0.12);
      pieces.push(
        makeOrientedBox(
          `${comp.id}_arm_l`,
          -halfW,
          -halfD,
          -halfW + armW,
          halfD - backD,
          seatH,
          height * 0.78,
        ),
      );
      pieces.push(
        makeOrientedBox(
          `${comp.id}_arm_r`,
          halfW - armW,
          -halfD,
          halfW,
          halfD - backD,
          seatH,
          height * 0.78,
        ),
      );
      break;
    }

    // Par défaut (armoire, baie coulissante, meuble générique) : boîte pleine
    default: {
      pieces.push(
        makeOrientedBox(
          `${comp.id}_box`,
          -halfW,
          -halfD,
          halfW,
          halfD,
          0,
          height,
        ),
      );
      break;
    }
  }

  // Fusion de toutes les pièces en un seul maillage continu optimisé
  const aggregated = buildWallMeshAggregated({ id: comp.id }, pieces);

  return {
    ...aggregated,
    elementId: comp.id,
    role: 'full',
  };
}
