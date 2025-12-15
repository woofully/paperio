# Paper.io 2 Clone

A real-time multiplayer territory capture game built with TypeScript, Colyseus, and Three.js.

## Features

- **Real-time multiplayer** - Server-authoritative gameplay with Colyseus
- **Territory capture** - Exact polygon geometry using the proven two-candidate algorithm
- **Smooth movement** - Vector-based steering with client prediction
- **Collision detection** - Spatial hashing for efficient O(N) local checks
- **Three.js rendering** - Smooth quad-strip trails with proper thickness

## Architecture

This is a monorepo with three packages:

```
/packages
  /common    - Shared game logic (physics, math, constants)
  /server    - Colyseus authoritative server
  /client    - Vite + Three.js client
```

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Start the Server

In one terminal:

```bash
npm run dev:server
```

Server will start on `http://localhost:2567`

### 3. Start the Client

In another terminal:

```bash
npm run dev:client
```

Client will open on `http://localhost:3000`

### 4. Play!

- **Move your mouse** to steer your character
- **Leave your territory** to start drawing a trail
- **Re-enter your territory** to capture the area you enclosed
- **Don't hit other players' trails or territories** or you'll die!

## How It Works

### Territory Capture Algorithm

The core mechanic uses the "two-candidate" approach:

1. Detect when player **exits** territory (exact intersection point)
2. Track the trail while outside
3. Detect when player **re-enters** territory (exact intersection point)
4. Build two candidate polygons (clockwise and counter-clockwise boundary arcs)
5. Pick the **smaller area** (this is what the player captured)
6. Union with existing territory using polygon math

This ensures:
- ✅ Sharp corners (no rounding artifacts)
- ✅ Exact capture area
- ✅ Works with concave territories
- ✅ Handles complex loop shapes

### Collision Detection

Uses spatial hashing to reduce checks from O(N²) to O(N):

1. Divide world into grid cells
2. Index all trail segments and territory edges
3. Only check collisions with nearby cells (3×3 grid)

### Network Optimization

- **Flat arrays** - Territory and trails sent as `[x1, y1, x2, y2, ...]` instead of objects
- **Fixed timestep** - Server runs at 30 Hz
- **Sparse updates** - Territory only synced on capture, not every frame

## Project Structure

```
packages/
├── common/
│   ├── src/
│   │   ├── types.ts              # Shared type definitions
│   │   ├── constants.ts          # Game constants
│   │   ├── GameState.ts          # Core physics loop
│   │   └── math/
│   │       └── geometry.ts       # Polygon algorithms
│   └── package.json
├── server/
│   ├── src/
│   │   ├── index.ts              # Server entry point
│   │   ├── SpatialHash.ts        # Collision optimization
│   │   ├── schema/
│   │   │   └── GameSchema.ts     # Colyseus state schema
│   │   └── rooms/
│   │       └── GameRoom.ts       # Main game room
│   └── package.json
└── client/
    ├── src/
    │   ├── main.ts               # Client entry point
    │   ├── GameScene.ts          # Three.js scene + networking
    │   ├── PlayerRenderer.ts     # Territory + character rendering
    │   └── TrailRenderer.ts      # Quad-strip trail rendering
    ├── index.html
    ├── vite.config.ts
    └── package.json
```

## Development

### Build Everything

```bash
npm run build
```

### Build Individual Packages

```bash
npm run build:common
npm run build:server
npm run build:client
```

### Watch Mode

Server with auto-reload:
```bash
npm run dev:server
```

Client with hot reload:
```bash
npm run dev:client
```

## Technical Details

### TypeScript Configuration

Uses TypeScript Project References for proper monorepo support:
- Root `tsconfig.json` references all packages
- Each package has composite builds
- Client uses `moduleResolution: "bundler"` for Vite
- Server uses `moduleResolution: "bundler"` for modern Node.js

### Vite Configuration

Client uses path aliases to import from `/common`:
```typescript
alias: {
  '@paperio2/common': path.resolve(__dirname, '../common/src'),
}
```

### Colyseus Schema

Uses flat arrays for efficiency:
```typescript
@type(['number']) territory = new ArraySchema<number>();
```

Instead of:
```typescript
@type([PointSchema]) territory = new ArraySchema<PointSchema>(); // ❌ Less efficient
```

## Future Enhancements

- [ ] Clipper.js integration for true polygon union
- [ ] Player respawn system
- [ ] Leaderboard
- [ ] Power-ups
- [ ] Mobile touch controls
- [ ] Sound effects
- [ ] Particle effects
- [ ] Game rooms / matchmaking
- [ ] Persistent scores

## License

MIT
