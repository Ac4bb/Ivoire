let songs = [];
let currentSong = null;
let cursor = 0;
let chordProgress = new Set();

function showStorageError(error){
  const b = document.getElementById('errorBanner');
  b.style.display = 'block';
  b.textContent = '⚠ Stockage des morceaux : ' + error.message;
}
function hideStorageError(){
  document.getElementById('errorBanner').style.display = 'none';
}

function applyMidiGaps(tokens, gaps){
  if(gaps?.length === tokens.length){
    tokens.forEach((token,index)=>{ token.gap = gaps[index]; });
  }
}

function prepareSong({id, title, personal, notation:source}){
  const {meta, notation} = IvoireStorage.extractMeta(source);
  const prepared = {id, title, personal, meta, targetDuration:meta.duration || null, rawNotation:notation};
  try{
    const timedSeq = parseNotationWithTiming(notation, meta.format);
    if(!timedSeq.length) throw new SyntaxError('Aucune touche reconnue dans cette notation.');
    applyMidiGaps(timedSeq, meta.midiGaps);
    return {...prepared, seq:timedSeq.map(({note})=>note), timedSeq};
  }catch(error){
    if(!(error instanceof SyntaxError)) throw error;
    // L’entrée reste sélectionnable et modifiable sans réécrire la partition.
    return {...prepared, seq:[], timedSeq:[], notationError:error.message};
  }
}

async function loadSongs(){
  try{
    const data = await IvoireStorage.listSongs();
    songs = data.map(prepareSong);
    hideStorageError();
  }catch(e){
    showStorageError(e);
  }
  if(songs.length===0){
    const notes = Object.values(CODE_MAP).map(([note])=>note).join(' ');
    songs = [prepareSong({id:'demo', title:'Démo — gamme simple AZERTY',
      notation:'##meta:{"format":"azerty"}\n' + notes})];
  }
  refreshSongSelect();
}
function keyCount(seq){
  return (seq||[]).reduce((n,t)=>n+(Array.isArray(t)?t.length:1),0);
}
function refreshSongSelect(){
  const sel = document.getElementById('songSelect');
  const previousId = currentSong ? currentSong.id : null;
  const isFav = s => !!(s.meta && s.meta.favorite);
  const favorites = songs.filter(isFav);
  const normal = songs.filter(s=>!(s.meta && Array.isArray(s.meta.midiGaps)) && !isFav(s));
  const midi = songs.filter(s=>s.meta && Array.isArray(s.meta.midiGaps) && !isFav(s));
  const optHtml = s => `<option value="${escapeHtml(s.id)}">${isFav(s)?'⭐ ':''}${escapeHtml(s.title)} (${keyCount(s.seq)} touches)</option>`;
  let html = '';
  if(favorites.length) html += `<optgroup label="⭐ Favoris">${favorites.map(optHtml).join('')}</optgroup>`;
  if(normal.length) html += `<optgroup label="🎵 Morceaux (notation texte)">${normal.map(optHtml).join('')}</optgroup>`;
  if(midi.length) html += `<optgroup label="🎹 Morceaux importés en MIDI">${midi.map(optHtml).join('')}</optgroup>`;
  sel.innerHTML = html;
  if(songs.length){
    const stillExists = previousId && songs.some(s=>s.id===previousId);
    selectSong(stillExists ? previousId : (favorites[0] || normal[0] || midi[0]).id);
  }
}
function renderSongMeta(){
  const el = document.getElementById('songMeta');
  if(!currentSong || !currentSong.meta || Object.keys(currentSong.meta).length===0){ el.innerHTML=''; return; }
  const m = currentSong.meta;
  const badges = [];
  if(m.difficulty){
    badges.push(`<span class="meta-badge">📶 Niveau ${escapeHtml(m.difficulty)}${m.difficultyLabel ? ' · '+escapeHtml(m.difficultyLabel) : ''}</span>`);
  }
  if(Array.isArray(m.type) && m.type.length){
    badges.push(`<span class="meta-badge">🎼 ${escapeHtml(m.type.join(' · '))}</span>`);
  }
  if(m.duration){
    const mm = Math.floor(m.duration/60), ss = String(m.duration%60).padStart(2,'0');
    badges.push(`<span class="meta-badge">⏱ ${mm}:${ss}</span>`);
  }
  el.innerHTML = badges.join('');
}
function restartPractice(){
  cursor = 0;
  chordProgress = new Set();
  resetPracticeStats();
  renderStream();
}
function selectSong(id){
  currentSong = songs.find(s=>s.id===id) || null;
  stopDemo();
  document.getElementById('songSelect').value = id;
  document.getElementById('deleteSong').disabled = !currentSong?.personal;
  calibrateDemoSpeed();
  renderSongMeta();
  restartPractice();
  updateFavoriteBtn();
}
function updateFavoriteBtn(){
  const btn = document.getElementById('favoriteSong');
  const isFav = currentSong && currentSong.meta && currentSong.meta.favorite;
  btn.textContent = isFav ? '⭐ Favori' : '☆ Favori';
}
document.getElementById('songSelect').addEventListener('change', e=>selectSong(e.target.value));
document.getElementById('restartSong').addEventListener('click', restartPractice);

// ---------- écoute locale ----------
let demoPlaying = false;
let demoPaused = false;
let demoTimer = null;
let demoIndex = 0;
let demoSpeed = 1;
try{
  const savedSpeed = parseFloat(localStorage.getItem('ivoire:demoSpeed'));
  if(Number.isFinite(savedSpeed)) demoSpeed = Math.min(2.5, Math.max(0.5, savedSpeed));
}catch(e){}
const playDemoBtn = document.getElementById('playDemo');
const pausePlaybackBtn = document.getElementById('pausePlayback');
const stopPlaybackBtn = document.getElementById('stopPlayback');
const demoSpeedInput = document.getElementById('demoSpeed');
const demoSpeedLabel = document.getElementById('demoSpeedLabel');
demoSpeedInput.value = demoSpeed.toFixed(1);
demoSpeedLabel.textContent = demoSpeed.toFixed(1) + 'x';
demoSpeedInput.addEventListener('input', ()=>{
  demoSpeed = parseFloat(demoSpeedInput.value);
  demoSpeedLabel.textContent = demoSpeed.toFixed(1) + 'x';
  try{ localStorage.setItem('ivoire:demoSpeed', demoSpeed.toFixed(1)); }catch(e){}
});

const masterVolumeInput = document.getElementById('masterVolume');
const masterVolumeLabel = document.getElementById('masterVolumeLabel');
masterVolumeInput.value = masterVolume.toFixed(2);
masterVolumeLabel.textContent = Math.round(masterVolume*100) + '%';
masterVolumeInput.addEventListener('input', ()=>{
  masterVolume = parseFloat(masterVolumeInput.value);
  masterVolumeLabel.textContent = Math.round(masterVolume*100) + '%';
  try{ localStorage.setItem('ivoire:volume', masterVolume.toFixed(2)); }catch(e){}
});

function updateDemoButtons(){
  playDemoBtn.textContent = demoPaused ? '▶ Reprendre' : '▶ Écouter';
  playDemoBtn.disabled = !currentSong?.timedSeq.length;
  pausePlaybackBtn.disabled = !demoPlaying;
  stopPlaybackBtn.disabled = !(demoPlaying || demoPaused || demoIndex > 0);
}

function calibrateDemoSpeed(){
  try{ if(localStorage.getItem('ivoire:demoSpeed') !== null) return; }catch(e){}
  if(!currentSong || !currentSong.targetDuration || !currentSong.timedSeq || !currentSong.timedSeq.length){
    return; // pas de durée cible connue : on garde la vitesse manuelle actuelle
  }
  const naturalTotalMs = currentSong.timedSeq.reduce((sum,t)=>sum + Math.max(t.gap, GAP.fast), 0);
  const naturalTotalSec = naturalTotalMs / 1000;
  let speed = naturalTotalSec / currentSong.targetDuration;
  speed = Math.min(2.5, Math.max(0.5, speed));
  demoSpeed = speed;
  demoSpeedInput.value = speed.toFixed(1);
  demoSpeedLabel.textContent = speed.toFixed(1) + 'x';
}

function demoHighlight(token){
  const chars = Array.isArray(token) ? token : [token];
  chars.forEach(raw=>{
    const el = keyEls[raw];
    if(el) flash(el, 'ok-flash');
  });
}

function demoStep(){
  const seq = (currentSong && currentSong.timedSeq && currentSong.timedSeq.length) ? currentSong.timedSeq : null;
  if(!demoPlaying || demoPaused) return;
  if(!seq || demoIndex >= seq.length){ stopDemo(); return; }
  const { note: token } = seq[demoIndex];
  const chars = Array.isArray(token) ? token : [token];
  chars.forEach(ch=>tone(ch));
  demoHighlight(token);
  demoIndex++;
  const nextGap = demoIndex < seq.length ? seq[demoIndex].gap : 0;
  const delay = Math.max(nextGap, GAP.fast) / demoSpeed;
  demoTimer = setTimeout(demoStep, delay);
}

function startDemo(options={}){
  if(!currentSong || !currentSong.timedSeq || !currentSong.timedSeq.length) return;
  if(options.reset || demoIndex >= currentSong.timedSeq.length) demoIndex = 0;
  demoPlaying = true;
  demoPaused = false;
  clearTimeout(demoTimer);
  updateDemoButtons();
  demoStep();
}

function pauseDemo(){
  if(!demoPlaying) return;
  demoPlaying = false;
  demoPaused = true;
  clearTimeout(demoTimer);
  updateDemoButtons();
}

function stopDemo(){
  demoPlaying = false;
  demoPaused = false;
  clearTimeout(demoTimer);
  demoIndex = 0;
  updateDemoButtons();
}

playDemoBtn.addEventListener('click', ()=>startDemo({reset: !demoPaused}));
pausePlaybackBtn.addEventListener('click', pauseDemo);
stopPlaybackBtn.addEventListener('click', stopDemo);
updateDemoButtons();

document.getElementById('favoriteSong').addEventListener('click', async ()=>{
  if(!currentSong) return;
  if(currentSong.id === 'demo'){ alert("Le morceau démo ne peut pas être mis en favori."); return; }
  try{
    await IvoireStorage.toggleFavorite(currentSong.id);
    await loadSongs();
  }catch(e){ showStorageError(e); }
});
function showEditSongModal(song, onSave){
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:center;justify-content:center;';
  const box = document.createElement('div');
  box.style.cssText = 'background:var(--bg-raised);border:1px solid var(--line);border-radius:12px;padding:20px;max-width:640px;width:92%;max-height:85vh;overflow:auto;color:var(--ivory);font-family:Inter;';
  box.innerHTML = `
    <h3 style="margin:0 0 14px;">Modifier le morceau</h3>
    <label style="font-size:12px;color:var(--text-dim,#a89a82);display:block;margin-bottom:5px;">Titre</label>
    <input type="text" id="editSongTitle" style="width:100%;margin-bottom:14px;">
    <label for="editSongNotation" style="font-size:12px;color:var(--text-dim,#a89a82);display:block;margin-bottom:5px;">Partition (${song.meta?.format === 'azerty' ? 'AZERTY' : 'QWERTY'})</label>
    <textarea id="editSongNotation" style="width:100%;min-height:260px;font-family:'JetBrains Mono',monospace;"></textarea>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap;">
      <button id="editSongPreview" class="btn-ghost">▶ Tester</button>
      <button id="editSongCancel" class="btn-ghost">Annuler</button>
      <button id="editSongSave" class="btn-ghost">Enregistrer</button>
    </div>`;
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  box.querySelector('#editSongTitle').value = song.title;
  box.querySelector('#editSongNotation').value = song.rawNotation || '';
  box.querySelector('#editSongCancel').addEventListener('click', ()=>{ stopPreview(); overlay.remove(); });

  // ---------- aperçu audio : joue le contenu actuel de la partition sans rien sauvegarder ----------
  let previewTimer = null, previewIdx = 0, previewTokens = null;
  function stopPreview(){
    clearTimeout(previewTimer);
    previewTimer = null;
    box.querySelector('#editSongPreview').textContent = '▶ Tester';
  }
  box.querySelector('#editSongPreview').addEventListener('click', ()=>{
    if(previewTimer){ stopPreview(); return; }
    const text = box.querySelector('#editSongNotation').value;
    try{
      previewTokens = parseNotationWithTiming(text, song.meta?.format);
    }catch(error){
      alert(error.message);
      return;
    }
    if(song.meta?.midiGaps && sameTimedNotes(song.timedSeq, previewTokens)){
      applyMidiGaps(previewTokens, song.meta.midiGaps);
    }
    if(!previewTokens.length){ alert('Rien à jouer.'); return; }
    previewIdx = 0;
    box.querySelector('#editSongPreview').textContent = '⏹ Stop';
    const step = ()=>{
      if(previewIdx >= previewTokens.length){ stopPreview(); return; }
      const tok = previewTokens[previewIdx];
      (Array.isArray(tok.note) ? tok.note : [tok.note]).forEach(ch=>tone(ch));
      previewIdx++;
      const nextGap = previewIdx < previewTokens.length ? previewTokens[previewIdx].gap : GAP.fast;
      previewTimer = setTimeout(step, Math.max(nextGap, GAP.fast));
    };
    step();
  });

  const saveButton = box.querySelector('#editSongSave');
  saveButton.addEventListener('click', async ()=>{
    stopPreview();
    const newTitle = box.querySelector('#editSongTitle').value.trim();
    const newNotation = box.querySelector('#editSongNotation').value;
    if(!newTitle){ alert('Le titre ne peut pas être vide.'); return; }
    if(!newNotation.trim()){ alert('La partition ne peut pas être vide.'); return; }
    saveButton.disabled = true;
    try{
      await onSave(newTitle, newNotation);
      overlay.remove();
    }catch(error){
      alert(error.message);
    }finally{
      saveButton.disabled = false;
    }
  });
}

document.getElementById('renameSong').addEventListener('click', ()=>{
  if(!currentSong) return;
  if(currentSong.id === 'demo'){ alert("Le morceau démo ne peut pas être modifié."); return; }
  const {id, title, rawNotation} = currentSong;
  showEditSongModal(currentSong, async (newTitle, newNotation)=>{
    await IvoireStorage.editSong(id, newTitle, newNotation, {title, notation:rawNotation});
    await loadSongs();
    selectSong(id);
  });
});
document.getElementById('deleteSong').addEventListener('click', async ()=>{
  if(!currentSong?.personal) return;
  if(!confirm(`Supprimer "${currentSong.title}" ? Cette action est irréversible.`)) return;
  try{
    await IvoireStorage.deleteSong(currentSong.id);
    await loadSongs();
  }catch(e){ showStorageError(e); }
});

document.getElementById('addSong').addEventListener('click', async ()=>{
  const status = document.getElementById('addStatus');
  const title = document.getElementById('newTitle').value.trim();
  const raw = document.getElementById('newNotation').value;
  const format = document.getElementById('newNotationFormat').value;
  if(!title){ status.textContent='⚠ Ajoute un titre.'; status.style.color='var(--bad)'; return; }
  if(!raw.trim()){ status.textContent='⚠ Colle une notation.'; status.style.color='var(--bad)'; return; }
  status.textContent='⏳ Enregistrement...'; status.style.color='var(--text-dim)';
  try{
    const id = await IvoireStorage.addSong(title, raw, format);
    await loadSongs();
    selectSong(id);
    document.getElementById('newTitle').value='';
    document.getElementById('newNotation').value='';
    status.textContent=`✓ "${title}" enregistré (${keyCount(currentSong.seq)} touches).`;
    status.style.color='var(--good)';
    setTimeout(()=>{ status.textContent=''; }, 4000);
  }catch(e){
    status.textContent='⚠ Échec de l\'enregistrement : ' + e.message;
    status.style.color='var(--bad)';
  }
});

const importLegacyBtn = document.getElementById('importLegacy');
const legacyFilesInput = document.getElementById('legacyFiles');
importLegacyBtn.addEventListener('click', ()=>legacyFilesInput.click());
legacyFilesInput.addEventListener('change', async ()=>{
  const selected = [...legacyFilesInput.files];
  legacyFilesInput.value = '';
  if(!selected.length) return;
  importLegacyBtn.disabled = true;
  try{
    IvoireStorage.validateImportSizes(selected);
    const files = await Promise.all(selected.map(async file=>({name:file.name, text:await file.text()})));
    const result = await IvoireStorage.importLegacy(files);
    if(result.backupId !== null) await loadSongs();
    alert(`Import terminé. Partitions ajoutées : ${result.songs}. Historiques ajoutés : ${result.progress}. Déjà présents ou en conflit : ${result.skippedSongs} partition(s), ${result.skippedProgress} historique(s).`);
  }catch(e){
    showStorageError(e);
  }finally{
    importLegacyBtn.disabled = false;
  }
});

