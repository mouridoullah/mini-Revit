# ADR-067 : Identité de Marque Tabax & Renommage du Monorepo (`@tabax/*`)

## Statut
Accepté

## Contexte
Initié sous le nom de code de recherche `mini-Revit` / `Mini-BIM`, le projet a dépassé le stade de simple démonstrateur technologique pour devenir une plateforme logicielle professionnelle complète de modélisation de données du bâtiment (BIM) et de CAO architecturale dans le navigateur.

Avec l'achèvement de la Saison 3 (coupes 2D et élévations dynamiques, export DXF R12 sans dépendance, moteur vectoriel de carnet de plans multi-pages PDF 1.4, outillage de cotation et auto-cotation d'étage, réseaux MEP complets, détection de conflits spatiaux BVH et passage à l'échelle 10k entités), le produit nécessitait une identité de marque pérenne, distinctive et taillée pour l'ingénierie internationale.

Parmi les propositions explorées, le nom **Tabax** a été retenu à l'unanimité :
- **Origine & Signification :** En wolof, *tabax* signifie « construire, bâtir, édifier » ou désigne l'« édifice / bâtiment ».
- **Impact & Phonétique :** Direct, massif et sobre, il s'inscrit dans la lignée des grands noms de logiciels d'ingénierie et d'architecture (*Tekla*, *Revit*, *Archicad*).
- **Sobriété technique :** Deux syllabes fluides, sans caractères spéciaux ni accents, idéales pour les namespaces de packages (`@tabax/core`, `@tabax/geometry`) et les dépôts Git.

---

## Décision

### 1. Renommage du Scope des Workspaces (`@tabax/*`)
Tous les paquets du monorepo sont désormais publiés et consommés sous le scope officiel `@tabax` :
- `@mini-bim/geometry` $\to$ **`@tabax/geometry`** (Noyau géométrique pur)
- `@mini-bim/core` $\to$ **`@tabax/core`** (Noyau métier et modèle documentaire)
- `@mini-bim/view-2d` $\to$ **`@tabax/view-2d`** (Moteur de rendu 2D, DXF et PDF)
- `@mini-bim/view-3d` $\to$ **`@tabax/view-3d`** (Moteur de rendu Three.js)
- `@mini-bim/web` $\to$ **`@tabax/web`** (Cockpit applicatif web)
- `package.json` racine : `"name": "tabax-monorepo"`, `"description": "Tabax — Logiciel de modélisation architecturale et d'ingénierie BIM"`

---

### 2. Branding Applicatif & Expérience Utilisateur
- **Titre de la fenêtre web (`index.html`) :** `Tabax — Modélisation Architecturale & Ingénierie BIM`
- **Logo Cockpit (`Toolbar.tsx`) :** Affichage officiel `TABAX` avec badge de version dans le ruban Graphite Engineering.
- **Exports documentaires :**
  - **OpenBIM IFC4 :** En-têtes `IFCAPPLICATION(#..., '1.0.0', 'Tabax', 'tabax')` et `Tabax IFC4 Generator`.
  - **AutoCAD DXF R12 :** Identifiant `Tabax DXF Engine` et calques normalisés.
  - **Carnet de plans PDF 1.4 :** Cartouche architectural normalisé `TABAX BIM & ENGINEERING` et en-tête `TABAX CAD & GRAPHITE ENGINEERING`.
  - **Exports vectoriels SVG :** Métadonnées `Tabax CAD Engine` et `Tabax Architect`.
  - **Fichiers par défaut :** Téléchargements normalisés `tabax-model.ifc`, `tabax-plan.svg`, `project.mbim.json`.

---

### 3. Documentation & Gouvernance
- Mise à jour du `README.md` présentant la vision et les capacités actuelles de Tabax.
- Harmonisation des schémas d'`ARCHITECTURE.md`, `ROADMAP.md` et des spécifications techniques de modules.

---

## Conséquences

### Positives
- Identité de marque forte, singulière, professionnelle et culturelle.
- Cohérence totale entre l'interface utilisateur, les livrables générés (PDF, DXF, IFC) et l'architecture du code source (`@tabax/*`).
- Fin du nommage transitoire « mini-Revit » / « Mini-BIM ».

### Neutres
- Re-synchronisation du lockfile pnpm et des liens de workspaces.
