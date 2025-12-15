export interface Point {
  x: number;
  y: number;
}

export interface Player {
  id: string;
  x: number;
  y: number;
  angle: number;
  targetAngle: number;
  speed: number;
  color: string;

  // Territory and trail
  territory: Point[];
  trail: Point[];

  // State tracking for capture
  isOutside: boolean;
  exitPoint: Point | null;
  exitEdgeIndex: number;

  // Game state
  isDead: boolean;
  score: number;
}

export interface BoundaryIntersection {
  point: Point;
  edgeIndex: number;
}
