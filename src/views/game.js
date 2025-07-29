// game.js
import { generateLevel } from '../levelGenerator.js';

export function initGame({ onEnd }) {
  const canvas = document.getElementById('game');
  const ctx    = canvas.getContext('2d');

  const hitCircle = document.getElementById('hit-circle');
  const progC = document.getElementById('progress-container');
  const progB = document.getElementById('progress-bar');
  const viz   = document.getElementById('visualizer');
  const vctx  = viz.getContext('2d');

  let audioCtx, analyser, dataArray, sourceNode, gameAudio, startTime;
  let notes = [];
  let hits = 0, misses = 0;
  const speed = 500, hitWindow = 0.2;
  let effects = [];

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    viz.width     = window.innerWidth;
    viz.height    = 40;
  }
  window.addEventListener('resize', resize);

  function spawnEffect(type, x, y) {
    effects.push({ type, x, y, t0: audioCtx.currentTime });
  }

  function playHitSound() {
    const now = audioCtx.currentTime;
    const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.005, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const noise = audioCtx.createBufferSource();
    noise.buffer = buf;
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.setValueAtTime(1500, now);
    const ng = audioCtx.createGain();
    ng.gain.setValueAtTime(1, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    noise.connect(filter).connect(ng).connect(audioCtx.destination);
    noise.start(now); noise.stop(now + 0.06);

    const osc = audioCtx.createOscillator();
    const og = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(100, now);
    og.gain.setValueAtTime(0.5, now);
    og.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(og).connect(audioCtx.destination);
    osc.start(now); osc.stop(now + 0.1);
  }

  function playMissSound() {
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const og = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(60, now);
    og.gain.setValueAtTime(0.6, now);
    og.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(og).connect(audioCtx.destination);
    osc.start(now); osc.stop(now + 0.2);

    const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.02, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const noise = audioCtx.createBufferSource();
    noise.buffer = buf;
    const ng = audioCtx.createGain();
    ng.gain.setValueAtTime(0.3, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    noise.connect(ng).connect(audioCtx.destination);
    noise.start(now); noise.stop(now + 0.12);
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const xH = canvas.width * 0.9;
    const t = audioCtx.currentTime - startTime;

    // Position DOM notes
    notes.forEach(n => {
      if (n.hit || n.missed) return;
      const x = (t - n.spawnTime) * speed;
      if (x < 0 || x > canvas.width + 60) return;
      n.el.style.left = `${x}px`;
      n.el.style.top = `${canvas.height / 2 - 30}px`; // vertically centered
    });

    // Effects (still drawn on canvas)
    const now = audioCtx.currentTime;
    effects = effects.filter(e => now - e.t0 < 0.4);
    effects.forEach(e => {
      const age = now - e.t0, p = age / 0.4, alpha = 1 - p;
      const lw = 6 * (1 - p);
      const baseR = e.type === 'hit' ? 60 : 50, extR = e.type === 'hit' ? 40 : 30;
      ctx.strokeStyle = e.type === 'hit'
        ? `rgba(0,255,0,${alpha})`
        : `rgba(255,0,0,${alpha})`;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.arc(xH, canvas.height / 2, baseR + extR * p, 0, 2 * Math.PI);
      ctx.stroke();
    });

    // HUD
    ctx.fillStyle = '#fff';
    ctx.font = '24px sans-serif';
    ctx.fillText(`Score: ${hits}`, 20, 30);
    ctx.fillText(`Misses: ${misses}`, 20, 60);

    // Progress bar
    if (gameAudio.duration) {
      progB.style.width = `${(gameAudio.currentTime / gameAudio.duration) * 100}%`;
    }

    // Visualizer
    analyser.getByteFrequencyData(dataArray);
    vctx.clearRect(0, 0, viz.width, viz.height);
    const bars = 60, slice = Math.floor(dataArray.length / bars);
    for (let i = 0; i < bars; i++) {
      let sum = 0;
      for (let j = 0; j < slice; j++) sum += dataArray[i * slice + j];
      const h = (sum / slice) / 255 * viz.height;
      vctx.fillStyle = '#0f0';
      vctx.fillRect(i * (viz.width / bars), viz.height - h, viz.width / bars - 1, h);
    }

    requestAnimationFrame(draw);
  }

  function spawnAllNotes(rawNotes) {
    notes.forEach(n => n.el?.remove()); // Remove previous notes
    notes = rawNotes.map(n => {
      const el = document.createElement('div');
      el.className = 'note';
      el.textContent = { ArrowUp: '↑', ArrowRight: '→', ArrowDown: '↓', ArrowLeft: '←' }[n.key];
      el.style.position = 'absolute';
      el.style.left = '-60px';
      el.style.top = `${window.innerHeight / 2 - 30}px`;
      document.body.appendChild(el);
      return { ...n, hit: false, missed: false, el };
    });
  }

  function gameLoop() {
    const t = audioCtx.currentTime - startTime;
    const xH = canvas.width * 0.9;
    notes.forEach(n => {
      if (n.hit || n.missed) return;
      const x = (t - n.spawnTime) * speed;
      if (x > xH + 30) {
        n.missed = true; misses++;
        playMissSound();
        spawnEffect('miss', xH, canvas.height / 2);
        n.el.remove();
      }
    });
  }

  function keyHandler(e) {
    const allowed = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'];
    const xH = canvas.width * 0.9;
    if (!allowed.includes(e.key)) {
      misses++; playMissSound(); spawnEffect('miss', xH, canvas.height / 2);
      return;
    }
    const t = audioCtx.currentTime - startTime;
    for (let n of notes) {
      if (n.hit || n.missed) continue;
      const x = (t - n.spawnTime) * speed;
      if (Math.abs(x - xH) < hitWindow * speed) {
        if (e.key === n.key) {
          n.hit = true; hits++;
          playHitSound();
          spawnEffect('hit', xH, canvas.height / 2);
          n.el.remove();
        } else {
          n.missed = true; misses++;
          playMissSound();
          spawnEffect('miss', x, canvas.height / 2);
          n.el.remove();
        }
        return;
      }
    }
    misses++; playMissSound(); spawnEffect('miss', xH, canvas.height / 2);
  }

  window._showGame = (levelFile, diff) => {
    hits = 0; misses = 0; effects = [];
    resize();
    progC.classList.remove('hidden');
    viz.classList.remove('hidden');
    hitCircle.classList.remove('hidden');

    audioCtx = new AudioContext();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 128;
    dataArray = new Uint8Array(analyser.frequencyBinCount);

    fetch(`./levels/${levelFile}`)
      .then(r => r.arrayBuffer())
      .then(buf => audioCtx.decodeAudioData(buf))
      .then(audioBuffer => {
        const raw = generateLevel(audioBuffer, diff);
        const prepared = raw.map(n => ({
          spawnTime: n.time - (canvas.width * 0.9) / speed + 0.1,
          key: n.key
        }));
        spawnAllNotes(prepared);

        gameAudio = new Audio(`./levels/${levelFile}`);
        window._audioCtx = audioCtx;
        window._gameAudio = gameAudio;

        gameAudio.onended = () => setTimeout(() => onEnd({
          hits, misses, score: hits / ((hits + misses) || 1)
        }), 3000);

        sourceNode = audioCtx.createMediaElementSource(gameAudio);
        sourceNode.connect(analyser);
        analyser.connect(audioCtx.destination);

        startTime = audioCtx.currentTime;
        gameAudio.play();

        draw();
        window.addEventListener('keydown', keyHandler);
      });
  };

  window._hideGame = () => {
    canvas.classList.add('hidden');
    progC.classList.add('hidden');
    viz.classList.add('hidden');
    hitCircle.classList.add('hidden');
    notes.forEach(n => n.el?.remove());
    window.removeEventListener('keydown', keyHandler);
    if (audioCtx) audioCtx.close();
  };
}

export function showGame(levelFile, diff) {
  document.getElementById('game').classList.remove('hidden');
  window._showGame(levelFile, diff);
}

export function hideGame() {
  window._hideGame();
}
