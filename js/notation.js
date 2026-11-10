// La partition (Virtual Piano) est écrite en pensant à un clavier QWERTY : chaque lettre/chiffre
// y désigne une TOUCHE PHYSIQUE précise (ex: 'q' = la touche tout en haut à gauche). Sur un clavier
// AZERTY, cette même touche physique tape un caractère différent (ex: cette touche tape 'a' en AZERTY).
// On convertit donc : caractère de la partition -> position physique QWERTY -> caractère AZERTY réel à cette position.
// Symboles obtenus en QWERTY avec Shift + rangée de chiffres (ex: Shift+6 = '^' en QWERTY) :
// désignent la même touche physique que le chiffre correspondant, mais pressée avec Shift.
const QWERTY_SHIFT_DIGIT_SYMBOL_TO_CODE = {
  '!':'Digit1','@':'Digit2','#':'Digit3','$':'Digit4','%':'Digit5',
  '^':'Digit6','&':'Digit7','*':'Digit8','(':'Digit9',')':'Digit0'
};

function resolveNoteChar(raw, format){
  if(format === 'azerty') return Object.hasOwn(AZERTY_CHAR_TO_PITCH, raw) ? raw : null;
  if(/^[0-9]$/.test(raw)){
    // chiffre de la partition -> touche physique correspondante, SANS shift (symbole AZERTY)
    return CODE_MAP['Digit'+raw][0];
  }
  if(QWERTY_SHIFT_DIGIT_SYMBOL_TO_CODE[raw]){
    // symbole Shift+chiffre QWERTY -> même touche physique, AVEC shift (chiffre AZERTY)
    return CODE_MAP[QWERTY_SHIFT_DIGIT_SYMBOL_TO_CODE[raw]][1];
  }
  if(!/^[a-z]$/i.test(raw)) return null;
  const lower = raw.toLowerCase();
  const code = QWERTY_LETTER_TO_CODE[lower];
  if(code && CODE_MAP[code]){
    const isUpper = raw !== lower;
    return CODE_MAP[code][isUpper ? 1 : 0];
  }
  return null;
}

// Lecture et Entraînement partagent les mêmes notes et accords [xyz].
// Espaces, barres et sauts de paragraphe indiquent les pauses de la lecture.
const GAP = { fast:140, short:280, rest:480, longRest:680, longerRest:900, longestRest:1150, paragraph:1300 };
function classifyGap(region){
  const pipes = (region.match(/\|/g)||[]).length;
  const spaces = (region.match(/ /g)||[]).length;
  if(pipes === 0) return spaces <= 1 ? GAP.short : GAP.longRest;
  if(pipes === 1) return spaces === 0 ? GAP.rest : (spaces === 1 ? GAP.longRest : GAP.longerRest);
  return GAP.longestRest;
}
function parseNotationWithTiming(raw, format){
  raw = raw.replace(/\r\n?/g, '\n').replace(/[^\S\n]/g, ' ');
  const paragraphs = raw.split(/\n\s*\n/);
  const tokens = [];
  const readNote = char=>{
    const note = resolveNoteChar(char, format);
    if(note === null){
      throw new SyntaxError('Touche « ' + char + ' » invalide pour le format ' + (format === 'azerty' ? 'AZERTY' : 'QWERTY') + '.');
    }
    return note;
  };
  paragraphs.forEach((para, pIdx)=>{
    const normalized = para.replace(/\n/g, '');
    let pendingGap = pIdx > 0 ? GAP.paragraph : (tokens.length ? GAP.short : 0);
    let tempoMult = 1; // modifiable en cours de route via {x0.6} (plus vite) ou {x1.4} (plus lent)
    let i = 0;
    while(i < normalized.length){
      const ch = normalized[i];
      if(ch === '{'){
        const end = normalized.indexOf('}', i);
        if(end === -1) throw new SyntaxError('Indication de tempo non fermée. Utilise {x1.4}.');
        const marker = normalized.slice(i+1, end);
        const match = /^x(\d+(?:\.\d*)?|\.\d+)$/.exec(marker);
        const tempo = match ? Number(match[1]) : NaN;
        if(!(tempo >= 0.01 && tempo <= 100)){
          throw new SyntaxError('Tempo invalide. Utilise {x1.4} avec un facteur de 0,01 à 100.');
        }
        tempoMult = tempo;
        i = end + 1;
        continue;
      }
      if(ch === ' ' || ch === '|'){
        let region = '';
        while(i < normalized.length && (normalized[i]===' ' || normalized[i]==='|')){ region += normalized[i]; i++; }
        pendingGap = classifyGap(region) * tempoMult;
        continue;
      }
      if(ch === '['){
        const end = normalized.indexOf(']', i);
        if(end === -1) throw new SyntaxError('Accord non fermé. Utilise des crochets, par exemple [az].');
        const chord = normalized.slice(i+1, end).replace(/ /g, '');
        if(!chord || /[\[{}|]/.test(chord)){
          throw new SyntaxError('Accord invalide. Mets uniquement des touches entre les crochets.');
        }
        const group = [...chord].map(readNote);
        tokens.push({note: group.length===1 ? group[0] : group, gap: pendingGap});
        pendingGap = GAP.fast * tempoMult;
        i = end + 1;
        continue;
      }
      if(ch === ']' || ch === '}'){
        throw new SyntaxError('Délimiteur « ' + ch + ' » sans ouverture.');
      }
      tokens.push({note: readNote(ch), gap: pendingGap});
      pendingGap = GAP.fast * tempoMult;
      i++;
    }
  });
  return tokens;
}

function sameTimedNotes(left, right){
  return left.length === right.length && left.every(({note},index)=>{
    const other = right[index].note;
    if(!Array.isArray(note)) return note === other;
    return Array.isArray(other) && note.length === other.length && note.every((ch,i)=>ch === other[i]);
  });
}

