// Convertitore di indirizzi MAC con lookup del produttore (OUI) da un sottoinsieme locale.
// Le funzioni di calcolo non usano il DOM e sono importate anche da tests/run.mjs.

import { h, fmtInt, kvList, badge, copyText, toast, uid } from '../ui/dom.js';
import { dashlet, iconButton } from '../ui/dashlet.js';
import { dataTable } from '../ui/table.js';
import { formatIPv6, formatIPv4 } from './subnet.js';
import { t, tn } from '../i18n.js';
import { OUI_VENDORS, OUI_DATE } from '../../data/oui.js';

let ouiMap = null;
function ouiIndex() {
  if (!ouiMap) {
    ouiMap = new Map();
    for (const [vendor, list] of OUI_VENDORS) {
      for (let i = 0; i < list.length; i += 6) ouiMap.set(list.slice(i, i + 6), vendor);
    }
  }
  return ouiMap;
}

export const OUI_COUNT = OUI_VENDORS.reduce((n, [, list]) => n + list.length / 6, 0);

// Restituisce le 12 cifre esadecimali maiuscole, oppure 6 se è indicato solo l'OUI.
export function parseMac(text) {
  const s = String(text ?? '').trim();
  if (!s) return { ok: false, error: t('mac.err.empty') };
  const hex = s.replace(/[\s:.\-]/g, '').toUpperCase();
  if (!/^[0-9A-F]+$/.test(hex)) return { ok: false, error: t('mac.err.chars') };
  if (hex.length === 6) return { ok: true, hex, ouiOnly: true };
  if (hex.length !== 12) return { ok: false, error: t('mac.err.length', { n: hex.length }) };
  return { ok: true, hex, ouiOnly: false };
}

export const FORMATS = [
  { id: 'cisco', example: 'xxxx.xxxx.xxxx' },
  { id: 'colon', example: 'xx:xx:xx:xx:xx:xx' },
  { id: 'dash', example: 'xx-xx-xx-xx-xx-xx' },
  { id: 'plain', example: 'xxxxxxxxxxxx' },
];

export function formatMac(hex, style = 'colon', upper = true) {
  const v = upper ? hex.toUpperCase() : hex.toLowerCase();
  const pairs = v.match(/../g);
  switch (style) {
    case 'cisco': return v.match(/.{4}/g).join('.');
    case 'dash': return pairs.join('-');
    case 'plain': return v;
    default: return pairs.join(':');
  }
}

export function lookupVendor(hex) {
  return ouiIndex().get(hex.slice(0, 6).toUpperCase()) ?? null;
}

// Indirizzi con significato particolare (protocolli, ridondanza del gateway, virtualizzazione).
export function specialAddress(hex) {
  const v = hex.toUpperCase();
  const tail = (n) => parseInt(v.slice(-n), 16);
  if (v === 'FFFFFFFFFFFF') return 'Broadcast';
  if (v.startsWith('01005E') && parseInt(v.slice(6, 8), 16) < 0x80) {
    const group = formatIPv4((0xe0000000 | (parseInt(v.slice(6), 16) & 0x7fffff)) >>> 0);
    return t('mac.sp.mcast4', { group });
  }
  if (v.startsWith('3333')) return t('mac.sp.mcast6');
  const fixed = {
    '0180C2000000': 'Spanning Tree (BPDU, IEEE 802.1D)',
    '0180C2000001': 'Pause frame (IEEE 802.3x)',
    '0180C2000002': 'Slow protocols: LACP, OAM (IEEE 802.3)',
    '0180C2000003': 'IEEE 802.1X (EAPOL)',
    '0180C200000E': 'LLDP (IEEE 802.1AB)',
    '01000CCCCCCC': 'CDP, VTP, DTP, PAgP (Cisco)',
    '01000CCCCCCD': 'PVST+ (Cisco)',
  };
  if (fixed[v]) return fixed[v];
  if (v.startsWith('00005E0001')) return t('mac.sp.vrrp4', { n: tail(2) });
  if (v.startsWith('00005E0002')) return t('mac.sp.vrrp6', { n: tail(2) });
  if (v.startsWith('00000C07AC')) return t('mac.sp.hsrp1', { n: tail(2) });
  if (v.startsWith('00000C9FF')) return t('mac.sp.hsrp2', { n: tail(3) });
  if (v.startsWith('0007B400')) return t('mac.sp.glbp', { group: parseInt(v.slice(8, 10), 16), fwd: tail(2) });
  if (v.startsWith('525400')) return t('mac.sp.qemu');
  return null;
}

// Interfaccia IPv6 EUI-64 (RFC 4291): bit U/L invertito e FFFE in mezzo.
export function eui64LinkLocal(hex) {
  const bytes = hex.match(/../g).map((b) => parseInt(b, 16));
  const eui = [bytes[0] ^ 0x02, bytes[1], bytes[2], 0xff, 0xfe, bytes[3], bytes[4], bytes[5]];
  let iid = 0n;
  for (const b of eui) iid = (iid << 8n) | BigInt(b);
  return formatIPv6((0xfe80n << 112n) | iid);
}

export function macInfo(hex) {
  const first = parseInt(hex.slice(0, 2), 16);
  const multicast = (first & 1) === 1;
  const local = (first & 2) === 2;
  const broadcast = hex.toUpperCase() === 'FFFFFFFFFFFF';
  return {
    hex: hex.toUpperCase(),
    oui: hex.slice(0, 6).toUpperCase(),
    vendor: local ? null : lookupVendor(hex),
    multicast,
    broadcast,
    local,
    // MAC casuali dei client (privacy): unicast con bit U/L a 1.
    randomized: local && !multicast,
    special: hex.length === 12 ? specialAddress(hex) : null,
    eui64: hex.length === 12 && !multicast ? eui64LinkLocal(hex) : null,
  };
}

// Estrae gli indirizzi MAC da un testo libero (es. "show mac address-table").
const MAC_RE = /(?<![0-9A-Fa-f])(?:[0-9A-Fa-f]{4}\.[0-9A-Fa-f]{4}\.[0-9A-Fa-f]{4}|[0-9A-Fa-f]{2}(?:[:-][0-9A-Fa-f]{2}){5}|[0-9A-Fa-f]{12})(?![0-9A-Fa-f])/g;
export function extractMacs(text) {
  return [...String(text ?? '').matchAll(MAC_RE)].map((m) => ({ original: m[0], hex: m[0].replace(/[:.\-]/g, '').toUpperCase() }));
}

// ---------------------------------------------------------------- Interfaccia

const EXAMPLES = [
  ['0000.0c07.ac0a', 'HSRP'],
  ['00:50:56:ab:cd:ef', 'VMware'],
  ['80-5E-C0-12-34-56', 'Yealink'],
  ['01:00:5e:00:00:fb', 'Multicast'],
  ['52:54:00:12:34:56', 'QEMU'],
  ['0180.c200.000e', 'LLDP'],
];

function segmented(name, labelId, options) {
  return h('div', { class: 'segmented', role: 'radiogroup', 'aria-labelledby': labelId },
    options.map(([value, label]) => h('label', null, h('input', { type: 'radio', name, value }), h('span', null, label))));
}

const radioValue = (group) => group.querySelector('input:checked')?.value;
const setRadio = (group, value) => {
  for (const input of group.querySelectorAll('input')) input.checked = input.value === value;
};

const formatLabel = (id) => t(`mac.fmt.${id}`);

async function copy(text, what = t('mac.copied')) {
  toast((await copyText(text)) ? `${what}: ${text.length > 40 ? `${text.slice(0, 40)}…` : text}` : t('ui.copyFailed'));
}

function resultView(parsed, upper) {
  const info = macInfo(parsed.hex);
  const vendorValue = info.local
    ? h('span', { class: 'kpi__value' }, t('mac.vendorNone'))
    : h('span', { class: 'kpi__value' }, info.vendor ?? '—');
  const kpis = h('div', { class: 'kpis' },
    h('div', { class: 'kpi kpi--hl' }, h('div', { class: 'kpi__label' }, t('mac.vendor')), vendorValue),
    h('div', { class: 'kpi' }, h('div', { class: 'kpi__label' }, 'OUI'), h('div', { class: 'kpi__value' }, formatMac(`${info.oui}000000`, 'colon', upper).slice(0, 8))),
    h('div', { class: 'kpi' }, h('div', { class: 'kpi__label' }, t('mac.destination')), h('div', { class: 'kpi__value' }, info.broadcast ? 'Broadcast' : info.multicast ? 'Multicast' : 'Unicast')),
    h('div', { class: 'kpi' }, h('div', { class: 'kpi__label' }, t('mac.administration')), h('div', { class: 'kpi__value' }, info.local ? t('mac.local') : t('mac.global'))));

  const nodes = [kpis];
  if (!parsed.ouiOnly) {
    const rows = FORMATS.map((f) => {
      const value = formatMac(parsed.hex, f.id, upper);
      return h('tr', null,
        h('td', null, formatLabel(f.id)),
        h('td', { class: 'mono' }, value),
        h('td', { class: 'num' }, iconButton('copy', t('mac.copyFormat', { name: formatLabel(f.id) }), () => copy(value))));
    });
    if (info.eui64) {
      rows.push(h('tr', null,
        h('td', null, t('mac.linkLocal')),
        h('td', { class: 'mono' }, info.eui64),
        h('td', { class: 'num' }, iconButton('copy', t('mac.copyLinkLocal'), () => copy(info.eui64)))));
    }
    nodes.push(h('div', { class: 'table-wrap' }, h('table', { class: 'table table--plain table--formats' },
      h('thead', null, h('tr', null, h('th', null, h('span', null, t('mac.format'))), h('th', null, h('span', null, t('mac.value'))), h('th', { class: 'num' }, h('span', null, h('span', { class: 'visually-hidden' }, t('ui.copy')))))),
      h('tbody', null, rows))));
  }

  const first = parseInt(parsed.hex.slice(0, 2), 16);
  nodes.push(
    h('h3', { class: 'section-title' }, t('mac.details')),
    kvList([
      { label: t('mac.vendor'), value: info.local
        ? h('span', { class: 'sans' }, t('mac.vendorLocal'))
        : info.vendor ?? h('span', { class: 'sans muted' }, t('mac.vendorUnknown')), hl: Boolean(info.vendor) },
      { label: t('mac.firstByte'), value: `${parsed.hex.slice(0, 2)} · ${first.toString(2).padStart(8, '0')}` },
      { label: 'Bit I/G (b0)', value: info.multicast ? t('mac.igGroup') : t('mac.igIndividual') },
      { label: 'Bit U/L (b1)', value: info.local ? t('mac.ulLocal') : t('mac.ulGlobal') },
      info.special ? { label: t('mac.knownUse'), value: h('span', { class: 'sans' }, info.special), hl: true } : null,
    ]));
  const notes = [];
  if (info.randomized && !info.special) notes.push(h('li', { class: 'note' }, t('mac.noteRandom')));
  if (parsed.ouiOnly) notes.push(h('li', { class: 'note' }, t('mac.noteOuiOnly')));
  if (notes.length) nodes.push(h('ul', { class: 'notes' }, notes));
  return nodes;
}

export function render(container, params, ctx) {
  const ids = { mac: uid('mac'), case: uid('case'), bulk: uid('bulk'), fmt: uid('fmt') };
  const macInput = h('input', { id: ids.mac, class: 'input input--mono', type: 'text', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off', placeholder: '0000.0c07.ac0a, 00:50:56:ab:cd:ef…', 'aria-describedby': `${ids.mac}-hint ${ids.mac}-err` });
  const macError = h('span', { class: 'field__error', id: `${ids.mac}-err`, 'aria-live': 'polite' });
  const caseGroup = segmented(ids.case, `${ids.case}-l`, [['upper', t('mac.upper')], ['lower', t('mac.lower')]]);

  const reset = () => { macInput.value = ''; setRadio(caseGroup, 'lower'); update(); macInput.focus(); };
  const form = h('form', { novalidate: true },
    h('div', { class: 'field' },
      h('label', { for: ids.mac }, t('mac.address')),
      macInput,
      h('span', { class: 'field__hint', id: `${ids.mac}-hint` }, t('mac.addressHint')),
      macError),
    h('fieldset', { class: 'field field--plain' },
      h('legend', { class: 'field__label', id: `${ids.case}-l` }, t('mac.letters')), caseGroup),
    h('div', { class: 'examples' },
      h('span', { class: 'examples__label' }, t('ui.examples')),
      EXAMPLES.map(([mac, label]) => h('button', { type: 'button', class: 'chip', title: mac, onclick: () => { macInput.value = mac; update(); } }, label))),
    h('div', { class: 'form-actions' }, h('button', { type: 'button', class: 'btn btn--secondary', onclick: reset }, t('ui.resetBtn'))));
  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('input', update);
  form.addEventListener('change', update);

  const formDl = dashlet({ title: t('mac.converter'), expandable: false, onReset: reset });
  formDl.body.append(form);
  const resultDl = dashlet({ title: t('ui.result') });

  // Conversione multipla
  const bulkInput = h('textarea', { id: ids.bulk, class: 'input input--mono textarea textarea--code', rows: 8, wrap: 'off', spellcheck: 'false', placeholder: t('mac.bulkPlaceholder') });
  const fmtSelect = h('select', { id: ids.fmt, class: 'input' }, FORMATS.map((f) => h('option', { value: f.id }, `${formatLabel(f.id)} (${f.example})`)));
  const bulkTable = dataTable({
    columns: [
      { key: 'index', label: '#', align: 'right' },
      { key: 'original', label: t('mac.original'), mono: true },
      { key: 'converted', label: t('mac.converted'), mono: true },
      { key: 'vendor', label: t('mac.vendor'), format: (r) => r.vendor ?? (r.local ? t('mac.localShort') : '—') },
    ],
    pageSize: 25,
    filterPlaceholder: t('ui.filter'),
    emptyText: t('mac.noMacFound'),
  });
  let bulkResult = [];
  const copyAll = h('button', { type: 'button', class: 'btn btn--secondary', onclick: () => {
    if (bulkResult.length) copy(bulkResult.map((r) => r.converted).join('\n'), t('mac.copiedN', { n: bulkResult.length }));
  } }, t('mac.copyConverted'));
  const bulkDl = dashlet({ title: t('mac.bulkTitle'), className: 'span-all', onReset: () => { bulkInput.value = ''; lastBulk = ''; updateBulk(); } });
  bulkDl.body.append(
    h('div', { class: 'bulk-grid' },
      h('div', { class: 'field' }, h('label', { for: ids.bulk }, t('mac.text')), bulkInput),
      h('div', null,
        h('div', { class: 'field' }, h('label', { for: ids.fmt }, t('mac.outFormat')), fmtSelect),
        h('p', { class: 'field__hint' }, t('mac.outHint')),
        copyAll)),
    bulkTable.el);
  bulkInput.addEventListener('input', () => { lastBulk = bulkInput.value; updateBulk(); });
  fmtSelect.addEventListener('change', () => { updateBulk(); update(); });

  container.append(h('div', { class: 'tool-grid' }, formDl.el, resultDl.el, bulkDl.el));

  function upper() {
    return radioValue(caseGroup) === 'upper';
  }

  function update() {
    const parsed = parseMac(macInput.value);
    const empty = !macInput.value.trim();
    macError.textContent = parsed.ok || empty ? '' : parsed.error;
    if (parsed.ok || empty) macInput.removeAttribute('aria-invalid');
    else macInput.setAttribute('aria-invalid', 'true');
    if (empty) resultDl.body.replaceChildren(h('p', { class: 'empty' }, t('mac.empty')));
    else if (parsed.ok) resultDl.body.replaceChildren(...resultView(parsed, upper()));
    updateBulk();
    ctx.setParams({ mac: macInput.value.trim(), lettere: upper() ? 'maiuscole' : '', formato: fmtSelect.value === 'cisco' ? '' : fmtSelect.value });
  }

  function updateBulk() {
    const found = extractMacs(bulkInput.value);
    bulkResult = found.map((m, i) => {
      const info = macInfo(m.hex);
      return { index: i + 1, original: m.original, converted: formatMac(m.hex, fmtSelect.value, upper()), vendor: info.vendor, local: info.local };
    });
    bulkTable.setRows(bulkResult);
    bulkDl.setSubtitle(bulkInput.value.trim() ? tn('mac.found', bulkResult.length, { n: fmtInt(bulkResult.length) }) : '');
    copyAll.disabled = !bulkResult.length;
  }

  bulkInput.value = lastBulk;
  macInput.value = params.get('mac') ?? '0000.0c07.ac0a';
  setRadio(caseGroup, params.get('lettere') === 'maiuscole' ? 'upper' : 'lower');
  fmtSelect.value = FORMATS.some((f) => f.id === params.get('formato')) ? params.get('formato') : 'cisco';
  update();
  resultDl.setSubtitle(t('mac.ouiInfo', { n: fmtInt(OUI_COUNT), date: OUI_DATE.split('-').reverse().join('/') }));
}

// Anteprima per la Dashboard.
export function preview() {
  const hex = '00505612AB34';
  return {
    href: `?mac=${formatMac(hex, 'colon', false)}`,
    body: kvList([
      { label: formatLabel('cisco'), value: formatMac(hex, 'cisco', false) },
      { label: formatLabel('colon'), value: formatMac(hex, 'colon', false) },
      { label: formatLabel('dash'), value: formatMac(hex, 'dash', true) },
      { label: t('mac.vendor'), value: lookupVendor(hex) ?? '—', hl: true },
    ], 'kv--compact'),
  };
}

// Testo della conversione multipla, conservato in memoria al cambio di lingua (mai nell'URL).
let lastBulk = '';
