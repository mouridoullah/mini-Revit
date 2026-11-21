/* eslint-disable */
/**
 * Script de génération et consolidation de la maquette complète :
 * « Immeuble R+4 avec 100% des Composantes et Fonctionnalités de Mini-BIM »
 */

const fs = require('fs');
const path = require('path');
const ulid = () => '01M7' + Math.random().toString(36).substring(2, 11).toUpperCase() + Math.random().toString(36).substring(2, 11).toUpperCase();

const baseFile = fs.existsSync('immeuble-rplus5.json')
  ? 'immeuble-rplus5.json'
  : path.join('apps', 'web', 'public', 'demo-immeuble-r4.json');
const raw = fs.readFileSync(baseFile, 'utf8');
const model = JSON.parse(raw);

// 1. Mise à jour des Niveaux (Immeuble R+4 avec Toiture Terrasse)
model.levels['level_r0'].name = 'RDC (Rez-de-chaussée)';
model.levels['level_r1'].name = 'Étage R+1';
model.levels['level_r2'].name = 'Étage R+2';
model.levels['level_r3'].name = 'Étage R+3';
model.levels['level_r4'].name = 'Étage R+4';
model.levels['level_r5'].name = 'Toiture Terrasse & Attique';

// 2. Initialisation des dictionnaires si manquants
model.ducts = model.ducts || {};
model.cableTrays = model.cableTrays || {};
model.dimensions = model.dimensions || {};
model.roofOpenings = model.roofOpenings || {};
model.mepConnectors = model.mepConnectors || {};
model.mepSystems = model.mepSystems || {};
model.mepFittings = model.mepFittings || {};
model.mepEquipments = model.mepEquipments || {};
model.components = model.components || {};

// 3. Enregistrement des systèmes MEP
model.mepSystems['sys_vmc'] = {
  id: 'sys_vmc',
  name: 'VMC - Extraction sanitaire et cuisine',
  category: 'mepSystem',
  systemType: 'exhaust_air',
  domain: 'hvac',
  color: '#0284c7',
  elementIds: [],
};

model.mepSystems['sys_elec'] = {
  id: 'sys_elec',
  name: 'Courants Forts - Distribution colonnes',
  category: 'mepSystem',
  systemType: 'power',
  domain: 'electrical',
  color: '#f59e0b',
  elementIds: [],
};

// 4. Génération du Réseau Aéraulique (VMC / HVAC Ducts)
// Colonne montante principale dans la gaine technique en X = -2500, Y = 600
const floorLevels = [
  { id: 'level_r0', zBase: 0 },
  { id: 'level_r1', zBase: 3000 },
  { id: 'level_r2', zBase: 6000 },
  { id: 'level_r3', zBase: 9000 },
  { id: 'level_r4', zBase: 12000 },
  { id: 'level_r5', zBase: 15000 },
];

// Caisson d'extraction VMC en toiture
const vmcUnitId = 'equip_vmc_roof';
model.mepEquipments[vmcUnitId] = {
  id: vmcUnitId,
  category: 'mepEquipment',
  name: 'Centrale d’Extraction VMC Toiture',
  levelId: 'level_r5',
  equipmentType: 'air_handling_unit',
  position: { x: -2500, y: 600, z: 16500 },
  width: 800,
  depth: 800,
  height: 600,
  ports: [
    {
      id: ulid(),
      elementId: vmcUnitId,
      position: { x: -2500, y: 600, z: 16200 },
      direction: { x: 0, y: 0, z: -1 },
      domain: 'hvac',
      systemType: 'exhaust_air',
      shape: 'rectangular',
      width: 400,
      height: 250,
      flowDirection: 'in',
      label: 'VMC_ASPIRATION_COLONNE',
    },
    {
      id: ulid(),
      elementId: vmcUnitId,
      position: { x: -2500, y: 1000, z: 16500 },
      direction: { x: 0, y: 1, z: 0 },
      domain: 'hvac',
      systemType: 'exhaust_air',
      shape: 'round',
      diameter: 315,
      flowDirection: 'out',
      label: 'VMC_REJET_ATMOSPHERE',
    },
  ],
};
model.mepSystems['sys_vmc'].elementIds.push(vmcUnitId);

// Tronçons de gaine VMC par étage + piquages
for (let i = 0; i < floorLevels.length; i++) {
  const lvl = floorLevels[i];
  const zFloor = lvl.zBase;
  const zCeiling = zFloor + 2600;

  // Tronçon montant vertical entre étages
  const riserDuctId = `duct_riser_vmc_${i}`;
  const p0RiserId = ulid();
  const p1RiserId = ulid();

  model.ducts[riserDuctId] = {
    id: riserDuctId,
    category: 'duct',
    levelId: lvl.id,
    systemId: 'sys_vmc',
    name: `VMC - Colonne montante ${lvl.id}`,
    shape: 'rectangular',
    width: 400,
    height: 250,
    start: { x: -2500, y: 600, z: zFloor + 200 },
    end: { x: -2500, y: 600, z: zFloor + 2800 },
    ports: [
      {
        id: p0RiserId,
        elementId: riserDuctId,
        position: { x: -2500, y: 600, z: zFloor + 200 },
        direction: { x: 0, y: 0, z: -1 },
        domain: 'hvac',
        systemType: 'exhaust_air',
        shape: 'rectangular',
        width: 400,
        height: 250,
        flowDirection: 'bidirectional',
        label: 'DUCT_START',
      },
      {
        id: p1RiserId,
        elementId: riserDuctId,
        position: { x: -2500, y: 600, z: zFloor + 2800 },
        direction: { x: 0, y: 0, z: 1 },
        domain: 'hvac',
        systemType: 'exhaust_air',
        shape: 'rectangular',
        width: 400,
        height: 250,
        flowDirection: 'bidirectional',
        label: 'DUCT_END',
      },
    ],
  };
  model.mepSystems['sys_vmc'].elementIds.push(riserDuctId);

  // Té de piquage horizontal vers le logement
  const teeDuctId = `duct_tee_vmc_${i}`;
  const teeP0 = ulid();
  const teeP1 = ulid();
  const teeP2 = ulid();

  model.mepFittings[teeDuctId] = {
    id: teeDuctId,
    category: 'mepFitting',
    fittingType: 'tee',
    levelId: lvl.id,
    systemId: 'sys_vmc',
    position: { x: -2500, y: 600, z: zCeiling },
    ports: [
      {
        id: teeP0,
        elementId: teeDuctId,
        position: { x: -2500, y: 600, z: zCeiling - 100 },
        direction: { x: 0, y: 0, z: -1 },
        domain: 'hvac',
        systemType: 'exhaust_air',
        shape: 'rectangular',
        width: 400,
        height: 250,
      },
      {
        id: teeP1,
        elementId: teeDuctId,
        position: { x: -2500, y: 600, z: zCeiling + 100 },
        direction: { x: 0, y: 0, z: 1 },
        domain: 'hvac',
        systemType: 'exhaust_air',
        shape: 'rectangular',
        width: 400,
        height: 250,
      },
      {
        id: teeP2,
        elementId: teeDuctId,
        position: { x: -2300, y: 600, z: zCeiling },
        direction: { x: 1, y: 0, z: 0 },
        domain: 'hvac',
        systemType: 'exhaust_air',
        shape: 'round',
        diameter: 160,
      },
    ],
  };
  model.mepSystems['sys_vmc'].elementIds.push(teeDuctId);

  // Gaine horizontale vers la cuisine / SDB
  const branchDuctId = `duct_branch_vmc_${i}`;
  const branchP0 = ulid();
  const branchP1 = ulid();
  model.ducts[branchDuctId] = {
    id: branchDuctId,
    category: 'duct',
    levelId: lvl.id,
    systemId: 'sys_vmc',
    name: `VMC - Branche extraction ${lvl.id}`,
    shape: 'round',
    diameter: 160,
    start: { x: -2300, y: 600, z: zCeiling },
    end: { x: -500, y: 600, z: zCeiling },
    ports: [
      {
        id: branchP0,
        elementId: branchDuctId,
        position: { x: -2300, y: 600, z: zCeiling },
        direction: { x: -1, y: 0, z: 0 },
        domain: 'hvac',
        systemType: 'exhaust_air',
        shape: 'round',
        diameter: 160,
        flowDirection: 'bidirectional',
        label: 'BRANCH_START',
      },
      {
        id: branchP1,
        elementId: branchDuctId,
        position: { x: -500, y: 600, z: zCeiling },
        direction: { x: 1, y: 0, z: 0 },
        domain: 'hvac',
        systemType: 'exhaust_air',
        shape: 'round',
        diameter: 160,
        flowDirection: 'bidirectional',
        label: 'BRANCH_END',
      },
    ],
  };
  model.mepSystems['sys_vmc'].elementIds.push(branchDuctId);

  // Connecteurs VMC
  const connRiserToTee = `conn_vmc_riser_tee_${i}`;
  model.mepConnectors[connRiserToTee] = {
    id: connRiserToTee,
    category: 'mepConnector',
    portAId: p1RiserId,
    portBId: teeP0,
    systemId: 'sys_vmc',
  };

  const connTeeToBranch = `conn_vmc_tee_branch_${i}`;
  model.mepConnectors[connTeeToBranch] = {
    id: connTeeToBranch,
    category: 'mepConnector',
    portAId: teeP2,
    portBId: branchP0,
    systemId: 'sys_vmc',
  };
}

// 5. Génération du Réseau Électrique (Chemins de Câbles / Cable Trays)
// Colonne en X = 2000, Y = -500 (gainée dans la circulation intérieure, sans débord extérieur)
for (let i = 0; i < floorLevels.length; i++) {
  const lvl = floorLevels[i];
  const zFloor = lvl.zBase;
  const zTray = zFloor + 2500;

  // Tronçon vertical de chemin de câbles
  const riserTrayId = `tray_riser_${i}`;
  const t0Id = ulid();
  const t1Id = ulid();

  model.cableTrays[riserTrayId] = {
    id: riserTrayId,
    category: 'cableTray',
    levelId: lvl.id,
    systemId: 'sys_elec',
    name: `Câbles - Colonne montante ${lvl.id}`,
    width: 200,
    height: 60,
    start: { x: 2000, y: -500, z: zFloor + 100 },
    end: { x: 2000, y: -500, z: zFloor + 2700 },
    ports: [
      {
        id: t0Id,
        elementId: riserTrayId,
        position: { x: 2000, y: -500, z: zFloor + 100 },
        direction: { x: 0, y: 0, z: -1 },
        domain: 'electrical',
        systemType: 'power',
        shape: 'rectangular',
        width: 200,
        height: 60,
        flowDirection: 'bidirectional',
        label: 'TRAY_START',
      },
      {
        id: t1Id,
        elementId: riserTrayId,
        position: { x: 2000, y: -500, z: zFloor + 2700 },
        direction: { x: 0, y: 0, z: 1 },
        domain: 'electrical',
        systemType: 'power',
        shape: 'rectangular',
        width: 200,
        height: 60,
        flowDirection: 'bidirectional',
        label: 'TRAY_END',
      },
    ],
  };
  model.mepSystems['sys_elec'].elementIds.push(riserTrayId);

  // Distribution horizontale vers la circulation du palier intérieur
  const branchTrayId = `tray_branch_${i}`;
  const bt0Id = ulid();
  const bt1Id = ulid();

  model.cableTrays[branchTrayId] = {
    id: branchTrayId,
    category: 'cableTray',
    levelId: lvl.id,
    systemId: 'sys_elec',
    name: `Câbles - Distribution palier ${lvl.id}`,
    width: 150,
    height: 50,
    start: { x: 2000, y: -500, z: zTray },
    end: { x: 1200, y: -500, z: zTray },
    ports: [
      {
        id: bt0Id,
        elementId: branchTrayId,
        position: { x: 2000, y: -500, z: zTray },
        direction: { x: 1, y: 0, z: 0 },
        domain: 'electrical',
        systemType: 'power',
        shape: 'rectangular',
        width: 150,
        height: 50,
        flowDirection: 'bidirectional',
        label: 'BRANCH_START',
      },
      {
        id: bt1Id,
        elementId: branchTrayId,
        position: { x: 1200, y: -500, z: zTray },
        direction: { x: -1, y: 0, z: 0 },
        domain: 'electrical',
        systemType: 'power',
        shape: 'rectangular',
        width: 150,
        height: 50,
        flowDirection: 'bidirectional',
        label: 'BRANCH_END',
      },
    ],
  };
  model.mepSystems['sys_elec'].elementIds.push(branchTrayId);

  // Raccord Té chemin de câbles
  const trayTeeId = `tray_tee_${i}`;
  const tt0 = ulid();
  const tt1 = ulid();
  const tt2 = ulid();

  model.mepFittings[trayTeeId] = {
    id: trayTeeId,
    category: 'mepFitting',
    fittingType: 'tee',
    levelId: lvl.id,
    systemId: 'sys_elec',
    position: { x: 2000, y: -500, z: zTray },
    ports: [
      {
        id: tt0,
        elementId: trayTeeId,
        position: { x: 2000, y: -500, z: zTray - 50 },
        direction: { x: 0, y: 0, z: -1 },
        domain: 'electrical',
        systemType: 'power',
        shape: 'rectangular',
        width: 200,
        height: 60,
      },
      {
        id: tt1,
        elementId: trayTeeId,
        position: { x: 2000, y: -500, z: zTray + 50 },
        direction: { x: 0, y: 0, z: 1 },
        domain: 'electrical',
        systemType: 'power',
        shape: 'rectangular',
        width: 200,
        height: 60,
      },
      {
        id: tt2,
        elementId: trayTeeId,
        position: { x: 2000, y: -500, z: zTray },
        direction: { x: -1, y: 0, z: 0 },
        domain: 'electrical',
        systemType: 'power',
        shape: 'rectangular',
        width: 150,
        height: 50,
      },
    ],
  };
  model.mepSystems['sys_elec'].elementIds.push(trayTeeId);

  // Connecteurs électriques
  const connTrayRiser = `conn_tray_riser_tee_${i}`;
  model.mepConnectors[connTrayRiser] = {
    id: connTrayRiser,
    category: 'mepConnector',
    portAId: t1Id,
    portBId: tt0,
    systemId: 'sys_elec',
  };

  const connTrayBranch = `conn_tray_tee_branch_${i}`;
  model.mepConnectors[connTrayBranch] = {
    id: connTrayBranch,
    category: 'mepConnector',
    portAId: tt2,
    portBId: bt0Id,
    systemId: 'sys_elec',
  };
}

// 6. Ajout des Cotations 2D Associatives (Dimensions)
model.dimensions['dim_facade_sud_rdc'] = {
  id: 'dim_facade_sud_rdc',
  category: 'dimension',
  levelId: 'level_r0',
  type: 'linear',
  references: ['wall_0_south'],
  offset: -800,
  value: 10000,
};

model.dimensions['dim_facade_nord_rdc'] = {
  id: 'dim_facade_nord_rdc',
  category: 'dimension',
  levelId: 'level_r0',
  type: 'linear',
  references: ['wall_0_north'],
  offset: -800,
  value: 10000,
};

model.dimensions['dim_facade_ouest_rdc'] = {
  id: 'dim_facade_ouest_rdc',
  category: 'dimension',
  levelId: 'level_r0',
  type: 'linear',
  references: ['wall_0_west'],
  offset: -800,
  value: 10500,
};

model.dimensions['dim_facade_est_rdc'] = {
  id: 'dim_facade_est_rdc',
  category: 'dimension',
  levelId: 'level_r0',
  type: 'linear',
  references: ['wall_0_east'],
  offset: -800,
  value: 10500,
};

model.dimensions['dim_sejour_r1'] = {
  id: 'dim_sejour_r1',
  category: 'dimension',
  levelId: 'level_r1',
  type: 'linear',
  references: ['wall_1_south'],
  offset: -600,
  value: 10000,
};

// 7. Ajout d'une Trémie de Toiture (RoofOpening)
model.roofOpenings['roof_opening_hatch'] = {
  id: 'roof_opening_hatch',
  category: 'roofOpening',
  roofId: 'roof_main',
  offsetU: 0,
  offsetV: 2000,
  width: 1200,
  height: 900,
};

// 8. Enrichissement du Mobilier (Chaises, Baignoires, Meubles Hauts, Baies Coulissantes)
for (let i = 0; i < floorLevels.length; i++) {
  const lvlId = floorLevels[i].id;

  // 4 Chaises autour de la table à manger
  for (let c = 0; c < 4; c++) {
    const chairId = `comp_${lvlId}_chair_${c + 1}`;
    const offsetX = (c % 2 === 0 ? -400 : 400);
    const offsetY = (c < 2 ? -450 : 450);
    model.components[chairId] = {
      id: chairId,
      name: `Chaise ${c + 1}`,
      category: 'component',
      typeId: 'ct_chair',
      levelId: lvlId,
      placement: {
        x: 1200 + offsetX,
        y: -2500 + offsetY,
        rotation: c < 2 ? 0 : 180,
      },
    };
  }

  // Baignoire dans la salle de bain
  const bathId = `comp_${lvlId}_bathtub`;
  model.components[bathId] = {
    id: bathId,
    name: 'Baignoire',
    category: 'component',
    typeId: 'ct_bath_tub',
    levelId: lvlId,
    placement: {
      x: 1800,
      y: 800,
      rotation: 90,
    },
  };

  // Meuble haut de cuisine
  const wallKitchenId = `comp_${lvlId}_kitchen_wall`;
  model.components[wallKitchenId] = {
    id: wallKitchenId,
    name: 'Meuble haut cuisine',
    category: 'component',
    typeId: 'ct_kitchen_wall_60',
    levelId: lvlId,
    placement: {
      x: -800,
      y: -4200,
      rotation: 0,
    },
  };

  // Baie vitrée coulissante sur le balcon
  const slidingId = `comp_${lvlId}_sliding_balcony`;
  model.components[slidingId] = {
    id: slidingId,
    name: 'Baie coulissante séjour',
    category: 'component',
    typeId: 'ct_sliding_door',
    levelId: lvlId,
    placement: {
      x: -2500,
      y: -4500,
      rotation: 0,
    },
  };
}

// 9. Écriture du fichier consolidé
const outputJson = JSON.stringify(model, null, 2);
fs.writeFileSync('immeuble-r4-complet.json', outputJson, 'utf8');

// Écriture également dans apps/web/public pour chargement direct dans le navigateur
const publicDest = path.join('apps', 'web', 'public', 'demo-immeuble-r4.json');
fs.writeFileSync(publicDest, outputJson, 'utf8');

console.log('✅ Immeuble R+4 complet généré avec succès !');
console.log('Stats finales :');
console.log('- Niveaux :', Object.keys(model.levels).length);
console.log('- Murs :', Object.keys(model.walls).length);
console.log('- Dalles :', Object.keys(model.slabs).length);
console.log('- Portes :', Object.keys(model.doors).length);
console.log('- Fenêtres :', Object.keys(model.windows).length);
console.log('- Pièces :', Object.keys(model.rooms).length);
console.log('- Escaliers :', Object.keys(model.stairs).length);
console.log('- Toitures :', Object.keys(model.roofs).length);
console.log('- Trémies toiture :', Object.keys(model.roofOpenings).length);
console.log('- Cotations 2D :', Object.keys(model.dimensions).length);
console.log('- Composants / Mobilier :', Object.keys(model.components).length);
console.log('- Canalisations (Pipes) :', Object.keys(model.pipes).length);
console.log('- Gaines VMC (Ducts) :', Object.keys(model.ducts).length);
console.log('- Chemins de câbles (CableTrays) :', Object.keys(model.cableTrays).length);
console.log('- Raccords MEP (Fittings) :', Object.keys(model.mepFittings).length);
console.log('- Équipements MEP :', Object.keys(model.mepEquipments).length);
console.log('- Systèmes MEP :', Object.keys(model.mepSystems).length);
console.log('- Connecteurs MEP :', Object.keys(model.mepConnectors).length);
