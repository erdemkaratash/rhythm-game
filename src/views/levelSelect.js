// src/views/levelSelect.js

let lvlMenu, lvlList, diffList, backBtn, proceedBtn;
let selectedLevelText, avatarImg, selectedDiffText;
let onLevelChosenCb, onBackCb;

let selectedLevelFile = null;
let selectedDiff = 'medium';

export function initLevelSelect({ onLevelChosen, onBack }) {
  lvlMenu            = document.getElementById('level-menu');
  lvlList            = document.getElementById('level-list');
  diffList           = document.getElementById('diff-list');
  backBtn            = document.getElementById('back-to-menu');
  proceedBtn         = document.getElementById('proceed-btn');
  selectedLevelText  = document.getElementById('selected-level');
  avatarImg          = document.getElementById('avatar');
  selectedDiffText   = document.getElementById('diff-text');

  onLevelChosenCb = onLevelChosen;
  onBackCb        = onBack;

  // Back → main menu
  backBtn.addEventListener('click', () => {
    onBackCb();
  });

  // Proceed → start game with chosen level + diff
  proceedBtn.addEventListener('click', () => {
    if (!selectedLevelFile) {
      alert('Please select a level first');
      return;
    }
    onLevelChosenCb(selectedLevelFile, selectedDiff);
  });

  // Difficulty clicks
  diffList.querySelectorAll('li').forEach(li => {
    li.addEventListener('click', () => {
      // highlight
      diffList.querySelectorAll('li').forEach(l => l.classList.remove('selected'));
      li.classList.add('selected');

      // update selectedDiff & UI text
      selectedDiff = li.dataset.diff;
      selectedDiffText.textContent =
        selectedDiff.charAt(0).toUpperCase() + selectedDiff.slice(1);
    });
  });

  loadLevels();
}

export function showLevelSelect() {
  lvlMenu.classList.remove('hidden');
}

export function hideLevelSelect() {
  lvlMenu.classList.add('hidden');
}

function loadLevels() {
  lvlList.innerHTML = '';
  fetch('./levels/')
    .then(r => r.text())
    .then(html => {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      Array.from(doc.querySelectorAll('a'))
        .map(a => a.href.split('/').pop())
        .filter(f => f.endsWith('.mp3'))
        .forEach(mp3 => {
          const songName = decodeURIComponent(mp3.replace('.mp3',''));
          const li = document.createElement('li');
          li.textContent = songName;

          li.addEventListener('click', () => {
            // highlight selection
            lvlList.querySelectorAll('li').forEach(l => l.classList.remove('selected'));
            li.classList.add('selected');

            // store chosen file
            selectedLevelFile = mp3;

            // update UI
            selectedLevelText.textContent = songName;
          });

          lvlList.appendChild(li);
        });
    })
    .catch(() => {
      lvlList.innerHTML = '<li>Error loading levels</li>';
    });
}
