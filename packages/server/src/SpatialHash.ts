import type { Point } from '@paperio2/common';

/**
 * Spatial hash for efficient collision detection
 * Reduces collision checks from O(N²) to O(N) locally
 */
export class SpatialHash {
  private cellSize: number;
  private buckets: Map<string, any[]> = new Map();

  constructor(cellSize: number = 100) {
    this.cellSize = cellSize;
  }

  /**
   * Clear all buckets
   */
  clear(): void {
    this.buckets.clear();
  }

  /**
   * Get cell key for a position
   */
  private getKey(x: number, y: number): string {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    return `${cx},${cy}`;
  }

  /**
   * Insert an object at a position
   */
  insert(obj: any, x: number, y: number): void {
    const key = this.getKey(x, y);
    if (!this.buckets.has(key)) {
      this.buckets.set(key, []);
    }
    this.buckets.get(key)!.push(obj);
  }

  /**
   * Insert a line segment into all cells it crosses
   */
  insertSegment(obj: any, p1: Point, p2: Point): void {
    // Simple approach: insert at both endpoints and midpoint
    this.insert(obj, p1.x, p1.y);
    this.insert(obj, p2.x, p2.y);
    this.insert(obj, (p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
  }

  /**
   * Query objects near a position (includes 9 cells: current + 8 neighbors)
   */
  query(x: number, y: number): any[] {
    const results: any[] = [];
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);

    // Check 3x3 grid around the position
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const key = `${cx + i},${cy + j}`;
        const bucket = this.buckets.get(key);
        if (bucket) {
          results.push(...bucket);
        }
      }
    }

    return results;
  }
}
