import type { BimState, ElementId } from '../types.js';
import { BimValidationError } from '../rules.js';
import type { RelationDef, EntityCategory } from '../relations/types.js';
import { RELATIONS_REGISTRY } from '../relations/registry.js';
import { isWallCoveredByRoof } from '../roofs/top-profile.js';

function getEntitiesForCategory(
  state: BimState,
  category: EntityCategory,
): Record<string, Record<string, unknown>> {
  const dict: unknown = (() => {
    switch (category) {
      case 'wall':
        return state.walls ?? {};
      case 'door':
        return state.doors ?? {};
      case 'window':
        return state.windows ?? {};
      case 'dimension':
        return state.dimensions ?? {};
      case 'room':
        return state.rooms ?? {};
      case 'wallType':
        return state.wallTypes ?? {};
      case 'level':
        return state.levels ?? {};
      case 'slab':
        return state.slabs ?? {};
      case 'doorType':
        return state.doorTypes ?? {};
      case 'windowType':
        return state.windowTypes ?? {};
      case 'slabType':
        return state.slabTypes ?? {};
      case 'stair':
        return state.stairs ?? {};
      case 'stairType':
        return state.stairTypes ?? {};
      default:
        return {};
    }
  })();
  return dict as Record<string, Record<string, unknown>>;
}

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
      const current = queue.shift()!;
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
              curr = parentPath.get(curr)!;
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

      const walls = state.walls;
      if (walls) {
        for (const id in walls) {
          const w = walls[id];
          if (!w) continue;
          if (w.typeId) graph.addEdge(w.typeId, w.id);
          if (w.levelId) graph.addEdge(w.levelId, w.id);
          if (w.topConstraint?.kind === 'roof' && w.topConstraint.roofId) {
            graph.addEdge(w.topConstraint.roofId, w.id);
          } else if (w.topConstraint?.levelId) {
            graph.addEdge(w.topConstraint.levelId, w.id);
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

      const slabs = state.slabs;
      if (slabs) {
        for (const id in slabs) {
          const s = slabs[id];
          if (!s) continue;
          if (s.levelId) graph.addEdge(s.levelId, s.id);
          if (s.slabTypeId) graph.addEdge(s.slabTypeId, s.id);

          // Arête slab(N+1) -> wall(N) pour les murs contraints par ce niveau (ADR-045 D2)
          if (walls) {
            for (const wallId in walls) {
              const w = walls[wallId];
              if (w && w.topConstraint?.levelId === s.levelId) {
                graph.addEdge(s.id, w.id);
              }
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
          if (st.topLevelId) graph.addEdge(st.topLevelId, st.id);

          // Arête DAG stair -> slab(topLevelId) pour la dérivation dynamique de trémie (ADR-048 §5)
          if (slabs) {
            for (const slabId in slabs) {
              const slab = slabs[slabId];
              if (slab && slab.levelId === st.topLevelId) {
                graph.addEdge(st.id, slab.id);
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
          if (walls) {
            for (const wallId in walls) {
              const w = walls[wallId];
              if (!w) continue;
              if (w.topConstraint?.kind === 'roof') {
                if (w.topConstraint.roofId === r.id) {
                  graph.addEdge(r.id, w.id);
                }
              } else if (!w.topConstraint) {
                // Dépendance géométrique ciblée : uniquement si le mur est sous l'emprise du toit
                if (isWallCoveredByRoof(w, r)) {
                  graph.addEdge(r.id, w.id);
                }
              }
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
    } else {
      // Fallback générique multi-pass pour registres personnalisés
      for (const rel of registry) {
        const sourceEntities = getEntitiesForCategory(state, rel.sourceCategory);
        const isArr = rel.isArray;
        const field = rel.field;

        for (const sourceId in sourceEntities) {
          const entity = sourceEntities[sourceId];
          if (!entity) continue;

          if (isArr) {
            const arr = entity[field];
            if (Array.isArray(arr)) {
              for (let i = 0; i < arr.length; i++) {
                const targetId = arr[i];
                if (targetId && typeof targetId === 'string') {
                  graph.addEdge(targetId, sourceId);
                }
              }
            }
          } else {
            const targetId = entity[field];
            if (targetId && typeof targetId === 'string') {
              graph.addEdge(targetId, sourceId);
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
