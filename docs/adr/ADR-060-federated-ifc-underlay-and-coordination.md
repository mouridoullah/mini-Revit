# ADR-060 : Modèle de Référence Fédéré IFC en Lecture Seule (Underlay 3D) & Coordination Spatiale Inter-Maquettes

* **Statut :** ACCEPTÉ
* **Date :** 2026-11-20
* **Auteurs :** Équipe Mini-BIM
* **Décideurs :** Architecte Core & Moteur Géométrique
* **Livrable :** Sous-phase 9.5 (Clôture de la Phase 9)

---

## 1. Contexte & Problématique

Jusqu'à la Phase 9.4, Mini-BIM permettait la modélisation complète d'architectures et de réseaux techniques (MEP), ainsi que la détection de conflits internes dans sa propre maquette native (`BimState`).

Dans un flux de travail BIM réel (BIM Management et synthèse interdisciplinaire), les différents corps d'état (Structure, Architecture, CVC, Électricité, Plomberie) travaillent souvent sur des logiciels distincts et échangent des maquettes sous le format standardisé ISO 16739 (IFC4 / IFC2X3).

L'introduction de maquettes IFC externes posait un dilemme architectural critique :
- **Anti-pattern à proscrire :** Tenter une conversion destructive de l'IFC externe vers des entités éditables natives (`Wall`, `Slab`, etc. dans `BimState`). Ce choix introduit des cas limites géométriques infinis, pollue le modèle paramétrique natif et corrompt la source de vérité.
- **Principe BIM industriel :** Gérer les fichiers IFC externes comme des **maquettes de référence fédérées en lecture seule** (*Underlay 3D* / coordination layer), superposées dans la scène sans jamais modifier les données natives.

---

## 2. Décisions Architecturales

### 2.1 Isolation Stricte du Noyau Métier (`ADR-001`)
- Les maquettes externes sont représentées par l'interface dédiée `FederatedModel`, totalement disjointe de `BimState`.
- Une maquette fédérée :
  - N'injecte **aucun** élément dans `state.walls`, `state.slabs` ou `state.pipes`.
  - Ne génère **aucune** transaction dans le CommandBus et n'entre pas dans l'historique Undo/Redo.
  - N'est **pas** persistée dans la base IndexedDB locale (`autoSave`).
  - Possède son propre cycle de vie (chargement, recalage, visibilité, déchargement).

### 2.2 Normalisation Métrique & Alignement de Repère (`ADR-003`)
- Les fichiers IFC externes peuvent être exprimés en mètres, millimètres, pieds ou pouces.
- Le module `detectIfcUnits` analyse `IFCSIUNIT` et calcule un facteur de mise à l'échelle exact vers l'unité de référence interne (**millimètre**).
- WebIFC projetant par défaut ses géométries dans le repère Y-up standard d'OpenGL/Three.js, `transformVertexToMiniBim` applique la transformation de coordonnées inverse vers le repère architectural Z-up de Mini-BIM :
  $$\begin{cases} X_{\text{mini}} = X_{\text{web}} \times \text{scaleToMm} \\ Y_{\text{mini}} = -Z_{\text{web}} \times \text{scaleToMm} \\ Z_{\text{mini}} = Y_{\text{web}} \times \text{scaleToMm} \end{cases}$$
- **Validation étalon round-trip :** L'export IFC de la Villa Contemporaine Complexe rechargé en modèle fédéré coïncide avec le modèle natif à moins de **0,1 mm** d'écart sur l'ensemble de ses sommets.

### 2.3 Discipline Mémoire WASM & WebGL
- Le parsing WebIFC est systématiquement encapsulé dans un bloc `try ... finally { ifcApi.CloseModel(openModelId); }` assurant la libération immédiate de la mémoire WebAssembly après extraction des maillages.
- Dans `packages/view-3d`, la classe dédiée `FederatedIfcManager` regroupe les géométries Three.js dans un conteneur indépendant `FederatedIfcContainer` et libère systématiquement les `BufferGeometry` et `MeshStandardMaterial` lors du déchargement ou du `dispose()`.

### 2.4 Coordination Spatiale BVH (`ADR-059`)
- Chaque entité fédérée expose une boîte englobante 3D (`AABB3D`) normalisée dans le repère Mini-BIM, prenant en compte le décalage de recalage $(dX, dY, dZ)$ paramétré par l'utilisateur.
- La fonction `detectFederatedClashes(nativeState, federatedModel)` insère les entités IFC dans le `BVHTree` de la 9.4 pour détecter en temps interactif les collisions entre éléments natifs (ex: passage d'un tuyau ou d'une gaine) et éléments externes (ex: mur porteur ou poteau d'une maquette gros-œuvre).

### 2.5 Inspection Sémantique en Lecture Seule
- Le clic 3D sur un élément fédéré utilise le raycasting pour retrouver la paire `(modelId, expressId)`.
- Le panneau `FederatedIfcPanel` affiche en lecture seule le type IFC (`IfcWall`, `IfcSlab`, etc.), le `GlobalId` ISO de 22 caractères, le nom, la description et les jeux de propriétés (`BaseQuantities`, `PropertySets`).

---

## 3. Conséquences & Bénéfices

* **Sécurité du modèle :** Zéro risque de corruption du modèle natif par un fichier IFC tiers mal formé.
* **Coordination interdisciplinaire :** Capacité immédiate de confronter les réseaux techniques Mini-BIM aux géométries de référence d'autres logiciels BIM du marché.
* **Sobriété mémoire :** Les données géométriques sont converties en buffers typés légers, le parser WASM est refermé immédiatement, et Three.js gère la transparence et le filaire sans duplication de géométrie.
* **Indépendance architecturale :** Les 5 packages (`geometry`, `core`, `view-2d`, `view-3d`, `web`) préservent strictement leurs frontières sans couplage circulaire.
