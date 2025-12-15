// Types
export type { Point, Player, BoundaryIntersection } from './types.js';

// Math/Geometry
export {
  isPointInPolygon,
  getSegmentIntersection,
  findBoundaryIntersection,
  extractBoundaryArc,
  getPolygonArea,
  computeCapture,
  simplifyPolygon,
  segmentsIntersect,
} from './math/geometry.js';

// Game State
export { GameState } from './GameState.js';

// Constants
export * from './constants.js';
