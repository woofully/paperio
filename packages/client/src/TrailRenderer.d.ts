import * as THREE from 'three';
import type { Point } from '@paperio2/common';
/**
 * Renders trails as thick ribbons using quad strips
 */
export declare class TrailRenderer {
    private mesh;
    private geometry;
    private maxPoints;
    constructor(scene: THREE.Scene, color: string);
    /**
     * Update trail geometry - VERY VISIBLE like Paper.io 2!
     */
    update(trail: Point[], width?: number): void;
    /**
     * Remove from scene
     */
    dispose(): void;
}
