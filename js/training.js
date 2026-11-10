function escapeHtml(value){
  return String(value).replace(/[&<>"']/g, ch=>({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[ch]));
}

const STREAM_VERTICAL_BREAKPOINT = 500;
function updateStreamLayoutMode(stream){
  const vertical = window.innerWidth <= STREAM_VERTICAL_BREAKPOINT;
  stream.classList.toggle('vertical', vertical);
  if(vertical){
    const top = stream.getBoundingClientRect().top;
    const available = Math.max(220, window.innerHeight - top - 18);
    stream.style.setProperty('--stream-available-height', `${available}px`);
  } else {
    stream.style.removeProperty('--stream-available-height');
  }
}

function alignActiveStreamToken(){
  const stream = document.getElementById('stream');
  updateStreamLayoutMode(stream);
  const track = stream.querySelector('.stream-track');
  const active = stream.querySelector('.stream-token.now');
  if(!track || !active) return;
  track.style.transform = 'translate3d(0,0,0)';
  const streamRect = stream.getBoundingClientRect();
  const activeRect = active.getBoundingClientRect();
  const vertical = stream.classList.contains('vertical');
  if(vertical){
    const targetY = streamRect.top + streamRect.height * 0.30;
    const activeY = activeRect.top + activeRect.height / 2;
    track.style.transform = `translate3d(0, ${targetY - activeY}px, 0)`;
  } else {
    const targetX = streamRect.left + streamRect.width * 0.35;
    const activeX = activeRect.left + activeRect.width / 2;
    track.style.transform = `translate3d(${targetX - activeX}px, 0, 0)`;
  }
}

function renderStream(){
  const stream = document.getElementById('stream');
  const prog = document.getElementById('songProgress');
  if(currentSong?.notationError){
    stream.textContent = 'Partition illisible. Corrige la notation dans Modifier. ' + currentSong.notationError;
    prog.textContent = '—';
    updateExpectedHighlight();
    return;
  }
  if(!currentSong || !Array.isArray(currentSong.seq)){
    stream.textContent='Choisis ou ajoute un morceau ci-dessous ⬇';
    prog.textContent='—';
    return;
  }
  prog.textContent = `${cursor} / ${currentSong.seq.length}`;
  const dispOne = ch => (isShiftChar(ch) ? '⇧' : '') + (SYMBOL_TO_DIGIT_LABEL[ch] || ch);
  const disp = t => Array.isArray(t) ? '['+t.map(dispOne).join('')+']' : dispOne(t);
  if(cursor >= currentSong.seq.length){
    stream.innerHTML = '<span class="stream-finished">Morceau terminé — bravo !</span>';
  } else {
    const tokens = currentSong.seq.map((token, index)=>{
      const classes = ['stream-token'];
      if(Array.isArray(token)) classes.push('chord');
      if(index < cursor) classes.push('done');
      if(index === cursor) classes.push('now');
      return `<span class="${classes.join(' ')}" data-index="${index}">${escapeHtml(disp(token))}</span>`;
    }).join('');
    stream.innerHTML = `<div class="stream-track">${tokens}</div>`;
    alignActiveStreamToken();
  }
  updateExpectedHighlight();
}

window.addEventListener('resize', ()=>{
  if(currentSong && Array.isArray(currentSong.seq)) alignActiveStreamToken();
});

// ---------- input handling ----------
function updateExpectedHighlight(){
  Object.values(keyEls).forEach(el=>el.classList.remove('expect','expect-shift','expect-done','expect-next'));
  if(mode==='practice' && currentSong && cursor < currentSong.seq.length){
    const token = currentSong.seq[cursor];
    const chars = Array.isArray(token) ? token : [token];
    chars.forEach((raw,i)=>{
      const el = keyEls[raw];
      if(!el) return;
      if(chordProgress.has(i)){
        if(!el.classList.contains('expect')) el.classList.add('expect-done');
      } else {
        el.classList.remove('expect-done');
        el.classList.add('expect');
        if(isShiftChar(raw)) el.classList.add('expect-shift');
      }
    });
    const nextToken = currentSong.seq[cursor+1];
    if(nextToken !== undefined){
      const nextChars = Array.isArray(nextToken) ? nextToken : [nextToken];
      nextChars.forEach(raw=>{
        const el = keyEls[raw];
        if(el && !el.classList.contains('expect') && !el.classList.contains('expect-done')) el.classList.add('expect-next');
      });
    }
  }
}

function flash(el, cls){
  el.classList.add(cls,'pressed');
  setTimeout(()=>el.classList.remove(cls,'pressed'), 130);
}

function processKeyChar(ch){
  const el = keyEls[ch];
  tone(ch);

  stats.total++;
  stats.perKey[ch] = (stats.perKey[ch]||0)+1;

  if(mode==='practice' && currentSong && cursor < currentSong.seq.length){
    const token = currentSong.seq[cursor];
    const required = Array.isArray(token) ? token : [token];
    const matchIdx = required.findIndex((exp,i)=> !chordProgress.has(i) && ch===exp);
    if(matchIdx !== -1){
      chordProgress.add(matchIdx);
      practiceStats.correct++;
      if(el) flash(el,'ok-flash');
      if(chordProgress.size >= required.length){
        chordProgress = new Set();
        cursor++;
        if(cursor >= currentSong.seq.length) reportSongCompletion();
        renderStream();
      } else {
        updateExpectedHighlight();
      }
    } else {
      practiceStats.wrong++;
      practiceStats.keyErrors[ch] = (practiceStats.keyErrors[ch]||0)+1;
      if(el) flash(el,'bad-flash');
    }
  } else {
    if(el) flash(el,'pressed');
  }
  renderStats();
}

const localHeldCodes = new Set();
window.addEventListener('keydown', (e)=>{
  if(e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = (e.target.tagName||'').toLowerCase();
  if(tag==='input' || tag==='textarea' || tag==='select' || e.target.isContentEditable) return;
  const map = CODE_MAP[e.code];
  if(!map) return;
  e.preventDefault();
  if(e.repeat || localHeldCodes.has(e.code)) return;
  localHeldCodes.add(e.code);
  const ch = e.shiftKey ? map[1] : map[0];
  processKeyChar(ch);
});
window.addEventListener('keyup', (e)=>{
  localHeldCodes.delete(e.code);
});
window.addEventListener('blur', ()=>{
  localHeldCodes.clear();
});

resetPracticeStats();
loadSongs();
