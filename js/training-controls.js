// ---------- stats ----------
const stats = {total:0, perKey:{}};
let practiceStats;
function resetPracticeStats(){
  practiceStats = {correct:0, wrong:0, keyErrors:{}};
  renderStats();
}
function practiceAccuracy(){
  const {correct, wrong} = practiceStats;
  return Math.round(correct / (correct + wrong || 1) * 100);
}
function renderStats(){
  const {correct, wrong} = practiceStats;
  document.getElementById('statTotal').textContent = correct + wrong;
  document.getElementById('statCorrect').textContent = correct;
  document.getElementById('statWrong').textContent = wrong;
  document.getElementById('statAcc').textContent = correct + wrong ? practiceAccuracy()+'%' : '—';
  const list = document.getElementById('keyBreakdown');
  const entries = Object.entries(stats.perKey).sort((a,b)=>b[1]-a[1]).slice(0,8);
  list.innerHTML = stats.total ? '' : '<div class="note">Joue quelques notes pour voir tes touches les plus utilisées.</div>';
  entries.forEach(([k,n])=>{
    const row = document.createElement('div'); row.className='keyrow';
    row.innerHTML = `<span style="font-family:'JetBrains Mono';color:var(--brass-bright);">${k}</span><span>${n}×</span>`;
    list.appendChild(row);
  });
  if(heatmapOn) renderHeatmap();
}

// ---------- historique de progression ----------
async function reportSongCompletion(){
  if(!currentSong || currentSong.id === 'demo') return;
  try{
    await IvoireStorage.recordCompletion(currentSong.id, {
      accuracy:practiceAccuracy(), timestamp:new Date().toISOString(), keyErrors:{...practiceStats.keyErrors},
    });
  }catch(e){ showStorageError(e); }
}

// ---------- fonctionnalités retirées de l'interface ----------
let heatmapOn = false;
function clearHeatmap(){}
function renderHeatmap(){}

// ---------- mode ----------
let mode = 'free';
document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>{
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
  t.classList.add('active');
  mode = t.dataset.mode;
  document.getElementById('practicePanel').style.display = mode==='practice' ? 'block' : 'none';
  document.getElementById('modeHint').textContent = mode==='practice' ? 'presse la touche brassée en surbrillance' : 'appuie sur tes touches pour jouer';
  if(mode !== 'practice') stopMetronome();
  updateExpectedHighlight();
}));

// ---------- métronome ----------
let metronomeOn = false;
let metronomeTimer = null;
const metroBtn = document.getElementById('metroToggle');
const metroBpmInput = document.getElementById('metroBpm');

function metronomeClick(){
  if(!soundOn || !activateAudio()) return;
  const o = actx.createOscillator();
  const g = actx.createGain();
  o.type = 'square';
  o.frequency.value = 1000;
  g.gain.setValueAtTime(0.12, actx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime+0.05);
  o.connect(g); g.connect(actx.destination);
  o.start(); o.stop(actx.currentTime+0.05);
  metroBtn.style.opacity = '0.5';
  setTimeout(()=>{ metroBtn.style.opacity = '1'; }, 80);
}

function startMetronome(){
  stopMetronome();
  const bpm = Math.max(30, Math.min(240, parseInt(metroBpmInput.value,10) || 90));
  const interval = 60000 / bpm;
  metronomeClick();
  metronomeTimer = setInterval(metronomeClick, interval);
  metronomeOn = true;
  metroBtn.classList.add('active-toggle');
}
function stopMetronome(){
  clearInterval(metronomeTimer);
  metronomeTimer = null;
  metronomeOn = false;
  metroBtn.classList.remove('active-toggle');
}
metroBtn.addEventListener('click', ()=>{
  if(metronomeOn) stopMetronome(); else startMetronome();
});
metroBpmInput.addEventListener('change', ()=>{
  if(metronomeOn) startMetronome();
});

// ---------- son ----------
try{ soundOn = localStorage.getItem('ivoire:sound') !== 'off'; }catch(e){}
const soundBtn = document.getElementById('soundToggle');
function updateSoundBtn(){ soundBtn.textContent = soundOn ? '🔊 Son' : '🔇 Muet'; }
updateSoundBtn();
soundBtn.addEventListener('click', ()=>{
  soundOn = !soundOn;
  updateSoundBtn();
  try{ localStorage.setItem('ivoire:sound', soundOn ? 'on' : 'off'); }catch(e){}
});

