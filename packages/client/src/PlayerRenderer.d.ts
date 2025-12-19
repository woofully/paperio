import * as THREE from 'three';
/**
 * Renders a single player's territory, trail, and character
 */
export declare class PlayerRenderer {
    private scene;
    private color;
    private territoryMesh;
    characterMesh: THREE.Mesh;
    private trailRenderer;
    private nameLabel;
    private isDead;
    private targetPosition;
    private currentTrailData;
    private isFirstPositionUpdate;
    constructor(scene: THREE.Scene, color: string, playerName: string);
    /**
     * Called when server sends new data.
     * We DO NOT move the mesh here. We just update the target.
     * Exception: On first update, set position directly to prevent fly-in effect.
     */
    updatePosition(x: number, y: number): void;
    /**
     * Called every frame by the render loop.
     * Smoothly moves the mesh towards the target.
     */
    tick(dt: number): void;
    /**
     * Update territory shape - handles both flat arrays and object arrays
     */
    updateTerritory(territoryData: any): void;
    /**
     * Update trail - handles both flat arrays and object arrays
     * Stores data for the tick() loop to use
     */
    updateTrail(trailData: any): void;
    /**
     * Set visibility and trigger explosion on death
     */
    setVisible(visible: boolean, x: number, y: number): void;
    /**
     * Clean up resources
     */
    dispose(): void;
}
