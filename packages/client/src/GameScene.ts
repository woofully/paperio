import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { Client, Room } from 'colyseus.js';
import { PlayerRenderer } from './PlayerRenderer.js';
import { WORLD_WIDTH, WORLD_HEIGHT } from '@paperio2/common';

/**
 * Main game scene with Three.js rendering and Colyseus networking
 */
export class GameScene {
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private renderer: THREE.WebGLRenderer;
  private labelRenderer: CSS2DRenderer;
  private client: Client;
  private room: Room | null = null;
  private clock: THREE.Clock; // For smooth delta-time animation

  // Player renderers
  private playerRenderers: Map<string, PlayerRenderer> = new Map();
  private myPlayerId: string | null = null;

  // UI elements
  private scoreEl: HTMLElement;
  private statusEl: HTMLElement;
  private leaderboardEl: HTMLElement;
  private introModal: HTMLElement;
  private outroModal: HTMLElement;
  private username: string = '';
  private currentScore: string = '0.0%';

  constructor() {
    // Initialize Three.js
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xe8f4f8); // Light blueish-white
    this.clock = new THREE.Clock(); // Start the clock for delta time

    // Set up orthographic camera for top-down view
    const aspect = window.innerWidth / window.innerHeight;
    const viewHeight = 1000;
    const viewWidth = viewHeight * aspect;

    this.camera = new THREE.OrthographicCamera(
      -viewWidth / 2,
      viewWidth / 2,
      viewHeight / 2,
      -viewHeight / 2,
      0.1,
      1000
    );
    this.camera.position.z = 100;

    // Create renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);

    // Make sure canvas is added as first child so it's behind the UI
    document.body.insertBefore(this.renderer.domElement, document.body.firstChild);

    // Create label renderer for player names
    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
    this.labelRenderer.domElement.style.position = 'absolute';
    this.labelRenderer.domElement.style.top = '0';
    this.labelRenderer.domElement.style.left = '0';
    this.labelRenderer.domElement.style.pointerEvents = 'none';
    document.body.insertBefore(this.labelRenderer.domElement, document.body.firstChild.nextSibling);

    // Add grid for reference
    this.addGrid();

    // UI elements
    this.scoreEl = document.getElementById('score')!;
    this.statusEl = document.getElementById('status')!;
    this.leaderboardEl = document.getElementById('leaderboard-list')!;
    this.introModal = document.getElementById('intro-modal')!;
    this.outroModal = document.getElementById('outro-modal')!;

    // Set up modal handlers
    this.setupModals();

    // Input listeners
    this.setupInput();

    // Handle resize
    window.addEventListener('resize', () => this.onResize());

    // Initialize Colyseus client (but don't connect yet - wait for username)
    // Use wss:// in production, ws:// in development
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host || 'localhost:2567';
    const serverUrl = `${protocol}//${host}`;

    console.log('🔗 Connecting to server:', serverUrl);
    this.client = new Client(serverUrl);
  }

  /**
   * Set up intro and outro modals
   */
  private setupModals(): void {
    const usernameInput = document.getElementById('username-input') as HTMLInputElement;
    const playButton = document.getElementById('play-button') as HTMLButtonElement;
    const playAgainButton = document.getElementById('play-again-button') as HTMLButtonElement;

    // Handle Play button
    const handlePlay = () => {
      const username = usernameInput.value.trim();
      if (username.length === 0) {
        alert('Please enter a username!');
        return;
      }
      this.username = username;
      this.introModal.classList.add('hidden');
      this.connect();
    };

    playButton.addEventListener('click', handlePlay);
    usernameInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handlePlay();
    });

    // Handle Play Again button
    playAgainButton.addEventListener('click', async () => {
      this.outroModal.classList.add('hidden');

      // Disconnect from current room if connected
      if (this.room) {
        await this.room.leave();
        this.room = null;
      }

      // Clear player renderers
      this.playerRenderers.forEach((renderer) => renderer.dispose());
      this.playerRenderers.clear();
      this.myPlayerId = null;

      // Reset score display
      this.scoreEl.textContent = '0.0%';
      this.currentScore = '0.0%';

      // Reconnect with same username
      this.connect();
    });

    // Focus username input
    usernameInput.focus();
  }

  /**
   * Show outro modal with final score
   */
  private showOutroModal(): void {
    const finalScoreEl = document.getElementById('final-score')!;
    finalScoreEl.textContent = this.currentScore;
    this.outroModal.classList.remove('hidden');
  }

  /**
   * Add a grid to visualize the world
   */
  private addGrid(): void {
    // Grid, boundary, and center marker disabled for clean white background
    // Uncomment below for debugging:

    // const gridSize = WORLD_WIDTH;
    // const divisions = 50;
    // const gridHelper = new THREE.GridHelper(gridSize, divisions, 0x00ffff, 0x444444);
    // gridHelper.rotation.x = Math.PI / 2;
    // this.scene.add(gridHelper);

    // const boundaryGeometry = new THREE.EdgesGeometry(
    //   new THREE.PlaneGeometry(WORLD_WIDTH, WORLD_HEIGHT)
    // );
    // const boundaryMaterial = new THREE.LineBasicMaterial({ color: 0xff0000 });
    // const boundary = new THREE.LineSegments(boundaryGeometry, boundaryMaterial);
    // this.scene.add(boundary);

    // const centerGeometry = new THREE.CircleGeometry(20, 32);
    // const centerMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    // const centerMarker = new THREE.Mesh(centerGeometry, centerMaterial);
    // this.scene.add(centerMarker);
  }

  /**
   * Connect to game server
   */
  private async connect(): Promise<void> {
    try {
      this.statusEl.textContent = 'Connecting...';
      this.room = await this.client.joinOrCreate('game', { username: this.username });
      this.myPlayerId = this.room.sessionId;
      this.statusEl.textContent = 'Connected';

      // Listen for state changes
      this.room.state.players.onAdd((player: any, sessionId: string) => {
        this.onPlayerAdded(sessionId, player);

        // CRITICAL: Listen to changes on THIS specific player's properties
        player.onChange(() => {
          this.onPlayerChanged(sessionId, player);
        });

        // CRITICAL: Listen to territory array changes
        player.territory.onChange(() => {
          const renderer = this.playerRenderers.get(sessionId);
          if (renderer && player.territory.length > 0) {
            renderer.updateTerritory(player.territory);
          }
        });

        // Listen to trail array changes
        player.trail.onChange(() => {
          const renderer = this.playerRenderers.get(sessionId);
          if (renderer) {
            renderer.updateTrail(player.trail);
          }
        });
      });

      this.room.state.players.onRemove((player: any, sessionId: string) => {
        this.onPlayerRemoved(sessionId);
      });

      console.log('Connected to room:', this.room.id);
    } catch (error) {
      console.error('Failed to connect:', error);
      this.statusEl.textContent = 'Connection failed';
    }
  }

  /**
   * Player added to game
   */
  private onPlayerAdded(sessionId: string, player: any): void {
    console.log('🎮 Player added:', sessionId, 'at position:', player.x, player.y);
    console.log('🎨 Player color:', player.color);
    console.log('📦 Player territory:', player.territory);
    console.log('📏 Player territory length:', player.territory ? player.territory.length : 0);
    console.log('🚶 Player trail length:', player.trail ? player.trail.length : 0);

    const displayName = player.name || sessionId.substring(0, 8);
    const renderer = new PlayerRenderer(this.scene, player.color, displayName);
    this.playerRenderers.set(sessionId, renderer);

    // Initial update
    renderer.updatePosition(player.x, player.y);

    // Force territory update
    if (player.territory && player.territory.length > 0) {
      console.log('✅ Updating territory with data length:', player.territory.length);
      renderer.updateTerritory(player.territory);
    } else {
      console.warn('❌ No territory data for player!');
    }
  }

  /**
   * Player removed from game
   */
  private onPlayerRemoved(sessionId: string): void {
    console.log('Player removed:', sessionId);

    const renderer = this.playerRenderers.get(sessionId);
    if (renderer) {
      renderer.dispose();
      this.playerRenderers.delete(sessionId);
    }
  }

  /**
   * Player state changed
   */
  private onPlayerChanged(sessionId: string, player: any): void {
    const renderer = this.playerRenderers.get(sessionId);
    if (!renderer) return;

    renderer.updatePosition(player.x, player.y);

    // Update territory if it changed
    if (player.territory.length > 0) {
      renderer.updateTerritory(player.territory);
    }

    // Update trail
    renderer.updateTrail(player.trail);

    // Hide if dead (pass position for explosion)
    renderer.setVisible(!player.isDead, player.x, player.y);

    // Update score for local player
    if (sessionId === this.myPlayerId) {
      // Calculate percentage (assuming world is 5000x5000 = 25M total area)
      const totalArea = 5000 * 5000;
      const percentage = ((player.score / totalArea) * 100).toFixed(2);
      this.scoreEl.textContent = `${percentage}%`;
      this.currentScore = `${percentage}%`;

      // Show outro modal if player just died
      if (player.isDead) {
        this.showOutroModal();
      }
    }

    // Update leaderboard
    this.updateLeaderboard();
  }

  /**
   * Update leaderboard display
   */
  private updateLeaderboard(): void {
    if (!this.room) return;

    // Get all players sorted by score
    const players = (Array.from(this.room.state.players.values()) as any[])
      .sort((a, b) => b.score - a.score)
      .slice(0, 10); // Top 10

    // Calculate total area for percentages
    const totalArea = 5000 * 5000;

    // Build leaderboard HTML
    this.leaderboardEl.innerHTML = players
      .map((player, index) => {
        const percentage = ((player.score / totalArea) * 100).toFixed(2);
        const isMe = player.id === this.myPlayerId;
        const nameStyle = isMe ? 'font-weight: bold; color: #ffd700;' : '';
        const displayName = player.name || player.id.substring(0, 8);
        return `
          <div class="leaderboard-entry">
            <div class="leaderboard-rank">${index + 1}</div>
            <div class="leaderboard-name" style="${nameStyle}">${displayName}</div>
            <div class="leaderboard-percent">${percentage}%</div>
          </div>
        `;
      })
      .join('');
  }

  /**
   * Set up input handling
   */
  private setupInput(): void {
    const handleInput = (clientX: number, clientY: number) => {
      if (!this.room || !this.myPlayerId) return;

      // 1. Calculate relative to center of screen (Player Position)
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;

      const dx = clientX - centerX;
      const dy = clientY - centerY;

      // 2. Calculate Angle (Standard Screen Coordinates: Y is Down)
      // In Three.js/World, Y is Up
      // Mouse Down (+Y) -> World Down (-Y)
      // We invert Y to match the World Axis
      const angle = Math.atan2(-dy, dx);

      this.room.send('input', { type: 'input', angle });
    };

    window.addEventListener('mousemove', (e) => handleInput(e.clientX, e.clientY));

    // Touch support
    window.addEventListener('touchmove', (e) => {
      e.preventDefault(); // Prevent scrolling
      if (e.touches.length > 0) {
        handleInput(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: false });
  }

  /**
   * Handle window resize
   */
  private onResize(): void {
    const aspect = window.innerWidth / window.innerHeight;
    const viewHeight = 1000;
    const viewWidth = viewHeight * aspect;

    this.camera.left = -viewWidth / 2;
    this.camera.right = viewWidth / 2;
    this.camera.top = viewHeight / 2;
    this.camera.bottom = -viewHeight / 2;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
  }

  /**
   * Main render loop
   */
  animate = (): void => {
    requestAnimationFrame(this.animate);

    // 1. Get Delta Time (seconds since last frame)
    const dt = this.clock.getDelta();

    // 2. Interpolate all players
    this.playerRenderers.forEach((renderer, sessionId) => {
      renderer.tick(dt);
    });

    // 3. Update Camera to follow MY SMOOTH MESH
    if (this.myPlayerId && this.room) {
      const myRenderer = this.playerRenderers.get(this.myPlayerId);
      if (myRenderer) {
        // Follow the MESH, not the server data
        this.camera.position.x = myRenderer.characterMesh.position.x;
        this.camera.position.y = myRenderer.characterMesh.position.y;
      }
    }

    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  };

  /**
   * Start the game
   */
  start(): void {
    this.animate();
  }
}
