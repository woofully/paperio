/**
 * Main game scene with Three.js rendering and Colyseus networking
 */
export declare class GameScene {
    private scene;
    private camera;
    private renderer;
    private labelRenderer;
    private client;
    private room;
    private clock;
    private playerRenderers;
    private myPlayerId;
    private scoreEl;
    private statusEl;
    private leaderboardEl;
    private introModal;
    private outroModal;
    private username;
    private currentScore;
    private outroModalShown;
    private minimapCanvas;
    private minimapCtx;
    private readonly MINIMAP_SIZE;
    constructor();
    /**
     * Set up intro and outro modals
     */
    private setupModals;
    /**
     * Show outro modal with final score
     */
    private showOutroModal;
    /**
     * Add a grid to visualize the world
     */
    private addGrid;
    /**
     * Connect to game server
     */
    private connect;
    /**
     * Player added to game
     */
    private onPlayerAdded;
    /**
     * Player removed from game
     */
    private onPlayerRemoved;
    /**
     * Player state changed
     */
    private onPlayerChanged;
    /**
     * Update leaderboard display
     */
    private updateLeaderboard;
    /**
     * Set up input handling
     */
    private setupInput;
    /**
     * Handle window resize
     */
    private onResize;
    /**
     * Update minimap display
     */
    private updateMinimap;
    /**
     * Main render loop
     */
    animate: () => void;
    /**
     * Start the game
     */
    start(): void;
}
