# ADR-058 : Routage Géométrique Déterministe 3D et Insertion Paramétrique des Raccords MEP

## Statut
Accepté

## Date
2026-11-19

## Contexte
Dans le cadre de la Phase 9 (Réseaux Techniques MEP), après la mise en place du modèle sémantique et topologique (`MepNetworkGraph`, ADR-056) et du pipeline graphique 2D/3D avec inspection (Sous-phases 9.3.1 et 9.3.2), le besoin s'est imposé de doter Mini-BIM d'un moteur de routage automatique pour relier deux ports ou tronçons du réseau.

Deux écueils majeurs devaient être évités :
1. **Couplage lourd ou heuristique non déterministe ($A^*$, discrétisation en voxels) :** Ces algorithmes sont coûteux, complexes et non requis pour les topologies orthogonales élémentaires de plomberie et ventilation. De plus, ils sont réservés à la détection d'évitement d'obstacles de la Phase 9.4.
2. **Opérations topologiques destructives non réversibles :** L'insertion d'un piquage en Té dans un conduit existant requiert la scission du segment hôte, la création de 3 sous-entités et le re-câblage des connecteurs incidents. Toute commande non atomique risquerait de corrompre le graphe ou de laisser des connecteurs orphelins en cas d'Undo/Redo.

## Décisions Clés

### 1. D1 — Solveur de Routage Déterministe en Temps Constant $\mathcal{O}(1)$ (`routing.ts`)
- Implémentation d'un solveur géométrique 3D pur, sans dépendance vers le DOM, React ou Three.js (conforme ADR-009).
- Traitement analytique des configurations canoniques :
  - **Trajet direct (Straight run) :** Détecté lorsque les ports sont coaxiaux. Insertion automatique d'un raccord de réduction (`transition`) si les sections ou diamètres diffèrent.
  - **Coude orthogonal en L (90° et 45°) :** Calcul du point d'intersection virtuel avec vérification de non-collision avec le port opposé et support de la bascule d'orientation (`flipOrientation`).
  - **Déport en Z (Baïonnette) :** Deux coudes à 90° successifs pour compenser un décalage d'axe parallèle.
  - **Colonne montante / descendante ($\Delta Z$) :** Transition altimétrique avec coudes verticaux et calcul automatique de la colonne verticale.
- Garde-fou géométrique strict : tout tronçon inférieur à `MIN_SEGMENT_LENGTH_MM = 50 mm` est rejeté avec un code diagnostic clair (`SEGMENT_TOO_SHORT`).

### 2. D2 — Commandes Transactionnelles Atomiques sous Immer (`commands.ts`)
- **`RouteMepPathCommand` :** Matérialise un tracé multi-tronçons (`RoutePlan`) en instanciant les segments, raccords (`elbow`, `transition`) et connecteurs dans une transaction réversible unique.
- **`InsertTeeBranchCommand` :** Pique un raccord Té dans un tronçon existant :
  - Découpe atomiquement le segment hôte $[P_{\text{start}}, P_{\text{end}}]$ en deux sous-segments $[P_{\text{start}}, P_{\text{split}}]$ et $[P_{\text{split}}, P_{\text{end}}]$.
  - Instancie le raccord `tee` avec 3 ports orientés.
  - Re-câble automatiquement les connecteurs incidents de l'ancien segment hôte vers les nouveaux ports.
  - Connecte le port de dérivation à un nouveau tronçon secondaire (`branchData`).
  - Met à jour l'appartenance au système fluide (`MepSystem`).
  - Réversibilité garantie : un `doc.undo()` restaure fidèlement le segment hôte d'origine sans aucun élément orphelin.
- **`ConnectWithTransitionCommand` :** Connecte deux ports compatibles mais de dimensions inégales en intercalant un raccord `transition` avec héritage automatique du `levelId` et du `systemId`.

### 3. D3 — Re-maillage 3D Incrémental Isolé du Réseau MEP (`Viewport3D.tsx`)
- Mutation d'un élément MEP propage l'invalidation graphique (`dirtyCluster`) exclusivement aux éléments physiquement connectés via `state.mepConnectors`.
- **Zéro re-maillage architectural :** Les murs, ouvertures, dalles et toitures ne sont pas re-calculés lors de la pose ou de la modification d'un tronçon MEP.

### 4. D4 — Expérience Utilisateur Interactive et Ergonomie CAD (`MepTool.ts` & `MepRibbon.tsx`)
- Accrochage magnétique hybride :
  - Snapping sur connecteurs ouverts (`evaluateMepPortSnap`) conforme à l'ADR-047 (tolérance dynamique en pixels écran).
  - Snapping sur le corps de tronçons existants (`evaluateMepSegmentBodySnap`) pour l'amorce immédiate d'un piquage en Té.
- Prévisualisation 2D en temps réel : tracé polyline en pointillés à travers tous les waypoints du trajet avec pastilles circulaires sur les coudes intermédiaires.
- Raccourci clavier ergonomique : appui sur `Tab` ou `Espace` en cours de dessin pour inverser instantanément l'orientation du coude (`flipOrientation`).
- Ruban d'options : sélecteur d'angle préférentiel 90° / 45° dans `MepRibbon`.

## Conséquences et Bénéfices

- **Précision & Robustesse :** Tous les calculs géométriques et topologiques s'exécutent en temps constant $\mathcal{O}(1)$, garantissant un temps de calcul imperceptible (< 0,5 ms) lors de l'interaction utilisateur.
- **Intégrité Sémantique :** Absence totale de connecteurs orphelins sur les opérations Undo/Redo.
- **Conformité Architectural / MEP :** Découpage net entre le routage géométrique déterministe (Phase 9.3) et la détection d'évitement d'obstacles / clashes (Phase 9.4).
