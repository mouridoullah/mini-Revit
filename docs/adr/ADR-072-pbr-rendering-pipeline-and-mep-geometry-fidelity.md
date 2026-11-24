# ADR-072 : Rendu Photoréaliste PBR, Éclairage IBL Studio, Bouchons de Coupe Stencil 2-Passes & Scission Modulaire de `@tabax/view-3d` (Tabax v1.1.0)

## Contexte

Dans le cadre de la version 1.1.0 de Tabax BIM & Engineering, le moteur de rendu 3D (`@tabax/view-3d`) nécessitait une refonte visuelle majeure pour exploiter les capacités modernes de rendu (PBR, IBL, ombres douces haute résolution, occlusion ambiante) tout en résolvant la dette technique liée à la taille de plusieurs fichiers monolithiques historiques (`Scene3D.ts`, `components-3d.ts`, `mesh-generator/mep.ts`).

Plusieurs contraintes architecturales devaient être strictement préservées :
1. **Isolation des packages (ADR-023) :** Zéro modification du noyau `@tabax/core` ; toutes les évolutions visuelles restent confinées à `@tabax/view-3d` et à l'interface `Viewport3D.tsx`.
2. **Rendu à la demande (ADR-018) :** Zéro boucle continue `requestAnimationFrame` au repos pour préserver l'autonomie et les ressources GPU.
3. **Picking géométrique (ADR-026) :** Propagation inconditionnelle de `userData.elementId` sur chaque sous-maillage ou composant instancié.
4. **Protection des matériaux partagés (ADR-050) :** Gestion centralisée et libération unifiée des textures et matériaux partagés (`isSharedMaterial: true`).
5. **Autonomie locale (zéro dépendance externe) :** Génération de l'environnement IBL et des textures PBR en mémoire (zéro asset lourd HDR ou image externe téléchargée).

## Décisions Architecturales

### 1. D1 — Pipeline PBR & Éclairage IBL Studio (`rendering/EnvironmentManager.ts`)
- **Tone mapping & espace colorimétrique :** Activation de `THREE.ACESFilmicToneMapping` avec exposition calibrée à 1.05 et `THREE.SRGBColorSpace`.
- **Éclairage basé sur l'image (IBL) :** Génération d'une sonde d'environnement en mémoire via `PMREMGenerator` et `RoomEnvironment` natif Three.js, sans téléchargement d'asset HDR externe.
- **Ombres portées haute précision :** `THREE.PCFSoftShadowMap` en 4096×4096 (Ultra) ou 2048×2048 (Standard), avec ajustement dynamique du frustum orthographique sur la bounding box du bâtiment (`fitShadowCameraToBounds`) et réglage précis de `shadow.normalBias = 2.0` pour éliminer le *shadow acne*.
- **Sol studio récepteur d'ombres douces :** `ShadowMaterial` positionné sous `Z = -1`.
- **Contrôle solaire horaire :** Méthode `setSunHour(0-24)` orientant l'azimut et la hauteur du soleil.

### 2. D2 — Occlusion Ambiante Temps Réel & Anti-Saccade (`rendering/PostProcessingManager.ts`)
- **Pipeline post-traitement :** `EffectComposer` + `RenderPass` + `GTAOPass` + `OutputPass`.
- **Conformité ADR-018 :** Pendant l'interaction orbitale (`OrbitControls` événement `change`), un rendu direct ultra-réactif est effectué (`renderDirect()`). Un timer de 80 ms après le relâchement (`controls.addEventListener('end')`) déclenche la passe d'occlusion ambiante pleine résolution (`scheduleFullRender()`). Aucun calcul GPU n'est exécuté au repos.
- **Trois modes de rendu dédiés :** `technique` (rapide, sans ombres, look dessin), `ecorche` (fond sombre studio, contraste MEP), `realiste` (PBR, IBL, ombres et AO).

### 3. D3 — Bouchons de Coupe Pleins Stencil 2-Passes (`rendering/SectionCapManager.ts`)
- Mise en œuvre d'un véritable pipeline Stencil Buffer 2-passes :
  1. Passe 1 : Face arrière (`THREE.BackSide`) avec `IncrementWrapStencilOp` (`renderOrder: 1`).
  2. Passe 2 : Face avant (`THREE.FrontSide`) avec `DecrementWrapStencilOp` (`renderOrder: 1`).
  3. Passe 3 : Plan bouchon coplanaire mat (`#1e222a`) testant `stencilRef !== 0` et remettant le stencil à zéro (`renderOrder: 2`).
- Rendu solide et massif des sections coupées sans aucun vide intérieur ni z-fighting, préservant la visibilité des réseaux MEP traversants.

### 4. D4 — Menuiseries Paramétriques Haute Fidélité (`mesh-generator/openings-3d.ts`)
- **Fenêtres :** Cadre dormant aluminium anthracite (`#2d3748`), ouvrant intérieur, vitrage `THREE.MeshPhysicalMaterial` (`roughness: 0.04`, `transmission: 0.85`), meneaux verticaux pour largeur >= 700 mm, traverse pour hauteur >= 1200 mm et appui de fenêtre en saillie.
- **Portes :** Huisserie périphérique aluminium, vantail bois chaud (`#8b5a2b`) avec moulure de panneau en relief et béquille métallique chromée à +1050 mm.

### 5. D5 — Textures PBR Procédurales & Sols de Pièces (`rendering/ProceduralTextures.ts`, `mesh-generator/rooms.ts`)
- Génération procédurale sans assets externes via canvas 2D : enduit fin, béton banché, parquet chêne clair, carrelage gris doux, tôle galvanisée brossée et bois chaleureux.
- Intégration dans `rooms.ts` selon le type ou nom de pièce (carrelage pour pièces humides / sanitaires, parquet pour pièces sèches).
- Matériaux partagés conformes à ADR-050 et libérés proprement dans `Scene3D.dispose()`.

### 6. D6 — Scission Modulaire des Gros Fichiers de `@tabax/view-3d`
- **`Scene3D.ts` :** Monolithe ramené à **773 lignes** (strictement sous les 800 lignes requises par ADR-072), déléguant le maillage à `ArchitecturalMeshManager`, la grille à `ArchitecturalGridManager`, les matériaux à `DomainMeshFactory`, la surbrillance à `SelectionHighlightManager`, les collisions à `ClashOverlayManager` et la caméra à `CameraTransitionManager`.
- **`mesh-generator/mep.ts` :** Divisé en 8 sous-modules étanches dans `packages/view-3d/src/mesh-generator/mep/` (`colors.ts`, `common.ts`, `pipes.ts`, `ducts.ts`, `cable-trays.ts`, `fittings.ts`, `equipment.ts`, `batch.ts`) avec façade de ré-export de 27 lignes.
- **`components-3d.ts` :** Scindé en sous-modules spécialisés dans `packages/view-3d/src/components/` (`sanitary.ts`, `kitchen.ts`, `furniture.ts`, `glazing.ts`) avec façade de ré-export de 18 lignes.

### 7. D7 — Contrôle Utilisateur dans l'Interface (`Viewport3D.tsx`)
- Intégration d'une barre de contrôle compacte sans emoji dans le coin supérieur de la vue 3D :
  - 3 modes de rendu : `Technique`, `Écorché`, `Réaliste`.
  - Curseur d'ensoleillement dynamique (heure solaire 6h-20h modifiant l'azimut et la hauteur du soleil).
  - Case à cocher pour basculer la visibilité des arêtes d'architecture fines.

## Statut
Accepté et implémenté (v1.1.0).

## Conséquences
- Rendu photoréaliste de niveau studio sur station RTX sans aucune dépendance externe ni fichier d'asset téléchargé.
- Zéro dégradation des performances : rendu à la demande ADR-018 préservé, zéro boucle d'animation permanente.
- Découpage strict et isolation des packages respectée (zéro modification de `@tabax/core`).
- Codebase considérablement allégée : plus aucun fichier de plus de 800 lignes dans `@tabax/view-3d` (`Scene3D.ts` à 773 lignes).
- Couverture : tests unitaires dédiés GPU/cycle de vie dans `rendering/`, 18 scénarios Playwright E2E réels (incluant le basculement PBR / Écorché / curseur solaire, export DXF R12, idempotence d'auto-cotation et synchronisation de coupe 3D écorchée).
