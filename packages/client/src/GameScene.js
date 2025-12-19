import * as THREE from 'three';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { Client } from 'colyseus.js';
import { PlayerRenderer } from './PlayerRenderer.js';
import { WORLD_WIDTH, WORLD_HEIGHT } from '@paperio2/common';
/**
 * Main game scene with Three.js rendering and Colyseus networking
 */
export class GameScene {
    constructor() {
        this.room = null;
        // Player renderers
        this.playerRenderers = new Map();
        this.myPlayerId = null;
        this.username = '';
        this.currentScore = '0.0%';
        this.outroModalShown = false;
        this.MINIMAP_SIZE = 200;
        /**
         * Main render loop
         */
        this.animate = () => {
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
            // Update minimap
            this.updateMinimap();
        };
        // Initialize Three.js
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB); // Sky blue for outside world
        this.clock = new THREE.Clock(); // Start the clock for delta time
        // Create circular playable area background (radius 2500, centered at world)
        const playableAreaGeometry = new THREE.CircleGeometry(WORLD_WIDTH / 2, 64); // Radius 2500, 64 segments for smooth circle
        const playableAreaMaterial = new THREE.MeshBasicMaterial({
            color: 0xe8f4f8, // Light blueish-white
            side: THREE.DoubleSide,
        });
        const playableArea = new THREE.Mesh(playableAreaGeometry, playableAreaMaterial);
        playableArea.position.set(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, -10); // Center at (2500, 2500), behind everything
        this.scene.add(playableArea);
        // Set up orthographic camera for top-down view
        const aspect = window.innerWidth / window.innerHeight;
        const viewHeight = 1000;
        const viewWidth = viewHeight * aspect;
        this.camera = new THREE.OrthographicCamera(-viewWidth / 2, viewWidth / 2, viewHeight / 2, -viewHeight / 2, 0.1, 1000);
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
        document.body.appendChild(this.labelRenderer.domElement);
        // Add grid for reference
        this.addGrid();
        // UI elements
        this.scoreEl = document.getElementById('score');
        this.statusEl = document.getElementById('status');
        this.leaderboardEl = document.getElementById('leaderboard-list');
        this.introModal = document.getElementById('intro-modal');
        this.outroModal = document.getElementById('outro-modal');
        // Set up modal handlers
        this.setupModals();
        // Input listeners
        this.setupInput();
        // Handle resize
        window.addEventListener('resize', () => this.onResize());
        // Initialize Colyseus client (but don't connect yet - wait for username)
        // In development: always use ws://localhost:2567
        // In production: use current host with wss://
        let serverUrl;
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            // Development - connect to game server on port 2567
            serverUrl = 'ws://localhost:2567';
        }
        else {
            // Production - use current host (server serves both client and game)
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            serverUrl = `${protocol}//${window.location.host}`;
        }
        console.log('🔗 Connecting to server:', serverUrl);
        this.client = new Client(serverUrl);
        // Initialize minimap canvas
        this.minimapCanvas = document.getElementById('minimap');
        this.minimapCtx = this.minimapCanvas.getContext('2d');
    }
    /**
     * Set up intro and outro modals
     */
    setupModals() {
        const usernameInput = document.getElementById('username-input');
        const playButton = document.getElementById('play-button');
        const playAgainButton = document.getElementById('play-again-button');
        // Handle Play button
        const handlePlay = () => {
            const username = usernameInput.value.trim();
            // Use "player" as default if username is empty
            this.username = username.length === 0 ? 'player' : username;
            this.introModal.classList.add('hidden');
            this.connect();
        };
        playButton.addEventListener('click', handlePlay);
        usernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter')
                handlePlay();
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
            this.outroModalShown = false; // Allow modal to show again
            // Reconnect with same username
            this.connect();
        });
        // Focus username input
        usernameInput.focus();
    }
    /**
     * Show outro modal with final score
     */
    showOutroModal(isVictory = false) {
        const modalTitleEl = this.outroModal.querySelector('.modal-title');
        const finalScoreEl = document.getElementById('final-score');
        if (isVictory) {
            modalTitleEl.textContent = '🏆 VICTORY! 🏆';
            modalTitleEl.style.color = '#ffd700'; // Gold color
        }
        else {
            modalTitleEl.textContent = 'Game Over!';
            modalTitleEl.style.color = '#4ECDC4'; // Default cyan
        }
        finalScoreEl.textContent = this.currentScore;
        this.outroModal.classList.remove('hidden');
    }
    /**
     * Add a grid to visualize the world
     */
    addGrid() {
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
    async connect() {
        try {
            this.statusEl.textContent = 'Connecting...';
            this.room = await this.client.joinOrCreate('game', { username: this.username });
            this.myPlayerId = this.room.sessionId;
            this.statusEl.textContent = 'Connected';
            // Listen for state changes
            this.room.state.players.onAdd((player, sessionId) => {
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
            this.room.state.players.onRemove((player, sessionId) => {
                this.onPlayerRemoved(sessionId);
            });
            console.log('Connected to room:', this.room.id);
        }
        catch (error) {
            console.error('Failed to connect:', error);
            this.statusEl.textContent = 'Connection failed';
        }
    }
    /**
     * Player added to game
     */
    onPlayerAdded(sessionId, player) {
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
        }
        else {
            console.warn('❌ No territory data for player!');
        }
    }
    /**
     * Player removed from game
     */
    onPlayerRemoved(sessionId, player) {
        console.log('Player removed:', sessionId);
        const renderer = this.playerRenderers.get(sessionId);
        if (renderer) {
            // Trigger explosion if player hasn't already exploded
            // This handles cases where the server removes the player before isDead state is synced
            renderer.setVisible(false, player.x || renderer.characterMesh.position.x, player.y || renderer.characterMesh.position.y);
            // Small delay before disposal to let explosion animation start
            setTimeout(() => {
                renderer.dispose();
                this.playerRenderers.delete(sessionId);
            }, 100); // 100ms delay for explosion to spawn particles
        }
    }
    /**
     * Player state changed
     */
    onPlayerChanged(sessionId, player) {
        const renderer = this.playerRenderers.get(sessionId);
        if (!renderer)
            return;
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
            // Calculate percentage based on circular playable world
            // Radius = (5000/2) - 1 = 2499, Area = π × 2499²
            const worldRadius = 2499;
            const totalArea = Math.PI * worldRadius * worldRadius;
            const percentage = ((player.score / totalArea) * 100).toFixed(2);
            this.scoreEl.textContent = `${percentage}%`;
            this.currentScore = `${percentage}%`;
            // Show outro modal if player just died or won (only once)
            if ((player.isDead || player.hasWon) && !this.outroModalShown) {
                this.outroModalShown = true;
                this.showOutroModal(player.hasWon);
            }
        }
        // Update leaderboard
        this.updateLeaderboard();
    }
    /**
     * Update leaderboard display
     */
    updateLeaderboard() {
        if (!this.room)
            return;
        // Get all players sorted by score
        const players = Array.from(this.room.state.players.values())
            .sort((a, b) => b.score - a.score)
            .slice(0, 10); // Top 10
        // Calculate total area for percentages (circular world)
        const worldRadius = 2499;
        const totalArea = Math.PI * worldRadius * worldRadius;
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
    setupInput() {
        const handleInput = (clientX, clientY) => {
            if (!this.room || !this.myPlayerId)
                return;
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
    onResize() {
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
     * Update minimap display
     */
    updateMinimap() {
        if (!this.myPlayerId || !this.room)
            return;
        const player = this.room.state.players.get(this.myPlayerId);
        if (!player)
            return;
        const ctx = this.minimapCtx;
        const size = this.MINIMAP_SIZE;
        const center = size / 2;
        // Clear canvas
        ctx.clearRect(0, 0, size, size);
        // Clip to circular boundary
        ctx.save();
        ctx.beginPath();
        ctx.arc(center, center, center, 0, Math.PI * 2);
        ctx.clip();
        // Draw background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(0, 0, size, size);
        // Draw player territory (if exists)
        if (player.territory && player.territory.length > 0) {
            // Convert Colyseus ArraySchema to real array (same as PlayerRenderer)
            const territoryData = Array.isArray(player.territory) ? player.territory : Array.from(player.territory);
            const points = [];
            // Detect data format (flat array vs object array) - same logic as PlayerRenderer
            if (territoryData.length > 0 && typeof territoryData[0] === 'number') {
                // FORMAT: Flat array [x, y, x, y...]
                for (let i = 0; i < territoryData.length; i += 2) {
                    points.push({ x: territoryData[i], y: territoryData[i + 1] });
                }
            }
            else {
                // FORMAT: Object array [{x,y}, {x,y}...]
                for (let i = 0; i < territoryData.length; i++) {
                    points.push(territoryData[i]);
                }
            }
            if (points.length >= 3) {
                ctx.fillStyle = player.color;
                ctx.globalAlpha = 0.5;
                ctx.beginPath();
                points.forEach((point, i) => {
                    const x = (point.x / WORLD_WIDTH) * size;
                    const y = ((WORLD_HEIGHT - point.y) / WORLD_HEIGHT) * size; // Invert Y
                    if (i === 0)
                        ctx.moveTo(x, y);
                    else
                        ctx.lineTo(x, y);
                });
                ctx.closePath();
                ctx.fill();
                ctx.globalAlpha = 1.0;
            }
        }
        // Draw player position dot
        const playerX = (player.x / WORLD_WIDTH) * size;
        const playerY = ((WORLD_HEIGHT - player.y) / WORLD_HEIGHT) * size; // Invert Y
        ctx.fillStyle = player.color;
        ctx.beginPath();
        ctx.arc(playerX, playerY, 4, 0, Math.PI * 2);
        ctx.fill();
        // Add glow effect
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
    }
    /**
     * Start the game
     */
    start() {
        this.animate();
    }
}
