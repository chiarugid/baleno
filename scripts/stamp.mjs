// Versione dei file contro la cache del browser (nessun build step: si lancia prima del commit).
//   node scripts/stamp.mjs          aggiorna index.html
//   node scripts/stamp.mjs --check  esce con errore se index.html non è aggiornato
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

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const file = join(ROOT, 'index.html');
  const html = readFileSync(file, 'utf8');
  const stamped = stampHtml(html, collectAssets());
  if (process.argv.includes('--check')) {
    if (stamped !== html) { console.error('index.html non aggiornato: lancia node scripts/stamp.mjs'); process.exit(1); }
    console.log('index.html aggiornato');
  } else if (stamped !== html) {
    writeFileSync(file, stamped);
    console.log('index.html aggiornato con le nuove impronte');
  } else {
    console.log('nessuna modifica');
  }
}
