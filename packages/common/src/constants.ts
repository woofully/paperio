/**
 * Game constants shared between client and server
 */

// World settings
export const WORLD_WIDTH = 5000;
export const WORLD_HEIGHT = 5000;

// Player settings
export const PLAYER_SPEED = 500; // units per second (fast, smooth movement like Paper.io 2)
export const PLAYER_TURN_SPEED = 12.0; // lerp factor for smooth turning (very responsive)
export const PLAYER_SIZE = 10; // visual size

// Territory settings
export const STARTING_TERRITORY_SIZE = 300; // Increased for safer spawn
export const MIN_SPAWN_DISTANCE = 500; // min distance from other territories

// Trail settings
export const TRAIL_WIDTH = 20; // Wider trail so it's visible
export const TRAIL_POINT_DISTANCE = 10; // min distance between trail points

// Server settings
export const SERVER_TICK_RATE = 60; // Hz (increased to match 60 FPS for smooth rendering)
export const SERVER_TICK_INTERVAL = 1000 / SERVER_TICK_RATE; // ms

// Colors for players
export const PLAYER_COLORS = [
  '#FF6B6B', // Red
  '#4ECDC4', // Cyan
  '#45B7D1', // Blue
  '#FFA07A', // Light Salmon
  '#98D8C8', // Mint
  '#F7DC6F', // Yellow
  '#BB8FCE', // Purple
  '#85C1E2', // Sky Blue
  '#F8B88B', // Peach
  '#52B788', // Green
];
