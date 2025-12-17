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
  deathTimer: number; // Time since death (for delayed removal)
  score: number;
  invulnerableTimer: number; // Grace period after capture to prevent instant death
  hasWon: boolean; // Player captured 99%+ of world
}

export interface BoundaryIntersection {
  point: Point;
  edgeIndex: number;
}
