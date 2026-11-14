# Spécification Technique : Cotations 2D Associatives et Plans SVG — Mini-BIM

**Statut :** Spécification de Référence  
**Date :** 2026-11-14  
**Auteur :** Antigravity (Lead Software Architect & Computational Geometry Engineer)  
**Packages d'implémentation :**

- `@mini-bim/core` (`packages/core/src/dimensions/`, `packages/core/src/commands.ts`)
- `@mini-bim/view-2d` (`packages/view-2d/src/renderer.ts`, `packages/view-2d/src/svg-exporter.ts`)

---

## 1. Modèle de Données `Dimension`

L'entité `Dimension` est stockée de façon normalisée dans le dictionnaire `state.dimensions: Record<ElementId, Dimension>` :

```typescript
export interface Dimension {
  readonly id: ElementId;
  readonly category: 'dimension';
  readonly levelId: ElementId;
  readonly type: 'linear' | 'aligned';
  readonly references: readonly ElementId[];
  readonly offset: number; // Décalage perpendiculaire par rapport à l'axe (en mm)
  readonly value: number; // Valeur calculée automatiquement (en mm)
  readonly customLabel?: string; // Surcharge textuelle facultative
}
```

---

## 2. Invariants Métier et Calcul Paramétrique

La fonction pure `computeDimensionValue(dim, state)` applique les règles d'invariance géométrique suivantes :

1. **Une Référence Unique `[wallId]` :**  
   Mesure la longueur axiale du mur :
   $$\text{value} = \sqrt{(x_2 - x_1)^2 + (y_2 - y_1)^2}$$
2. **Deux Références `[wallId1, wallId2]` :**
   - Si les deux murs sont parallèles, la distance orthogonale exacte est mesurée :
     $$\text{dist} = |(M_2 - M_1) \cdot \vec{n}_1|$$
   - Si les deux murs ne sont pas parallèles, la distance euclidienne entre leurs centres $M_1$ et $M_2$ est retournée.

---

## 3. Propagation Paramétrique Bidirectionnelle

L'associativité est garantie sans écouteur manuel grâce au moteur de commandes transactionnel :

1. **Mise à jour de Mur (`UpdateWallCommand`) :**  
   Lorsqu'un mur est déplacé ou redimensionné :
   - Toutes les cotations dont `references.includes(wallId)` sont identifiées.
   - Leur propriété `value` est recalculée dans le draft Immer.
   - `UpdateWallCommand.getChangedIds()` retourne `[wallId, ...impactedDimensionIds]`.
2. **Suppression de Mur (`DeleteWallCommand`) :**  
   Lorsqu'un mur est supprimé :
   - Toutes les cotations associées sont automatiquement supprimées en cascade (`ON DELETE CASCADE`).
   - `getChangedIds()` inclut les identifiants de ces cotations pour informer les vues.
   - Un appel à `undo()` restaure le mur et toutes ses cotations à l'identique (`toEqual(stateBefore)`).

---

## 4. Documentation de Plans Imprimables (SVG)

La fonction `generatePlanSvg(doc, options)` de `@mini-bim/view-2d` produit des fichiers vectoriels prêts à l'impression à des échelles architecturales normalisées :

- **Échelles supportées :** 1:50, 1:100, 1:200.
- **Formats normalisés :** A4 (297 × 210 mm) et A3 (420 × 297 mm) en orientation paysage.
- **Graphisme architectural normalisé :**
  - **Murs :** Poché gris (`#d1d5db`), contour d'arête vue/coupée noir (`#111827`, 1.5 px).
  - **Menuiseries :** Évidement de baie blanc pur, battement de porte à 90° en pointillé avec arc de cercle, vitrage de fenêtre bleu.
  - **Pièces :** Poché pastel translucide (`rgba(219, 234, 254, 0.45)`), nom en gras et surface utile en m².
  - **Cotations :** Lignes de rappel, ligne de cote, traits obliques à 45° et libellés textuels orientés.
  - **Cartouche architectural :** Cadre normalisé en bas à droite comportant le nom du projet, titre de planche, échelle, format, auteur et date.
