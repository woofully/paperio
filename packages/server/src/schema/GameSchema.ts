import { Schema, type, MapSchema, ArraySchema } from '@colyseus/schema';

/**
 * Player state synchronized to clients
 * Uses flat arrays for efficiency
 */
export class PlayerState extends Schema {
  @type('string') id: string = '';
  @type('string') name: string = '';
  @type('number') x: number = 0;
  @type('number') y: number = 0;
  @type('number') angle: number = 0;
  @type('string') color: string = '#FFFFFF';
  @type('boolean') isDead: boolean = false;
  @type('boolean') hasWon: boolean = false;
  @type('number') score: number = 0;

  // Territory as flat array: [x1, y1, x2, y2, ...]
  // This is more efficient than array of objects
  @type(['number']) territory = new ArraySchema<number>();

  // Trail as flat array
  @type(['number']) trail = new ArraySchema<number>();
}

/**
 * Root game state
 */
export class GameRoomState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
}
