import type { BimState, ElementId, Wall } from '../types.js';
import { BimValidationError } from '../rules.js';
import type { RelationDef } from '../relations/types.js';
import { RELATIONS_REGISTRY } from '../relations/registry.js';
import { isWallCoveredByRoof } from '../roofs/top-profile.js';
import { getEntitiesForCategory, getEntityFieldValue } from '../relations/cascade.js';

/**
 * Graphe de dépendances dirigé acyclique (DAG minimal) pour la propagation d'invalidation.
 * Dans ce graphe : parent -> enfant (dépendant).
 * Exemple : wall -> door (si wall change, door est invalidée).
 */
export class DependencyGraph {
  private readonly forward = new Map<ElementId, Set<ElementId>>(); // parent -> children
  private readonly backward = new Map<ElementId, Set<ElementId>>(); // child -> parents

  /**
   * Ajoute une arête orientée du parent vers l'enfant dépendant.
   */
  public addEdge(parent: ElementId, child: ElementId): void {
    if (!parent || !child || parent === child) return;

    let children = this.forward.get(parent);
    if (!children) {
      children = new Set();
      this.forward.set(parent, children);
    }
    children.add(child);

    let parents = this.backward.get(child);
    if (!parents) {
      parents = new Set();
      this.backward.set(child, parents);
    }
    parents.add(parent);
  }

  /**
   * Supprime une arête orientée existante.
   */
  public removeEdge(parent: ElementId, child: ElementId): void {
    this.forward.get(parent)?.delete(child);
    this.backward.get(child)?.delete(parent);
  }

  /**
   * Supprime complètement un nœud et toutes ses arêtes incidentes.
   */
  public removeNode(id: ElementId): void {
    const children = this.forward.get(id);
    if (children) {
      for (const child of children) {
        this.backward.get(child)?.delete(id);
      }
      this.forward.delete(id);
    }

    const parents = this.backward.get(id);
    if (parents) {
      for (const parent of parents) {
        this.forward.get(parent)?.delete(id);
      }
      this.backward.delete(id);
    }
  }

  /**
   * Retourne la fermeture transitive ordonnée (ULID) de tous les descendants (dépendants).
   */
  public getDependents(id: ElementId): readonly ElementId[] {
    const directChildren = this.forward.get(id);
    if (!directChildren || directChildren.size === 0) return [];

    const visited = new Set<ElementId>();
    const queue: ElementId[] = [];

    for (const child of directChildren) {
      visited.add(child);
      queue.push(child);
    }

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;
      const nextChildren = this.forward.get(current);
      if (nextChildren) {
        for (const child of nextChildren) {
          if (!visited.has(child)) {
            visited.add(child);
            queue.push(child);
          }
        }
      }
    }

    return Array.from(visited).sort();
  }

  /**
   * Retourne la liste des parents directs d'un nœud (dépendances directes).
   */
  public getDependencies(id: ElementId): readonly ElementId[] {
    const parents = this.backward.get(id);
    if (!parents || parents.size === 0) return [];
    return Array.from(parents).sort();
  }

  /**
   * Vérifie la présence d'au moins un cycle dans le graphe.
   */
  public hasCycle(): boolean {
    return this.findCycleNodes().length > 0;
  }

  /**
   * Détecte les cycles via un parcours DFS à 3 couleurs.
   * Retourne la liste des nœuds impliqués dans un cycle.
   */
  public findCycleNodes(): ElementId[] {
    if (this.forward.size === 0) return [];

    const color = new Map<ElementId, number>();
    const parentPath = new Map<ElementId, ElementId>();
    let cycleNodes: ElementId[] = [];

    const dfs = (node: ElementId): boolean => {
      color.set(node, 1);

      const children = this.forward.get(node);
      if (children) {
        for (const next of children) {
          const c = color.get(next);
          if (c === 1) {
            // Cycle détecté ! Reconstitution du chemin
            const cycle: ElementId[] = [next, node];
            let curr = node;
            while (parentPath.has(curr) && parentPath.get(curr) !== next) {
              const p = parentPath.get(curr);
              if (!p) break;
              curr = p;
              cycle.push(curr);
            }
            cycleNodes = Array.from(new Set(cycle)).sort();
            return true;
          }
          if (c === undefined) {
            parentPath.set(next, node);
            if (dfs(next)) return true;
          }
        }
      }

      color.set(node, 2);
      return false;
    };

    for (const node of this.forward.keys()) {
      if (color.get(node) === undefined) {
        if (dfs(node)) break;
      }
    }

    return cycleNodes;
  }

  /**
   * Construit le graphe de dépendances complet à partir d'un état documentaire et d'un registre de relations.
   */
  public static build(
    state: BimState,
    registry: readonly RelationDef[] = RELATIONS_REGISTRY,
  ): DependencyGraph {
    const graph = new DependencyGraph();

    if (registry === RELATIONS_REGISTRY) {
      // Chemin optimisé en un seul passage linéaire O(E) sans allocations de tuples
      const doors = state.doors;
      if (doors) {
        for (const id in doors) {
          const d = doors[id];
          if (!d) continue;
          if (d.hostWallId) graph.addEdge(d.hostWallId, d.id);
          if (d.doorTypeId) graph.addEdge(d.doorTypeId, d.id);
        }
      }

      const windows = state.windows;
      if (windows) {
        for (const id in windows) {
          const w = windows[id];
          if (!w) continue;
          if (w.hostWallId) graph.addEdge(w.hostWallId, w.id);
          if (w.windowTypeId) graph.addEdge(w.windowTypeId, w.id);
        }
      }

      const wallsByTopLevelId = new Map<ElementId, ElementId[]>();
      const wallsByRoofId = new Map<ElementId, ElementId[]>();
      const unconstrainedWalls: Wall[] = [];

      const walls = state.walls;
      if (walls) {
        for (const id in walls) {
          const w = walls[id];
          if (!w) continue;
          if (w.typeId) graph.addEdge(w.typeId, w.id);
          if (w.levelId) graph.addEdge(w.levelId, w.id);
          if (w.topConstraint?.kind === 'roof' && w.topConstraint.roofId) {
            graph.addEdge(w.topConstraint.roofId, w.id);
            let rList = wallsByRoofId.get(w.topConstraint.roofId);
            if (!rList) {
              rList = [];
              wallsByRoofId.set(w.topConstraint.roofId, rList);
            }
            rList.push(w.id);
          } else if (w.topConstraint?.levelId) {
            graph.addEdge(w.topConstraint.levelId, w.id);
            let tList = wallsByTopLevelId.get(w.topConstraint.levelId);
            if (!tList) {
              tList = [];
              wallsByTopLevelId.set(w.topConstraint.levelId, tList);
            }
            tList.push(w.id);
          } else if (!w.topConstraint) {
            unconstrainedWalls.push(w);
          }
        }
      }

      const dimensions = state.dimensions;
      if (dimensions) {
        for (const id in dimensions) {
          const dim = dimensions[id];
          if (!dim) continue;
          const refs = dim.references;
          if (refs) {
            for (let i = 0; i < refs.length; i++) {
              const refId = refs[i];
              if (refId) {
                graph.addEdge(refId, id);
              }
            }
          }
        }
      }

      const slabsByLevelId = new Map<ElementId, ElementId[]>();
      const slabs = state.slabs;
      if (slabs) {
        for (const id in slabs) {
          const s = slabs[id];
          if (!s) continue;
          if (s.levelId) {
            graph.addEdge(s.levelId, s.id);
            let sList = slabsByLevelId.get(s.levelId);
            if (!sList) {
              sList = [];
              slabsByLevelId.set(s.levelId, sList);
            }
            sList.push(s.id);
          }
          if (s.slabTypeId) graph.addEdge(s.slabTypeId, s.id);

          // Arête slab(N+1) -> wall(N) pour les murs contraints par ce niveau (ADR-045 D2)
          const matchingWalls = wallsByTopLevelId.get(s.levelId);
          if (matchingWalls) {
            for (let i = 0; i < matchingWalls.length; i++) {
              const wid = matchingWalls[i];
              if (wid) graph.addEdge(s.id, wid);
            }
          }
        }
      }

      const stairs = state.stairs;
      if (stairs) {
        for (const id in stairs) {
          const st = stairs[id];
          if (!st) continue;
          if (st.stairTypeId) graph.addEdge(st.stairTypeId, st.id);
          if (st.bottomLevelId) graph.addEdge(st.bottomLevelId, st.id);
          if (st.topLevelId) {
            graph.addEdge(st.topLevelId, st.id);
            // Arête DAG stair -> slab(topLevelId) pour la dérivation dynamique de trémie (ADR-048 §5)
            const matchingSlabs = slabsByLevelId.get(st.topLevelId);
            if (matchingSlabs) {
              for (let i = 0; i < matchingSlabs.length; i++) {
                const sid = matchingSlabs[i];
                if (sid) graph.addEdge(st.id, sid);
              }
            }
          }
        }
      }

      const roofs = state.roofs;
      if (roofs) {
        for (const id in roofs) {
          const r = roofs[id];
          if (!r) continue;
          if (r.roofTypeId) graph.addEdge(r.roofTypeId, r.id);
          if (r.levelId) graph.addEdge(r.levelId, r.id);

          // Arête DAG roof -> walls sous-jacents (ou wall.topConstraint.roofId)
          const constrainedRoofWalls = wallsByRoofId.get(r.id);
          if (constrainedRoofWalls) {
            for (let i = 0; i < constrainedRoofWalls.length; i++) {
              const wid = constrainedRoofWalls[i];
              if (wid) graph.addEdge(r.id, wid);
            }
          }
          // Dépendance géométrique ciblée : uniquement pour les murs sans contrainte supérieure sous l'emprise du toit
          for (let i = 0; i < unconstrainedWalls.length; i++) {
            const w = unconstrainedWalls[i];
            if (w && isWallCoveredByRoof(w, r)) {
              graph.addEdge(r.id, w.id);
            }
          }
        }
      }

      const roofOpenings = state.roofOpenings;
      if (roofOpenings) {
        for (const id in roofOpenings) {
          const ro = roofOpenings[id];
          if (!ro) continue;
          if (ro.roofId) graph.addEdge(ro.roofId, ro.id);
        }
      }

      const components = state.components;
      if (components) {
        for (const id in components) {
          const comp = components[id];
          if (!comp) continue;
          if (comp.typeId) graph.addEdge(comp.typeId, comp.id);
          if (comp.levelId) graph.addEdge(comp.levelId, comp.id);
          if (comp.placement?.hostWallId) {
            graph.addEdge(comp.placement.hostWallId, comp.id);
          }
        }
      }

      // Dépendances structurelles MEP (Phase 9.2 / ADR-056) :
      // Niveau -> Élément MEP, Système MEP -> Élément MEP.
      // STRICTEMENT AUCUNE arête physique de connexion entre ports pour garantir l'acyclicité du DAG.
      if (state.pipes) {
        for (const id in state.pipes) {
          const p = state.pipes[id];
          if (!p) continue;
          if (p.levelId) graph.addEdge(p.levelId, p.id);
          if (p.systemId) graph.addEdge(p.systemId, p.id);
        }
      }

      if (state.ducts) {
        for (const id in state.ducts) {
          const d = state.ducts[id];
          if (!d) continue;
          if (d.levelId) graph.addEdge(d.levelId, d.id);
          if (d.systemId) graph.addEdge(d.systemId, d.id);
        }
      }

      if (state.cableTrays) {
        for (const id in state.cableTrays) {
          const ct = state.cableTrays[id];
          if (!ct) continue;
          if (ct.levelId) graph.addEdge(ct.levelId, ct.id);
          if (ct.systemId) graph.addEdge(ct.systemId, ct.id);
        }
      }

      if (state.mepFittings) {
        for (const id in state.mepFittings) {
          const f = state.mepFittings[id];
          if (!f) continue;
          if (f.levelId) graph.addEdge(f.levelId, f.id);
          if (f.systemId) graph.addEdge(f.systemId, f.id);
        }
      }

      if (state.mepEquipments) {
        for (const id in state.mepEquipments) {
          const eq = state.mepEquipments[id];
          if (!eq) continue;
          if (eq.levelId) graph.addEdge(eq.levelId, eq.id);
          if (eq.systemId) graph.addEdge(eq.systemId, eq.id);
        }
      }

      if (state.mepConnectors) {
        for (const id in state.mepConnectors) {
          const c = state.mepConnectors[id];
          if (!c) continue;
          if (c.systemId) graph.addEdge(c.systemId, c.id);
        }
      }
    } else {
      // Fallback générique multi-pass pour registres personnalisés
      for (const rel of registry) {
        const sourceEntities = getEntitiesForCategory(state, rel.sourceCategory);
        const isArr = rel.isArray;
        const field = rel.field;

        for (const sourceId in sourceEntities) {
          const entity = sourceEntities[sourceId];
          if (!entity) continue;

          const val = getEntityFieldValue(entity, field);
          if (isArr) {
            if (Array.isArray(val)) {
              for (let i = 0; i < val.length; i++) {
                const targetId = val[i];
                if (targetId && typeof targetId === 'string') {
                  graph.addEdge(targetId, sourceId);
                }
              }
            }
          } else {
            if (val && typeof val === 'string') {
              graph.addEdge(val, sourceId);
            }
          }
        }
      }
    }

    const cycleNodes = graph.findCycleNodes();
    if (cycleNodes.length > 0) {
      throw new BimValidationError(
        'CYCLE_DETECTED',
        `Cycle detected in dependency graph involving nodes: ${cycleNodes.join(', ')}`,
        { offendingIds: cycleNodes },
      );
    }

    return graph;
  }
}
