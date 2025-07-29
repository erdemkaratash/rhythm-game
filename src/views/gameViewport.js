// gameViewport.js
import { initGame, showGame, hideGame } from './game.js';
import { initGameMenu, showGameMenu, hideGameMenu } from './gameMenu.js';

export function initGameViewport({ onBack, onEnd }) {
  initGame({ onEnd: stats => {
    hideGameMenu();
    hideGame();
    onEnd(stats);
  }});

  initGameMenu({
    onContinue: () => {
      // resume handled in gameMenu
    },
    onExit: () => {
      hideGameMenu();
      hideGame();
      onBack();
    }
  });
}

export function showGameViewport(levelFile, diff) {
  showGameMenu();
  showGame(levelFile, diff);
}

export function hideGameViewport() {
  hideGame();
  hideGameMenu();
}
