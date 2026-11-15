# SPÉCIFICATION TECHNIQUE DES OUTILS INTERACTIFS 2D (TOOLS_SPEC.md)

**Statut :** Spécification de Référence — Phase 3.3  
**Dernière mise à jour :** 14 novembre 2026  
**Package d'implémentation :** `apps/web/src/tools/` et `@mini-bim/view-2d`

---

## 1. Vue d'Ensemble Architecturale

Le module d'outils interactifs 2D permet à l'utilisateur de manipuler directement la vue en plan architecturale pour sélectionner des éléments (`SelectTool`) et modéliser de nouveaux murs (`WallTool`).

L'architecture repose sur quatre principes directeurs :

1. **Machines à États Pures (Pure State Machines) :**  
   Les classes d'outils ne dépendent d'aucun moteur de rendu, d'aucune bibliothèque UI (React, Three.js) et d'aucune API DOM (`window`, `document`, `HTMLCanvasElement`). Elles peuvent être instanciées et testées dans un environnement JavaScript/TypeScript pur en quelques microsecondes.
2. **Entrées et Sorties Typées et Normalisées :**  
   Les événements d'entrée sont normalisés en `ToolEvent`, et les effets secondaires sont émis sous forme d'objets `ToolOutput` immuables (`command`, `selectionChanged`, `preview`, `noop`).
3. **Précision Trigonométrique et Snapping Déterministe :**  
   L'aimantation angulaire à 45° utilise des vecteurs unitaires précalculés pour garantir une orthogonalité et une symétrie absolues sans imprécision de virgule flottante.
4. **Délégation et Nettoyage Garanti :**  
   Le pont DOM (`toolGlue.ts` et `<Viewport2D />`) garantit la libération systématique des écouteurs et le nettoyage des formes élastiques temporaires lors de tout changement d'outil ou démontage React.

```
       [ Navigateur / DOM ]
          │ PointerEvent / KeyboardEvent
          ▼
     [ toolGlue.ts ]
          │ ToolEvent normalisé
          ▼
   [ Tool (SelectTool | WallTool) ] ◄── Context: { doc, transform, activeLevelId, ... }
          │
          ├─► ToolOutput::command           ──► BimDocument.execute()
          ├─► ToolOutput::selectionChanged  ──► View2D.setSelection()
          └─► ToolOutput::preview           ──► View2D.setPreview()
```

---

## 2. Contrats d'Interface Fondamentaux

### 2.1 Interface Commune `Tool`

```typescript
export type ToolKind =
  'select' | 'wall' | 'door' | 'window' | 'move-wall' | 'move-opening' | 'slab' | 'stair';

export interface Tool {
  readonly kind: ToolKind;
  getState(): SelectToolState | WallToolState;
  handle(event: ToolEvent, ctx: ToolContext): ToolOutput;
  reset(): void;
}
```

### 2.2 Événements Normalisés `ToolEvent`

```typescript
export type ToolEvent =
  | {
      readonly type: 'pointerdown';
      readonly screen: Vec2;
      readonly button: number; // 0 = gauche, 1 = molette, 2 = droit
      readonly shift: boolean;
      readonly alt: boolean;
    }
  | {
      readonly type: 'pointermove';
      readonly screen: Vec2;
      readonly shift: boolean;
      readonly alt: boolean;
    }
  | {
      readonly type: 'pointerup';
      readonly screen: Vec2;
      readonly button: number;
      readonly shift: boolean;
      readonly alt: boolean;
    }
  | {
      readonly type: 'keydown';
      readonly key: string; // 'Escape', 'Enter', etc.
    };
```

### 2.3 Sorties Typées `ToolOutput`

```typescript
export type ToolOutput =
  | { readonly kind: 'command'; readonly command: Command }
  | { readonly kind: 'selectionChanged'; readonly ids: readonly string[] }
  | { readonly kind: 'preview'; readonly preview: PreviewShape | null }
  | { readonly kind: 'noop' };
```

---

## 3. Outil de Sélection : `SelectTool`

### 3.1 Machine à États

```
      ┌──────────┐
      │   idle   │
      └────┬─────┘
           │
           │ pointerdown (button 0)
           ▼
      [ Hit-Test ]
     /            \
 [Hit element]   [No element]
   │                │
   ▼                ▼
┌──────────────┐ ┌──────────┐
│   selected   │ │   idle   │
└──────┬───────┘ └──────────┘
       │
       │ pointerdown in void | Escape
       ▼
 ┌──────────┐
 │   idle   │
 └──────────┘
```

- **Hit-testing :** Utilise `findWallAtScreen(screenPos, transform, doc, { activeLevelId })` de `@mini-bim/view-2d`.
- **Émission :**
  - Si un mur est sous le curseur : `{ kind: 'selectionChanged', ids: [hitId] }` et état `selected`.
  - Si aucun élément sous le curseur : `{ kind: 'selectionChanged', ids: [] }` et état `idle`.
  - Sur touche `Escape` : `{ kind: 'selectionChanged', ids: [] }` et état `idle`.

---

## 4. Outil de Tracé de Murs : `WallTool`

### 4.1 Machine à États

```
                      ┌──────────┐
                      │   idle   │
                      └────┬─────┘
                           │ pointerdown (button 0)
                           ▼
                     ┌───────────┐
       ┌────────────►│  drawing  │◄────────────┐
       │             └─────┬─────┘             │
       │                   │                   │
  pointermove              │ pointerup (button 0) | keydown (Enter)
  (update preview)         ▼
                      [ Length >= 100 mm ? ]
                     /                      \
                  [Yes]                     [No]
                    │                         │
                    ▼                         ▼
         { kind: 'command',           { kind: 'preview',
           command: AddWallCommand }    preview: null }
                    │                         │
                    └───────────┬─────────────┘
                                │
                                ▼
                           ┌──────────┐
                           │   idle   │
                           └──────────┘
```

- **Validation par relâchement :** Tracé par clic-glisser standard.
- **Validation par touche `Enter` :** Permet la validation sans relâcher immédiatement.
- **Annulation par touche `Escape` :** Efface le rubber-band et revient à `idle`.
- **Contrainte de longueur minimale ergonomique (`MIN_WALL_LENGTH = 100 mm`) :** $L < 100\text{ mm}$ annule silencieusement pour éviter la création de micro-segments involontaires lors d'un clic parasite sans intention de glisser.  
  _Note d'architecture :_ Ce seuil UX est distinct de la règle d'intégrité topologique du modèle dans `@mini-bim/core` (`validateWall` exigeant $\text{length} > 10^{-4}\text{ mm}$). Le modèle autorise des murs plus courts programmés ou importés, mais l'interaction utilisateur à la souris applique un garde-fou ergonomique de 10 cm.
- **Aimantation angulaire (Shift) :** Si la touche `Shift` est enfoncée lors du déplacement ou du relâchement, le point d'arrivée est aligné sur l'axe multiple de 45° le plus proche selon la stratégie de **longueur conservée**.

---

## 5. Algorithme d'Aimantation Angulaire à 45° (`snapAngle45`)

### 5.1 Décision : Longueur Conservée vs Projection Scalaire

Dans les logiciels de CAO/BIM professionnels (AutoCAD, Revit, Archicad), l'aimantation angulaire polaire/orthogonale applique la stratégie de **longueur conservée** :
$$\mathbf{P}_{\text{snapped}} = \mathbf{P}_{\text{start}} + r \cdot \mathbf{U}[k] \quad \text{où } r = \|\mathbf{P}_{\text{current}} - \mathbf{P}_{\text{start}}\|$$

Une projection scalaire produit scalaire ($\operatorname{dot}(\vec{v}, \vec{u})\cdot \vec{u}$) réduirait artificiellement la longueur lors d'une déviation angulaire de quelques degrés ($\cos(1^\circ) \approx 0.9998 \cdot r$), provoquant une variation indésirable de la longueur lors du tracé. La longueur conservée permet à l'utilisateur de doser la longueur du mur à la distance voulue tout en bénéficiant de l'alignement directionnel.

### 5.2 Précision Float64 et Absence de Dérive

Pour garantir une précision parfaite sur les 8 directions ($0^\circ, 45^\circ, 90^\circ, 135^\circ, 180^\circ, -135^\circ, -90^\circ, -45^\circ$) et éliminer les erreurs de trigonométrie flottante :

1. Calcul du vecteur brut : $\vec{v} = \mathbf{P}_{\text{current}} - \mathbf{P}_{\text{start}}$.
2. Norme : $r = \|\vec{v}\| = \sqrt{dx^2 + dy^2}$.
3. Angle brut : $\theta = \operatorname{atan2}(dy, dx) \in (-\pi, \pi]$.
4. Normalisation positive : $\theta_{\text{norm}} = (\theta < 0) \; ? \; \theta + 2\pi : \theta$.
5. Index du secteur (largeur $\pi/4$, décalage $\pi/8$) :
   $$k = \left\lfloor \frac{\theta_{\text{norm}} + \frac{\pi}{8}}{\frac{\pi}{4}} \right\rfloor \bmod 8$$
6. Consultation du vecteur unitaire tabulé (avec `Math.SQRT1_2` $\approx 0.7071067811865476$) :
   $$ \mathbf{U} = \begin{bmatrix}
   (1, 0) \\
   (\texttt{Math.SQRT1\_2}, \texttt{Math.SQRT1\_2}) \\
   (0, 1) \\
   (-\texttt{Math.SQRT1\_2}, \texttt{Math.SQRT1\_2}) \\
   (-1, 0) \\
   (-\texttt{Math.SQRT1\_2}, -\texttt{Math.SQRT1\_2}) \\
   (0, -1) \\
   (\texttt{Math.SQRT1\_2}, -\texttt{Math.SQRT1\_2})
   \end{bmatrix}$$
   $$
7. Point aimanté exact :
   $$\mathbf{P}_{\text{snapped}} = \mathbf{P}_{\text{start}} + r \cdot \mathbf{U}[k]$$

**Propriétés mathématiques vérifiées par test :**

- Pour $k = 0, 2, 4, 6$ (axes cardinaux), l'une des composantes est **strictement zéro bit-à-bit** en IEEE-754 ($y \equiv 0$ ou $x \equiv 0$).
- Pour $k = 1, 3, 5, 7$ (diagonales), $\Delta x$ et $\Delta y$ sont calculés par le même produit `r * Math.SQRT1_2`, assurant une égalité binaire stricte $|\Delta x| \equiv |\Delta y|$ et une pente exacte $\frac{\Delta y}{\Delta x} \equiv 1.0$ (erreur résiduelle $< 10^{-15}$).

### 5.3 Rayon d'Accrochage en Pixels Écran (Indépendance au Zoom)

Le rayon de magnétisme pour l'accrochage aux sommets et arêtes est étalonné en pixels écran (ex: 12 px) :
$$\text{toleranceMonde} = \frac{\text{tolerancePixels}}{\text{transform.scale}}$$
Cette convention assure une zone d'attraction ergonomique constante sous le pointeur de la souris, que l'utilisateur travaille en vue d'ensemble dézoomée ou en vue de détail agrandie.

---

## 6. Pont DOM et Intégration React

### 6.1 Normalisation DOM & Ratio d'Affichage CSS (`toolGlue.ts`)

- Conversion de `PointerEvent` en coordonnées locales d'affichage relatives à `canvas.getBoundingClientRect()`.
- Application du ratio d'échelle CSS :
  $$\text{scaleX} = \frac{\text{canvas.width}}{\text{rect.width}}, \quad \text{scaleY} = \frac{\text{canvas.height}}{\text{rect.height}}$$
  $$x_{\text{canvas}} = (e.\text{clientX} - \text{rect.left}) \cdot \text{scaleX}$$
  $$y_{\text{canvas}} = (e.\text{clientY} - \text{rect.top}) \cdot \text{scaleY}$$
  Garantit une fidélité absolue même lorsque le canvas est affiché via un style CSS responsive (ex: `width: 100%`) différent de sa résolution interne en pixels.
- Gestion des touches de modification (`shiftKey`, `altKey`).
- Extraction des touches du clavier (`Escape`, `Enter`).

### 6.2 Hook `useActiveTool.ts`

- Fournit `activeToolKind` (`'select' | 'wall'`) et la fonction de bascule `setActiveToolKind`.
- Conserve les instances des outils dans des `useRef` pour éviter toute réallocation superflue.
- Réinitialise systématiquement l'état (`reset()`) de l'outil sortant lors d'un changement.

### 6.3 Nettoyage dans `<Viewport2D />`

- Les écouteurs (`pointerdown`, `pointermove`, `pointerup`, `keydown`) sont nettoyés dans le retour de `useEffect`.
- `tool.reset()` et `view.setPreview(null)` sont systématiquement invoqués lors du démontage ou du changement d'outil, éliminant tout risque d'écouteurs orphelins ou d'artefacts graphiques persistants.

---

## 7. Outils Phase 3.3 — Manipulation d'Ouvertures et Déplacement de Murs

### 7.1 `DoorTool` & `WindowTool` (Insertion Interactive d'Ouvertures)

- **Nature :** Machines à états pures (0 import de `@mini-bim/geometry`, React, Three.js ou DOM).
- **États :** `{ kind: 'idle' } | { kind: 'hovering'; wallId: string; offsetAlong: number } | { kind: 'placed'; id: string }`.
- **Aimantation architecturale (Snap 50 mm) :**  
  La projection orthogonale du curseur écran sur l'axe du mur hôte produit un abscisse curviligne $u$. Cet offset est aimanté au pas de 50 mm via `snapToStep(rawOffset, 50)`.
- **Clamping et gardes minimales :**  
  L'ouverture est contrainte dans l'intervalle $[50, L_{\text{mur}} - W_{\text{baie}} - 50]$ mm pour respecter l'intégrité constructive et les règles d'épaisseur/d'appui.
- **Émission :** `pointerdown` émet `AddDoorCommand` ou `AddWindowCommand`.

### 7.2 `MoveWallTool` — LE TEST DE CRÉDIBILITÉ DU BIM

- **Principe directeur :** « Le modèle est la source de vérité, la géométrie est un cache ».
- **Invariant paramétrique :**  
  Lorsqu'un mur hôte est translaté par `UpdateWallCommand(wallId, { start: start + delta, end: end + delta })`, **aucune ouverture hébergée n'est altérée dans le document**. Chaque porte ou fenêtre conserve rigoureusement son `offsetAlong` paramétrique. C'est le moteur de rendu 3D (`Viewport3D.tsx`) et 2D (`Viewport2D.tsx`) qui régénère automatiquement les solides percés et replace les placeholders 3D aux nouvelles coordonnées spatiales mondes.
- **Machine à états :**
  - `idle` : curseur libre.
  - `dragging` : clic sur un mur existant capturé via `findWallAtScreen`. Prévisualisation de l'axe translaté sous forme de `line`.
- **Aimantation spatiale (Snap 10 mm) :**  
  Chaque composante du vecteur translation $\vec{\Delta} = (\Delta x, \Delta y)$ est aimantée sur le pas de 10 mm (ex: $105 \text{ mm} \to 100 \text{ mm}$ via banker's rounding).
- **Suppression des commandes nulles :**  
  Si $\vec{\Delta} = (0, 0)$ (clic stationnaire), l'outil retourne `{ kind: 'preview', preview: null }` sans émettre de commande, évitant toute pollution de la pile undo/redo.
- **Validation des contraintes géométriques et topologiques :**
  - **Longueur invariante :** La translation applique rigoureusement le même vecteur $\vec{\Delta}$ aux deux extrémités $\mathbf{P}_{\text{start}}$ et $\mathbf{P}_{\text{end}}$ ($\|\vec{end}_{\text{new}} - \vec{start}_{\text{new}}\| \equiv \|\vec{end} - \vec{start}\| > 0$). La longueur du mur est donc strictement conservée et ne peut devenir nulle.
  - **Maintien de Connectivité des Jonctions (Wall Stretching / Joint Tracking — Spécifié pour Phase 6.0) :**  
    Afin de préserver l'étanchéité des enceintes de pièces et d'éviter leur passage intempestif au statut `unenclosed` (ADR-039) lors de la manipulation d'un mur ou d'un sommet :
    1. Le moteur de jonctions identifie l'ensemble des murs incidents partageant le sommet translaté (jonctions d'angles en L ou jonctions en T).
    2. La commande transactionnelle (`MoveWallCommand` ou `MoveWallEndpointCommand`) met à jour simultanément le sommet cible et les extrémités des murs connectés.
    3. Les murs adjacents s'étirent de façon élastique le long de leurs axes directeurs respectifs, maintenant la continuité physique fermée de la cloison.

### 7.3 `MoveOpeningTool` (Déplacement d'Ouvertures le Long de l'Axe)

- **Machine à états :**
  - `idle` : en attente.
  - `dragging` : détection d'une porte ou fenêtre via `findOpeningAtScreen`. Glissement le long du mur hôte avec projection axiale, snap 50 mm et clamp aux gardes de rive.
- **Propagation de recalcul :**  
  Émet `MoveOpeningCommand(openingId, newOffsetAlong)`. Conformément à la Phase 3.2, `MoveOpeningCommand.getChangedIds()` retourne `[openingId, hostWallId]`, provoquant la reconstruction atomique du mur solide percé (`updateMeshBatch`) et le repositionnement du placeholder.

### 7.4 Note Technique sur l'Espionnage des Fonctions Exportées (`vi.spyOn`)

> [!NOTE] Espionnage sur exports nommés en ESM
> L'espionnage Vitest via `vi.spyOn(Module, 'namedFunction')` nécessite en ECMAScript natif un import namespace (`import * as Scene3DModule from '@mini-bim/view-3d'`) afin que les références d'export soient mutables via le module loader de Vitest 3+. Les tests d'intégration d'`apps/web` appliquent systématiquement cette convention architecturale.

### 7.5 Capture de l'Instance `View2D` dans les Tests d'Intégration (Note 3 de Revue)

> [!IMPORTANT] Dépendance au cycle d'instanciation de `View2D`
> Les tests d'intégration d'`apps/web` nécessitant la `Transform2D` réelle (notamment le test de crédibilité du BIM et les tests d'aimantation fine de `DoorTool`) capturent l'instance de `View2D` via un spy sur sa méthode prototype : `vi.spyOn(View2D.prototype, 'setDocument')`.  
> Ce pattern fonctionne parce que le composant React `<Viewport2D />` appelle systématiquement `view.setDocument(doc)` dans son hook `useEffect` lors du chargement initial.  
> **Contrat de maintenance :** Si l'implémentation de `<Viewport2D />` venait à injecter le document directement à la construction (`new View2D(canvas, { doc })`) sans appel explicite à `setDocument`, ce spy ne capturerait plus l'instance (`capturedView2D` resterait `null`). Dans ce cas, les tests d'intégration devront adapter leur mécanisme de capture (par exemple en espionnant le constructeur ou en exposant un hook de diagnostic).
