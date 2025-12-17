import { Room } from '@colyseus/core';
import type { Client } from 'colyseus';
import { GameRoomState, PlayerState } from '../schema/GameSchema.js';
import {
  GameState,
  isPointInPolygon,
  findBoundaryIntersection,
  computeCapture,
  simplifyPolygon,
  ensureClockwise,
  segmentsIntersect,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  SERVER_TICK_INTERVAL,
  PLAYER_COLORS,
  MIN_SPAWN_DISTANCE,
  STARTING_TERRITORY_SIZE,
  type Player,
  type Point,
} from '@paperio2/common';
import { SpatialHash } from '../SpatialHash.js';
import { BotBrain } from '../ai/BotBrain.js';
import { getRandomBotName } from '../utils/names.js';

export class GameRoom extends Room<GameRoomState> {
  private game: GameState = new GameState();
  private spatialHash: SpatialHash = new SpatialHash(100);
  private colorIndex: number = 0;

  // Bot management
  private bots: Map<string, BotBrain> = new Map();
  private botManagementInterval: NodeJS.Timeout | null = null;
  private readonly TARGET_TOTAL_PLAYERS = 4; // Maintain 4 players total (humans + bots) - less crowded
  private readonly MIN_HUMAN_PLAYERS_FOR_BOTS = 3; // Only spawn bots if < 3 humans

  onCreate(options: any) {
    this.setState(new GameRoomState());

    // Set maximum players per room
    this.maxClients = 10;

    // Set up message handlers
    this.onMessage('input', (client, message) => {
      // Update player's target angle
      this.game.setPlayerInput(client.sessionId, message.angle);
    });

    // Set up fixed-timestep simulation (30 Hz)
    this.setSimulationInterval((deltaTime) => {
      const dt = deltaTime / 1000; // Convert to seconds
      this.update(dt);
    }, SERVER_TICK_INTERVAL);

    // Set up bot management (check every 2 seconds)
    this.botManagementInterval = setInterval(() => {
      this.manageBotPopulation();
    }, 2000);

    console.log('GameRoom created (max 10 players)');
  }

  onJoin(client: Client, options: any) {
    console.log(`🎮 Player ${client.sessionId} joined`);

    // Get username from options (default to session ID if not provided)
    const username = options.username || client.sessionId.substring(0, 8);
    console.log(`👤 Username: ${username}`);

    // Find spawn position
    const spawnPos = this.findSpawnPosition();
    const color = PLAYER_COLORS[this.colorIndex % PLAYER_COLORS.length];
    this.colorIndex++;

    console.log(`📍 Spawn position: (${spawnPos.x}, ${spawnPos.y})`);
    console.log(`🎨 Color: ${color}`);

    // Create player in game state
    const player = this.game.createPlayer(
      client.sessionId,
      spawnPos.x,
      spawnPos.y,
      color
    );

    console.log(`✅ Player created with territory:`, player.territory);
    console.log(`📏 Territory has ${player.territory.length} points`);

    // Create player in Colyseus state
    const playerState = new PlayerState();
    playerState.id = client.sessionId;
    playerState.name = username;
    playerState.x = player.x;
    playerState.y = player.y;
    playerState.angle = player.angle;
    playerState.color = player.color;
    playerState.isDead = false;
    playerState.hasWon = false;
    playerState.score = 0;

    // Sync territory
    this.syncTerritory(playerState, player.territory);
    console.log(`📦 Synced territory to Colyseus state, length: ${playerState.territory.length}`);

    this.state.players.set(client.sessionId, playerState);
    console.log(`✅ Player state added to room`);
  }

  onLeave(client: Client, consented: boolean) {
    console.log(`Player ${client.sessionId} left`);
    this.game.removePlayer(client.sessionId);
    this.state.players.delete(client.sessionId);
  }

  /**
   * Main game loop
   */
  private update(dt: number): void {
    try {
      // Update physics
      this.game.update(dt);

      // Update bot AI (bots set their own target angles)
      this.bots.forEach((bot, botId) => {
        const player = this.game.getPlayer(botId);
        if (!player) {
          // Player doesn't exist - clean up bot
          this.bots.delete(botId);
          this.state.players.delete(botId);
          return;
        }

        // Clean up dead bots after 1 second (time for death animation)
        if (player.isDead && player.deathTimer > 1.0) {
          this.bots.delete(botId);
          this.game.removePlayer(botId);
          this.state.players.delete(botId);
          return;
        }

        // Only update AI for alive bots
        if (!player.isDead) {
          bot.update(dt);
        }
      });

      // Check for territory capture and collisions
      this.spatialHash.clear();
      this.checkCaptureAndCollisions();

      // Sync state to clients
      this.syncState();
    } catch (e) {
      console.error("❌ CRITICAL SERVER ERROR:", e);
      // Don't crash the room, just skip this tick
    }
  }

  /**
   * Check for loop closures and collisions
   */
  private checkCaptureAndCollisions(): void {
    const players = this.game.getAllPlayers();

    // Build spatial hash for trails
    for (const player of players) {
      if (player.isDead) continue;

      // Index trail segments WITH THEIR ARRAY INDEX (CRITICAL for self-collision)
      for (let i = 0; i < player.trail.length - 1; i++) {
        this.spatialHash.insertSegment(
          {
            type: 'trail',
            playerId: player.id,
            p1: player.trail[i],
            p2: player.trail[i + 1],
            index: i  // <--- CRITICAL: Store the index
          },
          player.trail[i],
          player.trail[i + 1]
        );
      }

      // Index territory edges
      for (let i = 0; i < player.territory.length; i++) {
        const p1 = player.territory[i];
        const p2 = player.territory[(i + 1) % player.territory.length];
        this.spatialHash.insertSegment(
          { type: 'territory', playerId: player.id, p1, p2 },
          p1,
          p2
        );
      }
    }

    // Check each player
    for (const player of players) {
      if (player.isDead) continue;

      const currentPos = { x: player.x, y: player.y };
      const prevPos = { x: (player as any).prevX || player.x, y: (player as any).prevY || player.y };

      // Track if we captured this frame (to skip collision check)
      let justCaptured = false;

      // Check if inside own territory
      const isInside = isPointInPolygon(currentPos, player.territory);

      // EXIT detection
      // Don't exit if invulnerable (prevents immediate re-exit after capture)
      if (!player.isOutside && !isInside && player.invulnerableTimer <= 0) {
        const hit = findBoundaryIntersection(prevPos, currentPos, player.territory);
        if (hit) {
          player.isOutside = true;
          player.exitPoint = hit.point;
          player.exitEdgeIndex = hit.edgeIndex;
          player.trail = [hit.point]; // Start trail at exact exit point
          console.log(`🚪 Player ${player.id} EXITED territory at`, hit.point);
        } else {
          // Fallback: If we jumped out without hitting edge, force start
          player.isOutside = true;
          player.exitPoint = prevPos;
          player.exitEdgeIndex = 0; // Approximate
          player.trail = [prevPos];
          console.log(`⚠️ Player ${player.id} EXITED (fallback) at`, prevPos);
        }
      }

      // ENTRY detection (loop closure into territory)
      if (player.isOutside && isInside) {
        let hit = findBoundaryIntersection(prevPos, currentPos, player.territory);

        // FIX: Handle Tunneling. If we are inside but missed the intersection, force it.
        if (!hit) {
          // Find closest vertex as a fallback entry point
          let closestIdx = 0;
          let minD = Infinity;
          for (let i = 0; i < player.territory.length; i++) {
            const d = Math.hypot(player.territory[i].x - currentPos.x, player.territory[i].y - currentPos.y);
            if (d < minD) {
              minD = d;
              closestIdx = i;
            }
          }
          hit = { point: currentPos, edgeIndex: closestIdx };
          console.log(`⚠️ Tunneling detected - forcing capture at closest vertex`);
        }

        // FIX: Add minimum trail length check (e.g. 2 points) to prevent jitter captures
        if (hit && player.exitPoint && player.trail.length > 2) {
          console.log(`🏠 Player ${player.id} ENTERED territory at`, hit.point);
          console.log(`📏 Trail had ${player.trail.length} points`);
          console.log(`🎨 Trail covered area from exit:(${player.exitPoint.x.toFixed(0)},${player.exitPoint.y.toFixed(0)}) to entry:(${hit.point.x.toFixed(0)},${hit.point.y.toFixed(0)})`);

          try {
            // Compute capture
            const capturedPoly = computeCapture(
              player.territory,
              player.trail,
              player.exitPoint,
              player.exitEdgeIndex,
              hit.point,
              hit.edgeIndex
            );

            // FIX 1: Balanced simplification (1.0) to preserve border shape while preventing lag
            // 0.5 = 700+ vertices (causes pauses), 2-5 = gaps, 1.0 = sweet spot
            let newTerritory = simplifyPolygon(capturedPoly, 1.0);

            // FIX 2: Adaptive simplification if vertex count is still too high
            // If territory exceeds 400 vertices after simplification, apply more aggressive simplification
            if (newTerritory.length > 400) {
              console.log(`⚠️ Territory has ${newTerritory.length} vertices, applying aggressive simplification`);
              newTerritory = simplifyPolygon(newTerritory, 2.0);
            }

            // FIX 3: Enforce Clockwise Winding (prevents "White Hole" rendering issue)
            newTerritory = ensureClockwise(newTerritory);

            // SANITY CHECK: Ensure no NaN or invalid coordinates
            const isValid = newTerritory.every(p =>
              !isNaN(p.x) && !isNaN(p.y) &&
              isFinite(p.x) && isFinite(p.y)
            );

            if (!isValid) {
              throw new Error("Generated invalid territory with NaN/Infinity");
            }

            const newArea = Math.floor(this.calculateArea(newTerritory));
            const oldArea = player.score; // Score tracks area

            // FIX 3: Lenient Growth Check
            // Allow small fluctuations (floating point noise) but block catastrophic failures
            // Checking (newArea > 100) prevents accepting tiny invalid polygons
            if (newTerritory.length > 3 && newArea > 100 && isFinite(newArea)) {
              player.territory = newTerritory;
              player.score = newArea;
              console.log(`✅ Territory Updated: ${oldArea} -> ${newArea}`);
              console.log(`   New territory has ${newTerritory.length} vertices`);

              // FORCE territory sync to client
              (player as any).territoryChanged = true;

              // Grant invulnerability and mark capture
              justCaptured = true;
              player.invulnerableTimer = 0.5; // 0.5s grace period
            } else {
              console.warn(`⚠️ Capture rejected: New area (${newArea}) invalid or too small`);
              console.warn(`   Old area: ${oldArea}, Territory length: ${newTerritory.length}`);
            }
          } catch (err) {
            console.error(`❌ Error calculating capture for player ${player.id}:`, err);
            console.error(`   Territory preserved, trail cleared to prevent stuck state`);
          }

          // Reset trail state regardless of success to prevent getting stuck
          console.log(`🗑️  Trail CLEARED (had ${player.trail.length} points)`);
          player.trail = [];
          player.isOutside = false;
          player.exitPoint = null;
          player.exitEdgeIndex = -1;
        }
      }

      // LOOP CLOSURE detection (completing a circle back to exit point in open space)
      if (player.isOutside && !isInside && player.exitPoint && player.trail.length > 10) {
        const distToExit = Math.sqrt(
          Math.pow(currentPos.x - player.exitPoint.x, 2) +
          Math.pow(currentPos.y - player.exitPoint.y, 2)
        );

        // If player is close to their exit point, complete the loop
        if (distToExit < 80) { // Increased tolerance to 80 for easier loop closure
          console.log(`🔄 Player ${player.id} COMPLETED LOOP at exit point`);

          try {
            // FIX: Use computeCapture instead of manual polygon construction.
            // Treat this as entering the territory at the exact same edge we left it.
            // This ensures we MERGE the loop with the existing territory instead of replacing it.
            const capturedPoly = computeCapture(
              player.territory,
              player.trail,
              player.exitPoint,
              player.exitEdgeIndex,
              player.exitPoint, // Entry point is same as Exit point
              player.exitEdgeIndex // Entry edge is same as Exit edge
            );

            // Balanced simplification for loop closure
            let newTerritory = simplifyPolygon(capturedPoly, 1.0);

            // Adaptive simplification if vertex count is too high
            if (newTerritory.length > 400) {
              console.log(`⚠️ Loop territory has ${newTerritory.length} vertices, applying aggressive simplification`);
              newTerritory = simplifyPolygon(newTerritory, 2.0);
            }

            // Sanity Checks
            const isValid = newTerritory.every(p => !isNaN(p.x) && !isNaN(p.y));
            if (!isValid) throw new Error("Invalid Polygon generated");

            const newArea = Math.floor(this.calculateArea(newTerritory));
            const oldArea = player.score;

            // FIX: Robust growth check
            if (newTerritory.length > 3 && newArea > oldArea) {
              player.territory = newTerritory;
              player.score = newArea;
              (player as any).territoryChanged = true;

              const growth = newArea - oldArea;
              console.log(`✅ Territory Grew (Loop): +${growth.toFixed(0)}`);

              // Grant invulnerability and mark capture
              justCaptured = true;
              player.invulnerableTimer = 0.5; // 0.5s grace period
            } else {
              console.warn(`⚠️ Loop capture rejected: Area did not grow (${oldArea} -> ${newArea})`);
            }
          } catch (err) {
            console.error(`❌ Error calculating loop capture:`, err);
          }

          // Always clean up state
          player.trail = [];
          player.isOutside = false;
          player.exitPoint = null;
          player.exitEdgeIndex = -1;
        }
      }

      // CRITICAL: Skip collision check if we just captured
      // The spatial hash contains old trail data that was just cleared
      // Checking it now would cause instant death from "ghost trail"
      if (justCaptured) {
        continue;
      }

      // WIN CONDITION: If player has captured 99%+ of the world, they're invincible
      // The circular world has area = π × 2499² ≈ 19,618,318
      const worldRadius = (WORLD_WIDTH / 2) - 1.0;
      const worldArea = Math.PI * worldRadius * worldRadius;
      const winThreshold = worldArea * 0.99; // 99% coverage = win

      if (player.score >= winThreshold) {
        // Player has won! Set victory flag
        if (!player.hasWon) {
          player.hasWon = true;
          const percentage = ((player.score / worldArea) * 100).toFixed(2);
          console.log(`🏆🎉 VICTORY! Player ${player.id} conquered ${percentage}% of the world!`);
        }

        // Force them back inside if somehow outside
        if (player.isOutside) {
          player.isOutside = false;
          player.trail = [];
          player.exitPoint = null;
          player.exitEdgeIndex = -1;
        }
        continue; // Skip collision detection
      }

      // Collision detection
      if (player.isOutside) {
        const nearby = this.spatialHash.query(player.x, player.y);

        for (const item of nearby) {
          // 1. Check collision with OTHER players' TRAILS ONLY
          // Territories are NOT solid - you can move through them to steal land!
          if (item.playerId !== player.id && item.type === 'trail') {
            if (segmentsIntersect(prevPos, currentPos, item.p1, item.p2)) {
              // CUTTING TRAIL: Moving player cuts other player's trail → Other player dies!
              const victim = this.game.getPlayer(item.playerId);
              if (victim && victim.isOutside) {
                console.log(`✂️ Player ${player.id} CUT ${item.playerId}'s trail!`);
                this.killPlayer(victim);
              }
              // Don't break - check for more victims in case of multi-kill
            }
          }

          // 2. Check self-collision (hitting own trail)
          // FIX: Use INDEX GAP instead of Distance
          // When you loop back, your head is physically close to your old trail (distance ~0),
          // so the old dist > 30 check would FAIL to detect the collision.
          // Instead, we check if the segment is "old enough" by comparing array indices.
          if (item.playerId === player.id && item.type === 'trail') {
            const currentIndex = player.trail.length; // Virtual index of head

            // Check if player is near their exit point (completing a valid loop)
            // Use 100 units threshold (larger than 80 unit loop closure threshold) to prevent death during valid loops
            const isNearExitPoint = player.exitPoint &&
              Math.sqrt(
                Math.pow(currentPos.x - player.exitPoint.x, 2) +
                Math.pow(currentPos.y - player.exitPoint.y, 2)
              ) < 100; // Within 100 units of exit point (safety margin for loop closure)

            // Skip self-collision check if:
            // 1. Player is entering their territory (closing the loop into territory)
            // 2. Player is near their exit point (completing a loop in open space)
            // This allows valid loop closures (like circling the entire boundary)
            if (!isInside && !isNearExitPoint) {
              // FIX: Increase safety buffer to 20 segments (~0.3s) to prevent false deaths
              // when sliding along borders or making tight turns
              if (currentIndex - item.index > 20) {
                if (segmentsIntersect(prevPos, currentPos, item.p1, item.p2)) {
                  console.log(`💀 Player ${player.id} hit their own trail (Index gap: ${currentIndex - item.index})`);
                  this.killPlayer(player);
                  break;
                }
              }
            }
          }
        }
      }
    }
  }

  /**
   * Kill a player
   */
  private killPlayer(player: Player): void {
    player.isDead = true;
    player.deathTimer = 0; // Start death timer for delayed removal
    player.trail = [];
    console.log(`Player ${player.id} died`);
  }

  /**
   * Calculate polygon area
   */
  private calculateArea(polygon: Point[]): number {
    let area = 0;
    for (let i = 0; i < polygon.length; i++) {
      const j = (i + 1) % polygon.length;
      area += polygon[i].x * polygon[j].y;
      area -= polygon[j].x * polygon[i].y;
    }
    return Math.abs(area) / 2;
  }

  /**
   * Sync game state to Colyseus state
   */
  private syncState(): void {
    for (const player of this.game.getAllPlayers()) {
      const playerState = this.state.players.get(player.id);
      if (!playerState) continue;

      playerState.x = player.x;
      playerState.y = player.y;
      playerState.angle = player.angle;
      playerState.isDead = player.isDead;
      playerState.hasWon = player.hasWon;
      playerState.score = player.score;

      // Sync trail (flat array)
      this.syncTrail(playerState, player.trail);

      // Sync territory when it changes (initially or after capture)
      // Check if territory size changed OR if territoryChanged flag is set
      if (playerState.territory.length !== player.territory.length * 2 || (player as any).territoryChanged) {
        this.syncTerritory(playerState, player.territory);
        (player as any).territoryChanged = false; // Clear flag
      }
    }
  }

  /**
   * Convert territory to flat array
   */
  private syncTerritory(playerState: PlayerState, territory: Point[]): void {
    playerState.territory.clear();
    for (const point of territory) {
      playerState.territory.push(point.x, point.y);
    }
  }

  /**
   * Convert trail to flat array
   * Only sync if trail length changed to avoid unnecessary updates
   */
  private syncTrail(playerState: PlayerState, trail: Point[]): void {
    const expectedLength = trail.length * 2;

    // If length changed, resync the entire trail
    if (playerState.trail.length !== expectedLength) {
      playerState.trail.clear();
      for (const point of trail) {
        playerState.trail.push(point.x, point.y);
      }
    }
  }

  /**
   * Manage bot population based on human player count
   * Bots are spawned when there are few humans to make the game feel populated
   */
  private manageBotPopulation(): void {
    // Count human players (exclude bots)
    const allPlayers = this.game.getAllPlayers();
    const humanCount = allPlayers.filter((p: Player) => !p.id.startsWith('BOT_')).length;
    const botCount = this.bots.size;
    const totalPlayers = humanCount + botCount;

    // Only spawn bots if there are few human players
    if (humanCount >= this.MIN_HUMAN_PLAYERS_FOR_BOTS) {
      // Too many humans - don't spawn bots
      // Existing bots will naturally die off or can be left to play
      return;
    }

    // Spawn bots to reach target population
    if (totalPlayers < this.TARGET_TOTAL_PLAYERS) {
      const botsToSpawn = this.TARGET_TOTAL_PLAYERS - totalPlayers;

      for (let i = 0; i < botsToSpawn; i++) {
        this.spawnBot();
      }
    }

    // Optional: Despawn bots if too many players
    // (Or just let them die naturally in combat)
  }

  /**
   * Spawn a single bot
   */
  private spawnBot(): void {
    const botId = `BOT_${Math.random().toString(36).substr(2, 9)}`;
    const spawn = this.findSpawnPosition();
    const color = PLAYER_COLORS[this.colorIndex % PLAYER_COLORS.length];
    this.colorIndex++;

    // Create in GameState
    const player = this.game.createPlayer(botId, spawn.x, spawn.y, color);

    // Create in Colyseus State (so clients see it)
    const playerState = new PlayerState();
    playerState.id = botId;
    playerState.name = getRandomBotName();
    playerState.x = player.x;
    playerState.y = player.y;
    playerState.angle = player.angle;
    playerState.color = player.color;
    playerState.isDead = false;
    playerState.hasWon = false;
    playerState.score = 0;

    this.syncTerritory(playerState, player.territory);
    this.state.players.set(botId, playerState);

    // Create Bot Brain
    this.bots.set(botId, new BotBrain(botId, this.game));

    console.log(`🤖 Spawned bot: ${playerState.name} (Total: ${this.game.getAllPlayers().length} players, ${this.bots.size} bots)`);
  }

  /**
   * Clean up when room is disposed
   */
  onDispose(): void {
    if (this.botManagementInterval) {
      clearInterval(this.botManagementInterval);
    }
    console.log('GameRoom disposed');
  }

  /**
   * Find a valid spawn position
   * Ensures new player's territory won't overlap with existing territories
   */
  private findSpawnPosition(): Point {
    const maxAttempts = 100; // Increased attempts for better spawn placement
    const centerX = WORLD_WIDTH / 2;
    const centerY = WORLD_HEIGHT / 2;
    const maxRadius = WORLD_WIDTH / 2;
    const territoryRadius = (STARTING_TERRITORY_SIZE / 2) + 5; // Match the radius used in createPlayer

    for (let i = 0; i < maxAttempts; i++) {
      // Generate random position within circular boundary
      // Use sqrt for uniform distribution in circle
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.sqrt(Math.random()) * (maxRadius - territoryRadius - 50);
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;

      // Check if this spawn position is valid
      let valid = true;
      for (const player of this.game.getAllPlayers()) {
        // Skip dead players
        if (player.isDead) continue;

        // Check 1: Don't spawn inside another player's territory
        if (isPointInPolygon({ x, y }, player.territory)) {
          valid = false;
          break;
        }

        // Check 2: Ensure new territory won't overlap with existing territory
        // Find closest point on existing territory to spawn position
        let minDistToTerritory = Infinity;
        for (const territoryPoint of player.territory) {
          const dx = x - territoryPoint.x;
          const dy = y - territoryPoint.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          minDistToTerritory = Math.min(minDistToTerritory, dist);
        }

        // New territory radius + existing territory should not overlap
        // Add buffer of 100 units to ensure clear separation
        const minSafeDist = territoryRadius + 100;
        if (minDistToTerritory < minSafeDist) {
          valid = false;
          break;
        }
      }

      if (valid) {
        return { x, y };
      }
    }

    // Fallback: try to find ANY position not inside a territory
    for (let i = 0; i < maxAttempts; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.sqrt(Math.random()) * (maxRadius - territoryRadius - 50);
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;

      let insideAnyTerritory = false;
      for (const player of this.game.getAllPlayers()) {
        if (player.isDead) continue;
        if (isPointInPolygon({ x, y }, player.territory)) {
          insideAnyTerritory = true;
          break;
        }
      }

      if (!insideAnyTerritory) {
        return { x, y };
      }
    }

    // Last resort fallback to center (might overlap, but game must continue)
    console.warn('⚠️ Could not find non-overlapping spawn position! Using center.');
    return { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 };
  }
}
