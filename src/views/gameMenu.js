// gameMenu.js
export function initGameMenu({ onContinue, onExit }) {
  const menuBtn = document.createElement('button');
  menuBtn.textContent = 'Menu';
  Object.assign(menuBtn.style, {
    position: 'absolute', top: '10px', right: '10px',
    padding: '0.5rem 1rem', fontSize: '1rem',
    zIndex: 1000, display: 'none', cursor: 'pointer'
  });
  document.body.appendChild(menuBtn);

  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'fixed', top:0, left:0,
    width:'100%', height:'100%',
    backgroundColor:'rgba(0,0,0,0.6)',
    display:'none', justifyContent:'center',
    alignItems:'center', zIndex:1001
  });
  const box = document.createElement('div');
  Object.assign(box.style, {
    backgroundColor:'#222', color:'#fff',
    padding:'2rem', borderRadius:'8px',
    display:'flex', flexDirection:'column', gap:'1rem',
    textAlign:'center'
  });
  const btnC = document.createElement('button');
  btnC.textContent = 'Continue';
  const btnE = document.createElement('button');
  btnE.textContent = 'Exit to Level Select';
  [btnC, btnE].forEach(b => {
    Object.assign(b.style, {
      padding:'0.75rem 1.5rem', fontSize:'1rem', cursor:'pointer'
    });
    box.appendChild(b);
  });
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  // pause on open
  menuBtn.addEventListener('click', () => {
    const ac = window._audioCtx;
    const ga = window._gameAudio;
    if (ac && ac.state === 'running') ac.suspend();
    if (ga && !ga.paused)        ga.pause();
    overlay.style.display = 'flex';
  });

  // continue → resume
  btnC.addEventListener('click', () => {
    overlay.style.display = 'none';
    const ac = window._audioCtx;
    const ga = window._gameAudio;
    if (ac && ac.state === 'suspended') ac.resume();
    if (ga && ga.paused)         ga.play();
    onContinue();
  });

  // exit
  btnE.addEventListener('click', () => {
    overlay.style.display = 'none';
    onExit();
  });

  window._showGameMenu = () => { menuBtn.style.display = 'block'; };
  window._hideGameMenu = () => {
    menuBtn.style.display = 'none';
    overlay.style.display = 'none';
  };
}

export function showGameMenu() { window._showGameMenu(); }
export function hideGameMenu() { window._hideGameMenu(); }
