// Touches physiques du piano AZERTY. La touche « m » (code Semicolon) est hors de la gamme Virtual Piano.
const CODE_MAP = {
  Digit1:['&','1'],Digit2:['é','2'],Digit3:['"','3'],Digit4:['\'','4'],Digit5:['(','5'],
  Digit6:['-','6'],Digit7:['è','7'],Digit8:['_','8'],Digit9:['ç','9'],Digit0:['à','0'],
  KeyQ:['a','A'],KeyW:['z','Z'],KeyE:['e','E'],KeyR:['r','R'],KeyT:['t','T'],
  KeyY:['y','Y'],KeyU:['u','U'],KeyI:['i','I'],KeyO:['o','O'],KeyP:['p','P'],
  KeyA:['q','Q'],KeyS:['s','S'],KeyD:['d','D'],KeyF:['f','F'],KeyG:['g','G'],
  KeyH:['h','H'],KeyJ:['j','J'],KeyK:['k','K'],KeyL:['l','L'],
  KeyZ:['w','W'],KeyX:['x','X'],KeyC:['c','C'],KeyV:['v','V'],KeyB:['b','B'],
  KeyN:['n','N'],KeyM:[',','?']
};
// Position physique QWERTY d'origine de chaque touche (nécessaire pour convertir la partition ET pour la hauteur des notes).
const QWERTY_LETTER_TO_CODE = {
  q:'KeyQ', w:'KeyW', e:'KeyE', r:'KeyR', t:'KeyT', y:'KeyY', u:'KeyU', i:'KeyI', o:'KeyO', p:'KeyP',
  a:'KeyA', s:'KeyS', d:'KeyD', f:'KeyF', g:'KeyG', h:'KeyH', j:'KeyJ', k:'KeyK', l:'KeyL',
  z:'KeyZ', x:'KeyX', c:'KeyC', v:'KeyV', b:'KeyB', n:'KeyN', m:'KeyM'
};

const ROWS = [
  ['&','é','"','\'','(','-','è','_','ç','à'],
  ['a','z','e','r','t','y','u','i','o','p'],
  ['q','s','d','f','g','h','j','k','l'],
  ['w','x','c','v','b','n',',']
];

// Les 36 touches (1234567890 qwertyuiop asdfghjkl zxcvbnm) correspondent aux touches BLANCHES
// du piano (notes naturelles do-ré-mi-fa-sol-la-si qui se répètent), PAS à une gamme chromatique.
// La variante avec Maj est un demi-ton au-dessus.
const STANDARD_ORDER = ['1','2','3','4','5','6','7','8','9','0','q','w','e','r','t','y','u','i','o','p','a','s','d','f','g','h','j','k','l','z','x','c','v','b','n','m'];
const NATURAL_SEMITONES = [0,2,4,5,7,9,11]; // do ré mi fa sol la si
const CODE_TO_QWERTY = {};
Object.entries(QWERTY_LETTER_TO_CODE).forEach(([letter,code])=>{ CODE_TO_QWERTY[code]=letter; });
for(let d=0; d<=9; d++){ CODE_TO_QWERTY['Digit'+d] = String(d); }
const AZERTY_CHAR_TO_PITCH = {};
Object.entries(CODE_MAP).forEach(([code,[lo,hi]])=>{
  const qwertyChar = CODE_TO_QWERTY[code];
  if(qwertyChar === undefined) return;
  const i = STANDARD_ORDER.indexOf(qwertyChar);
  if(i < 0) return;
  const octave = Math.floor(i/7);
  const noteIdx = i % 7;
  const semis = octave*12 + NATURAL_SEMITONES[noteIdx];
  AZERTY_CHAR_TO_PITCH[lo] = semis;
  AZERTY_CHAR_TO_PITCH[hi] = semis + 1;
});

const SYMBOL_TO_DIGIT_LABEL = {'&':'1','é':'2','"':'3','\'':'4','(':'5','-':'6','è':'7','_':'8','ç':'9','à':'0'};

// ---------- build piano ----------
const piano = document.getElementById('piano');
const keyEls = {};
ROWS.forEach(row=>{
  const prow = document.createElement('div'); prow.className='prow';
  row.forEach(k=>{
    const el = document.createElement('div');
    el.className='pkey';
    el.textContent = SYMBOL_TO_DIGIT_LABEL[k] || k;
    el.dataset.key = k;
    prow.appendChild(el);
    keyEls[k]=el;
  });
  piano.appendChild(prow);
});

// Une touche physique tape 2 caractères (sans/avec shift) mais n'a qu'un seul élément visuel :
// on fait pointer le caractère "shifté" vers ce même élément pour que la surbrillance fonctionne.
Object.values(CODE_MAP).forEach(([lo,hi])=>{
  if(keyEls[lo] && !keyEls[hi]) keyEls[hi] = keyEls[lo];
});
function isShiftChar(ch){
  return Object.values(CODE_MAP).some(([lo,hi])=>hi===ch && lo!==ch);
}

