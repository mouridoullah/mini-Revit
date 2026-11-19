/**
 * @mini-bim/core/mep/graph
 *
 * Graphe de réseau topologique physique indépendant (MepNetworkGraph).
 * Modélise la connectivité physique des réseaux de fluide/ventilation/courants sans contrainte DAG.
 *
 * RÈGLE ARCHITECTURALE FONDAMENTALE (ADR-009 / Phase 9.2) :
 * - Ce graphe est STRICTEMENT DÉCOUPLÉ du DependencyGraph (DAG d'invalidation).
 * - Il autorise les boucles fermées (réseaux hydrauliques aller/retour, boucles de recyclage),
 *   les ramifications, les dérivations, les sous-réseaux disjoints et les éléments isolés.
 */

import type { ElementId, BimState } from '../types.js';
import type {
  Port,
  Connector,
  MepElement,
} from './types.js';
import { MEP_TOLERANCES } from './tolerances.js';
import { arePointsCoincident3D, areDirectionsOpposed3D } from './math3d.js';

export interface ConnectionValidationResult {
  readonly valid: boolean;
  readonly code?:
    | 'SAME_ELEMENT'
    | 'PORT_ALREADY_CONNECTED'
    | 'DOMAIN_MISMATCH'
    | 'SYSTEM_TYPE_MISMATCH'
    | 'SHAPE_MISMATCH'
    | 'DIMENSION_MISMATCH'
    | 'NOT_COINCIDENT'
    | 'DIRECTIONS_NOT_OPPOSED'
    | undefined;
  readonly reason?: string | undefined;
}

export class MepNetworkGraph {
  private readonly elements = new Map<ElementId, MepElement>();
  private readonly ports = new Map<ElementId, Port>();
  private readonly portsByElement = new Map<ElementId, Set<ElementId>>();
  private readonly connectors = new Map<ElementId, Connector>();
  private readonly portToConnector = new Map<
    ElementId,
    { readonly connectorId: ElementId; readonly otherPortId: ElementId }
  >();

  /**
   * Enregistre un élément MEP et ses ports associés dans le graphe.
   */
  public addElement(element: MepElement): void {
    this.elements.set(element.id, element);
    let portSet = this.portsByElement.get(element.id);
    if (!portSet) {
      portSet = new Set();
      this.portsByElement.set(element.id, portSet);
    }
    for (const port of element.ports) {
      this.ports.set(port.id, port);
      portSet.add(port.id);
    }
  }

  /**
   * Retire un élément MEP, ses ports et détache toute connexion incidente.
   */
  public removeElement(elementId: ElementId): readonly ElementId[] {
    const detachedConnectorIds: ElementId[] = [];
    const portSet = this.portsByElement.get(elementId);
    if (portSet) {
      for (const portId of portSet) {
        const connInfo = this.portToConnector.get(portId);
        if (connInfo) {
          detachedConnectorIds.push(connInfo.connectorId);
          this.disconnect(connInfo.connectorId);
        }
        this.ports.delete(portId);
      }
      this.portsByElement.delete(elementId);
    }
    this.elements.delete(elementId);
    return detachedConnectorIds;
  }

  /**
   * Vérifie la validité technique d'une connexion potentielle entre deux ports.
   */
  public validateConnection(
    portA: Port,
    portB: Port,
    options: { readonly skipGeometricCheck?: boolean } = {},
  ): ConnectionValidationResult {
    // 1. Ports sur le même élément interdits
    if (portA.elementId === portB.elementId) {
      return {
        valid: false,
        code: 'SAME_ELEMENT',
        reason: `Cannot connect ports on the same element "${portA.elementId}".`,
      };
    }

    // 2. Vérification de disponibilité des ports
    const connA = this.portToConnector.get(portA.id);
    if (connA) {
      return {
        valid: false,
        code: 'PORT_ALREADY_CONNECTED',
        reason: `Port "${portA.id}" is already connected via connector "${connA.connectorId}".`,
      };
    }
    const connB = this.portToConnector.get(portB.id);
    if (connB) {
      return {
        valid: false,
        code: 'PORT_ALREADY_CONNECTED',
        reason: `Port "${portB.id}" is already connected via connector "${connB.connectorId}".`,
      };
    }

    // 3. Domaine technique identique
    if (portA.domain !== portB.domain) {
      return {
        valid: false,
        code: 'DOMAIN_MISMATCH',
        reason: `MepDomain mismatch: port "${portA.id}" is "${portA.domain}" but port "${portB.id}" is "${portB.domain}".`,
      };
    }

    // 4. Nature du fluide ou sous-système identique
    if (portA.systemType !== portB.systemType) {
      return {
        valid: false,
        code: 'SYSTEM_TYPE_MISMATCH',
        reason: `MepSystemType mismatch: port "${portA.id}" is "${portA.systemType}" but port "${portB.id}" is "${portB.systemType}".`,
      };
    }

    // 5. Forme de section transversale identique
    if (portA.shape !== portB.shape) {
      return {
        valid: false,
        code: 'SHAPE_MISMATCH',
        reason: `Port shape mismatch: "${portA.shape}" vs "${portB.shape}".`,
      };
    }

    // 6. Dimensions nominales conformes
    if (portA.shape === 'round') {
      const diamA = portA.diameter ?? 0;
      const diamB = portB.diameter ?? 0;
      if (Math.abs(diamA - diamB) > MEP_TOLERANCES.DIMENSION_MM) {
        return {
          valid: false,
          code: 'DIMENSION_MISMATCH',
          reason: `Round diameter mismatch: ${diamA} mm vs ${diamB} mm (tol: ${MEP_TOLERANCES.DIMENSION_MM} mm).`,
        };
      }
    } else if (portA.shape === 'rectangular') {
      const wA = portA.width ?? 0;
      const wB = portB.width ?? 0;
      const hA = portA.height ?? 0;
      const hB = portB.height ?? 0;
      if (
        Math.abs(wA - wB) > MEP_TOLERANCES.DIMENSION_MM ||
        Math.abs(hA - hB) > MEP_TOLERANCES.DIMENSION_MM
      ) {
        return {
          valid: false,
          code: 'DIMENSION_MISMATCH',
          reason: `Rectangular section mismatch: ${wA}x${hA} mm vs ${wB}x${hB} mm.`,
        };
      }
    }

    // 7. Vérifications géométriques (coïncidence et directions opposées)
    if (!options.skipGeometricCheck) {
      if (!arePointsCoincident3D(portA.position, portB.position, MEP_TOLERANCES.POSITION_MM)) {
        return {
          valid: false,
          code: 'NOT_COINCIDENT',
          reason: `Ports are not spatially coincident within ${MEP_TOLERANCES.POSITION_MM} mm.`,
        };
      }

      if (!areDirectionsOpposed3D(portA.direction, portB.direction, MEP_TOLERANCES.ANGLE_RAD)) {
        return {
          valid: false,
          code: 'DIRECTIONS_NOT_OPPOSED',
          reason: `Port directions are not opposed (face-to-face alignment required).`,
        };
      }
    }

    return { valid: true };
  }

  /**
   * Établit une connexion physique entre deux ports au moyen d'un Connector.
   */
  public connect(connector: Connector): void {
    const portA = this.ports.get(connector.portAId);
    const portB = this.ports.get(connector.portBId);

    if (!portA || !portB) {
      throw new Error(
        `Cannot connect ports: port "${!portA ? connector.portAId : connector.portBId}" not found in graph.`,
      );
    }

    const val = this.validateConnection(portA, portB);
    if (!val.valid) {
      throw new Error(`Invalid connection: ${val.reason}`);
    }

    this.connectors.set(connector.id, connector);
    this.portToConnector.set(connector.portAId, {
      connectorId: connector.id,
      otherPortId: connector.portBId,
    });
    this.portToConnector.set(connector.portBId, {
      connectorId: connector.id,
      otherPortId: connector.portAId,
    });
  }

  /**
   * Supprime une connexion existante via son identifiant de Connector.
   */
  public disconnect(connectorId: ElementId): boolean {
    const conn = this.connectors.get(connectorId);
    if (!conn) return false;

    this.connectors.delete(connectorId);
    this.portToConnector.delete(conn.portAId);
    this.portToConnector.delete(conn.portBId);
    return true;
  }

  /**
   * Retourne l'élément MEP par son identifiant.
   */
  public getElement(elementId: ElementId): MepElement | undefined {
    return this.elements.get(elementId);
  }

  /**
   * Retourne le port par son identifiant.
   */
  public getPort(portId: ElementId): Port | undefined {
    return this.ports.get(portId);
  }

  /**
   * Retourne la connexion associée à un port donné s'il est raccordé.
   */
  public getConnectorForPort(portId: ElementId): Connector | undefined {
    const info = this.portToConnector.get(portId);
    return info ? this.connectors.get(info.connectorId) : undefined;
  }

  /**
   * Retourne le port distant connecté à un port donné.
   */
  public getConnectedPort(portId: ElementId): Port | undefined {
    const info = this.portToConnector.get(portId);
    return info ? this.ports.get(info.otherPortId) : undefined;
  }

  /**
   * Retourne la liste des éléments voisins directs connectés à un élément donné.
   */
  public getConnectedElements(elementId: ElementId): readonly ElementId[] {
    const portIds = this.portsByElement.get(elementId);
    if (!portIds || portIds.size === 0) return [];

    const neighborIds = new Set<ElementId>();
    for (const portId of portIds) {
      const info = this.portToConnector.get(portId);
      if (info) {
        const otherPort = this.ports.get(info.otherPortId);
        if (otherPort && otherPort.elementId !== elementId) {
          neighborIds.add(otherPort.elementId);
        }
      }
    }
    return Array.from(neighborIds).sort();
  }

  /**
   * Parcours BFS d'un réseau physique à partir d'un élément de départ.
   * Retourne la composante connexe complète (tous les éléments physiquement connectés).
   */
  public getNetwork(startElementId: ElementId): readonly ElementId[] {
    if (!this.elements.has(startElementId)) return [];

    const visited = new Set<ElementId>([startElementId]);
    const queue: ElementId[] = [startElementId];

    while (queue.length > 0) {
      const currentId = queue.shift();
      if (!currentId) break;

      const neighbors = this.getConnectedElements(currentId);
      for (const neighborId of neighbors) {
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          queue.push(neighborId);
        }
      }
    }

    return Array.from(visited).sort();
  }

  /**
   * Partionne l'ensemble des éléments MEP du projet en composantes connexes (sous-réseaux disjoints).
   */
  public getAllNetworks(): readonly (readonly ElementId[])[] {
    const unvisited = new Set<ElementId>(this.elements.keys());
    const networks: (readonly ElementId[])[] = [];

    for (const elementId of this.elements.keys()) {
      if (unvisited.has(elementId)) {
        const comp = this.getNetwork(elementId);
        for (const id of comp) {
          unvisited.delete(id);
        }
        networks.push(comp);
      }
    }

    return networks;
  }

  /**
   * Retourne la liste des ports libres (non connectés) pour un élément donné ou pour l'ensemble du projet.
   */
  public getOpenPorts(elementId?: ElementId): readonly Port[] {
    const open: Port[] = [];

    if (elementId) {
      const portIds = this.portsByElement.get(elementId);
      if (portIds) {
        for (const pid of portIds) {
          if (!this.portToConnector.has(pid)) {
            const p = this.ports.get(pid);
            if (p) open.push(p);
          }
        }
      }
    } else {
      for (const [pid, p] of this.ports.entries()) {
        if (!this.portToConnector.has(pid)) {
          open.push(p);
        }
      }
    }

    return open;
  }

  /**
   * Retourne la liste des éléments complètement isolés (aucun port connecté).
   */
  public getIsolatedElements(): readonly ElementId[] {
    const isolated: ElementId[] = [];
    for (const [elementId, portIds] of this.portsByElement.entries()) {
      let isConnected = false;
      for (const pid of portIds) {
        if (this.portToConnector.has(pid)) {
          isConnected = true;
          break;
        }
      }
      if (!isConnected) {
        isolated.push(elementId);
      }
    }
    return isolated.sort();
  }

  /**
   * Détecte si le graphe physique comporte au moins une boucle fermée (cycle dans les composantes connexes).
   * Note : Les boucles sont valides en MEP (ex: retour chauffage), cette méthode permet de les recenser.
   */
  public hasLoops(): boolean {
    const visited = new Set<ElementId>();

    for (const startId of this.elements.keys()) {
      if (visited.has(startId)) continue;

      // DFS avec suivi du parent pour détecter un cycle dans un graphe non orienté
      const stack: { id: ElementId; parentId: ElementId | null }[] = [{ id: startId, parentId: null }];
      visited.add(startId);

      while (stack.length > 0) {
        const item = stack.pop();
        if (!item) break;

        const neighbors = this.getConnectedElements(item.id);
        for (const neighborId of neighbors) {
          if (!visited.has(neighborId)) {
            visited.add(neighborId);
            stack.push({ id: neighborId, parentId: item.id });
          } else if (neighborId !== item.parentId) {
            // Re-visite d'un nœud déjà exploré différent du parent direct = boucle physique fermée !
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Retourne l'ensemble de tous les connecteurs actifs du graphe.
   */
  public getAllConnectors(): readonly Connector[] {
    return Array.from(this.connectors.values());
  }

  /**
   * Construit un MepNetworkGraph complet à partir de l'état documentaire BimState.
   */
  public static build(state: BimState): MepNetworkGraph {
    const graph = new MepNetworkGraph();

    // 1. Ingestion des tuyauteries (Pipes)
    if (state.pipes) {
      for (const id in state.pipes) {
        const p = state.pipes[id];
        if (p) graph.addElement(p);
      }
    }

    // 2. Ingestion des gaines (Ducts)
    if (state.ducts) {
      for (const id in state.ducts) {
        const d = state.ducts[id];
        if (d) graph.addElement(d);
      }
    }

    // 3. Ingestion des chemins de câbles (CableTrays)
    if (state.cableTrays) {
      for (const id in state.cableTrays) {
        const ct = state.cableTrays[id];
        if (ct) graph.addElement(ct);
      }
    }

    // 4. Ingestion des raccords (MepFittings)
    if (state.mepFittings) {
      for (const id in state.mepFittings) {
        const f = state.mepFittings[id];
        if (f) graph.addElement(f);
      }
    }

    // 5. Ingestion des équipements (MepEquipments)
    if (state.mepEquipments) {
      for (const id in state.mepEquipments) {
        const eq = state.mepEquipments[id];
        if (eq) graph.addElement(eq);
      }
    }

    // 6. Ingestion des connexions (Connectors)
    if (state.mepConnectors) {
      for (const id in state.mepConnectors) {
        const c = state.mepConnectors[id];
        if (c) {
          try {
            graph.connect(c);
          } catch {
            // Les connexions invalides dans l'état brut ne font pas crasher la construction
          }
        }
      }
    }

    return graph;
  }
}
