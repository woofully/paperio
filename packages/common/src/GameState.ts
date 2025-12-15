import type { Player, Point } from './types.js';
import {
  isPointInPolygon,
  findBoundaryIntersection,
  simplifyPolygon,
  getPolygonArea,
} from './math/geometry.js';
import {
  PLAYER_SPEED,
  PLAYER_TURN_SPEED,
  TRAIL_POINT_DISTANCE,
  STARTING_TERRITORY_SIZE,
} from './constants.js';

/**
 * Core game state and physics
 * This runs on both client (for prediction) and server (authoritative)
 */
export class GameState {
  players: Map<string, Player> = new Map();

  /**
   * Create a new player with starting territory
   */
  createPlayer(id: string, x: number, y: number, color: string): Player {
    // Create a small circle as starting territory (like real Paper.io 2)
    const radius = STARTING_TERRITORY_SIZE / 2;
    const segments = 64; // High segment count for smooth circle appearance
    const territory: Point[] = [];

    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      territory.push({
        x: x + Math.cos(angle) * radius,
        y: y + Math.sin(angle) * radius,
      });
    }

    // Calculate initial territory area for the score
    const initialArea = Math.floor(getPolygonArea(territory));

    const player: Player = {
      id,
      x,
      y,
      angle: 0,
      targetAngle: 0,
      speed: PLAYER_SPEED,
      color,
      territory,
      trail: [],
      isOutside: false,
      exitPoint: null,
      exitEdgeIndex: -1,
      isDead: false,
      score: initialArea,
    };

    this.players.set(id, player);
    return player;
  }

  /**
   * Remove a player from the game
   */
  removePlayer(id: string): void {
    this.players.delete(id);
  }

  /**
   * Main physics update loop
   * Called at fixed timestep on server, variable on client
   */
  update(dt: number): void {
    for (const player of this.players.values()) {
      if (player.isDead) continue;

      this.updatePlayerMovement(player, dt);
      this.updatePlayerTrail(player);
    }
  }

  /**
   * Update player position and rotation
   */
  private updatePlayerMovement(player: Player, dt: number): void {
    // 1. Normalize Player Angle to -PI..PI range FIRST
    // This prevents the "270 degree spin" when crossing the boundary
    // atan2(sin(θ), cos(θ)) is a clean way to normalize any angle
    player.angle = Math.atan2(Math.sin(player.angle), Math.cos(player.angle));

    // 2. Calculate Shortest Turn Direction
    let angleDiff = player.targetAngle - player.angle;

    // Normalize diff to -PI to +PI
    while (angleDiff <= -Math.PI) angleDiff += Math.PI * 2;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;

    // Apply rotation
    player.angle += angleDiff * PLAYER_TURN_SPEED * dt;

    // Move forward
    const prevX = player.x;
    const prevY = player.y;

    player.x += Math.cos(player.angle) * player.speed * dt;
    player.y += Math.sin(player.angle) * player.speed * dt;

    // Store previous position for intersection detection
    (player as any).prevX = prevX;
    (player as any).prevY = prevY;
  }

  /**
   * Update player's trail
   * Only adds points if moved far enough (optimization)
   */
  private updatePlayerTrail(player: Player): void {
    // Only add trail points if player is flagged as outside their territory
    if (!player.isOutside) {
      return;
    }

    const currentPos = { x: player.x, y: player.y };

    // Check if we've moved far enough since the last trail point
    if (player.trail.length > 0) {
      const lastPoint = player.trail[player.trail.length - 1];
      const dx = currentPos.x - lastPoint.x;
      const dy = currentPos.y - lastPoint.y;
      const distSq = dx * dx + dy * dy;

      // Only add a new point if we've moved at least TRAIL_POINT_DISTANCE
      if (distSq < TRAIL_POINT_DISTANCE * TRAIL_POINT_DISTANCE) {
        return; // Too close, don't add point
      }
    }

    // Add current position to trail
    player.trail.push({ ...currentPos });
  }

  /**
   * Set player input (target angle)
   */
  setPlayerInput(playerId: string, targetAngle: number): void {
    const player = this.players.get(playerId);
    if (player && !player.isDead) {
      player.targetAngle = targetAngle;
    }
  }

  /**
   * Get player by ID
   */
  getPlayer(id: string): Player | undefined {
    return this.players.get(id);
  }

  /**
   * Get all players
   */
  getAllPlayers(): Player[] {
    return Array.from(this.players.values());
  }
}
