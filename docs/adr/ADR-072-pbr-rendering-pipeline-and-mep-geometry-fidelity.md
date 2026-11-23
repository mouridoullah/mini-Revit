# ADR-072 : Pipeline de Rendu PBR RTX, IBL, Bouchons Stencil et Modularisation Géométrique MEP & Composants

## Contexte

Dans le cadre de la version 1.1.0 de Tabax BIM & Engineering, le moteur de rendu 3D (`@tabax/view-3d`) nécessitait une refonte visuelle majeure pour exploiter les capacités modernes de rendu (PBR, IBL, ombres douces haute résolution, occlusion ambiante) tout en résolvant la dette technique liée à la taille de plusieurs fichiers monolithiques historiques (`Scene3D.ts`, `components-3d.ts`, `mesh-generator/mep.ts`).

Plusieurs contraintes architecturales devaient être strictement préservées :
1. **Isolation des packages (ADR-023) :** Zéro modification du noyau `@tabax/core` ; toutes les évolutions visuelles restent confinées à `@tabax/view-3d` et à l'interface `Viewport3D.tsx`.
2. **Rendu à la demande (ADR-018) :** Zéro boucle continue `requestAnimationFrame` au repos pour préserver l'autonomie et les ressources GPU.
3. **Picking géométrique (ADR-026) :** Propagation inconditionnelle de `userData.elementId` sur chaque sous-maillage ou composant instancié.
4. **Protection des matériaux partagés (ADR-050) :** Gestion centralisée et libération unifiée des textures et matériaux partagés (`isSharedMaterial: true`).
5. **Autonomie locale (zéro dépendance externe) :** Génération de l'environnement IBL et des textures PBR en mémoire (zéro asset lourd HDR ou image externe téléchargée).

## Décisions Architecturales

### 1. Pipeline PBR & IBL en Mémoire (`EnvironmentManager.ts` & `ProceduralTextures.ts`)
- **Tone mapping & espace colorimétrique :** Activation de `THREE.ACESFilmicToneMapping` avec exposition calibrée à 1.05 et `THREE.SRGBColorSpace`.
- **Éclairage basé sur l'image (IBL) :** Génération d'une sonde d'environnement en mémoire via `PMREMGenerator` et `RoomEnvironment` natif Three.js, sans téléchargement d'asset HDR externe.
- **Ombres portées haute précision :** `THREE.PCFSoftShadowMap` en 4096×4096 (Ultra) ou 2048×2048 (Standard), avec ajustement dynamique du frustum orthographique sur la bounding box du bâtiment (`fitShadowCameraToBounds`) et réglage précis de `shadow.normalBias` pour éliminer le *shadow acne*.
- **Textures PBR procédurales en mémoire :** Génération au démarrage via `OffscreenCanvas` / `CanvasTexture` (enduit fin, béton banché, parquet chêne, carrelage gris, tôle galvanisée brossée, bois chaleureux) avec `RepeatWrapping` et filtrage anisotrope maximal.

### 2. Occlusion Ambiante et Stratégie Anti-Saccade (`PostProcessingManager.ts`)
- **Pipeline post-traitement :** `EffectComposer` + `RenderPass` + `GTAOPass` + `OutputPass`.
- **Conformité ADR-018 :** Pendant l'interaction orbitale (`OrbitControls` événement `change`), un rendu direct ultra-réactif est effectué (`renderDirect()`). Un timer de 80 ms après le relâchement (`controls.addEventListener('end')`) déclenche la passe d'occlusion ambiante pleine résolution (`scheduleFullRender()`). Aucun calcul GPU n'est exécuté au repos.

### 3. Bouchons de Coupe Stencil (`SectionCapManager.ts`) & Menuiseries Détaillées
- **Bouchons de coupe :** Couplé à `Scene3D.setSectionCutPlane` (ADR-063). Lorsqu'un plan de coupe est actif, un maillage de capuchon orienté `THREE.BackSide` avec matériau anthracite mat (`#1e222a`) masque les creux intérieurs pour offrir un rendu écorché technique lisible.
- **Menuiseries enrichies (`openings-3d.ts`) :**
  - Fenêtres : cadre aluminium anthracite (`#2d3748`), vitrage `THREE.MeshPhysicalMaterial` (`roughness: 0.04`, `metalness: 0.1`, `transmission: 0.85`), meneaux verticaux pour largeur >= 700 mm, traverse pour hauteur >= 1200 mm et appui de fenêtre en saillie.
  - Portes : huisserie périphérique, vantail bois texturé en retrait, moulure de panneau et béquille chromée à +1050 mm.

### 4. Modularisation Géométrique de `components-3d.ts` et `mesh-generator/mep.ts`
- Scission de `components-3d.ts` en sous-modules spécialisés dans `packages/view-3d/src/components/` :
  - `sanitary.ts` : cuvette suspendue, plan vasque avec mitigeur, receveur de douche, baignoire évidée.
  - `kitchen.ts` : caissons bas, plan de travail débordant, plinthe en retrait, électroménager.
  - `furniture.ts` : lit avec tête de lit, table à 4 pieds invariants, chaise avec dossier, canapé à accoudoirs, armoire.
  - `glazing.ts` : baie coulissante et porte-fenêtre à double vantaux décalés.
- Scission de la génération MEP dans `packages/view-3d/src/mesh-generator/mep/` :
  - `pipes.ts` : tuyauteries paramétriques haute fidélité.
  - `ducts.ts` : gaines circulaires et rectangulaires.
  - `cable-trays.ts` : chemins de câbles en profilé U avec échelons transversaux.
  - `fittings.ts` : coudes, tés, croix, réductions et bouchons.
  - `equipment.ts` : CTA, chaudières, ballons ECS, pompes, radiateurs et armoires électriques.

### 5. Contrôle Utilisateur dans l'Interface (`Viewport3D.tsx`)
- Intégration d'une barre de contrôle compacte sans emoji dans le coin supérieur de la vue 3D :
  - 3 modes de rendu : `Technique` (neutre), `Écorché Coupe` (contraste sombre), `Réaliste PBR` (IBL + AO).
  - Curseur d'ensoleillement (heure solaire de 6h à 20h modifiant l'azimut et la hauteur du soleil).
  - Case à cocher pour basculer la visibilité des arêtes d'architecture fines.

## Statut
Accepté et implémenté (v1.1.0).

## Conséquences
- Rendu visuel haut de gamme immédiatement disponible sans téléchargement d'assets lourds.
- Architecture modulaire et découpage des fichiers volumineux facilitant la maintenance.
- Rétrocompatibilité totale avec l'ensemble des 1 345+ tests Vitest et scénarios E2E Playwright.
