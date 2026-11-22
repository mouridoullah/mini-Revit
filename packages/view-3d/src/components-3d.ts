import { vec2, type Vec2, type WallPiece, buildWallMeshAggregated, type RawMeshData } from '@tabax/geometry';

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
      // Meuble vasque caisson bas (s'étend avec width et depth)
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
      // Sous-élément invariant : mitigeur / robinetterie aux dimensions fixes (40x40x120 mm)
      pieces.push(
        makeOrientedBox(
          `${comp.id}_faucet`,
          -20,
          halfD * 0.7 - 20,
          20,
          halfD * 0.7 + 20,
          height,
          height + 120,
        ),
      );
      // Sous-élément invariant : bonde centrale fixe (30x30x10 mm)
      pieces.push(
        makeOrientedBox(
          `${comp.id}_drain`,
          -15,
          -15,
          15,
          15,
          height - 10,
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
      // Baignoire paramétrique à rebord fixe de 80 mm et cuve expansible
      const rim = 80;
      if (width > 2 * rim && depth > 2 * rim) {
        // Rebord avant
        pieces.push(
          makeOrientedBox(
            `${comp.id}_rim_front`,
            -halfW,
            -halfD,
            halfW,
            -halfD + rim,
            0,
            height,
          ),
        );
        // Rebord arrière
        pieces.push(
          makeOrientedBox(
            `${comp.id}_rim_back`,
            -halfW,
            halfD - rim,
            halfW,
            halfD,
            0,
            height,
          ),
        );
        // Rebord gauche
        pieces.push(
          makeOrientedBox(
            `${comp.id}_rim_left`,
            -halfW,
            -halfD + rim,
            -halfW + rim,
            halfD - rim,
            0,
            height,
          ),
        );
        // Rebord droit
        pieces.push(
          makeOrientedBox(
            `${comp.id}_rim_right`,
            halfW - rim,
            -halfD + rim,
            halfW,
            halfD - rim,
            0,
            height,
          ),
        );
        // Fond de cuve
        pieces.push(
          makeOrientedBox(
            `${comp.id}_cavity_bottom`,
            -halfW + rim,
            -halfD + rim,
            halfW - rim,
            halfD - rim,
            0,
            60,
          ),
        );
      } else {
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
      }
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
      // 4 pieds invariants aux dimensions fixes strictes de 50 x 50 mm
      const legSize = 50;
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

    // -------------------------------------------------------------------------
    // 4. MENUISERIES VITRÉES PARAMÉTRIQUES NON-DÉFORMANTES (Phase 8.5)
    // -------------------------------------------------------------------------
    case 'sliding_door': {
      // Profils de dormant invariants (largeur 50 mm, profondeur 70 mm)
      const frameW = 50;
      const frameD = Math.min(depth, 70);
      const halfFD = frameD / 2;

      // Montant gauche fixe
      pieces.push(
        makeOrientedBox(
          `${comp.id}_jamb_l`,
          -halfW,
          -halfFD,
          -halfW + frameW,
          halfFD,
          0,
          height,
        ),
      );
      // Montant droit fixe
      pieces.push(
        makeOrientedBox(
          `${comp.id}_jamb_r`,
          halfW - frameW,
          -halfFD,
          halfW,
          halfFD,
          0,
          height,
        ),
      );
      // Traverse haute fixe
      pieces.push(
        makeOrientedBox(
          `${comp.id}_head`,
          -halfW + frameW,
          -halfFD,
          halfW - frameW,
          halfFD,
          height - frameW,
          height,
        ),
      );
      // Seuil bas fixe
      pieces.push(
        makeOrientedBox(
          `${comp.id}_sill`,
          -halfW + frameW,
          -halfFD,
          halfW - frameW,
          halfFD,
          0,
          frameW,
        ),
      );

      // Panneaux vitrés qui s'étendent avec les dimensions effectives
      const glassH0 = frameW;
      const glassH1 = height - frameW;
      const glassW = (width - 2 * frameW) / 2 + 20; // Recouvrement central
      // Vantail vitré 1 (avant)
      pieces.push(
        makeOrientedBox(
          `${comp.id}_glass1`,
          -halfW + frameW,
          -halfFD + 8,
          -halfW + frameW + glassW,
          -halfFD + 20,
          glassH0,
          glassH1,
        ),
      );
      // Vantail vitré 2 (arrière)
      pieces.push(
        makeOrientedBox(
          `${comp.id}_glass2`,
          halfW - frameW - glassW,
          halfFD - 20,
          halfW - frameW,
          halfFD - 8,
          glassH0,
          glassH1,
        ),
      );
      break;
    }

    case 'french_window': {
      // Porte-fenêtre : cadre fixe et 2 vantaux vitrés
      const frameW = 50;
      const frameD = Math.min(depth, 70);
      const halfFD = frameD / 2;

      // Montant gauche fixe
      pieces.push(
        makeOrientedBox(
          `${comp.id}_jamb_l`,
          -halfW,
          -halfFD,
          -halfW + frameW,
          halfFD,
          0,
          height,
        ),
      );
      // Montant droit fixe
      pieces.push(
        makeOrientedBox(
          `${comp.id}_jamb_r`,
          halfW - frameW,
          -halfFD,
          halfW,
          halfFD,
          0,
          height,
        ),
      );
      // Traverse haute fixe
      pieces.push(
        makeOrientedBox(
          `${comp.id}_head`,
          -halfW + frameW,
          -halfFD,
          halfW - frameW,
          halfFD,
          height - frameW,
          height,
        ),
      );
      // Seuil bas fixe
      pieces.push(
        makeOrientedBox(
          `${comp.id}_sill`,
          -halfW + frameW,
          -halfFD,
          halfW - frameW,
          halfFD,
          0,
          frameW,
        ),
      );
      // Meneau central fixe
      pieces.push(
        makeOrientedBox(
          `${comp.id}_mullion`,
          -frameW / 2,
          -halfFD,
          frameW / 2,
          halfFD,
          frameW,
          height - frameW,
        ),
      );

      // Panneaux vitrés expansibles
      const glassH0 = frameW;
      const glassH1 = height - frameW;
      // Vitrage gauche
      pieces.push(
        makeOrientedBox(
          `${comp.id}_glass_l`,
          -halfW + frameW,
          -6,
          -frameW / 2,
          6,
          glassH0,
          glassH1,
        ),
      );
      // Vitrage droit
      pieces.push(
        makeOrientedBox(
          `${comp.id}_glass_r`,
          frameW / 2,
          -6,
          halfW - frameW,
          6,
          glassH0,
          glassH1,
        ),
      );
      break;
    }

    // Par défaut (armoire, meuble générique) : boîte pleine
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
