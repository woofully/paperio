import type { GameState, Player } from '@paperio2/common';
import { WORLD_WIDTH, WORLD_HEIGHT, isPointInPolygon } from '@paperio2/common';

/**
 * Bot AI that simulates human player behavior
 * Bots will:
 * - Wander around to capture territory
 * - Avoid world boundaries
 * - Return to safety when trail gets long
 * - Make random decisions to appear human-like
 */
export class BotBrain {
  public playerId: string;
  private game: GameState;

  // AI State
  private changeDirTimer: number = 0;
  private isReturning: boolean = false;
  private aiUpdateTimer: number = 0;

  // AI runs at 6Hz instead of 60Hz to save CPU
  private readonly AI_UPDATE_INTERVAL = 1 / 6; // ~0.167 seconds

  constructor(playerId: string, game: GameState) {
    this.playerId = playerId;
    this.game = game;
  }

  /**
   * Update bot AI logic
   * This is called every server tick (60Hz), but AI decisions only happen at 6Hz
   */
  update(dt: number): void {
    // Throttle AI updates to 6Hz for CPU efficiency
    this.aiUpdateTimer += dt;
    if (this.aiUpdateTimer < this.AI_UPDATE_INTERVAL) {
      return;
    }
    this.aiUpdateTimer = 0;

    const player = this.game.getPlayer(this.playerId);
    if (!player || player.isDead) return;

    // 1. CRITICAL: Avoid circular world boundary
    const centerX = WORLD_WIDTH / 2;
    const centerY = WORLD_HEIGHT / 2;
    const maxRadius = WORLD_WIDTH / 2;
    const margin = 300; // Stay 300 units away from edge

    const dx = player.x - centerX;
    const dy = player.y - centerY;
    const distFromCenter = Math.sqrt(dx * dx + dy * dy);

    if (distFromCenter > maxRadius - margin) {
      // Steer towards center
      const angleToCenter = Math.atan2(-dy, -dx);
      this.game.setPlayerInput(this.playerId, angleToCenter);
      return;
    }

    // 2. BEHAVIOR LOGIC
    this.processBehavior(player, dt);
  }

  private processBehavior(player: Player, dt: number): void {
    // Decrease timer
    this.changeDirTimer -= dt;

    const trailLength = player.trail.length;

    // RULE 1: If trail is getting long (risky), return to territory
    if (trailLength > 40 && player.isOutside) {
      if (!this.isReturning) {
        this.isReturning = true;
      }
      this.steerTowardsTerritory(player);
      return;
    }

    // RULE 2: If inside territory, reset state and prepare to wander
    if (!player.isOutside) {
      this.isReturning = false;
    }

    // RULE 3: Random direction changes (appear human-like)
    if (this.changeDirTimer <= 0) {
      if (this.isReturning && player.isOutside) {
        // Keep steering towards territory
        this.steerTowardsTerritory(player);
        this.changeDirTimer = 0.5; // Update return path every 0.5s
      } else {
        // Random wandering - turn within +/- 60 degrees
        const currentAngle = player.angle;
        const turn = (Math.random() - 0.5) * Math.PI / 1.5; // +/- 60 degrees
        const newAngle = currentAngle + turn;

        this.game.setPlayerInput(this.playerId, newAngle);

        // Change direction every 0.5-2.5 seconds
        this.changeDirTimer = Math.random() * 2.0 + 0.5;
      }
    }
  }

  /**
   * Steer bot towards its own territory (for safety)
   */
  private steerTowardsTerritory(player: Player): void {
    if (player.territory.length === 0) return;

    // Find centroid of territory (average of all points)
    let sumX = 0;
    let sumY = 0;
    for (const point of player.territory) {
      sumX += point.x;
      sumY += point.y;
    }
    const centerX = sumX / player.territory.length;
    const centerY = sumY / player.territory.length;

    // Calculate angle towards territory center
    const dx = centerX - player.x;
    const dy = centerY - player.y;
    const angleToTerritory = Math.atan2(dy, dx);

    this.game.setPlayerInput(this.playerId, angleToTerritory);
  }
}
