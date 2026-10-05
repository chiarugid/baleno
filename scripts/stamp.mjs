// Versione dei file contro la cache del browser (nessun build step: si lancia prima del commit).
//   node scripts/stamp.mjs          aggiorna index.html e sw.js
//   node scripts/stamp.mjs --check  esce con errore se non sono aggiornati
//
// A ogni CSS e modulo JS si aggiunge ?v=<impronta del contenuto>: i fogli di stile e lo script
// principale direttamente in index.html, gli altri moduli (anche quelli caricati con import())
// tramite una import map. Cambia solo l'impronta dei file modificati, quindi dopo un push basta
// ricaricare la pagina. Le fine riga sono normalizzate: l'impronta non dipende da CRLF/LF.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BEGIN = '<!-- stamp:begin (generato da scripts/stamp.mjs, non modificare) -->';
const END = '<!-- stamp:end -->';

export function fingerprint(text) {
  return createHash('sha256').update(String(text).replace(/\r\n/g, '\n')).digest('hex').slice(0, 10);
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

// Percorsi relativi alla radice (con /) e impronta di ogni file versionato.
export function collectAssets(root = ROOT) {
  const files = [
    ...walk(join(root, 'js')).filter((f) => f.endsWith('.js')),
    ...walk(join(root, 'data')).filter((f) => f.endsWith('.js')),
    ...walk(join(root, 'css')).filter((f) => f.endsWith('.css')),
  ];
  return files
    .map((f) => ({ path: relative(root, f).split(sep).join('/'), hash: fingerprint(readFileSync(f, 'utf8')) }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

// index.html con link CSS, script principale e import map aggiornati.
export function stampHtml(html, assets) {
  const byPath = Object.fromEntries(assets.map((a) => [a.path, a.hash]));
  let out = html.replace(/(<link rel="stylesheet" href=")(css\/[^"?]+)(?:\?v=[0-9a-f]+)?(")/g,
    (m, a, path, z) => (byPath[path] ? `${a}${path}?v=${byPath[path]}${z}` : m));
  const modules = assets.filter((a) => a.path.endsWith('.js'));
  const map = { imports: Object.fromEntries(modules.map((a) => [`./${a.path}`, `./${a.path}?v=${a.hash}`])) };
  const block = `${BEGIN}\n  <script type="importmap">\n${JSON.stringify(map, null, 2).replace(/^/gm, '  ')}\n  </script>\n  ${END}`;
  out = out.includes(BEGIN)
    ? out.replace(new RegExp(`${BEGIN.replace(/[()]/g, '\\$&')}[\\s\\S]*?${END}`), block)
    : out.replace(/(\s*)(<script type="module" src="js\/app\.js)/, `$1${block}$1$2`);
  out = out.replace(/<script type="module" src="js\/app\.js(?:\?v=[0-9a-f]+)?">/, `<script type="module" src="js/app.js?v=${byPath['js/app.js']}">`);
  return out;
}

// File salvati dal service worker per l'uso offline: pagina, icona, font e ogni asset versionato.
export const STATIC_FILES = ['./', './index.html', './favicon.svg', './fonts/inter-var.woff2'];

// sw.js con versione (impronta di index.html e degli asset) ed elenco dei file aggiornati.
export function stampSw(sw, stampedHtml, assets) {
  const list = [...STATIC_FILES, ...assets.map((a) => `./${a.path}?v=${a.hash}`)];
  const version = fingerprint(stampedHtml + list.join('\n'));
  const block = `// stamp:begin (generato da scripts/stamp.mjs, non modificare)\nconst VERSION = '${version}';\nconst ASSETS = ${JSON.stringify(list, null, 2)};\n// stamp:end`;
  return sw.replace(/\/\/ stamp:begin[\s\S]*?\/\/ stamp:end/, block);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const htmlFile = join(ROOT, 'index.html');
  const swFile = join(ROOT, 'sw.js');
  const html = readFileSync(htmlFile, 'utf8');
  const sw = readFileSync(swFile, 'utf8');
  const assets = collectAssets();
  const stampedHtml = stampHtml(html, assets);
  const stampedSw = stampSw(sw, stampedHtml, assets);
  const changed = [stampedHtml !== html && 'index.html', stampedSw !== sw && 'sw.js'].filter(Boolean);
  if (process.argv.includes('--check')) {
    if (changed.length) { console.error(`${changed.join(', ')} non aggiornati: lancia node scripts/stamp.mjs`); process.exit(1); }
    console.log('index.html e sw.js aggiornati');
  } else if (changed.length) {
    if (stampedHtml !== html) writeFileSync(htmlFile, stampedHtml);
    if (stampedSw !== sw) writeFileSync(swFile, stampedSw);
    console.log(`aggiornati: ${changed.join(', ')}`);
  } else {
    console.log('nessuna modifica');
  }
}
