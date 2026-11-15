export {
  computeEffectiveRoofPolygon,
  RoofGeometryError,
  type EffectiveRoofPolygonResult,
} from './effective.js';

export {
  computeRoofSlopes,
  type Slope,
  type RoofPlane3D,
} from './slopes.js';

export {
  computeWallTopProfile,
  isWallCoveredByRoof,
} from './top-profile.js';
