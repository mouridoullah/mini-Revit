# ADR-051 : Persistance Locale Automatique via IndexedDB & Sécurisation de Session (S2-8)

## Statut

**Accepté** (Chantier 3 — Persistance locale automatique S2-8)

## Date

15 novembre 2026

## Contexte & Analyse du Problème

Avant le Chantier 3, Mini-BIM ne disposait d'aucun mécanisme de persistance automatique :
- En cas de rafraîchissement inopiné de la page (F5, fermeture d'onglet ou crash navigateur), tout le travail non exporté explicitement via le bouton "Sauvegarder" (fichier JSON téléchargé) était irrémédiablement perdu.
- Les prototypes BIM modernes doivent garantir la sécurité des données utilisateur sans friction, en enregistrant automatiquement l'état transactionnel sans impacter la fluidité de l'UI (60 fps).

---

## Décisions d'Architecture

### 1. D1 — Choix Technologique : IndexedDB

- `localStorage` est synchrone et limité à ~5 Mo, ce qui risque de bloquer le fil principal lors de la sérialisation de projets de plusieurs milliers d'éléments architecturaux.
- `IndexedDB` est asynchrone, non bloquant, et offre des quotas de stockage de plusieurs centaines de mégaoctets.
- Base de données dédiée : `mini_bim_autosave` (version 1), ObjectStore : `projects`, clé primaire : `'current_project'`.

### 2. D2 — Structure de l'Enregistrement de Sauvegarde

```typescript
export interface AutoSaveRecord {
  readonly id: 'current_project';
  readonly state: BimState;
  readonly json: string;
  readonly timestamp: number;
  readonly schemaVersion: number;
}
```

La double présence de `state` et `json` permet une désérialisation immédiate ou une validation via `BimDocument.fromJSON(record.json)` garantissant la totale intégrité du schéma et du DAG de dépendances.

### 3. D3 — Stratégie Temporelle : Debounce 500 ms & Flush Immédiat

- **Modifications transactionnelles :** Chaque exécution de commande déclenche `doc.subscribe()`, qui notifie `AutoSaveManager.scheduleSave(doc)`. Un délai d'inactivité (debounce) de 500 ms regroupe les rafales de modifications (ex. tracé continu de mur ou glissement) en une seule écriture disque.
- **Flush sur `beforeunload` :** Un écouteur sur l'événement `beforeunload` de la fenêtre déclenche `flushSave(doc)` si des modifications non encore écrites sont en attente (`isDirty() === true`).
- **Sauvegarde explicite :** L'export fichier déclenche également une persistance synchrone dans IndexedDB.

### 4. D4 — Restauration Automatique au Démarrage

- Au montage initial de `<App />`, si aucun `initialDoc` de test n'est fourni, l'application interroge IndexedDB via `loadFromIndexedDB()`.
- Si un projet est trouvé, il est reconstitué via `BimDocument.fromJSON(res.json)` et injecté dans le contexte documentaire via `setDocument()`.
- Une notification informative discrète (bannière bleue `data-testid="info-banner"`) signale à l'utilisateur : *"Projet restauré depuis la sauvegarde automatique"* et s'estompe après 4 secondes.

### 5. D5 — Testabilité Headless & Mock Isolé

- Node.js et JSDOM ne disposent pas d'implémentation native d'IndexedDB.
- Un mock complet et déterministe (`createMockIndexedDB`) a été développé dans `apps/web/src/persistence/indexedDBMock.ts` et enregistré sur `globalThis.indexedDB` dans `test-setup.ts`.
- Tous les tests de persistance (`T-AUTOSAVE-01..05` et `T-APP-AUTOSAVE-01`) s'exécutent en mémoire sans dépendance externe native.

---

## Conséquences & Vérification

- Aucun blocage du thread UI lors des modifications architecturales.
- Sauvegarde continue invisible pour l'utilisateur.
- Restauration fidèle après rafraîchissement d'onglet, préservant 100 % des murs, niveaux, dalles, escaliers, ouvertures et pièces.
