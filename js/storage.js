const IvoireStorage = (() => {
  let databasePromise;
  let cataloguePromise;
  const MAX_FILE_BYTES = 512 * 1024;
  const MAX_BATCH_BYTES = 4 * 1024 * 1024;
  const MAX_NOTATION_LENGTH = 64 * 1024;
  const MAX_EVENTS = 10000;
  const finiteIn = (value, min, max)=>Number.isFinite(value) && value >= min && value <= max;
  const isRecord = value=>value !== null && typeof value === 'object' && !Array.isArray(value);
  const isShortText = (value, limit)=>typeof value === 'string' && value.length <= limit;
  const isFormat = value=>value === 'azerty' || value === 'qwerty';
  const metadataChecks = {
    format:isFormat,
    favorite:value=>typeof value === 'boolean',
    duration:value=>finiteIn(value, 0, 86400),
    difficulty:value=>finiteIn(value, 0, 100),
    difficultyLabel:value=>isShortText(value,120),
    type:value=>Array.isArray(value) && value.length <= 16 && value.every(item=>isShortText(item,120)),
    midiGaps:value=>Array.isArray(value) && value.length <= MAX_EVENTS &&
      value.every(gap=>finiteIn(gap,0,60000)),
  };

  function requestResult(request){
    return new Promise((resolve, reject)=>{
      request.onsuccess = ()=>resolve(request.result);
      request.onerror = ()=>reject(request.error);
    });
  }

  function openDatabase(){
    if(!databasePromise){
      databasePromise = Promise.resolve().then(()=>{
        const request = indexedDB.open('ivoire', 1);
        request.onupgradeneeded = ()=>{
          const db = request.result;
          db.createObjectStore('songs', {keyPath:'id'});
          db.createObjectStore('progress', {keyPath:'id'});
          db.createObjectStore('backups', {keyPath:'id', autoIncrement:true});
        };
        return requestResult(request);
      }).then(db=>{
        db.onversionchange = ()=>{
          db.close();
          databasePromise = undefined;
        };
        return db;
      }).catch(error=>{
        databasePromise = undefined;
        throw error;
      });
    }
    return databasePromise;
  }

  async function transact(names, mode, operation){
    const db = await openDatabase();
    const tx = db.transaction(names, mode);
    const completed = new Promise((resolve, reject)=>{
      tx.oncomplete = resolve;
      tx.onabort = ()=>reject(tx.error || new Error('Transaction annulée.'));
    });
    // Une requête peut échouer avant que l’opération ait fini de traiter son erreur.
    completed.catch(()=>{});
    const stores = Object.fromEntries(names.map(name=>[name, tx.objectStore(name)]));
    try{
      const result = await operation(stores);
      await completed;
      return result;
    }catch(error){
      try{ tx.abort(); }catch(e){ /* transaction déjà terminée */ }
      await completed.catch(()=>{});
      throw error;
    }
  }

  async function fetchCatalogue(){
    const response = await fetch('songs/catalog.json');
    if(!response.ok) throw new Error('Catalogue indisponible (HTTP ' + response.status + ').');
    const data = await response.json();
    if(!Array.isArray(data) || data.some(song=>typeof song?.id !== 'string' ||
      typeof song.title !== 'string' || typeof song.notation !== 'string')){
      throw new Error('Catalogue invalide.');
    }
    return data;
  }

  function getCatalogue(){
    if(!cataloguePromise){
      cataloguePromise = fetchCatalogue().catch(error=>{
        cataloguePromise = undefined;
        throw error;
      });
    }
    return cataloguePromise;
  }

  function songId(title){
    return title.replaceAll(' ', '_').toLowerCase();
  }

  function sanitizeTitle(title){
    const safeTitle = title.replace(/[^\p{L}\p{N} _-]/gu, '').trim().replace(/\s+/g, ' ').slice(0,120);
    if(!safeTitle || songId(safeTitle) === 'demo') throw new Error('Titre invalide ou réservé.');
    return safeTitle;
  }

  function validJsonKey(key){
    return key.length <= 120 && !['__proto__','constructor','prototype'].includes(key);
  }

  function boundedJson(value, depth=0){
    if(depth > 4) return false;
    if(value === null || typeof value === 'boolean' || Number.isFinite(value) || isShortText(value,2048)) return true;
    if(Array.isArray(value)) return value.length <= 128 && value.every(item=>boundedJson(item,depth+1));
    if(!isRecord(value)) return false;
    const entries = Object.entries(value);
    return entries.length <= 32 && entries.every(([key,item])=>validJsonKey(key) && boundedJson(item,depth+1));
  }

  function readNotation(notation, strict=false){
    const header = /^(##meta:|##duration:)/.exec(notation);
    if(!header) return {meta:{}, notation};
    const newline = notation.indexOf('\n');
    const end = newline < 0 ? notation.length : newline;
    const body = newline < 0 ? '' : notation.slice(newline+1);
    let meta;
    try{
      if(end > 256 * 1024) throw new Error();
      const value = notation.slice(header[0].length,end).trim();
      meta = header[0] === '##meta:' ? JSON.parse(value) : {duration:value ? Number(value) : NaN};
      if(!isRecord(meta)) throw new Error();
    }catch(e){
      if(strict) throw new Error('En-tête de métadonnées invalide.');
      return {meta:{}, notation:body};
    }
    if(strict){
      const entries = Object.entries(meta);
      if(entries.length > 32) throw new Error('Trop de champs dans les métadonnées.');
      for(const [key,value] of entries){
        const valid = Object.hasOwn(metadataChecks,key) ? metadataChecks[key](value) : boundedJson(value);
        if(!validJsonKey(key) || !valid) throw new Error('Métadonnée invalide : « ' + key.slice(0,120) + ' ».');
      }
    }
    return {meta, notation:body};
  }

  function extractMeta(notation){
    const raw = readNotation(notation);
    // Les anciennes entrées restent intactes dans IndexedDB. Seul l’affichage filtre les champs invalides.
    const meta = Object.fromEntries(Object.entries(raw.meta)
      .filter(([key,value])=>Object.hasOwn(metadataChecks,key) && metadataChecks[key](value)));
    return {meta, notation:raw.notation};
  }

  function validateNotation(notation, meta, allowLegacyTimingMismatch=false){
    if(notation.length > MAX_NOTATION_LENGTH) throw new Error('La notation dépasse 65 536 caractères.');
    const timed = parseNotationWithTiming(notation, meta.format);
    if(!timed.length){
      throw new Error('Aucune touche reconnue dans cette notation.');
    }
    if(timed.length > MAX_EVENTS || timed.some(({note})=>Array.isArray(note) && note.length > 64)){
      throw new Error('La partition dépasse 10 000 événements ou 64 notes par accord.');
    }
    if(!allowLegacyTimingMismatch && meta.midiGaps && meta.midiGaps.length !== timed.length){
      throw new Error('Le nombre de valeurs midiGaps doit correspondre aux événements de la partition.');
    }
    return timed;
  }

  function formatNotation(meta, notation){
    return '##meta:' + JSON.stringify(meta) + '\n' + notation;
  }

  function visibleSongs(catalogue, overrides){
    const songs = new Map(catalogue.map(song=>[song.id, song]));
    for(const song of overrides){
      if(song.deleted) songs.delete(song.id);
      else songs.set(song.id, song);
    }
    return songs;
  }

  async function listSongs(){
    const [catalogue, overrides] = await Promise.all([
      getCatalogue(),
      transact(['songs'], 'readonly', ({songs})=>requestResult(songs.getAll())),
    ]);
    const catalogueIds = new Set(catalogue.map(song=>song.id));
    return [...visibleSongs(catalogue, overrides).values()].map(song=>({
      ...song, personal:!catalogueIds.has(song.id),
    })).sort((a,b)=>{
      const left = a.title.toLowerCase(), right = b.title.toLowerCase();
      return left < right ? -1 : left > right ? 1 : 0;
    });
  }

  async function changeSong(makeRecord){
    const catalogue = await getCatalogue();
    return transact(['songs'], 'readwrite', async ({songs})=>{
      const visible = visibleSongs(catalogue, await requestResult(songs.getAll()));
      const record = makeRecord(visible, catalogue);
      await requestResult(songs.put(record));
      return record.id;
    });
  }

  function requireSong(songs, id){
    const song = songs.get(id);
    if(!song) throw new Error('Morceau introuvable.');
    return song;
  }

  function checkTitle(songs, title, exceptId){
    if([...songs.values()].some(song=>song.id !== exceptId && songId(song.title) === songId(title))){
      throw new Error('Un morceau porte déjà ce nom.');
    }
  }

  async function addSong(title, rawNotation, format){
    if(rawNotation.length > MAX_FILE_BYTES) throw new Error('La partition est trop volumineuse.');
    const {meta, notation} = readNotation(rawNotation, true);
    if(format !== undefined){
      if(!isFormat(format)) throw new Error('Format de partition invalide.');
      meta.format = format;
    }
    validateNotation(notation, meta);
    return changeSong(songs=>{
      title = sanitizeTitle(title);
      const id = songId(title);
      if(songs.has(id)) throw new Error('Un morceau utilise déjà cet identifiant.');
      checkTitle(songs, title);
      return {id, title, notation:Object.keys(meta).length ? formatNotation(meta, notation) : notation};
    });
  }

  function editSong(id, title, notation, original){
    return changeSong(songs=>{
      const current = requireSong(songs, id);
      const previous = readNotation(current.notation);
      if(current.title !== original.title || previous.notation !== original.notation){
        throw new Error('Ce morceau a changé. Rouvre-le avant de le modifier.');
      }
      title = title === current.title ? title : sanitizeTitle(title);
      checkTitle(songs, title, id);
      if(previous.notation === notation) return {...current, title};

      const meta = {...previous.meta};
      const timed = validateNotation(notation, {format:meta.format});
      // La mise en forme seule ne change pas les intervalles MIDI ni la durée cible.
      let previousTimed = [];
      try{
        previousTimed = parseNotationWithTiming(previous.notation, meta.format);
      }catch(error){
        if(!(error instanceof SyntaxError)) throw error;
      }
      if(!sameTimedNotes(previousTimed, timed)){
        delete meta.midiGaps;
        delete meta.duration;
      }
      return {id, title, notation:formatNotation(meta, notation)};
    });
  }

  function deleteSong(id){
    return changeSong((songs,catalogue)=>{
      if(catalogue.some(song=>song.id === id)) throw new Error('Les morceaux du catalogue sont protégés.');
      requireSong(songs, id);
      return {id, deleted:true};
    });
  }

  function toggleFavorite(id){
    return changeSong(songs=>{
      const song = requireSong(songs, id);
      const {meta, notation} = readNotation(song.notation);
      return {...song, notation:formatNotation({...meta, favorite:!meta.favorite}, notation)};
    });
  }

  function recordCompletion(id, {accuracy, timestamp, keyErrors}){
    return transact(['progress'], 'readwrite', async ({progress})=>{
      const previous = await requestResult(progress.get(id));
      const entry = previous?.entry || {timesPlayed:0, bestAccuracy:0, lastPlayed:null, keyErrors:{}};
      const merged = new Map(Object.entries(entry.keyErrors));
      for(const [key, count] of Object.entries(keyErrors)){
        merged.set(key, (merged.get(key) ?? 0) + count);
      }
      const updated = {
        ...entry,
        timesPlayed:entry.timesPlayed + 1,
        bestAccuracy:Math.max(entry.bestAccuracy, accuracy),
        lastPlayed:timestamp > (entry.lastPlayed || '') ? timestamp : entry.lastPlayed,
        keyErrors:Object.fromEntries(merged),
      };
      await requestResult(progress.put({id, entry:updated}));
    });
  }

  function validateImportSizes(files){
    if(files.length > 100) throw new Error('Sélectionne au maximum 100 fichiers par import.');
    let total = 0;
    for(const {name,size} of files){
      if(!isShortText(name,255)) throw new Error('Nom de fichier invalide ou trop long.');
      if(size > MAX_FILE_BYTES) throw new Error('« ' + name + ' » dépasse la limite de 512 Kio par fichier.');
      total += size;
    }
    if(total > MAX_BATCH_BYTES) throw new Error('La sélection dépasse la limite de 4 Mio par import.');
  }

  function parseLegacyProgress(content){
    let data;
    try{ data = JSON.parse(content); }
    catch(e){ throw new Error('JSON malformé dans progress.json.'); }
    if(!isRecord(data)) throw new Error('Progression invalide.');
    const rows = Object.entries(data);
    if(rows.length > 2000) throw new Error('La progression dépasse 2 000 morceaux.');
    return rows.map(([id,entry])=>{
      if(!isShortText(id,255) || !isRecord(entry) || !Number.isSafeInteger(entry.timesPlayed) || entry.timesPlayed < 0 ||
        !finiteIn(entry.bestAccuracy,0,100) || (entry.lastPlayed !== null && !isShortText(entry.lastPlayed,64)) ||
        !isRecord(entry.keyErrors)){
        throw new Error('Progression invalide pour « ' + id.slice(0,120) + ' ».');
      }
      const errors = Object.entries(entry.keyErrors);
      const extra = Object.entries(entry).filter(([key])=>!['timesPlayed','bestAccuracy','lastPlayed','keyErrors'].includes(key));
      if(errors.length > 128 || errors.some(([key,value])=>key.length > 16 || !Number.isSafeInteger(value) || value < 0) ||
        extra.length > 32 || extra.some(([key,value])=>!validJsonKey(key) || !boundedJson(value))){
        throw new Error('Progression invalide pour « ' + id.slice(0,120) + ' ».');
      }
      return {id, entry};
    });
  }

  function parseLegacyFiles(files){
    if(files.length > 100) throw new Error('Sélectionne au maximum 100 fichiers par import.');
    const encoder = new TextEncoder();
    validateImportSizes(files.map(({name,text})=>({
      name, size:text.length > MAX_FILE_BYTES ? text.length : encoder.encode(text).byteLength,
    })));
    const songs = [];
    let progress;
    for(const {name, text} of files){
      const content = text.replace(/^\uFEFF/, '');
      if(name === 'progress.json'){
        if(progress) throw new Error('Sélectionne un seul fichier progress.json.');
        progress = parseLegacyProgress(content);
      }else if(name.endsWith('.txt')){
        const title = name.slice(0,-4);
        const id = songId(title);
        if(id === 'demo' || !content.trim()) throw new Error('Partition invalide : ' + name);
        const normalized = content.replace(/\r\n?/g, '\n');
        try{
          const {meta,notation} = readNotation(normalized,true);
          // Certains anciens exports ont des intervalles valides mais désalignés.
          // Ils restent importables et la lecture reprend alors le rythme de la notation.
          validateNotation(notation,meta,meta.format === undefined);
        }catch(error){
          throw new Error(name + ' : ' + error.message);
        }
        songs.push({id, title, notation:normalized});
      }else{
        throw new Error('Fichier non reconnu : ' + name);
      }
    }
    return {songs, progress:progress || []};
  }

  async function importLegacy(files){
    const incoming = parseLegacyFiles(files);
    const catalogue = await getCatalogue();
    return transact(['songs', 'progress', 'backups'], 'readwrite', async ({songs, progress, backups})=>{
      const [previousSongs, previousProgress] = await Promise.all([
        requestResult(songs.getAll()), requestResult(progress.getAll()),
      ]);
      const visible = visibleSongs(catalogue, previousSongs);
      const occupiedIds = new Set([...visible.keys(), ...previousSongs.map(song=>song.id)]);
      const occupiedTitles = new Set([...visible.values()].map(song=>songId(song.title)));
      const progressIds = new Set(previousProgress.map(row=>row.id));
      const newSongs = [];
      const newProgress = [];
      for(const song of incoming.songs){
        const titleId = songId(song.title);
        if(occupiedIds.has(song.id) || occupiedTitles.has(titleId)) continue;
        occupiedIds.add(song.id);
        occupiedTitles.add(titleId);
        newSongs.push(song);
      }
      for(const row of incoming.progress){
        if(progressIds.has(row.id)) continue;
        newProgress.push(row);
      }
      // La sauvegarde et les écritures sont validées ensemble, ou toutes annulées.
      let backupId = null;
      if(newSongs.length || newProgress.length){
        backupId = await requestResult(backups.add({
          createdAt:new Date().toISOString(), files, previousSongs, previousProgress,
        }));
        await Promise.all([
          ...newSongs.map(async song=>requestResult(songs.add(song))),
          ...newProgress.map(async row=>requestResult(progress.add(row))),
        ]);
      }
      return {
        backupId, songs:newSongs.length, progress:newProgress.length,
        skippedSongs:incoming.songs.length - newSongs.length,
        skippedProgress:incoming.progress.length - newProgress.length,
      };
    });
  }

  return {
    listSongs, addSong, editSong, deleteSong, toggleFavorite, extractMeta, recordCompletion, importLegacy, validateImportSizes,
    listBackups:()=>transact(['backups'], 'readonly', ({backups})=>requestResult(backups.getAll())),
  };
})();
