// Calcolatore subnet IPv4/IPv6.
// Le funzioni di calcolo (parse*, format*, calc*, subdivide) non usano il DOM
// e sono importate anche da tests/run.mjs.

import { h, fmtInt, kvList, badge, copyText, toast, uid } from '../ui/dom.js';
import { dashlet } from '../ui/dashlet.js';
import { dataTable } from '../ui/table.js';

// ---------------------------------------------------------------- IPv4

export function parseIPv4(text) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(text).trim());
  if (!m) return null;
  let value = 0;
  for (let i = 1; i <= 4; i++) {
    const part = m[i];
    if (part.length > 1 && part[0] === '0') return null; // evita ambiguità ottale
    const n = Number(part);
    if (n > 255) return null;
    value = value * 256 + n;
  }
  return value;
}

export function formatIPv4(n) {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

export function maskFromPrefix(prefix) {
  return prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
}

export function prefixFromMask(mask) {
  const inverted = ~mask >>> 0;
  if ((inverted & (inverted + 1)) !== 0) return null; // bit non contigui
  let prefix = 0;
  for (let bit = 31; bit >= 0 && (mask >>> bit) & 1; bit--) prefix++;
  return prefix;
}

const V4_TYPES = [
  ['0.0.0.0/8', '"Questa rete" (RFC 1122)'],
  ['10.0.0.0/8', 'Privato (RFC 1918)'],
  ['100.64.0.0/10', 'CGNAT (RFC 6598)'],
  ['127.0.0.0/8', 'Loopback'],
  ['169.254.0.0/16', 'Link-local (APIPA)'],
  ['172.16.0.0/12', 'Privato (RFC 1918)'],
  ['192.0.0.0/24', 'Assegnazioni IETF (RFC 6890)'],
  ['192.0.2.0/24', 'Documentazione TEST-NET-1'],
  ['192.88.99.0/24', '6to4 relay anycast (deprecato)'],
  ['192.168.0.0/16', 'Privato (RFC 1918)'],
  ['198.18.0.0/15', 'Benchmark (RFC 2544)'],
  ['198.51.100.0/24', 'Documentazione TEST-NET-2'],
  ['203.0.113.0/24', 'Documentazione TEST-NET-3'],
  ['224.0.0.0/4', 'Multicast'],
  ['255.255.255.255/32', 'Broadcast limitato'],
  ['240.0.0.0/4', 'Riservato (classe E)'],
].map(([cidr, label]) => {
  const [addr, len] = cidr.split('/');
  const prefix = Number(len);
  return { network: parseIPv4(addr), mask: maskFromPrefix(prefix), label };
});

export function ipv4Type(addr) {
  const hit = V4_TYPES.find((t) => ((addr & t.mask) >>> 0) === t.network);
  return hit ? hit.label : 'Pubblico';
}

function ipv4Class(addr) {
  const first = addr >>> 24;
  if (first < 128) return 'A';
  if (first < 192) return 'B';
  if (first < 224) return 'C';
  if (first < 240) return 'D (multicast)';
  return 'E (riservata)';
}

export function calcIPv4(addr, prefix) {
  const mask = maskFromPrefix(prefix);
  const wildcard = ~mask >>> 0;
  const network = (addr & mask) >>> 0;
  const lastAddr = (network | wildcard) >>> 0;
  const total = 2 ** (32 - prefix);
  let first = network + 1;
  let last = lastAddr - 1;
  let broadcast = lastAddr;
  let usable = total - 2;
  if (prefix === 32) {
    first = last = network;
    broadcast = null;
    usable = 1;
  } else if (prefix === 31) {
    first = network;
    last = lastAddr;
    broadcast = null;
    usable = 2;
  }
  return {
    version: 4, address: addr, prefix, mask, wildcard, network, broadcast,
    first, last, total, usable, class: ipv4Class(addr), type: ipv4Type(addr),
  };
}

// ---------------------------------------------------------------- IPv6

const V6_MAX = (1n << 128n) - 1n;

export function parseIPv6(text) {
  let s = String(text).trim().toLowerCase();
  if (!s || /[^0-9a-f:.]/.test(s)) return null;

  if (s.includes('.')) {
    const cut = s.lastIndexOf(':');
    const v4 = parseIPv4(s.slice(cut + 1));
    if (cut < 0 || v4 == null) return null;
    s = `${s.slice(0, cut + 1)}${(v4 >>> 16).toString(16)}:${(v4 & 0xffff).toString(16)}`;
  }

  const halves = s.split('::');
  if (halves.length > 2) return null;
  const split = (part) => (part === '' ? [] : part.split(':'));
  const head = split(halves[0]);
  const tail = halves.length === 2 ? split(halves[1]) : [];
  if (halves.length === 1 && head.length !== 8) return null;
  if (halves.length === 2 && head.length + tail.length > 7) return null;

  const groups = [...head, ...Array(8 - head.length - tail.length).fill('0'), ...tail];
  let value = 0n;
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    value = (value << 16n) | BigInt(parseInt(g, 16));
  }
  return value;
}

function groupsOf(value) {
  const groups = [];
  for (let i = 7; i >= 0; i--) groups.push(Number((value >> BigInt(i * 16)) & 0xffffn));
  return groups;
}

export function formatIPv6Expanded(value) {
  return groupsOf(value).map((g) => g.toString(16).padStart(4, '0')).join(':');
}

// Forma compressa secondo RFC 5952.
export function formatIPv6(value) {
  if (value >> 32n === 0xffffn) return `::ffff:${formatIPv4(Number(value & 0xffffffffn))}`;
  const groups = groupsOf(value);
  let bestStart = -1;
  let bestLen = 1;
  for (let i = 0; i < 8;) {
    if (groups[i] !== 0) { i++; continue; }
    let j = i;
    while (j < 8 && groups[j] === 0) j++;
    if (j - i > bestLen) { bestStart = i; bestLen = j - i; }
    i = j;
  }
  const hex = groups.map((g) => g.toString(16));
  if (bestStart < 0) return hex.join(':');
  return `${hex.slice(0, bestStart).join(':')}::${hex.slice(bestStart + bestLen).join(':')}`;
}

const V6_TYPES = [
  ['::/128', 'Non specificato'],
  ['::1/128', 'Loopback'],
  ['::ffff:0:0/96', 'IPv4-mapped'],
  ['64:ff9b::/96', 'NAT64 (RFC 6052)'],
  ['100::/64', 'Discard (RFC 6666)'],
  ['2001::/32', 'Teredo'],
  ['2001:db8::/32', 'Documentazione (RFC 3849)'],
  ['2002::/16', '6to4'],
  ['fc00::/7', 'Unique Local (ULA)'],
  ['fe80::/10', 'Link-local'],
  ['ff00::/8', 'Multicast'],
  ['2000::/3', 'Global unicast'],
].map(([cidr, label]) => {
  const [addr, len] = cidr.split('/');
  return { network: parseIPv6(addr), mask: maskFromPrefix6(Number(len)), label };
});

function maskFromPrefix6(prefix) {
  return V6_MAX ^ ((1n << BigInt(128 - prefix)) - 1n);
}

export function ipv6Type(addr) {
  const hit = V6_TYPES.find((t) => (addr & t.mask) === t.network);
  return hit ? hit.label : 'Riservato / non assegnato';
}

export function calcIPv6(addr, prefix) {
  const mask = maskFromPrefix6(prefix);
  const network = addr & mask;
  const last = network | (V6_MAX ^ mask);
  return {
    version: 6, address: addr, prefix, network, first: network, last,
    total: 1n << BigInt(128 - prefix), type: ipv6Type(addr),
  };
}

// ---------------------------------------------------------------- Input

// Accetta "192.168.1.0/24", "192.168.1.5 255.255.255.0", "2001:db8::/48",
// oppure indirizzo e prefisso/maschera in due campi separati.
export function parseInput(addressText, prefixText = '') {
  let addrPart = String(addressText ?? '').trim();
  let prefPart = String(prefixText ?? '').trim();
  if (!addrPart) return { ok: false, field: 'address', error: 'Inserisci un indirizzo IP.' };

  const slash = addrPart.indexOf('/');
  if (slash >= 0) {
    prefPart = addrPart.slice(slash + 1).trim();
    addrPart = addrPart.slice(0, slash).trim();
  } else if (/\s/.test(addrPart)) {
    [addrPart, prefPart] = addrPart.split(/\s+/, 2);
  }

  const version = addrPart.includes(':') ? 6 : 4;
  const address = version === 4 ? parseIPv4(addrPart) : parseIPv6(addrPart);
  if (address == null) {
    return { ok: false, field: 'address', error: version === 4 ? 'Indirizzo IPv4 non valido.' : 'Indirizzo IPv6 non valido.' };
  }

  prefPart = prefPart.replace(/^\//, '');
  if (!prefPart) return { ok: false, field: 'prefix', error: 'Indica il prefisso (es. /24) o la maschera.' };

  const maxBits = version === 4 ? 32 : 128;
  let prefix;
  if (/^\d{1,3}$/.test(prefPart)) {
    prefix = Number(prefPart);
    if (prefix > maxBits) return { ok: false, field: 'prefix', error: `Il prefisso deve essere tra 0 e ${maxBits}.` };
  } else if (version === 4) {
    const mask = parseIPv4(prefPart);
    prefix = mask == null ? null : prefixFromMask(mask);
    if (prefix == null) return { ok: false, field: 'prefix', error: 'Maschera non valida (i bit a 1 devono essere contigui).' };
  } else {
    return { ok: false, field: 'prefix', error: 'Per IPv6 indica la lunghezza del prefisso (0–128).' };
  }

  return { ok: true, version, address, prefix };
}

export function calc(addressText, prefixText) {
  const parsed = parseInput(addressText, prefixText);
  if (!parsed.ok) return parsed;
  const result = parsed.version === 4 ? calcIPv4(parsed.address, parsed.prefix) : calcIPv6(parsed.address, parsed.prefix);
  return { ok: true, ...result };
}

// ---------------------------------------------------------------- Suddivisione

// Tre limiti distinti per la suddivisione:
// - calcolo: fino a 2^32 sottoreti, le righe si generano al volo pagina per pagina;
// - visualizzazione piena: fino a 4.096 righe ordinamento e filtro valgono per tutto l'elenco,
//   oltre si sfoglia comunque tutto ma ordinamento e filtro agiscono sulla pagina corrente;
// - esportazione CSV: fino a 65.536 righe, per tenere il file generabile nel browser.
export const LIMITS = {
  calcBits: 32,
  displayRows: 4096,
  exportRows: 65536,
};

// Come trattare un elenco di `count` sottoreti nell'interfaccia.
export function splitPlan(count) {
  const full = count <= LIMITS.displayRows;
  const exportable = count <= LIMITS.exportRows;
  return {
    mode: full ? 'full' : 'paged',
    exportable,
    notes: [
      full ? null : `Oltre ${fmtInt(LIMITS.displayRows)} righe: la tabella sfoglia tutte le ${fmtInt(count)} sottoreti, ma ordinamento e filtro agiscono solo sulla pagina corrente.`,
      exportable ? null : `Esportazione CSV disponibile fino a ${fmtInt(LIMITS.exportRows)} righe: questa suddivisione ne ha ${fmtInt(count)}. Scegli un nuovo prefisso più corto o suddividi una rete più piccola.`,
    ].filter(Boolean),
  };
}

function ceilLog2(n) {
  let bits = 0;
  while (2n ** BigInt(bits) < n) bits++;
  return bits;
}

// mode: 'prefix' (nuovo prefisso), 'count' (numero di sottoreti), 'hosts' (host per sottorete)
export function subdivide(result, mode, valueText) {
  const maxBits = result.version === 4 ? 32 : 128;
  const raw = String(valueText ?? '').trim().replace(/^\//, '');
  if (!/^\d+$/.test(raw)) return { ok: false, error: 'Inserisci un numero intero.' };
  const value = BigInt(raw);

  let newPrefix;
  if (mode === 'prefix') {
    newPrefix = Number(value);
  } else if (mode === 'count') {
    if (value < 1n) return { ok: false, error: 'Servono almeno 1 sottorete.' };
    newPrefix = result.prefix + ceilLog2(value);
  } else if (mode === 'hosts') {
    if (value < 1n) return { ok: false, error: 'Indica almeno 1 host.' };
    let needed = value;
    // IPv4: rete e broadcast non sono assegnabili, salvo /31 (RFC 3021) e /32.
    if (result.version === 4 && value > 2n) needed = value + 2n;
    newPrefix = maxBits - ceilLog2(needed);
  } else {
    return { ok: false, error: 'Modalità di suddivisione sconosciuta.' };
  }

  if (newPrefix > maxBits) {
    return { ok: false, error: `Il prefisso risultante (/${newPrefix}) supera /${maxBits}.` };
  }
  if (newPrefix <= result.prefix) {
    return {
      ok: false,
      error: mode === 'hosts'
        ? `Una /${result.prefix} non basta: serve almeno una /${newPrefix}.`
        : `Il nuovo prefisso deve essere più lungo di /${result.prefix}.`,
    };
  }
  const bits = newPrefix - result.prefix;
  if (bits > LIMITS.calcBits) {
    return { ok: false, error: `Troppe sottoreti (2^${bits}): il massimo calcolabile è 2^${LIMITS.calcBits}.` };
  }

  const count = 2 ** bits;
  let getRow;
  if (result.version === 4) {
    const size = 2 ** (32 - newPrefix);
    getRow = (i) => {
      const r = calcIPv4(result.network + i * size, newPrefix);
      return {
        index: i + 1,
        sortNet: r.network,
        network: `${formatIPv4(r.network)}/${newPrefix}`,
        first: formatIPv4(r.first),
        last: formatIPv4(r.last),
        broadcast: r.broadcast == null ? '—' : formatIPv4(r.broadcast),
        usable: r.usable,
      };
    };
  } else {
    const size = 1n << BigInt(128 - newPrefix);
    getRow = (i) => {
      const net = result.network + BigInt(i) * size;
      return {
        index: i + 1,
        sortNet: net,
        network: `${formatIPv6(net)}/${newPrefix}`,
        first: formatIPv6(net),
        last: formatIPv6(net + size - 1n),
        total: size,
      };
    };
  }

  let requested = null;
  if (mode === 'count') requested = value;
  return { ok: true, newPrefix, count, getRow, requested };
}

// CSV con separatore ";" (compatibile con Excel in italiano), una riga per sottorete.
export function subnetsCsv(split, version) {
  if (split.count > LIMITS.exportRows) {
    return { ok: false, error: `Esportazione limitata a ${fmtInt(LIMITS.exportRows)} righe.` };
  }
  const head = version === 4 ? ['#', 'Rete', 'Primo host', 'Ultimo host', 'Broadcast', 'Host utilizzabili'] : ['#', 'Rete', 'Primo indirizzo', 'Ultimo indirizzo', 'Indirizzi'];
  const lines = [head.join(';')];
  for (let i = 0; i < split.count; i++) {
    const r = split.getRow(i);
    lines.push((version === 4
      ? [r.index, r.network, r.first, r.last, r.broadcast, r.usable]
      : [r.index, r.network, r.first, r.last, r.total.toString()]).join(';'));
  }
  return { ok: true, text: `${lines.join('\r\n')}\r\n`, rows: split.count };
}

// ---------------------------------------------------------------- Testo per copia

export function resultAsText(r) {
  const lines = r.version === 4
    ? [
      ['Indirizzo', formatIPv4(r.address)],
      ['Rete', `${formatIPv4(r.network)}/${r.prefix}`],
      ['Maschera', formatIPv4(r.mask)],
      ['Wildcard', formatIPv4(r.wildcard)],
      ['Broadcast', r.broadcast == null ? '—' : formatIPv4(r.broadcast)],
      ['Primo host', formatIPv4(r.first)],
      ['Ultimo host', formatIPv4(r.last)],
      ['Host utilizzabili', fmtInt(r.usable)],
      ['Indirizzi totali', fmtInt(r.total)],
      ['Tipo', r.type],
    ]
    : [
      ['Indirizzo', formatIPv6(r.address)],
      ['Espanso', formatIPv6Expanded(r.address)],
      ['Rete', `${formatIPv6(r.network)}/${r.prefix}`],
      ['Primo indirizzo', formatIPv6(r.first)],
      ['Ultimo indirizzo', formatIPv6(r.last)],
      ['Indirizzi totali', fmtInt(r.total)],
      ['Tipo', r.type],
    ];
  return lines.map(([k, v]) => `${k}: ${v}`).join('\n');
}

// ---------------------------------------------------------------- Interfaccia

const DEFAULT_IP = '192.168.10.0/26';
const EXAMPLES = ['192.168.10.0/26', '172.16.5.130/27', '10.0.0.0 255.255.252.0', '2001:db8:acad::/48'];

function typeBadge(type) {
  if (/Pubblico|Global/.test(type)) return badge(type, 'ok');
  if (/Privato|Unique Local|CGNAT|Link-local/.test(type)) return badge(type, 'info');
  if (/Riservato|Documentazione|Benchmark|deprecato|Discard|Non specificato/.test(type)) return badge(type, 'warn');
  return badge(type);
}

function bitsView(value, prefix) {
  const bin = value.toString(2).padStart(32, '0');
  const octets = [];
  for (let o = 0; o < 4; o++) {
    const span = h('span');
    for (let b = o * 8; b < o * 8 + 8; b++) {
      span.append(h('span', { class: b < prefix ? 'bits__net' : 'bits__host' }, bin[b]));
    }
    octets.push(span);
  }
  return h('div', { class: 'bits' }, octets);
}

function resultView(r) {
  const nodes = [];
  if (r.version === 4) {
    const notes = [];
    if (r.address !== r.network && r.prefix < 31) {
      notes.push(h('li', { class: 'note' }, `${formatIPv4(r.address)} è un host della rete ${formatIPv4(r.network)}/${r.prefix}.`));
    }
    if (r.prefix === 31) notes.push(h('li', { class: 'note' }, 'Collegamento punto-punto (RFC 3021): entrambi gli indirizzi sono assegnabili, nessun broadcast.'));
    if (r.prefix === 32) notes.push(h('li', { class: 'note' }, 'Host singolo (/32), tipico di loopback e route host.'));

    nodes.push(kvList([
      { label: 'Indirizzo', value: formatIPv4(r.address) },
      { label: 'Rete', value: `${formatIPv4(r.network)}/${r.prefix}`, hl: true },
      { label: 'Maschera', value: formatIPv4(r.mask) },
      { label: 'Wildcard', value: formatIPv4(r.wildcard) },
      { label: 'Broadcast', value: r.broadcast == null ? '—' : formatIPv4(r.broadcast) },
      { label: 'Primo host', value: formatIPv4(r.first) },
      { label: 'Ultimo host', value: formatIPv4(r.last) },
      { label: 'Host utilizzabili', value: fmtInt(r.usable), hl: true },
      { label: 'Indirizzi totali', value: fmtInt(r.total) },
      { label: 'Esadecimale', value: `0x${r.address.toString(16).toUpperCase().padStart(8, '0')}` },
      { label: 'Classe', value: h('span', { class: 'mono' }, r.class) },
      { label: 'Tipo', value: typeBadge(r.type) },
    ]));
    if (notes.length) nodes.push(h('ul', { class: 'notes' }, notes));
    nodes.push(
      h('h3', { class: 'section-title' }, 'Rappresentazione binaria'),
      kvList([
        { label: 'Indirizzo', value: bitsView(r.address, r.prefix) },
        { label: 'Maschera', value: bitsView(r.mask, r.prefix) },
      ], 'kv--compact'),
      h('div', { class: 'bits-legend' }, h('span', null, `Rete (${r.prefix} bit)`), h('span', null, `Host (${32 - r.prefix} bit)`)),
    );
  } else {
    const hostBits = 128 - r.prefix;
    nodes.push(kvList([
      { label: 'Indirizzo', value: formatIPv6(r.address) },
      { label: 'Espanso', value: formatIPv6Expanded(r.address) },
      { label: 'Rete', value: `${formatIPv6(r.network)}/${r.prefix}`, hl: true },
      { label: 'Primo indirizzo', value: formatIPv6(r.first) },
      { label: 'Ultimo indirizzo', value: formatIPv6(r.last) },
      { label: 'Indirizzi totali', value: [fmtInt(r.total), h('span', { class: 'sub' }, `2^${hostBits}`)], hl: true },
      r.prefix <= 64 ? { label: 'Sottoreti /64', value: [fmtInt(1n << BigInt(64 - r.prefix)), h('span', { class: 'sub' }, `2^${64 - r.prefix}`)] } : null,
      { label: 'Tipo', value: typeBadge(r.type) },
    ]));
    if (r.prefix > 64 && r.prefix < 127) {
      nodes.push(h('ul', { class: 'notes' }, h('li', { class: 'note note--warn' }, 'Prefissi più lunghi di /64 non sono compatibili con SLAAC (RFC 4291).')));
    }
  }
  return nodes;
}

export function render(container, params, ctx) {
  const ids = { address: uid('ip'), prefix: uid('pfx'), mode: uid('mode'), value: uid('val') };
  const errors = { address: h('span', { class: 'field__error', id: `${ids.address}-err` }), prefix: h('span', { class: 'field__error', id: `${ids.prefix}-err` }), value: h('span', { class: 'field__error', id: `${ids.value}-err` }) };

  const addressInput = h('input', { id: ids.address, class: 'input input--mono', type: 'text', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off', placeholder: '192.168.10.0/26 o 2001:db8::/48', 'aria-describedby': `${ids.address}-err` });
  const prefixInput = h('input', { id: ids.prefix, class: 'input input--mono', type: 'text', autocomplete: 'off', spellcheck: 'false', placeholder: '/26 o 255.255.255.192', 'aria-describedby': `${ids.prefix}-hint ${ids.prefix}-err` });
  const modeSelect = h('select', { id: ids.mode, class: 'input' },
    h('option', { value: '' }, 'Nessuna'),
    h('option', { value: 'prefix' }, 'Per nuovo prefisso'),
    h('option', { value: 'count' }, 'Per numero di sottoreti'),
    h('option', { value: 'hosts' }, 'Per host per sottorete'));
  const valueLabel = h('label', { for: ids.value }, 'Valore');
  const valueInput = h('input', { id: ids.value, class: 'input input--mono', type: 'text', inputmode: 'numeric', autocomplete: 'off', 'aria-describedby': `${ids.value}-err` });

  const VALUE_LABELS = { '': ['Valore', ''], prefix: ['Nuovo prefisso', 'es. 28'], count: ['Numero di sottoreti', 'es. 4'], hosts: ['Host per sottorete', 'es. 50'] };
  function syncMode() {
    const [label, placeholder] = VALUE_LABELS[modeSelect.value];
    valueLabel.textContent = label;
    valueInput.placeholder = placeholder;
    valueInput.disabled = !modeSelect.value;
  }
  modeSelect.addEventListener('change', syncMode);

  const form = h('form', { novalidate: true },
    h('div', { class: 'field' }, h('label', { for: ids.address }, 'Indirizzo IP'), addressInput, errors.address),
    h('div', { class: 'field' },
      h('label', { for: ids.prefix }, 'Prefisso o maschera'),
      prefixInput,
      h('span', { class: 'field__hint', id: `${ids.prefix}-hint` }, 'Facoltativo se l’indirizzo è in notazione CIDR.'),
      errors.prefix),
    h('fieldset', { class: 'group' },
      h('legend', null, 'Suddivisione in sottoreti'),
      h('div', { class: 'field' }, h('label', { for: ids.mode }, 'Modalità'), modeSelect),
      h('div', { class: 'field' }, valueLabel, valueInput, errors.value)),
    h('div', { class: 'examples' },
      h('span', { class: 'examples__label' }, 'Esempi'),
      EXAMPLES.map((ex) => h('button', { type: 'button', class: 'chip', onclick: () => { clearForm(); addressInput.value = ex; apply(); } }, ex))),
    h('div', { class: 'form-actions' },
      h('button', { type: 'submit', class: 'btn btn--primary' }, 'Apply'),
      h('button', { type: 'button', class: 'btn btn--secondary', onclick: () => { clearForm(); showEmpty(); ctx.setParams({}); addressInput.focus(); } }, 'Reset')));
  form.addEventListener('submit', (e) => { e.preventDefault(); apply(); });

  const formDl = dashlet({ title: 'Parametri', expandable: false, onReset: () => { clearForm(); showEmpty(); ctx.setParams({}); } });
  formDl.body.append(form);

  let current = null;
  const resultDl = dashlet({
    title: 'Risultato',
    actions: [{ icon: 'copy', label: 'Copia risultato', onclick: async () => {
      if (!current) return;
      toast((await copyText(resultAsText(current))) ? 'Risultato copiato' : 'Copia non riuscita');
    } }],
    onReset: () => { showEmpty(); },
  });

  const table = dataTable({
    columns: [
      { key: 'index', label: '#', align: 'right' },
      { key: 'network', label: 'Rete', mono: true, sortValue: (r) => r.sortNet },
      { key: 'first', label: 'Primo', mono: true, sortValue: (r) => r.sortNet },
      { key: 'last', label: 'Ultimo', mono: true, sortValue: (r) => r.sortNet },
      { key: 'broadcast', label: 'Broadcast', mono: true, sortValue: (r) => r.sortNet },
      { key: 'usable', label: 'Host', align: 'right', format: (r) => fmtInt(r.usable) },
    ],
    filterPlaceholder: 'Filtra sottoreti…',
  });
  const table6 = dataTable({
    columns: [
      { key: 'index', label: '#', align: 'right' },
      { key: 'network', label: 'Rete', mono: true, sortValue: (r) => r.sortNet },
      { key: 'first', label: 'Primo indirizzo', mono: true, sortValue: (r) => r.sortNet },
      { key: 'last', label: 'Ultimo indirizzo', mono: true, sortValue: (r) => r.sortNet },
      { key: 'total', label: 'Indirizzi', align: 'right', format: (r) => fmtInt(r.total) },
    ],
    filterPlaceholder: 'Filtra sottoreti…',
  });
  const splitDl = dashlet({ title: 'Sottoreti', className: 'span-all', flush: true });
  splitDl.el.hidden = true;
  let currentSplit = null;
  const exportBtn = h('button', { type: 'button', class: 'btn btn--secondary', onclick: () => downloadCsv() }, 'Esporta CSV');
  const splitNotes = h('ul', { class: 'notes notes--flush' });
  const splitBar = h('div', { class: 'dashlet__bar' }, exportBtn, splitNotes);

  function downloadCsv() {
    if (!currentSplit) return;
    const csv = subnetsCsv(currentSplit.split, currentSplit.result.version);
    if (!csv.ok) { toast(csv.error); return; }
    const { result, split } = currentSplit;
    const net = (result.version === 4 ? formatIPv4(result.network) : formatIPv6(result.network)).replace(/[:.]/g, '-');
    // File generato nel browser: nessun dato viene inviato.
    const url = URL.createObjectURL(new Blob(['\ufeff', csv.text], { type: 'text/csv;charset=utf-8' }));
    const a = h('a', { href: url, download: `sottoreti_${net}_${result.prefix}_in_${split.newPrefix}.csv` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`Esportate ${fmtInt(csv.rows)} righe`);
  }

  container.append(h('div', { class: 'tool-grid' }, formDl.el, resultDl.el, splitDl.el));

  function setError(field, message) {
    const input = { address: addressInput, prefix: prefixInput, value: valueInput }[field];
    errors[field].textContent = message ?? '';
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }

  function clearErrors() {
    setError('address');
    setError('prefix');
    setError('value');
  }

  function clearForm() {
    addressInput.value = '';
    prefixInput.value = '';
    modeSelect.value = '';
    valueInput.value = '';
    syncMode();
    clearErrors();
  }

  function showEmpty() {
    current = null;
    resultDl.body.replaceChildren(h('p', { class: 'empty' }, 'Inserisci un indirizzo e premi Apply.'));
    splitDl.el.hidden = true;
  }

  function apply() {
    clearErrors();
    const result = calc(addressInput.value, prefixInput.value);
    if (!result.ok) {
      setError(result.field, result.error);
      ({ address: addressInput, prefix: prefixInput })[result.field].focus();
      return;
    }

    let split = null;
    if (modeSelect.value) {
      split = subdivide(result, modeSelect.value, valueInput.value);
      if (!split.ok) {
        setError('value', split.error);
        valueInput.focus();
        return;
      }
    }

    current = result;
    resultDl.body.replaceChildren(...resultView(result));
    renderSplit(result, split);
    ctx.setParams({ ip: addressInput.value.trim(), mask: prefixInput.value.trim(), split: modeSelect.value, n: modeSelect.value ? valueInput.value.trim() : '' });
  }

  function renderSplit(result, split) {
    splitDl.el.hidden = !split;
    if (!split) return;
    const t = result.version === 4 ? table : table6;
    const perNet = result.version === 4 ? split.getRow(0).usable : 1n << BigInt(128 - split.newPrefix);
    let subtitle = `${fmtInt(split.count)} × /${split.newPrefix} · ${fmtInt(perNet)} ${result.version === 4 ? 'host' : 'indirizzi'} ciascuna`;
    if (split.requested != null && BigInt(split.count) !== split.requested) subtitle += ` (richieste ${fmtInt(split.requested)})`;
    splitDl.setSubtitle(subtitle);
    const plan = splitPlan(split.count);
    currentSplit = { result, split };
    if (plan.mode === 'full') t.setRows(Array.from({ length: split.count }, (_, i) => split.getRow(i)));
    else t.setSource({ count: split.count, getRow: split.getRow });
    exportBtn.disabled = !plan.exportable;
    exportBtn.title = plan.exportable ? `Scarica ${fmtInt(split.count)} righe in CSV` : `Oltre ${fmtInt(LIMITS.exportRows)} righe`;
    splitNotes.replaceChildren(...plan.notes.map((n, i) => h('li', { class: `note${i === 0 && plan.mode === 'paged' ? ' note--warn' : ''}` }, n)));
    splitDl.body.replaceChildren(splitBar, t.el);
  }

  // Stato iniziale: parametri dall'URL o esempio predefinito.
  addressInput.value = params.get('ip') ?? DEFAULT_IP;
  prefixInput.value = params.get('mask') ?? '';
  modeSelect.value = ['prefix', 'count', 'hosts'].includes(params.get('split')) ? params.get('split') : '';
  valueInput.value = params.get('n') ?? '';
  syncMode();
  apply();
}

// Anteprima per la Dashboard.
export function preview() {
  const r = calcIPv4(parseIPv4('192.168.10.0'), 26);
  return {
    href: `?ip=${encodeURIComponent('192.168.10.0/26')}`,
    body: kvList([
      { label: 'Rete', value: `${formatIPv4(r.network)}/${r.prefix}`, hl: true },
      { label: 'Range host', value: `${formatIPv4(r.first)} – ${formatIPv4(r.last)}` },
      { label: 'Broadcast', value: formatIPv4(r.broadcast) },
      { label: 'Host utilizzabili', value: fmtInt(r.usable) },
    ], 'kv--compact'),
  };
}
