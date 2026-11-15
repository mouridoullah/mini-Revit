# Registre des Exceptions Lint (Dette Technique Tolérée)

Ce document répertorie l'intégralité des 75 avertissements `@typescript-eslint/no-non-null-assertion` préexistants dans le projet avant la Phase 7.
**Règle Phase 7** : Aucun nouvel avertissement toléré (zéro warning sur les nouveaux fichiers et modifications).

| Fichier | Ligne(s) | Contexte / Justification |
|---|---|---|
| `apps/web/src/components/PropertyInspector.tsx` | 294, 298, 466, 566, 677, 744, 799 | Extraction sûre d'éléments dictionnaires après vérification préalable d'existence ou accès aux champs de formulaires typés. |
| `apps/web/src/tools/SlabTool.ts` | 22, 23, 105, 114, 196 | Accès aux sommets de polygone lors du tracé interactif de dalle garanti par le state machine. |
| `apps/web/src/tools/StairTool.ts` | 181, 186 | Accès aux points de contrôle de l'escalier lors de l'interaction après test d'état. |
| `packages/core/src/commands.ts` | 211 | Accès sécurisé au patch de commande après garde de type. |
| `packages/core/src/dag/DependencyGraph.ts` | 120, 174 | Accès aux nœuds adjacents dans la table de hachage du DAG lors du parcours topologique. |
| `packages/core/src/levels.ts` | 29, 54, 62, 66, 67 | Calculs altimétriques inter-niveaux après tri ordonné des étages. |
| `packages/core/src/migrations/v1_to_v2.ts` | 198 | Déréférencement d'attributs lors de la migration du schéma documentaire. |
| `packages/core/src/relations/cascade.ts` | 73 | Récupération de l'arête de relation après vérification dans le registre. |
| `packages/core/src/rules.ts` | 644, 655, 666, 677, 688, 699, 710, 754, 844, 877, 971, 1193 | Vérification des règles métier et cascades de contraintes sur entités validées. |
| `packages/core/src/walls.ts` | 115 | Accès aux coordonnées de vecteur d'axe après vérification de longueur. |
| `packages/geometry/src/mesh/triangulate.ts` | 174 | Déréférencement des indices de sommets après calcul Earcut. |
| `packages/geometry/src/slabs/effective.ts` | 138, 139, 148 | Découpe booléenne d'empreinte de dalle après clipping de polygones. |
| `packages/view-2d/src/renderer.ts` | 284, 292, 723, 726, 1020, 1029, 1074, 1088 | Accès aux segments et styles de tracé Canvas 2D. |
| `packages/view-3d/src/mesh-generator.ts` | 302, 318, 324, 341..343, 350, 351, 370, 508, 617, 638..640, 642..644, 663, 684..686, 688..690 | Indexation directe des triplets de sommets et normales dans les buffers Three.js pour escaliers et dalles extrudées. |
