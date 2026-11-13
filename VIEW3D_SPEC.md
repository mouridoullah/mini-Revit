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
