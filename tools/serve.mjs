import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reachableAudio } from './audit-audio.mjs';

const root = await realpath(fileURLToPath(new URL('../', import.meta.url)));
const args = process.argv.slice(2);
const port = Number(args.find(arg=>arg !== '--public') ?? 0);
if(!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Port HTTP invalide.');
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8',
  '.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.ogg':'audio/ogg',
  '.webp':'image/webp','.png':'image/png','.ttf':'font/ttf','.woff2':'font/woff2'};
const fontSubsets = {
  fraunces:['vietnamese','latin-ext','latin'],
  inter:['cyrillic-ext','cyrillic','greek-ext','greek','vietnamese','latin-ext','latin'],
  jetbrainsmono:['cyrillic-ext','cyrillic','greek','vietnamese','latin-ext','latin'],
};
const publicAssets = new Set([
  '/index.html', '/styles.css', '/songs/catalog.json',
  '/assets/images/guts_175.webp', '/assets/images/favicon-16.png', '/assets/images/favicon-32.png',
  '/assets/images/favicon-192.png', '/assets/images/apple-touch-icon.png',
  '/assets/fonts/fonts.css', '/assets/fonts/gloria-hallelujah/GloriaHallelujah.ttf',
  ...Object.entries(fontSubsets).flatMap(([family, subsets])=>
    subsets.map(subset=>'/assets/fonts/' + family + '/' + subset + '.woff2')),
  '/js/audio.js', '/js/keyboard.js', '/js/notation.js', '/js/storage.js',
  '/js/songs.js', '/js/training.js', '/js/training-controls.js',
  '/js/interface/errors.js', '/js/interface/song-options.js',
  '/js/interface/theme-init.js', '/js/interface/theme.js',
  ...reachableAudio().map(path=>'/'+path),
]);

createServer(async (request, response)=>{
  try{
    const port = request.socket.localPort;
    const host = request.headers.host?.toLowerCase();
    if(!['127.0.0.1','localhost'].some(name=>host === name+':'+port || (port === 80 && host === name))){
      return response.writeHead(403).end();
    }
    // Inspecter le chemin brut avant qu’un parseur d’URL ne résolve ses segments.
    const rawPath = request.url.split('?',1)[0];
    let path = decodeURIComponent(rawPath);
    if(!path.startsWith('/') || path.startsWith('//') ||
      /%2f|%5c/i.test(rawPath) || /[%:\\\x00-\x1f\x7f]/.test(path) ||
      path.split('/').some(segment=>segment === '.' || segment === '..')){
      return response.writeHead(400).end();
    }
    if(path === '/') path = '/index.html';
    if(!['GET','HEAD'].includes(request.method) || !publicAssets.has(path)){
      return response.writeHead(404).end();
    }
    const expected = resolve(root, '.' + path);
    const file = await realpath(expected);
    if(file !== expected || !file.startsWith(root + sep)) return response.writeHead(404).end();
    const info = await stat(file);
    if(!info.isFile()) return response.writeHead(404).end();
    response.writeHead(200, {'Content-Type':types[extname(file)],'Content-Length':info.size,
      'X-Content-Type-Options':'nosniff'});
    if(request.method === 'HEAD') return response.end();
    createReadStream(file).on('error', error=>response.destroy(error)).pipe(response);
  }catch(error){
    response.writeHead(error.code === 'ENOENT' ? 404 : 400).end();
  }
}).listen(port, '127.0.0.1', function(){
  console.log(`Ivoire · http://127.0.0.1:${this.address().port}/`);
});
