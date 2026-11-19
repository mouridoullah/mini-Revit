import { describe, it, expect } from 'vitest';
import {
  BimDocument,
  generateId,
  toJSON,
  fromJSON,
  DependencyGraph,
  runBenchmark,
} from '../index.js';
import {
  MepNetworkGraph,
  createPipe,
  createDuct,
  createCableTray,
  createMepFitting,
  createMepEquipment,
  createMepSystem,
  createPort,
  point3D,
  vector3D,
  AddPipeCommand,
  DeletePipeCommand,
  AddDuctCommand,
  AddMepEquipmentCommand,
  DeleteMepEquipmentCommand,
  AddMepFittingCommand,
  CreateMepSystemCommand,
  AssignToMepSystemCommand,
  ConnectPortsCommand,
  DisconnectPortsCommand,
  type Connector,
  type Port,
} from './index.js';

describe('Phase 9.2 — Noyau MEP & Modèle Topologique des Réseaux Techniques', () => {
  const levelId = 'lvl_rdc';

  function setupDoc(): { doc: BimDocument; levelId: string } {
    const doc = BimDocument.createDefaultProject();
    const state = doc.getState();
    const firstLevelId = Object.keys(state.levels)[0] ?? levelId;
    return { doc, levelId: firstLevelId };
  }

  // --------------------------------------------------------------------------
  // 1. Réseau linéaire
  // --------------------------------------------------------------------------
  it('T-MEP-01 : Réseau linéaire — chaîne continue de segments raccordés', () => {
    const { doc, levelId } = setupDoc();

    // Tuyau 1 : (0, 0, 1000) -> (2000, 0, 1000)
    const pipe1 = createPipe({
      levelId,
      start: point3D(0, 0, 1000),
      end: point3D(2000, 0, 1000),
      diameter: 32,
      systemType: 'domestic_cold_water',
    });
    // Tuyau 2 : (2000, 0, 1000) -> (5000, 0, 1000)
    const pipe2 = createPipe({
      levelId,
      start: point3D(2000, 0, 1000),
      end: point3D(5000, 0, 1000),
      diameter: 32,
      systemType: 'domestic_cold_water',
    });

    doc.execute(new AddPipeCommand(pipe1));
    doc.execute(new AddPipeCommand(pipe2));

    // Connecteur unissant le port end de pipe1 (index 1) et le port start de pipe2 (index 0)
    const conn1: Connector = {
      id: generateId(),
      category: 'mepConnector',
      portAId: pipe1.ports[1]?.id ?? '',
      portBId: pipe2.ports[0]?.id ?? '',
    };
    doc.execute(new ConnectPortsCommand(conn1));

    const graph = MepNetworkGraph.build(doc.getState());
    expect(graph.getConnectedElements(pipe1.id)).toEqual([pipe2.id]);
    expect(graph.getConnectedElements(pipe2.id)).toEqual([pipe1.id]);

    const net = graph.getNetwork(pipe1.id);
    expect(net).toEqual([pipe1.id, pipe2.id].sort());
    expect(graph.hasLoops()).toBe(false);
  });

  // --------------------------------------------------------------------------
  // 2. Réseau ramifié
  // --------------------------------------------------------------------------
  it('T-MEP-02 : Réseau ramifié — dérivation via raccord Té (1 entrée, 2 sorties)', () => {
    const { doc, levelId } = setupDoc();

    const pTee = point3D(2000, 0, 1000);

    // Tuyau principal d'amenée : (0, 0, 1000) -> (2000, 0, 1000)
    const mainPipe = createPipe({
      levelId,
      start: point3D(0, 0, 1000),
      end: pTee,
      diameter: 32,
      systemType: 'domestic_cold_water',
    });

    // Branche 1 : (2000, 0, 1000) -> (4000, 0, 1000) [continuation X]
    const branch1 = createPipe({
      levelId,
      start: pTee,
      end: point3D(4000, 0, 1000),
      diameter: 32,
      systemType: 'domestic_cold_water',
    });

    // Branche 2 : (2000, 0, 1000) -> (2000, 2000, 1000) [dérivation Y]
    const branch2 = createPipe({
      levelId,
      start: pTee,
      end: point3D(2000, 2000, 1000),
      diameter: 32,
      systemType: 'domestic_cold_water',
    });

    // Raccord Té à pTee avec 3 ports
    const teeFitting = createMepFitting({
      levelId,
      fittingType: 'tee',
      domain: 'plumbing',
      systemType: 'domestic_cold_water',
      position: pTee,
      ports: [
        createPort({
          elementId: '',
          position: pTee,
          direction: vector3D(-1, 0, 0), // face à mainPipe.end
          domain: 'plumbing',
          systemType: 'domestic_cold_water',
          shape: 'round',
          diameter: 32,
          label: 'INLET',
        }),
        createPort({
          elementId: '',
          position: pTee,
          direction: vector3D(1, 0, 0), // face à branch1.start
          domain: 'plumbing',
          systemType: 'domestic_cold_water',
          shape: 'round',
          diameter: 32,
          label: 'BRANCH_1',
        }),
        createPort({
          elementId: '',
          position: pTee,
          direction: vector3D(0, 1, 0), // face à branch2.start
          domain: 'plumbing',
          systemType: 'domestic_cold_water',
          shape: 'round',
          diameter: 32,
          label: 'BRANCH_2',
        }),
      ],
    });

    doc.execute(new AddPipeCommand(mainPipe));
    doc.execute(new AddPipeCommand(branch1));
    doc.execute(new AddPipeCommand(branch2));
    doc.execute(new AddMepFittingCommand(teeFitting));

    // Connexions
    doc.execute(
      new ConnectPortsCommand({
        id: generateId(),
        category: 'mepConnector',
        portAId: mainPipe.ports[1]?.id ?? '',
        portBId: teeFitting.ports[0]?.id ?? '',
      }),
    );
    doc.execute(
      new ConnectPortsCommand({
        id: generateId(),
        category: 'mepConnector',
        portAId: branch1.ports[0]?.id ?? '',
        portBId: teeFitting.ports[1]?.id ?? '',
      }),
    );
    doc.execute(
      new ConnectPortsCommand({
        id: generateId(),
        category: 'mepConnector',
        portAId: branch2.ports[0]?.id ?? '',
        portBId: teeFitting.ports[2]?.id ?? '',
      }),
    );

    const graph = MepNetworkGraph.build(doc.getState());
    const teeNeighbors = graph.getConnectedElements(teeFitting.id);
    expect(teeNeighbors).toEqual([mainPipe.id, branch1.id, branch2.id].sort());

    const fullNet = graph.getNetwork(mainPipe.id);
    expect(fullNet.length).toBe(4);
    expect(graph.hasLoops()).toBe(false);
  });

  // --------------------------------------------------------------------------
  // 3. Réseau avec boucle (boucle fermée hydraulique)
  // --------------------------------------------------------------------------
  it('T-MEP-03 : Réseau avec boucle — boucle fermée autorisée et détectée sans erreur DAG', () => {
    const { doc, levelId } = setupDoc();

    // Chaudière à (0, 0, 500) avec 2 ports (départ et retour)
    const boiler = createMepEquipment({
      levelId,
      family: 'boiler',
      position: point3D(0, 0, 500),
      width: 600,
      depth: 400,
      height: 900,
      ports: [
        createPort({
          elementId: '',
          position: point3D(0, 0, 1000),
          direction: vector3D(1, 0, 0), // sortie aller
          domain: 'hydronic',
          systemType: 'hydronic_supply',
          shape: 'round',
          diameter: 28,
          label: 'SUPPLY_OUT',
        }),
        createPort({
          elementId: '',
          position: point3D(0, 0, 600),
          direction: vector3D(1, 0, 0), // entrée retour
          domain: 'hydronic',
          systemType: 'hydronic_supply', // même fluide dans la boucle
          shape: 'round',
          diameter: 28,
          label: 'RETURN_IN',
        }),
      ],
    });

    // Émetteur radiateur à (4000, 0, 500)
    const radiator = createMepEquipment({
      levelId,
      family: 'radiator',
      position: point3D(4000, 0, 500),
      width: 1000,
      depth: 150,
      height: 600,
      ports: [
        createPort({
          elementId: '',
          position: point3D(4000, 0, 1000),
          direction: vector3D(-1, 0, 0), // entrée aller
          domain: 'hydronic',
          systemType: 'hydronic_supply',
          shape: 'round',
          diameter: 28,
          label: 'RAD_IN',
        }),
        createPort({
          elementId: '',
          position: point3D(4000, 0, 600),
          direction: vector3D(-1, 0, 0), // sortie retour
          domain: 'hydronic',
          systemType: 'hydronic_supply',
          shape: 'round',
          diameter: 28,
          label: 'RAD_OUT',
        }),
      ],
    });

    // Tuyau aller (haut z=1000)
    const pipeSupply = createPipe({
      levelId,
      start: point3D(0, 0, 1000),
      end: point3D(4000, 0, 1000),
      diameter: 28,
      domain: 'hydronic',
      systemType: 'hydronic_supply',
    });

    // Tuyau retour (bas z=600)
    const pipeReturn = createPipe({
      levelId,
      start: point3D(0, 0, 600),
      end: point3D(4000, 0, 600),
      diameter: 28,
      domain: 'hydronic',
      systemType: 'hydronic_supply',
    });

    doc.execute(new AddMepEquipmentCommand(boiler));
    doc.execute(new AddMepEquipmentCommand(radiator));
    doc.execute(new AddPipeCommand(pipeSupply));
    doc.execute(new AddPipeCommand(pipeReturn));

    // Connexion 1 : boiler supply -> pipeSupply.start
    doc.execute(
      new ConnectPortsCommand({
        id: generateId(),
        category: 'mepConnector',
        portAId: boiler.ports[0]?.id ?? '',
        portBId: pipeSupply.ports[0]?.id ?? '',
      }),
    );
    // Connexion 2 : pipeSupply.end -> radiator in
    doc.execute(
      new ConnectPortsCommand({
        id: generateId(),
        category: 'mepConnector',
        portAId: pipeSupply.ports[1]?.id ?? '',
        portBId: radiator.ports[0]?.id ?? '',
      }),
    );
    // Connexion 3 : radiator out -> pipeReturn.end
    doc.execute(
      new ConnectPortsCommand({
        id: generateId(),
        category: 'mepConnector',
        portAId: radiator.ports[1]?.id ?? '',
        portBId: pipeReturn.ports[1]?.id ?? '',
      }),
    );
    // Connexion 4 : pipeReturn.start -> boiler return (FERMETURE DE LA BOUCLE)
    doc.execute(
      new ConnectPortsCommand({
        id: generateId(),
        category: 'mepConnector',
        portAId: pipeReturn.ports[0]?.id ?? '',
        portBId: boiler.ports[1]?.id ?? '',
      }),
    );

    const graph = MepNetworkGraph.build(doc.getState());
    // Le graphe physique détecte la boucle
    expect(graph.hasLoops()).toBe(true);

    // RÈGLE D'OR : Le DependencyGraph BIM reste 100% acyclique !
    const dag = DependencyGraph.build(doc.getState());
    expect(dag.hasCycle()).toBe(false);
  });

  // --------------------------------------------------------------------------
  // 4. Réseau déconnecté (sous-réseaux disjoints)
  // --------------------------------------------------------------------------
  it('T-MEP-04 : Réseau déconnecté — détection de sous-réseaux disjoints multiples', () => {
    const { doc, levelId } = setupDoc();

    // Réseau A (EF) : Pipe A1 -> Pipe A2
    const pipeA1 = createPipe({
      levelId,
      start: point3D(0, 0, 1000),
      end: point3D(1000, 0, 1000),
      diameter: 22,
      systemType: 'domestic_cold_water',
    });
    const pipeA2 = createPipe({
      levelId,
      start: point3D(1000, 0, 1000),
      end: point3D(2000, 0, 1000),
      diameter: 22,
      systemType: 'domestic_cold_water',
    });
    // Réseau B (Air) : Duct B1 à un autre endroit
    const ductB1 = createDuct({
      levelId,
      start: point3D(0, 5000, 2500),
      end: point3D(3000, 5000, 2500),
      shape: 'round',
      diameter: 160,
      systemType: 'supply_air',
    });

    doc.execute(new AddPipeCommand(pipeA1));
    doc.execute(new AddPipeCommand(pipeA2));
    doc.execute(new AddDuctCommand(ductB1));

    doc.execute(
      new ConnectPortsCommand({
        id: generateId(),
        category: 'mepConnector',
        portAId: pipeA1.ports[1]?.id ?? '',
        portBId: pipeA2.ports[0]?.id ?? '',
      }),
    );

    const graph = MepNetworkGraph.build(doc.getState());
    const allNets = graph.getAllNetworks();
    expect(allNets.length).toBe(2);

    const netA = graph.getNetwork(pipeA1.id);
    expect(netA).toEqual([pipeA1.id, pipeA2.id].sort());

    const netB = graph.getNetwork(ductB1.id);
    expect(netB).toEqual([ductB1.id]);
  });

  // --------------------------------------------------------------------------
  // 5. Port libre
  // --------------------------------------------------------------------------
  it('T-MEP-05 : Ports libres — identification des extrémités ouvertes d’un réseau', () => {
    const { doc, levelId } = setupDoc();

    const pipe1 = createPipe({
      levelId,
      start: point3D(0, 0, 1000),
      end: point3D(2000, 0, 1000),
      diameter: 32,
    });
    const pipe2 = createPipe({
      levelId,
      start: point3D(2000, 0, 1000),
      end: point3D(4000, 0, 1000),
      diameter: 32,
    });

    doc.execute(new AddPipeCommand(pipe1));
    doc.execute(new AddPipeCommand(pipe2));

    doc.execute(
      new ConnectPortsCommand({
        id: generateId(),
        category: 'mepConnector',
        portAId: pipe1.ports[1]?.id ?? '',
        portBId: pipe2.ports[0]?.id ?? '',
      }),
    );

    const graph = MepNetworkGraph.build(doc.getState());
    const openPortsTotal = graph.getOpenPorts();
    // pipe1.port0 et pipe2.port1 sont ouverts, pipe1.port1 et pipe2.port0 sont connectés
    expect(openPortsTotal.length).toBe(2);
    expect(openPortsTotal.map((p) => p.id)).toContain(pipe1.ports[0]?.id);
    expect(openPortsTotal.map((p) => p.id)).toContain(pipe2.ports[1]?.id);

    const openForPipe1 = graph.getOpenPorts(pipe1.id);
    expect(openForPipe1.length).toBe(1);
    expect(openForPipe1[0]?.id).toBe(pipe1.ports[0]?.id);
  });

  // --------------------------------------------------------------------------
  // 6. Incompatibilité de domaine
  // --------------------------------------------------------------------------
  it('T-MEP-06 : Rejet connexion — incompatibilité de domaine technique (Plumbing vs HVAC)', () => {
    const { doc, levelId } = setupDoc();

    const pipe = createPipe({
      levelId,
      start: point3D(0, 0, 1000),
      end: point3D(2000, 0, 1000),
      diameter: 100,
      domain: 'plumbing',
      systemType: 'domestic_cold_water',
    });
    const duct = createDuct({
      levelId,
      start: point3D(2000, 0, 1000),
      end: point3D(4000, 0, 1000),
      shape: 'round',
      diameter: 100,
      systemType: 'supply_air',
    });

    doc.execute(new AddPipeCommand(pipe));
    doc.execute(new AddDuctCommand(duct));

    expect(() => {
      doc.execute(
        new ConnectPortsCommand({
          id: generateId(),
          category: 'mepConnector',
          portAId: pipe.ports[1]?.id ?? '',
          portBId: duct.ports[0]?.id ?? '',
        }),
      );
    }).toThrowError(/DOMAIN_MISMATCH/);
  });

  // --------------------------------------------------------------------------
  // 7. Incompatibilité de système / fluide
  // --------------------------------------------------------------------------
  it('T-MEP-07 : Rejet connexion — incompatibilité de fluide (EF vs ECS)', () => {
    const { doc, levelId } = setupDoc();

    const coldPipe = createPipe({
      levelId,
      start: point3D(0, 0, 1000),
      end: point3D(2000, 0, 1000),
      diameter: 22,
      systemType: 'domestic_cold_water',
    });
    const hotPipe = createPipe({
      levelId,
      start: point3D(2000, 0, 1000),
      end: point3D(4000, 0, 1000),
      diameter: 22,
      systemType: 'domestic_hot_water',
    });

    doc.execute(new AddPipeCommand(coldPipe));
    doc.execute(new AddPipeCommand(hotPipe));

    expect(() => {
      doc.execute(
        new ConnectPortsCommand({
          id: generateId(),
          category: 'mepConnector',
          portAId: coldPipe.ports[1]?.id ?? '',
          portBId: hotPipe.ports[0]?.id ?? '',
        }),
      );
    }).toThrowError(/SYSTEM_TYPE_MISMATCH/);
  });

  // --------------------------------------------------------------------------
  // 8. Connexion dupliquée
  // --------------------------------------------------------------------------
  it('T-MEP-08 : Rejet connexion — interdiction de doubler la connexion sur un même port', () => {
    const { doc, levelId } = setupDoc();

    const p1 = createPipe({
      levelId,
      start: point3D(0, 0, 1000),
      end: point3D(2000, 0, 1000),
      diameter: 32,
    });
    const p2 = createPipe({
      levelId,
      start: point3D(2000, 0, 1000),
      end: point3D(4000, 0, 1000),
      diameter: 32,
    });
    const p3 = createPipe({
      levelId,
      start: point3D(2000, 0, 1000),
      end: point3D(2000, 3000, 1000),
      diameter: 32,
    });

    doc.execute(new AddPipeCommand(p1));
    doc.execute(new AddPipeCommand(p2));
    doc.execute(new AddPipeCommand(p3));

    // Première connexion p1.end <-> p2.start
    doc.execute(
      new ConnectPortsCommand({
        id: generateId(),
        category: 'mepConnector',
        portAId: p1.ports[1]?.id ?? '',
        portBId: p2.ports[0]?.id ?? '',
      }),
    );

    // Tentative de re-connecter p1.end sur p3.start
    expect(() => {
      doc.execute(
        new ConnectPortsCommand({
          id: generateId(),
          category: 'mepConnector',
          portAId: p1.ports[1]?.id ?? '',
          portBId: p3.ports[0]?.id ?? '',
        }),
      );
    }).toThrowError(/PORT_ALREADY_CONNECTED/);
  });

  // --------------------------------------------------------------------------
  // 9. Suppression d'un élément intermédiaire
  // --------------------------------------------------------------------------
  it('T-MEP-09 : Suppression élément intermédiaire — cascade propre sans connecteurs orphelins', () => {
    const { doc, levelId } = setupDoc();

    const p1 = createPipe({
      levelId,
      start: point3D(0, 0, 1000),
      end: point3D(2000, 0, 1000),
      diameter: 32,
    });
    const p2 = createPipe({
      levelId,
      start: point3D(2000, 0, 1000),
      end: point3D(4000, 0, 1000),
      diameter: 32,
    });
    const p3 = createPipe({
      levelId,
      start: point3D(4000, 0, 1000),
      end: point3D(6000, 0, 1000),
      diameter: 32,
    });

    doc.execute(new AddPipeCommand(p1));
    doc.execute(new AddPipeCommand(p2));
    doc.execute(new AddPipeCommand(p3));

    const conn1Id = generateId();
    const conn2Id = generateId();

    doc.execute(
      new ConnectPortsCommand({
        id: conn1Id,
        category: 'mepConnector',
        portAId: p1.ports[1]?.id ?? '',
        portBId: p2.ports[0]?.id ?? '',
      }),
    );
    doc.execute(
      new ConnectPortsCommand({
        id: conn2Id,
        category: 'mepConnector',
        portAId: p2.ports[1]?.id ?? '',
        portBId: p3.ports[0]?.id ?? '',
      }),
    );

    expect(Object.keys(doc.getState().mepConnectors ?? {}).length).toBe(2);

    // Suppression de l'élément central p2
    doc.execute(new DeletePipeCommand(p2.id));

    const state = doc.getState();
    expect(state.pipes?.[p2.id]).toBeUndefined();
    // Les deux connecteurs incidents conn1 et conn2 doivent être automatiquement purgés
    expect(state.mepConnectors?.[conn1Id]).toBeUndefined();
    expect(state.mepConnectors?.[conn2Id]).toBeUndefined();
    expect(Object.keys(state.mepConnectors ?? {}).length).toBe(0);

    const graph = MepNetworkGraph.build(state);
    expect(graph.getConnectedElements(p1.id)).toEqual([]);
    expect(graph.getConnectedElements(p3.id)).toEqual([]);
  });

  // --------------------------------------------------------------------------
  // 10. Suppression d'un équipement raccordé
  // --------------------------------------------------------------------------
  it('T-MEP-10 : Suppression d’un équipement raccordé — nettoyage des connexions et affectations systèmes', () => {
    const { doc, levelId } = setupDoc();

    const eq = createMepEquipment({
      levelId,
      family: 'water_heater',
      position: point3D(0, 0, 0),
      width: 500,
      depth: 500,
      height: 1200,
      ports: [
        createPort({
          elementId: '',
          position: point3D(0, 0, 1000),
          direction: vector3D(1, 0, 0),
          domain: 'plumbing',
          systemType: 'domestic_hot_water',
          shape: 'round',
          diameter: 22,
        }),
      ],
    });

    const p = createPipe({
      levelId,
      start: point3D(0, 0, 1000),
      end: point3D(3000, 0, 1000),
      diameter: 22,
      systemType: 'domestic_hot_water',
    });

    const sys = createMepSystem({
      name: 'Réseau ECS Principal',
      domain: 'plumbing',
      systemType: 'domestic_hot_water',
    });

    doc.execute(new CreateMepSystemCommand(sys));
    doc.execute(new AddMepEquipmentCommand(eq));
    doc.execute(new AddPipeCommand(p));
    doc.execute(new AssignToMepSystemCommand(sys.id, [eq.id, p.id]));

    const connId = generateId();
    doc.execute(
      new ConnectPortsCommand({
        id: connId,
        category: 'mepConnector',
        portAId: eq.ports[0]?.id ?? '',
        portBId: p.ports[0]?.id ?? '',
      }),
    );

    expect(doc.getState().mepSystems?.[sys.id]?.elementIds).toContain(eq.id);

    // Suppression de l'équipement
    doc.execute(new DeleteMepEquipmentCommand(eq.id));

    const state = doc.getState();
    expect(state.mepEquipments?.[eq.id]).toBeUndefined();
    expect(state.mepConnectors?.[connId]).toBeUndefined();
    expect(state.mepSystems?.[sys.id]?.elementIds).not.toContain(eq.id);
  });

  // --------------------------------------------------------------------------
  // 11. Undo/Redo d'une connexion
  // --------------------------------------------------------------------------
  it('T-MEP-11 : Undo/Redo d’une connexion de ports', () => {
    const { doc, levelId } = setupDoc();

    const p1 = createPipe({
      levelId,
      start: point3D(0, 0, 1000),
      end: point3D(2000, 0, 1000),
      diameter: 32,
    });
    const p2 = createPipe({
      levelId,
      start: point3D(2000, 0, 1000),
      end: point3D(4000, 0, 1000),
      diameter: 32,
    });

    doc.execute(new AddPipeCommand(p1));
    doc.execute(new AddPipeCommand(p2));

    const connId = generateId();
    doc.execute(
      new ConnectPortsCommand({
        id: connId,
        category: 'mepConnector',
        portAId: p1.ports[1]?.id ?? '',
        portBId: p2.ports[0]?.id ?? '',
      }),
    );

    expect(doc.getState().mepConnectors?.[connId]).toBeDefined();

    // 1. Undo -> déconnexion
    doc.undo();
    expect(doc.getState().mepConnectors?.[connId]).toBeUndefined();
    let graph = MepNetworkGraph.build(doc.getState());
    expect(graph.getConnectedElements(p1.id)).toEqual([]);

    // 2. Redo -> reconnexion
    doc.redo();
    expect(doc.getState().mepConnectors?.[connId]).toBeDefined();
    graph = MepNetworkGraph.build(doc.getState());
    expect(graph.getConnectedElements(p1.id)).toEqual([p2.id]);
  });

  // --------------------------------------------------------------------------
  // 12. Undo/Redo de la suppression d'un élément
  // --------------------------------------------------------------------------
  it('T-MEP-12 : Undo/Redo de la suppression d’un élément avec ses connecteurs', () => {
    const { doc, levelId } = setupDoc();

    const p1 = createPipe({
      levelId,
      start: point3D(0, 0, 1000),
      end: point3D(2000, 0, 1000),
      diameter: 32,
    });
    const p2 = createPipe({
      levelId,
      start: point3D(2000, 0, 1000),
      end: point3D(4000, 0, 1000),
      diameter: 32,
    });

    doc.execute(new AddPipeCommand(p1));
    doc.execute(new AddPipeCommand(p2));

    const connId = generateId();
    doc.execute(
      new ConnectPortsCommand({
        id: connId,
        category: 'mepConnector',
        portAId: p1.ports[1]?.id ?? '',
        portBId: p2.ports[0]?.id ?? '',
      }),
    );

    // Supprimer p2
    doc.execute(new DeletePipeCommand(p2.id));
    expect(doc.getState().pipes?.[p2.id]).toBeUndefined();
    expect(doc.getState().mepConnectors?.[connId]).toBeUndefined();

    // Undo -> Restaure p2 ET la connexion connId !
    doc.undo();
    expect(doc.getState().pipes?.[p2.id]).toBeDefined();
    expect(doc.getState().mepConnectors?.[connId]).toBeDefined();

    const graph = MepNetworkGraph.build(doc.getState());
    expect(graph.getConnectedElements(p1.id)).toEqual([p2.id]);
  });

  // --------------------------------------------------------------------------
  // 13. Sérialisation et restauration d'un réseau complet
  // --------------------------------------------------------------------------
  it('T-MEP-13 : Sérialisation et désérialisation JSON sans perte d’intégrité topologique', () => {
    const { doc, levelId } = setupDoc();

    const p1 = createPipe({
      levelId,
      start: point3D(0, 0, 1000),
      end: point3D(2000, 0, 1000),
      diameter: 32,
    });
    const p2 = createPipe({
      levelId,
      start: point3D(2000, 0, 1000),
      end: point3D(4000, 0, 1000),
      diameter: 32,
    });
    const sys = createMepSystem({
      name: 'Eau Froide Sanitaire Distribution',
      domain: 'plumbing',
      systemType: 'domestic_cold_water',
    });

    doc.execute(new CreateMepSystemCommand(sys));
    doc.execute(new AddPipeCommand(p1));
    doc.execute(new AddPipeCommand(p2));
    doc.execute(new AssignToMepSystemCommand(sys.id, [p1.id, p2.id]));

    const connId = generateId();
    doc.execute(
      new ConnectPortsCommand({
        id: connId,
        category: 'mepConnector',
        portAId: p1.ports[1]?.id ?? '',
        portBId: p2.ports[0]?.id ?? '',
        systemId: sys.id,
      }),
    );

    // Sérialisation
    const jsonStr = toJSON(doc.getState());
    expect(jsonStr).toContain('pipes');
    expect(jsonStr).toContain('mepConnectors');
    expect(jsonStr).toContain('mepSystems');

    // Restauration
    const restoredDoc = BimDocument.fromJSON(jsonStr);
    const restoredGraph = MepNetworkGraph.build(restoredDoc.getState());

    expect(restoredGraph.getConnectedElements(p1.id)).toEqual([p2.id]);
    expect(restoredDoc.getState().mepSystems?.[sys.id]?.elementIds).toContain(p1.id);
  });

  // --------------------------------------------------------------------------
  // 14. Migration et rétrocompatibilité des maquettes sans données MEP
  // --------------------------------------------------------------------------
  it('T-MEP-14 : Rétrocompatibilité — chargement transparent de maquettes sans section MEP', () => {
    const legacyState = BimDocument.createDefaultProject().getState();
    const legacyJSON = JSON.stringify({
      schemaVersion: 2,
      units: 'mm',
      levels: legacyState.levels,
      wallTypes: legacyState.wallTypes,
      slabTypes: legacyState.slabTypes,
      doorTypes: legacyState.doorTypes,
      windowTypes: legacyState.windowTypes,
      walls: legacyState.walls,
      slabs: legacyState.slabs,
      doors: legacyState.doors,
      windows: legacyState.windows,
      rooms: legacyState.rooms,
      dimensions: legacyState.dimensions,
    });

    const doc = BimDocument.fromJSON(legacyJSON);
    expect(doc).toBeDefined();
    // Les dictionnaires MEP sont undefined ou vides, et le graphe se construit sans erreur
    const graph = MepNetworkGraph.build(doc.getState());
    expect(graph.getAllNetworks()).toEqual([]);
  });

  // --------------------------------------------------------------------------
  // 15. Cohérence entre MepNetworkGraph et DependencyGraph BIM
  // --------------------------------------------------------------------------
  it('T-MEP-15 : Cohérence des deux graphes — le DAG réagit aux niveaux sans subir les cycles MEP', () => {
    const { doc, levelId } = setupDoc();

    const p = createPipe({
      levelId,
      start: point3D(0, 0, 1000),
      end: point3D(2000, 0, 1000),
      diameter: 32,
    });
    doc.execute(new AddPipeCommand(p));

    const dag = DependencyGraph.build(doc.getState());
    // Le DAG connait la dépendance levelId -> pipe.id
    const dependentsOfLevel = dag.getDependents(levelId);
    expect(dependentsOfLevel).toContain(p.id);
  });

  // --------------------------------------------------------------------------
  // 16. Benchmarks synthétiques du MepNetworkGraph (100, 1 000, 10 000 connexions)
  // --------------------------------------------------------------------------
  describe('Benchmarks de Scalabilité du MepNetworkGraph', () => {
    it('T-MEP-SCALE : Mesure de performance sur 100, 1 000 et 10 000 connexions MEP', () => {
      const sizes = [100, 1000, 10000];

      for (const N of sizes) {
        const graph = new MepNetworkGraph();

        // Création d'une chaîne linéaire de N segments
        for (let i = 0; i < N; i++) {
          const pipe = createPipe({
            id: `pipe_${i}`,
            levelId: 'lvl_0',
            start: point3D(i * 1000, 0, 1000),
            end: point3D((i + 1) * 1000, 0, 1000),
            diameter: 32,
          });
          graph.addElement(pipe);
        }

        // Connexions de la chaîne (N-1 connecteurs)
        for (let i = 0; i < N - 1; i++) {
          const currentPipe = graph.getElement(`pipe_${i}`);
          const nextPipe = graph.getElement(`pipe_${i + 1}`);
          if (!currentPipe || !nextPipe) continue;
          const conn: Connector = {
            id: `conn_${i}`,
            category: 'mepConnector',
            portAId: currentPipe.ports[1]?.id ?? '',
            portBId: nextPipe.ports[0]?.id ?? '',
          };
          graph.connect(conn);
        }

        // Mesure du parcours BFS de la composante connexe
        const bfsMetrics = runBenchmark(
          `MEP_NETWORK_BFS_${N}`,
          () => {
            const net = graph.getNetwork('pipe_0');
            expect(net.length).toBe(N);
          },
          { iterations: 5, warmup: 1 },
        );

        // Mesure de détection de boucles
        const loopMetrics = runBenchmark(
          `MEP_HAS_LOOPS_${N}`,
          () => {
            expect(graph.hasLoops()).toBe(false);
          },
          { iterations: 5, warmup: 1 },
        );

        // Assertions de performance
        if (N <= 1000) {
          expect(bfsMetrics.p50Ms).toBeLessThan(10); // < 10 ms pour 1k nœuds
          expect(loopMetrics.p50Ms).toBeLessThan(15);
        } else if (N === 10000) {
          expect(bfsMetrics.p50Ms).toBeLessThan(100); // < 100 ms pour 10k nœuds
          expect(loopMetrics.p50Ms).toBeLessThan(150);
        }
      }
    });
  });
});
