import type { Point, BoundaryIntersection } from '../types.js';

/**
 * Point-in-polygon test using ray casting algorithm
 * Works correctly for both convex and concave polygons
 */
export function isPointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;

    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Line segment intersection using parametric form
 * Returns the intersection point if segments intersect, null otherwise
 */
export function getSegmentIntersection(
  A: Point,
  B: Point,
  C: Point,
  D: Point
): Point | null {
  const denom = (D.y - C.y) * (B.x - A.x) - (D.x - C.x) * (B.y - A.y);

  // Parallel or collinear
  if (denom === 0) return null;

  const ua = ((D.x - C.x) * (A.y - C.y) - (D.y - C.y) * (A.x - C.x)) / denom;
  const ub = ((B.x - A.x) * (A.y - C.y) - (B.y - A.y) * (A.x - C.x)) / denom;

  // Check if intersection is within both segments
  if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
    return {
      x: A.x + ua * (B.x - A.x),
      y: A.y + ua * (B.y - A.y),
    };
  }

  return null;
}

/**
 * Find where a line segment intersects a polygon boundary
 * Returns the intersection point and the edge index
 */
export function findBoundaryIntersection(
  p1: Point,
  p2: Point,
  polygon: Point[]
): BoundaryIntersection | null {
  for (let i = 0; i < polygon.length; i++) {
    const edgeStart = polygon[i];
    const edgeEnd = polygon[(i + 1) % polygon.length];

    const intersection = getSegmentIntersection(p1, p2, edgeStart, edgeEnd);

    if (intersection) {
      return {
        point: intersection,
        edgeIndex: i,
      };
    }
  }
  return null;
}

/**
 * Extract boundary arc between two edge indices
 * Goes from startEdge+1 to endEdge (inclusive)
 */
export function extractBoundaryArc(
  polygon: Point[],
  startEdgeIndex: number,
  endEdgeIndex: number
): Point[] {
  const arc: Point[] = [];
  let i = (startEdgeIndex + 1) % polygon.length;

  // Walk around the polygon until we reach the end edge
  while (i !== (endEdgeIndex + 1) % polygon.length) {
    arc.push(polygon[i]);
    i = (i + 1) % polygon.length;
  }

  return arc;
}

/**
 * Calculate signed polygon area using shoelace formula
 * Positive = Clockwise (in screen coords where Y is down)
 * Negative = Counter-Clockwise
 */
export function getSignedPolygonArea(polygon: Point[]): number {
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    area += polygon[i].x * polygon[j].y;
    area -= polygon[j].x * polygon[i].y;
  }
  return area / 2;
}

/**
 * Calculate polygon area (absolute value)
 * Returns absolute area (always positive)
 */
export function getPolygonArea(polygon: Point[]): number {
  return Math.abs(getSignedPolygonArea(polygon));
}

/**
 * Ensure polygon has clockwise winding order
 */
export function ensureClockwise(polygon: Point[]): Point[] {
  if (getSignedPolygonArea(polygon) < 0) {
    return [...polygon].reverse();
  }
  return polygon;
}

/**
 * Compute territory capture using the two-candidate approach
 * This is the core Paper.io 2 algorithm
 * Returns the candidate that results in a LARGER territory area
 */
export function computeCapture(
  territory: Point[],
  trail: Point[],
  exitPoint: Point,
  exitEdgeIndex: number,
  entryPoint: Point,
  entryEdgeIndex: number
): Point[] {
  const territoryArea = getPolygonArea(territory);
  console.log(`🔍 computeCapture: exitEdge=${exitEdgeIndex}, entryEdge=${entryEdgeIndex}, trail length=${trail.length}`);
  console.log(`   Current territory area: ${territoryArea.toFixed(0)}`);

  // CASE 1: Same Edge (Common expansion)
  // When exiting and entering on the same edge, extractBoundaryArc returns empty for both.
  // We must manually construct the "Short" (Loop) and "Long" (Expansion) paths.
  if (exitEdgeIndex === entryEdgeIndex) {
    console.log(`📍 SAME EDGE CASE: Edge ${exitEdgeIndex}`);

    // Candidate A: The loop itself (Short path along edge, no vertices)
    const candidateA = [exitPoint, ...trail, entryPoint];

    // Candidate B: The expanded territory (Long path around all vertices)
    const arcB: Point[] = [];
    let i = (exitEdgeIndex + 1) % territory.length;
    // Add ALL vertices of the original polygon
    for (let count = 0; count < territory.length; count++) {
      arcB.push(territory[i]);
      i = (i + 1) % territory.length;
    }
    const candidateB = [exitPoint, ...trail, entryPoint, ...arcB];

    const areaA = getPolygonArea(candidateA);
    const areaB = getPolygonArea(candidateB);
    const diffA = areaA - territoryArea;
    const diffB = areaB - territoryArea;

    console.log(`   Candidate A (loop only): ${areaA.toFixed(0)} area (${diffA > 0 ? '+' : ''}${diffA.toFixed(0)} change)`);
    console.log(`   Candidate B (expansion): ${areaB.toFixed(0)} area (${diffB > 0 ? '+' : ''}${diffB.toFixed(0)} change)`);
    console.log(`   ✅ Returning ${areaA > areaB ? 'A (loop)' : 'B (expansion)'}`);

    // Return the larger one (Expansion)
    return areaA > areaB ? candidateA : candidateB;
  }

  // CASE 2: Different Edges (Corner cuts)
  console.log(`📍 DIFFERENT EDGES CASE: Exit=${exitEdgeIndex}, Entry=${entryEdgeIndex}`);

  // Extract arcs in forward direction through polygon indices
  const arcA = extractBoundaryArc(territory, exitEdgeIndex, entryEdgeIndex);
  const arcB = extractBoundaryArc(territory, entryEdgeIndex, exitEdgeIndex);

  // CRITICAL FIX: Reverse arcA to maintain proper polygon winding order
  // arcA goes exit→entry, but we need it to go entry→exit (we're at entry, going to exit)
  const candidateA = [exitPoint, ...trail, entryPoint, ...arcA.reverse()];
  const candidateB = [exitPoint, ...trail, entryPoint, ...arcB];

  const areaA = getPolygonArea(candidateA);
  const areaB = getPolygonArea(candidateB);
  const diffA = areaA - territoryArea;
  const diffB = areaB - territoryArea;

  console.log(`   Arc A: ${arcA.length} vertices from boundary`);
  console.log(`   Arc B: ${arcB.length} vertices from boundary`);
  console.log(`   Candidate A: ${areaA.toFixed(0)} area (${diffA > 0 ? '+' : ''}${diffA.toFixed(0)} change)`);
  console.log(`   Candidate B: ${areaB.toFixed(0)} area (${diffB > 0 ? '+' : ''}${diffB.toFixed(0)} change)`);

  // Choose the candidate with LARGER ABSOLUTE AREA (expansion, not reduction)
  // Using Math.abs ensures we pick the correct polygon regardless of winding order
  const absAreaA = Math.abs(areaA);
  const absAreaB = Math.abs(areaB);

  console.log(`   ✅ Returning ${absAreaA > absAreaB ? 'A' : 'B'} (larger area = expansion)`);

  // Return the larger polygon (Expansion)
  return absAreaA > absAreaB ? candidateA : candidateB;
}

/**
 * Simplify a polygon by removing points that are too close together
 * This reduces network bandwidth and rendering cost
 */
export function simplifyPolygon(polygon: Point[], tolerance: number = 2): Point[] {
  if (polygon.length < 3) return polygon;

  const simplified: Point[] = [polygon[0]];

  for (let i = 1; i < polygon.length; i++) {
    const last = simplified[simplified.length - 1];
    const curr = polygon[i];
    const dx = curr.x - last.x;
    const dy = curr.y - last.y;
    const distSq = dx * dx + dy * dy;

    if (distSq > tolerance * tolerance) {
      simplified.push(curr);
    }
  }

  return simplified;
}

/**
 * Check if two line segments intersect (used for collision detection)
 */
export function segmentsIntersect(
  a1: Point,
  a2: Point,
  b1: Point,
  b2: Point
): boolean {
  return getSegmentIntersection(a1, a2, b1, b2) !== null;
}
