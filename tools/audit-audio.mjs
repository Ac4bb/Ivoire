import { readdir, readFile, stat } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const root = new URL('../', import.meta.url);
const keyboard = await readFile(new URL('js/keyboard.js', root), 'utf8');
const audio = await readFile(new URL('js/audio.js', root), 'utf8');

export function reachableAudio(){
  const element = {
    appendChild(){},
    addEventListener(){},
    dataset:{},
    options:[{value:'salamander'}],
    selectedOptions:[{textContent:'Instrument'}],
  };
  return runInNewContext(keyboard + '\n' + audio + `
    // Exécute les chemins de production sans téléchargement ni sortie audio.
    const required = new Set();
    activateAudio = ()=>true;
    warmNextSamples = ()=>warmQueue.forEach(path=>required.add(path));
    playDecodedBankSample = region=>required.add(region.sample);
    // Un cache vide fait examiner toutes les vélocités de repli.
    decodedSampleCache.has = path=>{ required.add(path); return false; };
    for (const instrument of ['salamander', 'old']) {
      currentInstrument = instrument;
      for (transposeSemis = -24; transposeSemis <= 24; transposeSemis++) {
        prepareInstrument();
        for (const note of Object.keys(AZERTY_CHAR_TO_PITCH)) {
          for (let index = 0; index <= 22; index++) {
            Math.random = ()=>Math.min(index / 22, 1 - Number.EPSILON);
            tone(note);
          }
        }
      }
    }
    [...required].sort();
  `, {
    document:{getElementById:()=>element, createElement:()=>({...element})},
    window:{addEventListener(){}},
    fetch:()=>new Promise(()=>{}),
  });
}

async function audit(){
  const required = new Set(reachableAudio());
  const piano = 'sounds/piano/';
  const names = await readdir(new URL(piano, root), {withFileTypes:true});
  const report = {};
  for (const bank of names.filter(entry=>entry.isDirectory())) {
    const dir = piano + bank.name + '/';
    const urls = new URL(encodeURIComponent(bank.name) + '/', new URL(piano, root));
    const entries = await readdir(urls, {recursive:true, withFileTypes:true});
    const files = entries.filter(entry=>entry.isFile() && entry.name.toLowerCase().endsWith('.ogg'));
    const used = new Set();
    const unused = [];
    let totalBytes = 0;
    let unusedBytes = 0;
    for (const file of files) {
      const folder = file.parentPath.slice(fileURLToPath(urls).length).replaceAll('\\','/');
      const path = dir + (folder ? folder + '/' : '') + file.name;
      const bytes = (await stat(new URL(path.split('/').map(encodeURIComponent).join('/'), root))).size;
      totalBytes += bytes;
      if (required.has(path)) used.add(path);
      else {
        unused.push(path);
        unusedBytes += bytes;
      }
    }
    const missing = [...required].filter(path=>path.startsWith(dir) && !used.has(path));
    if (missing.length) throw new Error('Échantillons Ogg manquants : ' + missing.join(', '));
    report[bank.name] = {
      total:files.length, used:used.size, unused:unused.length, totalBytes, unusedBytes,
      usedBytes:totalBytes-unusedBytes,
    };
  }
  if (Object.values(report).reduce((sum,bank)=>sum+bank.used,0) !== required.size) {
    throw new Error('Des chemins atteignables sont en dehors des banques vérifiées.');
  }
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await audit();
