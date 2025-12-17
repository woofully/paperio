# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Paper.io 2 clone - a real-time multiplayer territory capture game built with TypeScript, Three.js, and Colyseus. Players control characters that leave trails outside their territory, capturing new area when they complete loops back to their base.

## Monorepo Structure

This is an npm workspaces monorepo with three packages:

- **`packages/common`** - Shared game logic, physics, and geometry (runs on both client and server)
- **`packages/server`** - Colyseus game server with authoritative state
- **`packages/client`** - Three.js client with smooth interpolation rendering

## Development Commands

### Start Development Servers

```bash
# Start both client and server (run in separate terminals)
npm run dev:client  # Vite dev server on port 3000
npm run dev:server  # Game server on port 2567
```

Then open http://localhost:3000

### Build

```bash
# Build all packages (required order: common → server → client)
npm run build

# Build individual packages
npm run build:common
npm run build:server
npm run build:client
```

### Production

```bash
# Deploy to Fly.io (see DEPLOY.md for setup)
flyctl deploy
```

## Critical Architecture Concepts

### Dual State System

The game maintains two parallel state representations:

1. **`GameState` (common)** - Pure TypeScript game logic with full `Player` objects including geometry arrays
2. **`GameRoomState` (server)** - Colyseus schema with flat arrays for network efficiency

The server runs the authoritative `GameState` simulation and syncs changes to `GameRoomState` which broadcasts to clients.

**Key insight**: Territory/trail are stored as `Point[]` in `GameState` but as flat `number[]` arrays in `PlayerState` schema for minimal network overhead:
```typescript
// GameState: territory: Point[] = [{x:0,y:0}, {x:10,y:0}]
// PlayerState: territory: ArraySchema<number> = [0,0,10,0]
```

### Client-Server Synchronization

**Server (60Hz fixed timestep)**:
- Runs authoritative physics in `GameState.update()`
- Detects territory entry/exit using `findBoundaryIntersection()`
- Computes new territory with `computeCapture()` using polygon boolean operations
- Syncs to `GameRoomState` only when values change

**Client (60fps variable)**:
- Receives server updates via Colyseus state sync
- Uses delta-time interpolation (`THREE.Clock.getDelta()`) to smooth movement between updates
- Camera locks to interpolated player position, not raw server data
- Trail rendering uses vector projection to prevent visual artifacts from client lag

### Territory Capture Algorithm

**Critical flow** (see `GameRoom.checkCaptureAndCollisions()`):

1. **Exit Detection**: Player leaves territory → record `exitPoint` and `exitEdgeIndex`
2. **Trail Building**: Player moves outside, trail grows with segments
3. **Entry Detection**: Player re-enters territory → record entry point and edge
4. **Capture Computation**: 
   - Extract boundary segment from exit to entry edge
   - Combine with trail to form closed loop
   - Use `computeCapture()` with polygon clipping (js-angusj-clipper)
   - **Verify new area > old area** before applying (prevents glitches)
5. **State Update**: Replace old territory, clear trail, reset flags

**Polygon winding order matters**: Vertices must traverse boundary counterclockwise for proper area calculation.

### Collision Detection with Spatial Hash

Uses `SpatialHash` (100-unit grid cells) for O(1) collision queries instead of O(n²):

```typescript
// Index trail segments WITH their array index (critical for self-collision)
spatialHash.insertSegment({
  type: 'trail',
  playerId: player.id,
  p1: trail[i],
  p2: trail[i+1],
  index: i  // <-- Prevents false positives from nearby segments
}, trail[i], trail[i+1]);

// Collision uses INDEX GAP not distance
// Ignore last 5 segments (attached to body)
if (currentIndex - segmentIndex > 5) {
  // This is an old segment - collision is death
}
```

### Client Interpolation & Trail Rendering

**Problem**: Server updates at 60Hz but client renders at variable FPS. Direct rendering causes jitter and trail artifacts.

**Solution**: Separate data reception from rendering:

```typescript
// PlayerRenderer.updatePosition() - receives server data
updatePosition(x, y) {
  this.targetPosition.set(x, y, 10);  // Don't move mesh yet!
}

// PlayerRenderer.tick(dt) - called every frame
tick(dt) {
  // Smoothly interpolate to target
  this.characterMesh.position.lerp(this.targetPosition, 15.0 * dt);
  
  // Camera follows SMOOTH mesh, not server data
}
```

**Trail pruning** uses vector projection to prevent "future" trail segments appearing ahead of interpolated player position. Projects player onto trail segments using `t = (Player · Segment) / |Segment|²` and truncates beyond current position.

### Geometry Utilities (packages/common/src/math/geometry.ts)

Core computational geometry functions:

- `isPointInPolygon()` - Ray casting for territory boundary checks
- `getSegmentIntersection()` - Parametric line intersection for entry/exit detection
- `findBoundaryIntersection()` - Finds exact point where player crosses territory edge
- `computeCapture()` - Polygon boolean operations to merge trail loop with territory
- `segmentsIntersect()` - Fast collision detection between line segments
- `simplifyPolygon()` - Reduces vertex count while preserving shape (optional)
- `getPolygonArea()` - Calculates territory area for scoring

These are tested edge cases and should not be modified without thorough testing.

## Key Game Parameters (packages/common/src/constants.ts)

```typescript
WORLD_WIDTH = 5000
WORLD_HEIGHT = 5000
PLAYER_SPEED = 500  // units/second
SERVER_TICK_RATE = 60  // Hz
STARTING_TERRITORY_SIZE = 200  // diameter of spawn circle
```

Changing these affects game balance. Speed and tick rate must stay in sync for smooth interpolation.

## Network Protocol

**Client → Server**:
```typescript
room.send('input', { type: 'input', angle: Math.atan2(-dy, dx) });
```

**Server → Client**: Automatic state sync via Colyseus schema. Client listens to:
- `players.onAdd` - New player joins
- `player.onChange` - Position/angle/score updates
- `player.territory.onChange` - Territory shape changed
- `player.trail.onChange` - Trail points added/removed

## Special Considerations

### Production vs Development

- Development: Client connects to `ws://localhost:2567`
- Production: Client auto-detects protocol/host from `window.location`

Server serves static client files in production (see `packages/server/src/index.ts`).

### Username System

Players can set usernames via intro modal. Usernames are passed in connection options:
```typescript
room = await client.joinOrCreate('game', { username: this.username });
```

Usernames appear in leaderboard and as CSS2D labels below players (using Three.js `CSS2DRenderer`).

### Player Limit

Rooms limited to 10 players (`maxClients = 10` in `GameRoom.onCreate`). This prevents performance issues from excessive collision checks.

## Common Pitfalls

1. **Don't modify territory directly** - Always use `computeCapture()` and verify area increase
2. **Territory must be convex or carefully concave** - Winding order matters for polygon ops
3. **Flat array sync** - Remember territory/trail are `number[]` in schema, `Point[]` in game logic
4. **Client interpolation** - Never render server position directly, always interpolate
5. **Spatial hash indexing** - Always include segment index when inserting trails
6. **Build order** - Must build `common` before `server` or `client`

## Deployment

See `DEPLOY.md` for Fly.io deployment instructions. The app uses Docker multi-stage build with production-only dependencies.

## Port Management

See `PORT_MANAGEMENT.md` for commands to check and kill processes on development ports (3000, 2567).
