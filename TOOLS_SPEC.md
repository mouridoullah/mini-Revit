# SPÉCIFICATION TECHNIQUE DES OUTILS INTERACTIFS 2D (TOOLS_SPEC.md)

**Statut :** Spécification de Référence — Phase 2.3  
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
export type ToolKind = 'select' | 'wall';

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
- **Contrainte de longueur minimale :** $L < 100\text{ mm}$ annule silencieusement pour éviter la pollution du modèle par des clics accidentels.
- **Aimantation angulaire (Shift) :** Si la touche `Shift` est enfoncée lors du déplacement ou du relâchement, le point d'arrivée est projeté sur l'axe multiple de 45° le plus proche.

---

## 5. Algorithme d'Aimantation Angulaire à 45° (`snapAngle45`)

Pour garantir une précision parfaite sur les 8 directions ($0^\circ, 45^\circ, 90^\circ, 135^\circ, 180^\circ, -135^\circ, -90^\circ, -45^\circ$) et éliminer les erreurs de trigonométrie flottante :

1. Calcul du vecteur brut : $\vec{v} = \mathbf{P}_{\text{current}} - \mathbf{P}_{\text{start}}$.
2. Norme : $r = \|\vec{v}\| = \sqrt{dx^2 + dy^2}$.
3. Angle brut : $\theta = \operatorname{atan2}(dy, dx) \in (-\pi, \pi]$.
4. Normalisation positive : $\theta_{\text{norm}} = (\theta < 0) \; ? \; \theta + 2\pi : \theta$.
5. Index du secteur (largeur $\pi/4$, décalage $\pi/8$) :
   $$k = \left\lfloor \frac{\theta_{\text{norm}} + \frac{\pi}{8}}{\frac{\pi}{4}} \right\rfloor \bmod 8$$
6. Consultation du vecteur unitaire tabulé :
   $$ \mathbf{U} = \begin{bmatrix}
   (1, 0) \\
   (\tfrac{\sqrt{2}}{2}, \tfrac{\sqrt{2}}{2}) \\
   (0, 1) \\
   (-\tfrac{\sqrt{2}}{2}, \tfrac{\sqrt{2}}{2}) \\
   (-1, 0) \\
   (-\tfrac{\sqrt{2}}{2}, -\tfrac{\sqrt{2}}{2}) \\
   (0, -1) \\
   (\tfrac{\sqrt{2}}{2}, -\tfrac{\sqrt{2}}{2})
   \end{bmatrix}$$
   $$
7. Point aimanté exact :
   $$\mathbf{P}_{\text{snapped}} = \mathbf{P}_{\text{start}} + r \cdot \mathbf{U}[k]$$

**Propriété :** Pour $k = 0, 2, 4, 6$ (axes cardinaux), l'une des composantes est **strictement zéro**, garantissant qu'aucun mur orthogonal ne dévie d'un millième de degré.

---

## 6. Pont DOM et Intégration React

### 6.1 Normalisation DOM (`toolGlue.ts`)

- Conversion de `PointerEvent` en coordonnées locales d'affichage en soustrayant `canvas.getBoundingClientRect()`.
- Gestion des touches de modification (`shiftKey`, `altKey`).
- Extraction des touches du clavier (`Escape`, `Enter`).

### 6.2 Hook `useActiveTool.ts`

- Fournit `activeToolKind` (`'select' | 'wall'`) et la fonction de bascule `setActiveToolKind`.
- Conserve les instances des outils dans des `useRef` pour éviter toute réallocation superflue.
- Réinitialise systématiquement l'état (`reset()`) de l'outil sortant lors d'un changement.

### 6.3 Nettoyage dans `<Viewport2D />`

- Les écouteurs (`pointerdown`, `pointermove`, `pointerup`, `keydown`) sont nettoyés dans le retour de `useEffect`.
- `tool.reset()` et `view.setPreview(null)` sont systématiquement invoqués lors du démontage ou du changement d'outil, éliminant tout risque d'écouteurs orphelins ou d'artefacts graphiques persistants.
