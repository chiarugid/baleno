// Calcolatore subnet IPv4/IPv6.
// Le funzioni di calcolo (parse*, format*, calc*, subdivide) non usano il DOM
// e sono importate anche da tests/run.mjs.

import { h, fmtInt, kvList, badge, copyText, toast, uid } from '../ui/dom.js';
import { dashlet } from '../ui/dashlet.js';
import { dataTable } from '../ui/table.js';
import { t } from '../i18n.js';

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

// Tipi di indirizzo come identificativi stabili; l'etichetta mostrata è in i18n (subnet.type.*).
const V4_TYPES = [
  ['0.0.0.0/8', 'thisNet'],
  ['10.0.0.0/8', 'private'],
  ['100.64.0.0/10', 'cgnat'],
  ['127.0.0.0/8', 'loopback'],
  ['169.254.0.0/16', 'linkLocal4'],
  ['172.16.0.0/12', 'private'],
  ['192.0.0.0/24', 'ietf'],
  ['192.0.2.0/24', 'testnet1'],
  ['192.88.99.0/24', 'relay6to4'],
  ['192.168.0.0/16', 'private'],
  ['198.18.0.0/15', 'benchmark'],
  ['198.51.100.0/24', 'testnet2'],
  ['203.0.113.0/24', 'testnet3'],
  ['224.0.0.0/4', 'multicast'],
  ['255.255.255.255/32', 'limitedBroadcast'],
  ['240.0.0.0/4', 'classE'],
].map(([cidr, id]) => {
  const [addr, len] = cidr.split('/');
  const prefix = Number(len);
  return { network: parseIPv4(addr), mask: maskFromPrefix(prefix), id };
});

export function ipv4TypeId(addr) {
  return V4_TYPES.find((x) => ((addr & x.mask) >>> 0) === x.network)?.id ?? 'public';
}

export function ipv4Type(addr) {
  return t(`subnet.type.${ipv4TypeId(addr)}`);
}

function ipv4Class(addr) {
  const first = addr >>> 24;
  if (first < 128) return 'A';
  if (first < 192) return 'B';
  if (first < 224) return 'C';
  if (first < 240) return t('subnet.class.D');
  return t('subnet.class.E');
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
    first, last, total, usable, class: ipv4Class(addr), type: ipv4Type(addr), typeId: ipv4TypeId(addr),
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
  ['::/128', 'unspecified'],
  ['::1/128', 'loopback'],
  ['::ffff:0:0/96', 'mapped'],
  ['64:ff9b::/96', 'nat64'],
  ['100::/64', 'discard'],
  ['2001::/32', 'teredo'],
  ['2001:db8::/32', 'documentation'],
  ['2002::/16', 'sixToFour'],
  ['fc00::/7', 'ula'],
  ['fe80::/10', 'linkLocal'],
  ['ff00::/8', 'multicast'],
  ['2000::/3', 'global'],
].map(([cidr, id]) => {
  const [addr, len] = cidr.split('/');
  return { network: parseIPv6(addr), mask: maskFromPrefix6(Number(len)), id };
});

function maskFromPrefix6(prefix) {
  return V6_MAX ^ ((1n << BigInt(128 - prefix)) - 1n);
}

export function ipv6TypeId(addr) {
  return V6_TYPES.find((x) => (addr & x.mask) === x.network)?.id ?? 'reserved';
}

export function ipv6Type(addr) {
  return t(`subnet.type.${ipv6TypeId(addr)}`);
}

export function calcIPv6(addr, prefix) {
  const mask = maskFromPrefix6(prefix);
  const network = addr & mask;
  const last = network | (V6_MAX ^ mask);
  return {
    version: 6, address: addr, prefix, network, first: network, last,
    total: 1n << BigInt(128 - prefix), type: ipv6Type(addr), typeId: ipv6TypeId(addr),
  };
}

// ---------------------------------------------------------------- Input

// Accetta "192.168.1.0/24", "192.168.1.5 255.255.255.0", "2001:db8::/48",
// oppure indirizzo e prefisso/maschera in due campi separati.
export function parseInput(addressText, prefixText = '') {
  let addrPart = String(addressText ?? '').trim();
  let prefPart = String(prefixText ?? '').trim();
  if (!addrPart) return { ok: false, field: 'address', error: t('subnet.err.address') };

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
    return { ok: false, field: 'address', error: version === 4 ? t('subnet.err.ipv4') : t('subnet.err.ipv6') };
  }

  prefPart = prefPart.replace(/^\//, '');
  if (!prefPart) return { ok: false, field: 'prefix', error: t('subnet.err.prefixMissing') };

  const maxBits = version === 4 ? 32 : 128;
  let prefix;
  if (/^\d{1,3}$/.test(prefPart)) {
    prefix = Number(prefPart);
    if (prefix > maxBits) return { ok: false, field: 'prefix', error: t('subnet.err.prefixRange', { max: maxBits }) };
  } else if (version === 4) {
    const mask = parseIPv4(prefPart);
    prefix = mask == null ? null : prefixFromMask(mask);
    if (prefix == null) return { ok: false, field: 'prefix', error: t('subnet.err.mask') };
  } else {
    return { ok: false, field: 'prefix', error: t('subnet.err.v6prefix') };
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
      full ? null : t('subnet.limit.paged', { limit: fmtInt(LIMITS.displayRows), n: fmtInt(count) }),
      exportable ? null : t('subnet.limit.export', { limit: fmtInt(LIMITS.exportRows), n: fmtInt(count) }),
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
  if (!/^\d+$/.test(raw)) return { ok: false, error: t('subnet.err.integer') };
  const value = BigInt(raw);

  let newPrefix;
  if (mode === 'prefix') {
    newPrefix = Number(value);
  } else if (mode === 'count') {
    if (value < 1n) return { ok: false, error: t('subnet.err.minSubnets') };
    newPrefix = result.prefix + ceilLog2(value);
  } else if (mode === 'hosts') {
    if (value < 1n) return { ok: false, error: t('subnet.err.minHosts') };
    let needed = value;
    // IPv4: rete e broadcast non sono assegnabili, salvo /31 (RFC 3021) e /32.
    if (result.version === 4 && value > 2n) needed = value + 2n;
    newPrefix = maxBits - ceilLog2(needed);
  } else {
    return { ok: false, error: t('subnet.err.mode') };
  }

  if (newPrefix > maxBits) {
    return { ok: false, error: t('subnet.err.prefixTooLong', { prefix: newPrefix, max: maxBits }) };
  }
  if (newPrefix <= result.prefix) {
    return {
      ok: false,
      error: mode === 'hosts'
        ? t('subnet.err.notEnough', { prefix: result.prefix, needed: newPrefix })
        : t('subnet.err.mustBeLonger', { prefix: result.prefix }),
    };
  }
  const bits = newPrefix - result.prefix;
  if (bits > LIMITS.calcBits) {
    return { ok: false, error: t('subnet.err.tooMany', { bits, max: LIMITS.calcBits }) };
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
    return { ok: false, error: t('subnet.err.exportLimit', { n: fmtInt(LIMITS.exportRows) }) };
  }
  const lines = [version === 4 ? t('subnet.csv.headV4') : t('subnet.csv.headV6')];
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
      [t('subnet.address'), formatIPv4(r.address)],
      [t('subnet.network'), `${formatIPv4(r.network)}/${r.prefix}`],
      [t('subnet.mask'), formatIPv4(r.mask)],
      [t('subnet.wildcard'), formatIPv4(r.wildcard)],
      [t('subnet.broadcast'), r.broadcast == null ? '—' : formatIPv4(r.broadcast)],
      [t('subnet.firstHost'), formatIPv4(r.first)],
      [t('subnet.lastHost'), formatIPv4(r.last)],
      [t('subnet.usableHosts'), fmtInt(r.usable)],
      [t('subnet.totalAddresses'), fmtInt(r.total)],
      [t('subnet.type'), r.type],
    ]
    : [
      [t('subnet.address'), formatIPv6(r.address)],
      [t('subnet.expanded'), formatIPv6Expanded(r.address)],
      [t('subnet.network'), `${formatIPv6(r.network)}/${r.prefix}`],
      [t('subnet.firstAddress'), formatIPv6(r.first)],
      [t('subnet.lastAddress'), formatIPv6(r.last)],
      [t('subnet.totalAddresses'), fmtInt(r.total)],
      [t('subnet.type'), r.type],
    ];
  return lines.map(([k, v]) => `${k}: ${v}`).join('\n');
}

// ---------------------------------------------------------------- Interfaccia

const DEFAULT_IP = '192.168.10.0/26';
const EXAMPLES = ['192.168.10.0/26', '172.16.5.130/27', '10.0.0.0 255.255.252.0', '2001:db8:acad::/48'];

const TYPE_KIND = {
  public: 'ok', global: 'ok',
  private: 'info', ula: 'info', cgnat: 'info', linkLocal: 'info', linkLocal4: 'info',
  reserved: 'warn', classE: 'warn', testnet1: 'warn', testnet2: 'warn', testnet3: 'warn', documentation: 'warn',
  benchmark: 'warn', relay6to4: 'warn', discard: 'warn', unspecified: 'warn',
};

function typeBadge(r) {
  return badge(r.type, TYPE_KIND[r.typeId] ?? '');
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
      notes.push(h('li', { class: 'note' }, t('subnet.noteHostOf', { address: formatIPv4(r.address), network: `${formatIPv4(r.network)}/${r.prefix}` })));
    }
    if (r.prefix === 31) notes.push(h('li', { class: 'note' }, t('subnet.note31')));
    if (r.prefix === 32) notes.push(h('li', { class: 'note' }, t('subnet.note32')));

    nodes.push(kvList([
      { label: t('subnet.address'), value: formatIPv4(r.address) },
      { label: t('subnet.network'), value: `${formatIPv4(r.network)}/${r.prefix}`, hl: true },
      { label: t('subnet.mask'), value: formatIPv4(r.mask) },
      { label: t('subnet.wildcard'), value: formatIPv4(r.wildcard) },
      { label: t('subnet.broadcast'), value: r.broadcast == null ? '—' : formatIPv4(r.broadcast) },
      { label: t('subnet.firstHost'), value: formatIPv4(r.first) },
      { label: t('subnet.lastHost'), value: formatIPv4(r.last) },
      { label: t('subnet.usableHosts'), value: fmtInt(r.usable), hl: true },
      { label: t('subnet.totalAddresses'), value: fmtInt(r.total) },
      { label: t('subnet.hex'), value: `0x${r.address.toString(16).toUpperCase().padStart(8, '0')}` },
      { label: t('subnet.class'), value: h('span', { class: 'mono' }, r.class) },
      { label: t('subnet.type'), value: typeBadge(r) },
    ]));
    if (notes.length) nodes.push(h('ul', { class: 'notes' }, notes));
    nodes.push(
      h('h3', { class: 'section-title' }, t('subnet.binary')),
      kvList([
        { label: t('subnet.address'), value: bitsView(r.address, r.prefix) },
        { label: t('subnet.mask'), value: bitsView(r.mask, r.prefix) },
      ], 'kv--compact'),
      h('div', { class: 'bits-legend' }, h('span', null, t('subnet.legendNet', { n: r.prefix })), h('span', null, t('subnet.legendHost', { n: 32 - r.prefix }))),
    );
  } else {
    const hostBits = 128 - r.prefix;
    nodes.push(kvList([
      { label: t('subnet.address'), value: formatIPv6(r.address) },
      { label: t('subnet.expanded'), value: formatIPv6Expanded(r.address) },
      { label: t('subnet.network'), value: `${formatIPv6(r.network)}/${r.prefix}`, hl: true },
      { label: t('subnet.firstAddress'), value: formatIPv6(r.first) },
      { label: t('subnet.lastAddress'), value: formatIPv6(r.last) },
      { label: t('subnet.totalAddresses'), value: [fmtInt(r.total), h('span', { class: 'sub' }, `2^${hostBits}`)], hl: true },
      r.prefix <= 64 ? { label: t('subnet.slash64'), value: [fmtInt(1n << BigInt(64 - r.prefix)), h('span', { class: 'sub' }, `2^${64 - r.prefix}`)] } : null,
      { label: t('subnet.type'), value: typeBadge(r) },
    ]));
    if (r.prefix > 64 && r.prefix < 127) {
      nodes.push(h('ul', { class: 'notes' }, h('li', { class: 'note note--warn' }, t('subnet.noteSlaac'))));
    }
  }
  return nodes;
}

export function render(container, params, ctx) {
  const ids = { address: uid('ip'), prefix: uid('pfx'), mode: uid('mode'), value: uid('val') };
  const errors = { address: h('span', { class: 'field__error', id: `${ids.address}-err` }), prefix: h('span', { class: 'field__error', id: `${ids.prefix}-err` }), value: h('span', { class: 'field__error', id: `${ids.value}-err` }) };

  const addressInput = h('input', { id: ids.address, class: 'input input--mono', type: 'text', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off', placeholder: t('subnet.addressPlaceholder'), 'aria-describedby': `${ids.address}-err` });
  const prefixInput = h('input', { id: ids.prefix, class: 'input input--mono', type: 'text', autocomplete: 'off', spellcheck: 'false', placeholder: t('subnet.prefixPlaceholder'), 'aria-describedby': `${ids.prefix}-hint ${ids.prefix}-err` });
  const modeSelect = h('select', { id: ids.mode, class: 'input' },
    h('option', { value: '' }, t('subnet.modeNone')),
    h('option', { value: 'prefix' }, t('subnet.modePrefix')),
    h('option', { value: 'count' }, t('subnet.modeCount')),
    h('option', { value: 'hosts' }, t('subnet.modeHosts')));
  const valueLabel = h('label', { for: ids.value }, t('subnet.value'));
  const valueInput = h('input', { id: ids.value, class: 'input input--mono', type: 'text', inputmode: 'numeric', autocomplete: 'off', 'aria-describedby': `${ids.value}-err` });

  const VALUE_LABELS = { '': [t('subnet.value'), ''], prefix: [t('subnet.newPrefix'), t('subnet.egPrefix')], count: [t('subnet.subnetCount'), t('subnet.egCount')], hosts: [t('subnet.hostsPerSubnet'), t('subnet.egHosts')] };
  function syncMode() {
    const [label, placeholder] = VALUE_LABELS[modeSelect.value];
    valueLabel.textContent = label;
    valueInput.placeholder = placeholder;
    valueInput.disabled = !modeSelect.value;
  }
  modeSelect.addEventListener('change', syncMode);

  const form = h('form', { novalidate: true },
    h('div', { class: 'field' }, h('label', { for: ids.address }, t('subnet.ipAddress')), addressInput, errors.address),
    h('div', { class: 'field' },
      h('label', { for: ids.prefix }, t('subnet.prefixOrMask')),
      prefixInput,
      h('span', { class: 'field__hint', id: `${ids.prefix}-hint` }, t('subnet.prefixHint')),
      errors.prefix),
    h('fieldset', { class: 'group' },
      h('legend', null, t('subnet.splitLegend')),
      h('div', { class: 'field' }, h('label', { for: ids.mode }, t('subnet.mode')), modeSelect),
      h('div', { class: 'field' }, valueLabel, valueInput, errors.value)),
    h('div', { class: 'examples' },
      h('span', { class: 'examples__label' }, t('ui.examples')),
      EXAMPLES.map((ex) => h('button', { type: 'button', class: 'chip', onclick: () => { clearForm(); addressInput.value = ex; apply(); } }, ex))),
    h('div', { class: 'form-actions' },
      h('button', { type: 'submit', class: 'btn btn--primary' }, t('ui.apply')),
      h('button', { type: 'button', class: 'btn btn--secondary', onclick: () => { clearForm(); showEmpty(); ctx.setParams({}); addressInput.focus(); } }, t('ui.resetBtn'))));
  form.addEventListener('submit', (e) => { e.preventDefault(); apply(); });

  const formDl = dashlet({ title: t('ui.parameters'), expandable: false, onReset: () => { clearForm(); showEmpty(); ctx.setParams({}); } });
  formDl.body.append(form);

  let current = null;
  const resultDl = dashlet({
    title: t('ui.result'),
    actions: [{ icon: 'copy', label: t('subnet.copyResult'), onclick: async () => {
      if (!current) return;
      toast((await copyText(resultAsText(current))) ? t('subnet.resultCopied') : t('ui.copyFailed'));
    } }],
    onReset: () => { showEmpty(); },
  });

  const table = dataTable({
    columns: [
      { key: 'index', label: '#', align: 'right' },
      { key: 'network', label: t('subnet.network'), mono: true, sortValue: (r) => r.sortNet },
      { key: 'first', label: t('subnet.colFirst'), mono: true, sortValue: (r) => r.sortNet },
      { key: 'last', label: t('subnet.colLast'), mono: true, sortValue: (r) => r.sortNet },
      { key: 'broadcast', label: t('subnet.broadcast'), mono: true, sortValue: (r) => r.sortNet },
      { key: 'usable', label: t('subnet.colHosts'), align: 'right', format: (r) => fmtInt(r.usable) },
    ],
    filterPlaceholder: t('subnet.filterSubnets'),
  });
  const table6 = dataTable({
    columns: [
      { key: 'index', label: '#', align: 'right' },
      { key: 'network', label: t('subnet.network'), mono: true, sortValue: (r) => r.sortNet },
      { key: 'first', label: t('subnet.firstAddress'), mono: true, sortValue: (r) => r.sortNet },
      { key: 'last', label: t('subnet.lastAddress'), mono: true, sortValue: (r) => r.sortNet },
      { key: 'total', label: t('subnet.colAddresses'), align: 'right', format: (r) => fmtInt(r.total) },
    ],
    filterPlaceholder: t('subnet.filterSubnets'),
  });
  const splitDl = dashlet({ title: t('subnet.subnets'), className: 'span-all', flush: true });
  splitDl.el.hidden = true;
  let currentSplit = null;
  const exportBtn = h('button', { type: 'button', class: 'btn btn--secondary', onclick: () => downloadCsv() }, t('subnet.exportCsv'));
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
    const a = h('a', { href: url, download: `${t('subnet.csvFile')}_${net}_${result.prefix}_in_${split.newPrefix}.csv` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(t('subnet.exported', { n: fmtInt(csv.rows) }));
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
    resultDl.body.replaceChildren(h('p', { class: 'empty' }, t('subnet.empty')));
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
    const tbl = result.version === 4 ? table : table6;
    const perNet = result.version === 4 ? split.getRow(0).usable : 1n << BigInt(128 - split.newPrefix);
    let subtitle = t(result.version === 4 ? 'subnet.splitEachV4' : 'subnet.splitEachV6', { count: fmtInt(split.count), prefix: split.newPrefix, n: fmtInt(perNet) });
    if (split.requested != null && BigInt(split.count) !== split.requested) subtitle += t('subnet.requested', { n: fmtInt(split.requested) });
    splitDl.setSubtitle(subtitle);
    const plan = splitPlan(split.count);
    currentSplit = { result, split };
    if (plan.mode === 'full') tbl.setRows(Array.from({ length: split.count }, (_, i) => split.getRow(i)));
    else tbl.setSource({ count: split.count, getRow: split.getRow });
    exportBtn.disabled = !plan.exportable;
    exportBtn.title = plan.exportable ? t('subnet.exportTitle', { n: fmtInt(split.count) }) : t('subnet.exportOver', { n: fmtInt(LIMITS.exportRows) });
    splitNotes.replaceChildren(...plan.notes.map((n, i) => h('li', { class: `note${i === 0 && plan.mode === 'paged' ? ' note--warn' : ''}` }, n)));
    splitDl.body.replaceChildren(splitBar, tbl.el);
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
      { label: t('subnet.network'), value: `${formatIPv4(r.network)}/${r.prefix}`, hl: true },
      { label: t('subnet.hostRange'), value: `${formatIPv4(r.first)} – ${formatIPv4(r.last)}` },
      { label: t('subnet.broadcast'), value: formatIPv4(r.broadcast) },
      { label: t('subnet.usableHosts'), value: fmtInt(r.usable) },
    ], 'kv--compact'),
  };
}
