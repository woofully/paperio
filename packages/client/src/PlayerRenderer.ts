import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { Point } from '@paperio2/common';
import { TrailRenderer } from './TrailRenderer.js';

/**
 * Create particle explosion effect when player dies
 */
function createExplosion(scene: THREE.Scene, x: number, y: number, color: string) {
  const particleCount = 40; // More particles
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const velocities: { x: number; y: number }[] = [];

  for (let i = 0; i < particleCount; i++) {
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = 20; // High Z to see over everything
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 15 + 5; // Faster explosion
    velocities.push({ x: Math.cos(angle) * speed, y: Math.sin(angle) * speed });
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: color,
    size: 15, // Bigger particles
    transparent: true,
    opacity: 1.0
  });
  const points = new THREE.Points(geometry, material);
  scene.add(points);

  // Animate explosion
  let frame = 0;
  const animate = () => {
    if (frame > 45) {
      scene.remove(points);
      geometry.dispose();
      material.dispose();
      return;
    }
    const pos = geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < particleCount; i++) {
      pos[i * 3] += velocities[i].x;
      pos[i * 3 + 1] += velocities[i].y;
    }
    geometry.attributes.position.needsUpdate = true;
    material.opacity -= 0.02; // Fade out slower
    frame++;
    requestAnimationFrame(animate);
  };
  animate();
}

/**
 * Renders a single player's territory, trail, and character
 */
export class PlayerRenderer {
  private scene: THREE.Scene;
  private color: string;

  // Meshes
  private territoryMesh: THREE.Mesh;
  public characterMesh: THREE.Mesh; // Made public for camera tracking
  private trailRenderer: TrailRenderer;
  private nameLabel: CSS2DObject;

  // Track death state
  private isDead: boolean = false;

  // INTERPOLATION VARIABLES
  private targetPosition = new THREE.Vector3();
  private currentTrailData: Point[] = [];

  constructor(scene: THREE.Scene, color: string, playerName: string) {
    this.scene = scene;
    this.color = color;

    // Create territory mesh - VERY VISIBLE!
    const territoryGeometry = new THREE.BufferGeometry();
    const territoryMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      opacity: 0.9,  // Almost opaque!
      transparent: true,
      side: THREE.DoubleSide,
    });
    this.territoryMesh = new THREE.Mesh(territoryGeometry, territoryMaterial);
    this.territoryMesh.position.z = 0.5;
    scene.add(this.territoryMesh);
    console.log('Created territory mesh with color:', color);

    // Create character (circle) - Normal size, use player color
    const characterGeometry = new THREE.CircleGeometry(25, 32);
    const characterMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      opacity: 1.0,
    });
    this.characterMesh = new THREE.Mesh(characterGeometry, characterMaterial);
    scene.add(this.characterMesh);
    console.log('Created character with radius 25, color:', color);

    // Create name label
    const labelDiv = document.createElement('div');
    labelDiv.className = 'player-name-label';
    labelDiv.textContent = playerName;
    labelDiv.style.color = 'white';
    labelDiv.style.fontSize = '14px';
    labelDiv.style.fontWeight = 'bold';
    labelDiv.style.textShadow = '2px 2px 4px rgba(0,0,0,0.8)';
    labelDiv.style.padding = '2px 6px';
    labelDiv.style.background = 'rgba(0,0,0,0.5)';
    labelDiv.style.borderRadius = '4px';
    labelDiv.style.whiteSpace = 'nowrap';
    this.nameLabel = new CSS2DObject(labelDiv);
    this.nameLabel.position.set(0, -40, 0); // Position below player
    this.characterMesh.add(this.nameLabel);

    // Create trail renderer
    this.trailRenderer = new TrailRenderer(scene, color);
  }

  /**
   * Called when server sends new data.
   * We DO NOT move the mesh here. We just update the target.
   */
  updatePosition(x: number, y: number): void {
    this.targetPosition.set(x, y, 10);
  }

  /**
   * Called every frame by the render loop.
   * Smoothly moves the mesh towards the target.
   */
  tick(dt: number): void {
    if (this.isDead) return;

    // 1. Smoothly Interpolate Player
    const smoothingSpeed = 15.0;
    this.characterMesh.position.lerp(this.targetPosition, smoothingSpeed * dt);

    // 2. Render Trail with Robust Pruning
    if (this.currentTrailData.length > 0) {
      const headPos = new THREE.Vector3(
        this.characterMesh.position.x,
        this.characterMesh.position.y,
        0
      );

      // Start with a copy of the server trail
      // We will slice this array to remove "future" points
      const displayTrail = [...this.currentTrailData];

      // Search backwards from the end to find which segment the player is currently on
      // We limit search to last 10 points to prevent snapping to old intersecting trails
      let foundSegment = false;
      const searchLimit = Math.min(displayTrail.length - 1, 10);

      for (let i = displayTrail.length - 1; i > displayTrail.length - 1 - searchLimit; i--) {
        const pEnd = displayTrail[i];
        const pStart = displayTrail[i - 1];

        // Vector from Start to End of segment
        const segX = pEnd.x - pStart.x;
        const segY = pEnd.y - pStart.y;
        const segLenSq = segX * segX + segY * segY;

        // Vector from Start to Player
        const playerX = headPos.x - pStart.x;
        const playerY = headPos.y - pStart.y;

        // Project Player onto Segment: t = (Player . Segment) / |Segment|^2
        // t < 0: Player is before Start
        // 0 <= t <= 1: Player is on Segment
        // t > 1: Player is past End
        let t = 0;
        if (segLenSq > 0) {
          t = (playerX * segX + playerY * segY) / segLenSq;
        }

        if (t >= 1.0) {
          // Player is past this segment - we're ahead or at the tip
          foundSegment = true;
          break;
        }
        else if (t >= 0.0) {
          // Match! We are Inside this segment (0 <= t <= 1)
          // Points [i, i+1, ... end] are in the future
          // Truncate at i and append current position
          displayTrail.length = i;
          displayTrail.push({ x: headPos.x, y: headPos.y });
          foundSegment = true;
          break;
        }
        else {
          // t < 0: Player is "behind" this segment
          // This segment is in the future, remove it
          displayTrail.pop();
          // Continue loop...
        }
      }

      // Fallback: If we didn't find a matching segment, connect from last known point
      if (!foundSegment && displayTrail.length > 0) {
         displayTrail.push({ x: headPos.x, y: headPos.y });
      }

      this.trailRenderer.update(displayTrail, 25);
    }
  }

  /**
   * Update territory shape - handles both flat arrays and object arrays
   */
  updateTerritory(territoryData: any): void {
    // Safety check for null/undefined
    if (!territoryData) {
      console.warn('❌ Territory data is null/undefined');
      return;
    }

    // Convert Colyseus ArraySchema to real array
    const data = Array.isArray(territoryData) ? territoryData : Array.from(territoryData);

    const points: Point[] = [];

    // Detect data format (flat array vs object array)
    if (data.length > 0 && typeof data[0] === 'number') {
      // FORMAT: Flat array [x, y, x, y...]
      // Need at least 6 numbers (3 points) for a polygon
      if (data.length < 6) {
        console.warn('❌ Territory array too small:', data.length);
        return;
      }
      for (let i = 0; i < data.length; i += 2) {
        points.push({ x: data[i], y: data[i + 1] });
      }
    } else {
      // FORMAT: Object array [{x,y}, {x,y}...]
      // Need at least 3 point objects for a polygon
      if (data.length < 3) {
        console.warn('❌ Territory array too small:', data.length);
        return;
      }
      for (let i = 0; i < data.length; i++) {
        points.push(data[i]);
      }
    }

    // Create shape
    const shape = new THREE.Shape();
    shape.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      shape.lineTo(points[i].x, points[i].y);
    }
    shape.closePath();

    // Update geometry
    const geometry = new THREE.ShapeGeometry(shape);
    this.territoryMesh.geometry.dispose();
    this.territoryMesh.geometry = geometry;

    // FORCE visibility
    this.territoryMesh.visible = true;
  }

  /**
   * Update trail - handles both flat arrays and object arrays
   * Stores data for the tick() loop to use
   */
  updateTrail(trailData: any): void {
    // Safety check for null/undefined
    if (!trailData) {
      this.currentTrailData = [];
      this.trailRenderer.update([], 25);
      return;
    }

    // Convert Colyseus ArraySchema to real array
    const data = Array.isArray(trailData) ? trailData : Array.from(trailData);

    if (data.length === 0) {
      this.currentTrailData = [];
      this.trailRenderer.update([], 25);
      return;
    }

    const points: Point[] = [];

    // Detect data format (flat array vs object array)
    if (typeof data[0] === 'number') {
      // FORMAT: Flat array [x, y, x, y...]
      for (let i = 0; i < data.length; i += 2) {
        points.push({ x: data[i], y: data[i + 1] });
      }
    } else {
      // FORMAT: Object array [{x,y}, {x,y}...]
      for (let i = 0; i < data.length; i++) {
        points.push(data[i]);
      }
    }

    // Store data for the tick() loop to use
    this.currentTrailData = points;
  }

  /**
   * Set visibility and trigger explosion on death
   */
  setVisible(visible: boolean, x: number, y: number): void {
    // Check if we just died
    if (!visible && !this.isDead) {
      console.log("💥 EXPLOSION at", x, y);
      createExplosion(this.scene, x, y, this.color);
      this.isDead = true;
    }

    if (visible) this.isDead = false;

    this.territoryMesh.visible = visible;
    this.characterMesh.visible = visible;

    // Clear trail immediately on death
    if (!visible) {
      this.currentTrailData = [];
      this.trailRenderer.update([], 0);
    }
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.territoryMesh.geometry.dispose();
    (this.territoryMesh.material as THREE.Material).dispose();
    this.territoryMesh.removeFromParent();

    // Remove name label
    this.characterMesh.remove(this.nameLabel);
    this.nameLabel.element.remove();

    this.characterMesh.geometry.dispose();
    (this.characterMesh.material as THREE.Material).dispose();
    this.characterMesh.removeFromParent();

    this.trailRenderer.dispose();
  }
}
