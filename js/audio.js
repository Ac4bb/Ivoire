let actx;
let soundOn = true;
let transposeSemis = 0;
try{ transposeSemis = parseInt(localStorage.getItem('ivoire:transpose'), 10) || 0; }catch(e){}

let masterVolume = 0.5;
try{
  const savedVolume = parseFloat(localStorage.getItem('ivoire:volume'));
  if(Number.isFinite(savedVolume)) masterVolume = Math.min(1, Math.max(0, savedVolume));
}catch(e){}

// Banques SFZ supplémentaires. On reproduit les centres, plages et couches de vélocité
// observés dans les .sfz, sans précharger toute la banque Salamander.
const SFZ_NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
function midiNoteName(midi){
  return SFZ_NOTE_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}
function encodedSoundPath(path){
  return path.split('/').map(part => encodeURIComponent(part)).join('/');
}
function buildCenters(start, end, step){
  const centers = [];
  for(let midi=start; midi<=end; midi+=step) centers.push(midi);
  return centers;
}
function nearestMidiCenter(centers, midi){
  let best = centers[0], dist = Infinity;
  for(const center of centers){
    const d = Math.abs(center - midi);
    if(d < dist){ dist = d; best = center; }
  }
  return best;
}
function velocityLayer(layers, velocity){
  const v = Math.max(1, Math.min(127, velocity));
  return layers.find(layer => v >= layer.lo && v <= layer.hi) || layers[layers.length - 1];
}
function expressiveVelocity(base=104, spread=18){
  return Math.max(1, Math.min(127, Math.round(base + (Math.random() - 0.5) * spread)));
}

const decodedSampleCache = new Map();
const decodedSampleLoads = new Map();
const sampleFailures = new Map();
let sampleDecoder;
let preparedPaths = [];
let warmQueue = [];
let warming = 0;
let resumePending;
let playbackError = false;
const audioStatus = document.getElementById('audioStatus');

function updateAudioStatus(){
  const missing = preparedPaths.filter(path=>!decodedSampleCache.has(path));
  const failed = missing.filter(path=>sampleFailures.has(path)).length;
  const instrument = instrumentSelect.selectedOptions[0].textContent.trim();
  let message = instrument + ' — ';
  if(failed) message += 'erreur de chargement (' + failed + ' échantillon(s) indisponible(s))';
  else if(missing.length) message += 'chargement des échantillons…';
  else message += 'échantillons prêts';
  if(playbackError) message += ' · sortie audio indisponible';
  else if(actx?.state !== 'running') message += ' · son à activer par un clic ou une touche';
  if(audioStatus.textContent !== message) audioStatus.textContent = message;
}

function activateAudio(event){
  try{
    if(!actx){
      actx = new (window.AudioContext||window.webkitAudioContext)();
      actx.addEventListener('statechange', updateAudioStatus);
    }
    if(actx.state !== 'running' && (!resumePending || event?.isTrusted)){
      const pending = actx.resume().then(()=>{ playbackError = false; }, ()=>{
        playbackError = true;
      }).finally(()=>{
        if(resumePending === pending) resumePending = undefined;
        updateAudioStatus();
      });
      resumePending = pending;
    }
    return true;
  }catch(error){
    playbackError = true;
    updateAudioStatus();
    return false;
  }
}

function preloadDecodedSample(path){
  if(decodedSampleCache.has(path)) return Promise.resolve(decodedSampleCache.get(path));
  if(decodedSampleLoads.has(path)) return decodedSampleLoads.get(path);
  const previousFailure = sampleFailures.get(path);
  if(previousFailure && Date.now() < previousFailure.retryAt) return Promise.reject(previousFailure.error);
  sampleFailures.delete(path);

  const load = fetch(encodedSoundPath(path))
    .then(response => {
      if(!response.ok) throw new Error('HTTP ' + response.status + ' pour ' + path);
      return response.arrayBuffer();
    })
    .then(bytes => {
      // Décodage sans ouvrir ni reprendre la sortie audio avant un geste utilisateur.
      sampleDecoder ??= new (window.OfflineAudioContext||window.webkitOfflineAudioContext)(1, 1, 48000);
      return sampleDecoder.decodeAudioData(bytes);
    })
    .then(buffer => {
      decodedSampleCache.set(path, buffer);
      return buffer;
    })
    .catch(error => {
      sampleFailures.set(path, {error, retryAt:Date.now()+3000});
      throw error;
    })
    .finally(()=>{
      decodedSampleLoads.delete(path);
      updateAudioStatus();
    });
  decodedSampleLoads.set(path, load);
  return load;
}

function playDecodedBankSample(region, semis, gainScale){
  const midi = 36 + semis;
  const buffer = decodedSampleCache.get(region.sample);
  if(!buffer){
    preloadDecodedSample(region.sample).catch(()=>{});
    playFallbackTone(semis);
    return;
  }

  const src = actx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = Math.pow(2, (midi - region.center) / 12);
  const g = actx.createGain();
  const now = actx.currentTime;
  const startGain = masterVolume * gainScale;
  g.gain.setValueAtTime(startGain, now);
  if(startGain > 0.0001){
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, startGain * 0.72), now + Math.min(1.2, buffer.duration * 0.45));
  }
  src.connect(g);
  g.connect(actx.destination);
  src.start(now);
  src.onended = ()=>{ src.disconnect(); g.disconnect(); };
}

const SALAMANDER_DIR = 'sounds/piano/SalamanderGrandPianoV3_48khz24bit/48khz24bit/';
const SALAMANDER_CENTERS = buildCenters(21, 108, 3);
const SALAMANDER_WARM_VELOCITY = 108;
const SALAMANDER_VELOCITY_LAYERS = [
  {lo:1, hi:26, label:'1'}, {lo:27, hi:34, label:'2'}, {lo:35, hi:36, label:'3'}, {lo:37, hi:43, label:'4'},
  {lo:44, hi:46, label:'5'}, {lo:47, hi:50, label:'6'}, {lo:51, hi:56, label:'7'}, {lo:57, hi:64, label:'8'},
  {lo:65, hi:72, label:'9'}, {lo:73, hi:80, label:'10'}, {lo:81, hi:88, label:'11'}, {lo:89, hi:96, label:'12'},
  {lo:97, hi:104, label:'13'}, {lo:105, hi:112, label:'14'}, {lo:113, hi:120, label:'15'}, {lo:121, hi:127, label:'16'}
];
function salamanderRegion(midi, velocity){
  const center = nearestMidiCenter(SALAMANDER_CENTERS, midi);
  const layer = velocityLayer(SALAMANDER_VELOCITY_LAYERS, velocity);
  const name = midiNoteName(center);
  return {
    center,
    sample: SALAMANDER_DIR + name + 'v' + layer.label + '.ogg'
  };
}
function playSalamanderSample(semis){
  const midi = 36 + semis;
  const preferred = salamanderRegion(midi, expressiveVelocity(106, 22));
  if(!decodedSampleCache.has(preferred.sample)){
    // Utilise une autre vélocité de la même note pendant le chargement de la couche demandée.
    for(const velocity of [SALAMANDER_WARM_VELOCITY, 100, 112, 96]){
      const ready = salamanderRegion(midi, velocity);
      if(!decodedSampleCache.has(ready.sample)) continue;
      preloadDecodedSample(preferred.sample).catch(()=>{});
      playDecodedBankSample(ready, semis, 0.95);
      return;
    }
  }
  playDecodedBankSample(preferred, semis, 0.95);
}

const OLD_PIANO_DIR = 'sounds/piano/PianoFB SFZ+WAV-20200401/samples/';
const OLD_PIANO_RANGES = [
  {lo:19, hi:20, center:20, name:'G#0'},
  {lo:24, hi:25, center:24, name:'C1'},
  {lo:26, hi:27, center:27, name:'D#1'},
  {lo:33, hi:34, center:33, name:'A1'},
  {lo:35, hi:36, center:36, name:'C2'},
  {lo:41, hi:42, center:41, name:'F2'},
  {lo:43, hi:44, center:44, name:'G#2'},
  {lo:51, hi:52, center:52, name:'E3'},
  {lo:66, hi:67, center:67, name:'G4'},
  {lo:70, hi:71, center:71, name:'B4'},
  {lo:100, hi:101, center:101, name:'F7'},
  {lo:107, hi:108, center:107, name:'B7'}
];
function oldPianoRegion(midi){
  const clamped = Math.max(19, Math.min(108, midi));
  const range = OLD_PIANO_RANGES.find(item => clamped >= item.lo && clamped <= item.hi);
  const center = range ? range.center : clamped;
  const name = range ? range.name : midiNoteName(center);
  return {
    center,
    sample: OLD_PIANO_DIR + name + '.ogg'
  };
}
function playOldPianoSample(semis){
  const midi = 36 + semis;
  playDecodedBankSample(oldPianoRegion(midi), semis, 0.92);
}

function warmNextSamples(){
  while(warming < 2 && warmQueue.length){
    const path = warmQueue.shift();
    if(decodedSampleCache.has(path)) continue;
    warming++;
    preloadDecodedSample(path).catch(()=>{}).finally(()=>{
      warming--;
      warmNextSamples();
    });
  }
}

function prepareInstrument(){
  const midis = Object.values(AZERTY_CHAR_TO_PITCH).map(semis=>36 + semis + transposeSemis);
  midis.sort((a,b)=>Math.abs(a-60)-Math.abs(b-60));
  const region = currentInstrument === 'salamander'
    ? midi=>salamanderRegion(midi, SALAMANDER_WARM_VELOCITY)
    : oldPianoRegion;
  preparedPaths = [...new Set(midis.map(midi=>region(midi).sample))];
  // Au changement de banque, seuls les chargements déjà partis continuent.
  warmQueue = preparedPaths.filter(path=>!decodedSampleCache.has(path));
  updateAudioStatus();
  warmNextSamples();
}

// ---------- instrument sélectionné ----------
let currentInstrument = 'salamander';
try{ currentInstrument = localStorage.getItem('ivoire:instrument') || 'salamander'; }catch(e){}
const instrumentSelect = document.getElementById('instrumentSelect');
if(instrumentSelect){
  if(![...instrumentSelect.options].some(option => option.value === currentInstrument)) currentInstrument = 'salamander';
  instrumentSelect.value = currentInstrument;
  try{ localStorage.setItem('ivoire:instrument', currentInstrument); }catch(err){}
  instrumentSelect.addEventListener('change', e=>{
    currentInstrument = e.target.value;
    try{ localStorage.setItem('ivoire:instrument', currentInstrument); }catch(err){}
    prepareInstrument();
  });
}

// ---------- transposition (décale toutes les notes de X demi-tons) ----------
const transposeInput = document.getElementById('transposeInput');
if(transposeInput){
  transposeInput.value = transposeSemis;
  transposeInput.addEventListener('change', e=>{
    transposeSemis = parseInt(e.target.value, 10) || 0;
    transposeSemis = Math.max(-24, Math.min(24, transposeSemis));
    transposeInput.value = transposeSemis;
    try{ localStorage.setItem('ivoire:transpose', transposeSemis); }catch(err){}
    prepareInstrument();
  });
}

function tone(ch){
  if(!soundOn) return;
  let semis = AZERTY_CHAR_TO_PITCH[ch];
  if(semis === undefined || !activateAudio()) return;
  semis += transposeSemis;

  if(currentInstrument === 'salamander'){
    playSalamanderSample(semis);
  }else{
    playOldPianoSample(semis);
  }
}

function playFallbackTone(semis){
  if(masterVolume <= 0) return;
  const freq = 130.81 * Math.pow(2, semis/12);
  const o = actx.createOscillator();
  const g = actx.createGain();
  o.type='triangle';
  o.frequency.value = freq;
  const gain = 0.36 * masterVolume;
  g.gain.setValueAtTime(gain, actx.currentTime);
  g.gain.exponentialRampToValueAtTime(Math.min(0.001, gain), actx.currentTime+0.5);
  o.connect(g); g.connect(actx.destination);
  o.start(); o.stop(actx.currentTime+0.5);
}

window.addEventListener('keydown', activateAudio);
window.addEventListener('pointerup', activateAudio);
prepareInstrument();

