// onboarding.js
export function initOnboarding({ onStart }) {
  const startBtn = document.getElementById('start-btn');
  startBtn.addEventListener('click', onStart);
}

export function showOnboarding() {
  document.getElementById('menu').classList.remove('hidden');
}

export function hideOnboarding() {
  document.getElementById('menu').classList.add('hidden');
}
