import { Room } from '@colyseus/core';
import type { Client } from 'colyseus';
import { GameRoomState, PlayerState } from '../schema/GameSchema.js';
import {
  GameState,
  isPointInPolygon,
  findBoundaryIntersection,
  computeCapture,
  simplifyPolygon,
  segmentsIntersect,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  SERVER_TICK_INTERVAL,
  PLAYER_COLORS,
  MIN_SPAWN_DISTANCE,
  type Player,
  type Point,
} from '@paperio2/common';
import { SpatialHash } from '../SpatialHash.js';

export class GameRoom extends Room<GameRoomState> {
  private game: GameState = new GameState();
  private spatialHash: SpatialHash = new SpatialHash(100);
  private colorIndex: number = 0;

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
    // Update physics
    this.game.update(dt);

    // Check for territory capture and collisions
    this.spatialHash.clear();
    this.checkCaptureAndCollisions();

    // Sync state to clients
    this.syncState();
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

      // Check if inside own territory
      const isInside = isPointInPolygon(currentPos, player.territory);

      // EXIT detection
      if (!player.isOutside && !isInside) {
        const hit = findBoundaryIntersection(prevPos, currentPos, player.territory);
        if (hit) {
          player.isOutside = true;
          player.exitPoint = hit.point;
          player.exitEdgeIndex = hit.edgeIndex;
          player.trail = [hit.point]; // Start trail at exact exit point
          console.log(`🚪 Player ${player.id} EXITED territory at`, hit.point);
        }
      }

      // ENTRY detection (loop closure)
      if (player.isOutside && isInside) {
        const hit = findBoundaryIntersection(prevPos, currentPos, player.territory);

        // FIX: Add minimum trail length check (e.g. 2 points) to prevent jitter captures
        if (hit && player.exitPoint && player.trail.length > 2) {
          console.log(`🏠 Player ${player.id} ENTERED territory at`, hit.point);
          console.log(`📏 Trail had ${player.trail.length} points`);
          console.log(`🎨 Trail covered area from exit:(${player.exitPoint.x.toFixed(0)},${player.exitPoint.y.toFixed(0)}) to entry:(${hit.point.x.toFixed(0)},${hit.point.y.toFixed(0)})`);

          // Compute capture
          const capturedPoly = computeCapture(
            player.territory,
            player.trail,
            player.exitPoint,
            player.exitEdgeIndex,
            hit.point,
            hit.edgeIndex
          );

          // Don't simplify - keep all vertices to preserve the original territory shape
          const newTerritory = capturedPoly;
          const newArea = Math.floor(this.calculateArea(newTerritory));
          const oldArea = player.score; // Score tracks area

          // FIX: Only update if we actually grew (or initialized)
          // This prevents "disappearing" if the math glitched and returned a tiny polygon
          if (newTerritory.length > 3 && newArea > oldArea) {
            const growth = newArea - oldArea;
            const growthPercent = ((growth / oldArea) * 100).toFixed(1);
            player.territory = newTerritory;
            player.score = newArea;
            console.log(`✅ Territory Grew: ${oldArea} -> ${newArea} (+${growth.toFixed(0)}, +${growthPercent}%)`);
            console.log(`   New territory has ${newTerritory.length} vertices`);

            // FORCE territory sync to client
            (player as any).territoryChanged = true;
          } else {
            console.warn(`⚠️ Capture rejected: New area (${newArea}) not larger than old (${oldArea})`);
            console.warn(`   This means the trail loop would have REDUCED territory!`);
          }

          // Reset trail state regardless of success to prevent getting stuck
          console.log(`🗑️  Trail CLEARED (had ${player.trail.length} points)`);
          player.trail = [];
          player.isOutside = false;
          player.exitPoint = null;
          player.exitEdgeIndex = -1;
        }
      }

      // Collision detection
      if (player.isOutside) {
        const nearby = this.spatialHash.query(player.x, player.y);

        for (const item of nearby) {
          // 1. Check collision with OTHER players' trails and territories
          if (item.playerId !== player.id) {
            if (segmentsIntersect(prevPos, currentPos, item.p1, item.p2)) {
              console.log(`💀 Player ${player.id} ran into ${item.playerId}'s ${item.type}`);
              this.killPlayer(player);
              break;
            }
          }

          // 2. Check self-collision (hitting own trail)
          // FIX: Use INDEX GAP instead of Distance
          // When you loop back, your head is physically close to your old trail (distance ~0),
          // so the old dist > 30 check would FAIL to detect the collision.
          // Instead, we check if the segment is "old enough" by comparing array indices.
          if (item.playerId === player.id && item.type === 'trail') {
            const currentIndex = player.trail.length; // Virtual index of head

            // Ignore the last 5 segments (the ones attached to the body)
            // Any collision with an older segment is DEATH
            if (currentIndex - item.index > 5) {
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

  /**
   * Kill a player
   */
  private killPlayer(player: Player): void {
    player.isDead = true;
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
   * Find a valid spawn position
   */
  private findSpawnPosition(): Point {
    const maxAttempts = 50;

    for (let i = 0; i < maxAttempts; i++) {
      const x = Math.random() * (WORLD_WIDTH - 200) + 100;
      const y = Math.random() * (WORLD_HEIGHT - 200) + 100;

      // Check distance from other players
      let valid = true;
      for (const player of this.game.getAllPlayers()) {
        const dx = x - player.x;
        const dy = y - player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < MIN_SPAWN_DISTANCE) {
          valid = false;
          break;
        }
      }

      if (valid) {
        return { x, y };
      }
    }

    // Fallback to center
    return { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 };
  }
}
