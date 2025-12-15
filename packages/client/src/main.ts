import { GameScene } from './GameScene.js';

/**
 * Entry point for the game client
 */
function main() {
  console.log('🎮 Paper.io 2 Client starting...');

  const game = new GameScene();
  game.start();

  console.log('✅ Game initialized');
}

// Start the game when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
