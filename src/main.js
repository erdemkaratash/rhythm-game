// src/main.js

import {
  initOnboarding, showOnboarding, hideOnboarding
} from './views/onboarding.js';

import {
  initLevelSelect, showLevelSelect, hideLevelSelect
} from './views/levelSelect.js';

import {
  initGameViewport, showGameViewport, hideGameViewport
} from './views/gameViewport.js';

let currentLevel, currentDiff;

document.addEventListener('DOMContentLoaded', () => {
  // Onboarding → Level-Select
  initOnboarding({
    onStart: () => {
      hideOnboarding();
      showLevelSelect();
    }
  });

  // Level-Select → Game
  initLevelSelect({
    onLevelChosen: (levelFile, diff) => {
      currentLevel = levelFile;
      currentDiff  = diff;
      hideLevelSelect();
      showGameViewport(currentLevel, currentDiff);
    },
    onBack: () => {
      hideLevelSelect();
      showOnboarding();
    }
  });

  // Game viewport: pause/back and end-of-song
  initGameViewport({
    onBack: () => {
      // user chose “Exit to Level Select”
      hideGameViewport();
      showLevelSelect();
    },
    onEnd: stats => {
      // song ended
      console.log('Final stats', stats);
      hideGameViewport();
      showLevelSelect();
    }
  });

  // start at onboarding
  showOnboarding();
});
