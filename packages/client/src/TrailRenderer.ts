import * as THREE from 'three';
import type { Point } from '@paperio2/common';

/**
 * Renders trails as thick ribbons using quad strips
 */
export class TrailRenderer {
  private mesh: THREE.Mesh;
  private geometry: THREE.BufferGeometry;
  private maxPoints: number = 2000;

  constructor(scene: THREE.Scene, color: string) {
    // Pre-allocate buffers
    this.geometry = new THREE.BufferGeometry();

    // 2 vertices per point (left and right side of ribbon)
    const positions = new Float32Array(this.maxPoints * 2 * 3);
    // 2 triangles (6 indices) per segment
    const indices = new Uint16Array((this.maxPoints - 1) * 6);

    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setIndex(new THREE.BufferAttribute(indices, 1));

    // Trail material - match player color with transparency
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color), // Use player color
      opacity: 0.5,                   // Half transparent
      transparent: true,
      side: THREE.DoubleSide,
      depthTest: false,              // Draw on top of territory
      depthWrite: false              // Don't mess with Z-buffer
    });

    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.position.z = 5; // Above everything!
    this.mesh.frustumCulled = false; // Ensure trail is always rendered
    scene.add(this.mesh);
    console.log('Created trail renderer with color:', color);
  }

  /**
   * Update trail geometry - VERY VISIBLE like Paper.io 2!
   */
  update(trail: Point[], width: number = 25): void {
    if (trail.length < 2) {
      this.geometry.setDrawRange(0, 0);
      return;
    }

    const positions = this.geometry.attributes.position.array as Float32Array;
    const indices = this.geometry.index!.array as Uint16Array;

    let posIdx = 0;
    let indIdx = 0;

    // SAFETY: Don't exceed pre-allocated buffer size
    const renderCount = Math.min(trail.length, this.maxPoints);

    for (let i = 0; i < renderCount; i++) {
      const curr = trail[i];

      // Calculate direction for perpendicular offset
      let dx: number, dy: number;

      if (i === 0) {
        // First point: use direction to next
        const next = trail[i + 1];
        dx = next.x - curr.x;
        dy = next.y - curr.y;
      } else if (i === renderCount - 1) {
        // Last point: use direction from previous
        const prev = trail[i - 1];
        dx = curr.x - prev.x;
        dy = curr.y - prev.y;
      } else {
        // Middle points: use average of directions
        const prev = trail[i - 1];
        const next = trail[i + 1];
        dx = next.x - prev.x;
        dy = next.y - prev.y;
      }

      // Normalize and rotate 90 degrees for perpendicular
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const perpX = (-dy / len) * width / 2;
      const perpY = (dx / len) * width / 2;

      // Left vertex
      positions[posIdx++] = curr.x + perpX;
      positions[posIdx++] = curr.y + perpY;
      positions[posIdx++] = 0;

      // Right vertex
      positions[posIdx++] = curr.x - perpX;
      positions[posIdx++] = curr.y - perpY;
      positions[posIdx++] = 0;

      // Create triangles (quad) between this segment and next
      if (i < renderCount - 1) {
        const base = i * 2;

        // Triangle 1
        indices[indIdx++] = base;
        indices[indIdx++] = base + 1;
        indices[indIdx++] = base + 2;

        // Triangle 2
        indices[indIdx++] = base + 1;
        indices[indIdx++] = base + 3;
        indices[indIdx++] = base + 2;
      }
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.index!.needsUpdate = true;
    this.geometry.setDrawRange(0, (renderCount - 1) * 6);

    // CRITICAL: Compute bounding box/sphere so Three.js knows where the geometry is
    this.geometry.computeBoundingBox();
    this.geometry.computeBoundingSphere();

    // Disable frustum culling to ensure the trail is always rendered
    this.mesh.frustumCulled = false;
  }

  /**
   * Remove from scene
   */
  dispose(): void {
    this.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.removeFromParent();
  }
}
