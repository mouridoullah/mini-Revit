# ADR-050 : Unification des Données Dérivées, Invalidation de Cache & Matériaux Partagés (S1-2 + S2-3 + S2-5)

## Statut

**Accepté** (Chantier 3 — Correction des anomalies S1-2, S2-3, S2-5)

## Date

15 novembre 2026

## Contexte & Analyse des Problèmes

Dans le cadre de l'audit approfondi post-Phase 6.4, trois failles de cohérence et de synchronisation des données dérivées ont été identifiées :

1. **Bug S1-2 (Invalidation Underlay Cache & Réactivité UI) :**
   Le cache vectoriel `Path2D` des niveaux fantômes (underlay) n'était pas invalidé de manière sélective lors des mutations documentaires. La vue 2D ne réagissait pas automatiquement aux modifications effectuées sur le niveau inférieur lorsque l'utilisateur se trouvait sur un niveau supérieur avec vue fantôme activée.

2. **Bug S2-3 (Fuite de cycle de vie et destruction prématurée des matériaux partagés Three.js) :**
   Dans `Scene3D.removeMesh`, la méthode appelait aveuglément `.dispose()` sur `mesh.material` et `mesh.userData.baseMaterial`. Lorsque des matériaux partagés (comme `doorMaterial` ou `windowMaterial` conservés dans des `useRef` React de `Viewport3D`, ou les matériaux internes `slabMaterial` et `stairMaterial` de `Scene3D`) étaient réutilisés entre plusieurs maillages ou frames, la suppression d'un maillage détruisait le matériau partagé pour tous les autres, corrompant les shaders WebGL.

3. **Bug S2-5 (Divergence de dérivation des trémies d'escalier entre 2D et 3D) :**
   Le composant `View2D` recalculait manuellement le rectangle de trémie de manière redondante avec des marges arbitraires sans tenir compte de la coupure d'échappée réglementaire (`computeHeadroomCutoffStep`), tandis que `Viewport3D` appelait `computeStairShaft` sans l'option `useHeadroomCutoff: true`. Les représentations 2D et 3D de la même trémie divergeaient géométriquement.

---

## Décisions d'Architecture

### 1. D1 — Invalidation Réactive et Ciblée de l'Underlay Cache (S1-2)

- **Enregistrement des identifiants :** `UnderlayCache.getOrCompile` trace l'ensemble des `elementIds` (murs, portes, fenêtres, escaliers et identifiant de niveau) inclus dans le tracé compilé du niveau fantôme.
- **Filtrage sélectif :** `View2D.invalidateUnderlayCache(changedIds?: readonly string[])` vérifie via `shouldInvalidate(underlayLevelId, changedIds)` si un élément du niveau fantôme actif est impacté. Si oui, l'entrée de cache est purgée et `true` est retourné ; si non, l'entrée est préservée (`false`) évitant toute recompilation superflue.
- **Abonnement réactif :** Dans `Viewport2D.tsx`, un `useEffect` s'abonne à `doc.subscribe(changedIds)` et propage immédiatement l'invalidation vers `viewRef.current.invalidateUnderlayCache(changedIds)`. Les changements de props `activeLevelId` ou `underlayLevelId` déclenchent une invalidation complète sans argument.

### 2. D2 — Protection des Matériaux Partagés et Internes (S2-3)

- **Protocole de propriété :** Un maillage THREE.Mesh peut posséder son matériau (`ownsMaterial: true`, cas par défaut pour les matériaux uniques générés à la volée) ou l'emprunter (`mesh.userData.ownsMaterial === false` ou `mesh.userData.isSharedMaterial === true`).
- **Garde dans `removeMesh` & `dispose` :**
  ```typescript
  if (mesh.userData?.ownsMaterial === false || mesh.userData?.isSharedMaterial === true) {
    continue; // Le matériau survit à la suppression du maillage
  }
  ```
- **Matériaux internes protégés :** `Scene3D` protège ses instances réutilisables `defaultMaterial`, `highlightMaterial`, `slabMaterial` et `stairMaterial` contre toute destruction lors de `removeMesh`. Seul `Scene3D.dispose()` libère ces matériaux à la destruction complète du composant.
- **Placeholders 3D :** Dans `Viewport3D.tsx`, les placeholders d'ouvertures (portes et fenêtres) sont instanciés avec `ownsMaterial: false` et `isSharedMaterial: true`, garantissant la pérennité de `doorMaterialRef` et `windowMaterialRef`.

### 3. D3 — Dérivation Unique et Partagée des Trémies d'Escalier (S2-5)

- **Source unique de vérité :** `packages/view-2d` dépend désormais de `@tabax/core` en dépendance de production (`dependencies`).
- **Élimination de la duplication :** `View2D.ts` remplace l'ancien algorithme manuel par :
  ```typescript
  computeStairShaft(
    st as unknown as Stair,
    state as unknown as BimState,
    { useHeadroomCutoff: true, slabThickness },
  );
  ```
- **Parité stricte 2D / 3D :** `Viewport3D.tsx` applique exactement la même signature avec `{ useHeadroomCutoff: true, slabThickness: slabType.thickness }`. Les contours de trémies sont rigoureusement identiques au millimètre près en plan 2D et en maillage 3D.

---

## Conséquences & Vérification

- Invalidation instantanée de la vue fantôme lors de la modification d'un mur au RDC pendant qu'on consulte le R+1.
- Robustesse WebGL démontrée par 10 cycles consécutifs d'ajout/suppression sans appel à `.dispose()` sur le matériau partagé (`T-SHARED-MAT-01..03`).
- Trémies d'escaliers parfaitement alignées entre plan de niveau supérieur et extrusion 3D avec coupure d'échappée à 2000 mm (`T-STAIR-SHAFT-UNIFIED-01..03`).
