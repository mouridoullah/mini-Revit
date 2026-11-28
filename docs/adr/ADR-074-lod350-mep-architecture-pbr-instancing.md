# ADR-074 : Refonte Géométrique LOD 350 MEP, Architecture, Menuiseries & Instanciation GPU Partagée (Tabax v1.3.0)

## Contexte

Suite au déploiement du pipeline PBR et des bouchons de coupe stencil (`Tabax v1.1.0`, `ADR-072`) et du copilote BIM agentique (`Tabax v1.2.0`, `ADR-073`), les réseaux techniques MEP ainsi que l'enveloppe architecturale et les composants intérieurs restaient modélisés majoritairement sous forme de prismes ou de groupes unitaire mono-matériaux (LOD 200), tandis que `Viewport3D.tsx` approchait les 740 lignes et que les pièces répétitives généraient une duplication CPU/GPU inutile sur les maquettes multi-étages.

Parallèlement, les retours terrain sur le détecteur de conflits ont révélé que les coudes directs raccordant deux segments linéaires MEP (`pipe::pipe`, `duct::duct`, `cableTray::cableTray`) pouvaient remonter un faux positif « Hard Clash » égal au diamètre nominal au droit de l'assemblage.

---

## Décisions Architecturales

### 1. D1 — Moteur MEP LOD 350 Multi-Matériaux & Préservation du Socle Core (`@tabax/core`, `@tabax/view-3d`)
- Extension de `MepEquipmentFamily` (`check_valve`, `air_diffuser`, `junction_box`), de `CableTray.style` (`ladder` / `perforated`) et de `MepFitting.eccentricAlignment` (`flat_top` / `flat_bottom`) dans `@tabax/core`, avec couverture round-trip JSON garantie dans `serialization.test.ts`.
- Générateurs procéduraux `MepAssembly3D` (`packages/view-3d/src/mesh-generator/mep/` : `pipes.ts`, `ducts.ts`, `cable-trays.ts`, `fittings-assembly.ts`, `valves.ts`, `equipment-assembly.ts`) et `MepMaterialLibrary` (textures procédurales galva, cuivre, laiton, PVC mat, RAL 7035, EPDM, câbles CFO/CFA/Terre).
- **Dépréciation officielle des générateurs legacy mono-matériaux** (`mep/common.ts`, `mep/equipment.ts`, `mep/fittings.ts`, `mep/batch.ts`) conservés uniquement pour repli technique jusqu'à suppression planifiée en **`v1.4.0`**.
- **Bascules d'échelle automatiques (`syncMepElements.ts`) :** passage dynamique en `lod200` au-delà de `1 500` éléments MEP.

### 2. D2 — Architecture, Enveloppe, Menuiseries & 15 Composants Intérieurs LOD 350 (`@tabax/view-3d`)
- Contrat neutre `ComponentAssembly3D` (`components/types.ts`) couvrant :
  - **Enveloppe & Structure (`walls.ts`, `slabs.ts`, `stairs.ts`, `roofs.ts`, `roof-details.ts`) :**
    - *Murs :* différenciation béton structurel / plâtre + plinthes décoratives chanfreinées (`80 × 12 mm`) interrompues automatiquement aux seuils de portes et continues sous les fenêtres (`createWallSkirtingMesh`, `createWallAssembly`).
    - *Dalles :* sous-face et chants de trémie béton structurel + couche de finition noble parquet / carrelage (`createSlabAssembly`).
    - *Escaliers :* paillasse plâtre, marches chêne à nez débordant (`+25 mm`), limons latéraux aluminium anthracite, main courante chêne et garde-corps inox brossé (`createStairAssembly`).
    - *Toitures :* module scindé en `roofs.ts` (corps structurel étanche) + `roof-details.ts` (faîtage zinc profilé, rives pignon, chéneaux demi-ronds avec descentes EP ou couvertines acrotères + gravillons pour toits plats).
  - **Menuiseries hébergées (`openings-3d.ts`, alignées sur `components/glazing.ts`) :**
    - `createWindowAssembly` et `createDoorAssembly` avec chambranles chanfreinés double face, joint d'ombre périphérique de `3 mm`, appui extérieur avec larmier goutte d'eau, vitrage physique `glass_clear`, vantail bois mouluré double face, crémone/poignée et paumelles.
    - Rétrocompatibilité conservée sur `createWindowGroup` / `createDoorGroup`.
  - **Composants & Mobilier (`sanitary.ts`, `kitchen.ts`, `furniture.ts`, `glazing.ts`) :**
    - 15 familles refondues sous `ArchitecturalMaterialLibrary` (`porcelain_white`, `chrome_hardware`, `stainless_brushed`, `wood_oak`, `wood_dark`, `fabric_upholstery`, `fabric_cushion`, `quartz_white`, `granite_dark`, `glass_clear`, etc.), avec correctif de clé `role::customColor` lors de `setRenderMode`.

### 3. D3 — Unification des Primitives & Pools GPU `THREE.InstancedMesh` Partagés
- **Socle unifié `mesh-generator/shared/primitives.ts` :** factorise l'algèbre vectorielle `Vec3D`, `composeMatrix4` et `BaseMeshAccumulator` (boîte chanfreinée étanche à 18 faces + 8 coins, cylindre lisse à UVs métriques). `UvMeshAccumulator` et `ArchitecturalMeshAccumulator` héritent de ce tronc commun.
- **Moteur générique `GenericInstancePoolManager` (`rendering/InstancePoolBase.ts`) :** mutualisé entre `MepInstancePoolManager` (8 prototypes MEP : `bolt_m10`, `flange_corner`, `pipe_clamp`, `threaded_rod`, `ladder_rung`, `cable_gland`, `cabinet_hinge`, `diffuser_blade`) et `ComponentInstancePoolManager` (5 prototypes architecturaux : `railing_post`, `door_handle`, `door_hinge`, `cabinet_pull`, `furniture_leg`).
- **Exclusion stricte `SectionCapManager` :** les vitrages (`glass_clear`, `glass_tinted`) et équipements/mobilier ne sont jamais enregistrés dans les bouchons de coupe stencil.

### 4. D4 — Désengorgement de `Viewport3D.tsx` & Respect Strict d'`ADR-072` (`Scene3D.ts <= 800 L`)
- Extraction des synchroniseurs purs dans `apps/web/src/components/viewport-3d/` (`syncArchitecturalStructure.ts`, `syncArchitecturalOpenings.ts`, `syncArchitecturalComponents.ts`, `syncMepElements.ts`), ramenant `Viewport3D.tsx` sous les `500` lignes.
- `Scene3D.ts` reste strictement sous le plafond de `800` lignes (**`760` lignes**, marge de `40` lignes).

### 5. D5 — Pré-Lot Anti-Faux-Positifs Coudes MEP (`@tabax/core/clash`)
- Ajout de `areLinearMepNaturallyConnected` dans `packages/core/src/clash/classification/rules.ts` (pré-lot d'`ADR-075`) afin d'exclure les contacts légitimes aux coudes directs entre deux tuyaux, gaines ou chemins de câbles raccordés dans `MepNetworkGraph`.

---

## Statut
**Accepté** — Implémenté, qualifié par tests unitaires, tests GPU `ArchitecturalMeshManager`/`Scene3D` et métrologie complète sur `demo-immeuble-r4.json` pour **`Tabax v1.3.0`**.

## Conséquences
- **Réduction drastique des draw calls sur maquettes denses :** sur l'Immeuble R+4 complet (`demo-immeuble-r4.json`), **410 pièces d'architecture/mobilier** et **1 197 éléments de quincaillerie MEP** sont instanciés via **11 pools `InstancedMesh` seulement** (`6` pools Archi + `5` pools MEP), pour un temps total de construction scène `< 2,2 s`.
- **Cohérence visuelle totale** entre menuiseries hébergées (`openings-3d.ts`) et menuiseries catalogue (`glazing.ts`), ainsi qu'entre les modes `Technique`, `Écorché` et `Réaliste PBR`.
- **Suppression planifiée en `v1.4.0`** des 4 anciens fichiers MEP legacy (`common.ts`, `equipment.ts`, `fittings.ts`, `batch.ts`).
