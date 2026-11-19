# Registre des Exceptions Lint (Dette Technique Liquidée)

**Statut au Lot 4 de Consolidation : 0 exception / 0 warning.**

L'intégralité des avertissements `@typescript-eslint/no-non-null-assertion` préexistants (75 identifiés) a été éradiquée lors du **Lot 4 de consolidation** (qualité industrielle et maintenabilité).
Toutes les assertions non-nulles ont été remplacées par des gardes défensives strictes, des destructions vérifiées ou des helpers typés sûrs (`assertNoViolations`, etc.).

La politique de qualité du dépôt impose désormais :
- **0 erreur ESLint**
- **0 warning ESLint**
- **0 assertion `!` tolérée**
- **0 `any` / 0 `@ts-ignore` / 0 `TODO`**
