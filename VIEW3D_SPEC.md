# SPÉCIFICATION TECHNIQUE — PACKAGE `@mini-bim/view-3d`

## Moteur de Visualisation 3D Impératif Three.js pour Mini-BIM

**Version :** 0.1.0 (Phase 1.4)  
**Date :** 13 Novembre 2026  
**Auteur :** Lead Software Architect & Computational Geometry Engineer  
**Statut :** Spécifié, implémenté et certifié par tests automatisés

---

## 1. Principes Fondamentaux et Règle d'Or

Le package `@mini-bim/view-3d` constitue la couche de visualisation tridimensionnelle du moteur architectural Mini-BIM. Il est fondé sur quatre axiomes stricts :

1. **Indépendance Totale envers React et le DOM applicatif :**  
   `@mini-bim/view-3d` n'importe **aucun** composant ou hook React (`react`, `react-dom`). Il s'agit d'une couche impérative pure qui pilote Three.js. L'intégration dans l'interface utilisateur web (composant `<Viewport3D />`) est déléguée aux applications de niveau supérieur (`apps/web` en Phase 2+). Cette séparation permet d'utiliser le visualiseur dans des workers, des scripts Node headless (avec contextes mockés) ou d'autres frontaux.
2. **Consommation Neutre de Buffers Géométriques :**  
   Il dépend exclusivement de `@mini-bim/geometry` pour l'interface de données `RawMeshData`. Il ne recalculera jamais les normales de sommets ni les boîtes englobantes : il consomme directement les `Float32Array` et `Uint32Array` générés en amont.
3. **Rendu à la Demande (_Demand-Driven Rendering_) :**  
   Pour économiser drastiquement le CPU et le GPU, aucune boucle d'animation continue `requestAnimationFrame` (60 fps inconditionnel) n'est démarrée au repos. La scène est rendue uniquement lors des mutations de modèle (`addMesh`, `updateMesh`, `removeMesh`, `resize`) ou lors des manipulations interactives de caméra (`OrbitControls` `'change'`).
4. **Convention Altimétrique Z-up :**  
   Conformément aux normes industrielles BIM (Revit, Archicad, IFC ISO 16739), l'axe vertical d'élévation est l'axe $+Z$. Le plan horizontal du sol correspond au plan $XY$ ($Z = 0$). La grille `GridHelper` et la caméra perspective sont nativement alignées sur ce repère.

---

## 2. Architecture des Composants

```
┌────────────────────────────────────────────────────────┐
│                   @mini-bim/geometry                   │
│       Produit RawMeshData (positions, normales, uvs)   │
└───────────────────────────┬────────────────────────────┘
                            │ RawMeshData (Typed Arrays)
                            ▼
┌────────────────────────────────────────────────────────┐
│                   @mini-bim/view-3d                    │
│                                                        │
│   ┌───────────────────┐        ┌───────────────────┐   │
│   │    MeshAdapter    │───────▶│  BufferGeometry   │   │
│   └───────────────────┘        └─────────┬─────────┘   │
│                                          │             │
│   ┌───────────────────┐                  │             │
│   │  materials.ts     │──────────────────┤             │
│   │ (FrontSide PBR)   │                  ▼             │
│   └───────────────────┘             THREE.Mesh         │
│                                          │             │
│   ┌──────────────────────────────────────┴─────────┐   │
│   │                   Scene3D                      │   │
│   │ - WebGLRenderer (options canvas)               │   │
│   │ - PerspectiveCamera (Z-up)                     │   │
│   │ - OrbitControls (change -> render)             │   │
│   │ - GridHelper (plan XY z=0)                     │   │
│   │ - Éclairage ambiant + directionnel             │   │
│   └────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────┘
```

---

## 3. Spécification de l'API Publique

### 3.1 Interface `SceneOptions`

Options de configuration transmises lors de l'instanciation de `Scene3D` :

```typescript
export interface SceneOptions {
  /** Élément canvas HTML fourni par l'hôte. */
  readonly canvas: HTMLCanvasElement;

  /** Largeur initiale du viewport en pixels. */
  readonly width: number;

  /** Hauteur initiale du viewport en pixels. */
  readonly height: number;

  /** Couleur d'arrière-plan de la scène (défaut : 0xf4f3ef, beige architectural). */
  readonly background?: THREE.ColorRepresentation;

  /** Dimension de la grille de sol en mm (défaut : 20 000 mm = 20 m). */
  readonly gridSize?: number;

  /** Nombre de subdivisions de la grille (défaut : 20). */
  readonly gridDivisions?: number;

  /** Position initiale de la caméra en mm (défaut : { x: 8000, y: 8000, z: 8000 }). */
  readonly cameraPosition?: { readonly x: number; readonly y: number; readonly z: number };

  /** Point visé par la caméra et les contrôles (défaut : { x: 0, y: 0, z: 0 }). */
  readonly cameraTarget?: { readonly x: number; readonly y: number; readonly z: number };
}
```

### 3.2 Classe `MeshAdapter`

Transforme de façon déterministe les structures de bas niveau `RawMeshData` vers les objets de rendu Three.js.

```typescript
export class MeshAdapter {
  public static fromRawMeshData(data: RawMeshData): THREE.BufferGeometry;
}
```

#### Règles de conversion :

1. **Positions :** `new THREE.BufferAttribute(data.positions, 3)` (injecte directement le `Float32Array`).
2. **Normales :** `new THREE.BufferAttribute(data.normals, 3)` (normales franches unitaire, aucun lissage).
3. **Indices :** `geometry.setIndex(new THREE.BufferAttribute(data.indices, 1))` (`Uint32Array`).
4. **UVs (optionnels) :** Si `data.uvs` est renseigné, injecté sous `geometry.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2))`.
5. **BoundingBox :** Instanciée directement à partir de `data.boundingBox` (`min`, `max`) dans `geometry.boundingBox = new THREE.Box3(...)`.
6. **Métadonnées :** `geometry.userData = { elementId: data.elementId, role: data.role }`.
7. **Interdiction formelle :** `computeVertexNormals()` ne doit JAMAIS être invoqué, afin de préserver les normales franches strictes indispensables au rendu BIM sans bavure d'arêtes.

### 3.3 Matériau PBR Standard (`materials.ts`)

Conformément à l'ADR-017, le matériau par défaut utilise :

- `MeshStandardMaterial` PBR réaliste.
- Couleur neutre : `#c8c4bc` ($0\text{xc8c4bc}$, ton calcaire/béton clair).
- `roughness` : $0.8$, `metalness` : $0.0$.
- **`side: THREE.FrontSide` (Backface Culling) :** Élimine le rendu des faces arrière. Pour toute caméra extérieure, les deux faces de contact coplanaires entre tranches adjacentes (ex. allège et tranche pleine) tournent le dos à la vue et sont rejetées par le rasterizer GPU avant le Z-buffer, éradiquant tout Z-fighting sans calcul de fusion booléenne.

### 3.4 Classe Principale `Scene3D`

```typescript
export class Scene3D {
  public constructor(canvas: HTMLCanvasElement, options?: Partial<SceneOptions>);
  public constructor(options: SceneOptions);

  public addMesh(rawData: RawMeshData, material?: THREE.Material): THREE.Mesh;
  public updateMesh(rawData: RawMeshData, material?: THREE.Material): THREE.Mesh;
  public removeMesh(elementId: string): void;
  public getMeshes(elementId: string): readonly THREE.Mesh[];
  public getMeshCount(): number;

  public render(): void;
  public resize(width: number, height: number): void;
  public dispose(): void;

  public getCamera(): THREE.PerspectiveCamera;
  public getControls(): OrbitControls;
  public getRenderer(): THREE.WebGLRenderer;
  public getScene(): THREE.Scene;
}
```

---

## 4. Cycle de Vie et Prévention des Fuites Mémoire

Three.js ne bénéficie pas du ramasse-miettes (garbage collector) JavaScript standard pour les allocations GPU (VBOs, contextes WebGL, textures). Tout objet créé doit être libéré de manière explicite :

```
[Création]
  new Scene3D(canvas, options)
    ├── Instanciation WebGLRenderer
    ├── Grille au sol (GridHelper)
    ├── Matériau partagé PBR par défaut
    └── Contrôles orbitaux avec écouteur 'change'

[Mutations]
  scene.addMesh(rawData)
    └── Crée BufferGeometry et Mesh, ajoute à scene, appelle render()

  scene.updateMesh(rawData)
    ├── Récupère les anciens maillages de l'elementId
    ├── Appelle mesh.geometry.dispose()
    ├── Supprime les anciens Mesh de la scène
    └── Ajoute le nouveau maillage et appelle render()

  scene.removeMesh(elementId)
    ├── Appelle mesh.geometry.dispose()
    ├── Supprime le Mesh de la scène
    └── Appelle render()

[Destruction Totale]
  scene.dispose()
    ├── controls.dispose()
    ├── Pour chaque mesh : geometry.dispose()
    ├── gridHelper.geometry.dispose() + material.dispose()
    ├── defaultMaterial.dispose()
    ├── scene.clear()
    └── renderer.dispose()
```

---

## 5. Rendu à la Demande (_Demand-Driven Rendering_)

Contrairement aux moteurs de jeu (Unity, Unreal) qui bouclent à 60 ou 120 fps en permanence :

- Un logiciel de CAO/BIM est un outil bureautique statique $99\%$ du temps.
- `Scene3D` ne lance **aucun `requestAnimationFrame` autonome**.
- Les appels à `render()` surviennent uniquement :
  1. Lors de l'initialisation de la scène (`new Scene3D`).
  2. Lors de l'interaction de l'utilisateur avec la souris/pavé tactile via `OrbitControls` (événement `'change'`).
  3. Lors des modifications programmatiques du modèle (`addMesh`, `updateMesh`, `removeMesh`).
  4. Lors du redimensionnement de la fenêtre (`resize`).
- Ce modèle garantit une utilisation CPU/GPU proche de $0\%$ au repos.

---

## 6. Générateur de Maillages Découplé (`mesh-generator.ts` — Phase 2.2)

Pour permettre aux applications frontales (`apps/web`) d'instancier des géométries 3D sans violer la règle d'isolation (interdiction d'importer `@mini-bim/geometry`), `view-3d` exporte un générateur de maillages basé sur des interfaces neutres (ADR-023) :

```typescript
export interface WallGeometryParams {
  readonly id: string;
  readonly start: { readonly x: number; readonly y: number };
  readonly end: { readonly x: number; readonly y: number };
}

export interface WallTypeGeometryParams {
  readonly thickness: number;
  readonly height: number;
}

export function createWallMesh(
  wall: WallGeometryParams,
  wallType: WallTypeGeometryParams,
  elevation?: number,
): RawMeshData | null;
```

Ce module ne dépend d'aucun modèle métier (`@mini-bim/core` est absent des dépendances). Les applications fournissent directement leurs entités en exploitant le typage structurel de TypeScript.

### Limites Connues et Périmètre de Phase 3

1. **Footprint Isolé :** `createWallMesh` utilise `computeWallFootprint2d` (footprint isolé, PAS junction-resolved). Les murs aux coins se chevauchent visuellement (z-fighting potentiel aux arêtes coplanaires). Sera résolu en Phase 3 avec `computeJunctions`.
2. **Pièce unique (Full) :** `createWallMesh` traite une seule pièce (`role: 'full'`). Les ouvertures/multi-pièces sont gérées par `createWallMeshWithOpenings` (Phase 3.2).

---

## 7. Murs Percés et Placeholders d'Ouvertures (`mesh-generator.ts` — Phase 3.2)

Livré en Phase 3.2 pour connecter le pipeline géométrique 2.5D au rendu 3D Three.js :

```typescript
export interface OpeningGeometryParams {
  readonly id: string;
  readonly kind: 'door' | 'window';
  readonly offsetAlong: number;
  readonly width: number;
  readonly height: number;
  readonly sillHeight?: number;
}

export interface WallWithOpeningsParams {
  readonly wall: WallGeometryParams;
  readonly wallType: WallTypeGeometryParams;
  readonly openings: readonly OpeningGeometryParams[];
  readonly elevation?: number;
}

export function createWallMeshWithOpenings(params: WallWithOpeningsParams): RawMeshData[];

export function createOpeningPlaceholder(
  params: OpeningGeometryParams,
  wall: WallGeometryParams,
  elevation?: number,
): RawMeshData;
```

### Invariants et Principes de Conception :

1. **Règle de Sélection & Picking :**
   - Tous les tronçons solides d'un mur percé portent `RawMeshData.elementId = wall.id`. Un clic sur n'importe quel morceau sélectionne le mur hôte complet.
   - Les placeholders d'ouvertures portent `RawMeshData.elementId = opening.id`. Un clic sur le vantail/vitrage sélectionne l'ouverture spécifique.
2. **Conservation Stricte du Volume :**
   $$\sum_{i} V(\text{piece}_i) = V(\text{mur plein}) - \sum_{j} V(\text{ouverture}_j)$$
   Vérifié par le théorème de divergence sur maillages triangulaires ($\Delta < 50\text{ mm}^3$ sur 2.6 milliards de $\text{mm}^3$).
3. **Matériaux Dédiés :**
   - Porte : `createDoorPlaceholderMaterial()` (bois `#8b5a2b`, boîte orientée de 50 mm).
   - Fenêtre : `createWindowPlaceholderMaterial()` (vitrage translucide `#90caf9`, opacité 0.5, boîte orientée de 30 mm).

---

## 8. Maillage 3D des Dalles et Trémies (`createSlabMesh` — Phase 6.1b)

Livré en Phase 6.1b pour assurer le rendu volumique tridimensionnel des planchers avec découpe exacte des trémies :

```typescript
export interface SlabGeometryParams {
  readonly id: string;
  readonly boundary: readonly { readonly x: number; readonly y: number }[];
  readonly holes?: readonly (readonly { readonly x: number; readonly y: number }[])[];
  readonly openings?: readonly (readonly { readonly x: number; readonly y: number }[])[];
  readonly baseOffset?: number;
}

export interface SlabTypeGeometryParams {
  readonly thickness: number;
}

export function createSlabMesh(
  slab: SlabGeometryParams,
  slabType: SlabTypeGeometryParams,
  elevation?: number,
): RawMeshData | null;
```

### Invariants et Principes Géométriques :

1. **Convention d'Extrusion Descendante (ADR-045 D2) :**
   L'arase supérieure de la dalle correspond à l'élévation du niveau additionnée de son décalage de base :
   $$Z_{\text{sup}} = \text{elevation} + \text{baseOffset}$$
   L'arase inférieure est projetée vers le bas de la valeur de l'épaisseur :
   $$Z_{\text{inf}} = Z_{\text{sup}} - \text{thickness}$$
2. **Triangulation Concave avec Trous (`earcut`) :**
   - La face supérieure ($Z = Z_{\text{sup}}$) et la face inférieure ($Z = Z_{\text{inf}}$) sont triangulées via l'algorithme `earcut` sur le polygone effectif nettoyé par `computeEffectiveSlabPolygon`.
   - Les normales de la face supérieure pointent vers le haut $(0, 0, 1)$, celles de la face inférieure vers le bas $(0, 0, -1)$ avec inversion d'enroulement des triangles pour préserver le _front-face culling_.
3. **Flancs Verticaux (Contour & Trous) :**
   - Chaque segment d'arête du contour extérieur et de chaque trou intérieur engendre un quad vertical composé de 2 triangles.
   - Les normales des flancs sont orientées strictement vers l'extérieur pour le contour extérieur, et vers l'intérieur du vide pour les parois de trémies.
4. **Matériau Béton Standard & Raycasting :**
   - Matériau PBR standard béton (`#d1d5db`, rugosité 0.85).
   - Les métadonnées `userData: { category: 'slab' }` et `elementId: slab.id` permettent le picking 3D immédiat via `Scene3D.raycast`.

---

## 9. Maillage 3D des Escaliers Paramétriques (`createStairMesh` — Phase 6.4 / ADR-048)

Livré en Phase 6.4 pour assurer la génération volumique crénelée étanche des escaliers droits reliant deux niveaux :

```typescript
export interface StairGeometryParams {
  readonly id: string;
  readonly start: { readonly x: number; readonly y: number };
  readonly end: { readonly x: number; readonly y: number };
  readonly widthOverride?: number;
}

export interface StairTypeGeometryParams {
  readonly width: number;
}

export function createStairMesh(
  stair: StairGeometryParams,
  stairType: StairTypeGeometryParams,
  bottomElevation: number,
  topElevation: number,
): RawMeshData | null;
```

### Invariants Topologiques et Rendu PBR :

1. **Étanchéité Topologique & Caractéristique d'Euler-Poincaré :**
   - Le solide de l'escalier est une surface fermée connexe de genre zéro sans T-junctions ni arêtes orphelines.
   - Les marches (gérons horizontaux et contremarches verticales) et le dos inférieur incliné sont complétés par deux flancs latéraux triangulés par `earcut` (`triangulatePolygonWithHoles`).
   - Le maillage vérifie rigoureusement la caractéristique d'Euler :
     $$\chi = V - E + F = 2$$
2. **Matériau Bois & Rendu Photoréaliste :**
   - Matériau PBR warm wood tone (`#a0825a`, rugosité 0.6, métal 0.05).
3. **Raycast Picking & Interaction 3D :**
   - Associé au mesh Three.js via `stairMesh.userData = { category: 'stair', elementId: stair.id }`.
   - Permet la sélection directe dans le viewport 3D et la synchronisation avec l'inspecteur de propriétés.

---

## 10. Maillage 3D des Toitures et Biseautage des Murs (`createRoofMesh`, `topProfile` — Phase 7 / ADR-053)

### 10.1 Générateur de Toitures Étanche (`createRoofMesh`)

```typescript
export interface RoofGeometryParams {
  readonly id: string;
  readonly footprint: readonly { readonly x: number; readonly y: number }[];
  readonly ridgeAxis?: {
    readonly start: { readonly x: number; readonly y: number };
    readonly end: { readonly x: number; readonly y: number };
  };
  readonly slopeOverrideDeg?: number;
  readonly overhangOverrideMm?: number;
  readonly baseOffset?: number;
}

export interface RoofTypeGeometryParams {
  readonly family: 'flat' | 'gable';
  readonly thickness: number;
  readonly slopeDeg?: number;
  readonly overhangMm?: number;
}

export function createRoofMesh(
  roof: RoofGeometryParams,
  roofType: RoofTypeGeometryParams,
  elevation?: number,
  openings?: readonly RoofOpeningGeometryParams[],
): RawMeshData | null;
```

#### Invariants Topologiques :
1. **Étanchéité et Euler-Poincaré :**
   Le maillage fusionné de toiture forme un solide fermé de genre 0 vérifiant :
   $$\chi = V - E + F = 2$$
2. **Volume analytique exact :**
   $$V = 2 \times S_{\text{versant}} \times e_{\text{toit}}$$
3. **Matériau standard :** Terre cuite `#92400e` (rugosité 0.7, métal 0.05).

### 10.2 Biseautage des Murs sous Toiture (`topProfile`)
Dans `createWallMeshWithOpenings`, la tête de mur accepte désormais un paramètre `topProfile: readonly Vec2[]`.
- Si `topProfile` est trapézoïdal : les sommets supérieurs sont ajustés pour suivre la pente du versant unique.
- Si `topProfile` est en chevron (3 sommets) : le prisme de tête est scindé en deux pans rejoignant l'arête de faîtage sans fente ni artefact.


