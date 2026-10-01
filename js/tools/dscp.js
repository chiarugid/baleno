// Tabella e convertitore DSCP / ToS / IP Precedence / CoS.
// dscpInfo() e parseValue() non usano il DOM e sono importate anche da tests/run.mjs.

import { h, fmtInt, kvList, badge, uid } from '../ui/dom.js';
import { dashlet } from '../ui/dashlet.js';
import { dataTable } from '../ui/table.js';
import { t, tAll } from '../i18n.js';
import { DSCP_POINTS, PRECEDENCE_NAMES, ECN_NAMES } from '../../data/dscp.js';

const bin = (n, width) => n.toString(2).padStart(width, '0');
const hex = (n, width = 2) => `0x${n.toString(16).toUpperCase().padStart(width, '0')}`;

export function findPoint(name) {
  const key = String(name).trim().toUpperCase().replace(/\s+/g, '');
  return DSCP_POINTS.find((p) => p.name === key || p.alias === key || (key === 'BE' && p.dscp === 0)) ?? null;
}

// Tutte le rappresentazioni di un valore DSCP (0–63), con ECN facoltativo (0–3).
export function dscpInfo(dscp, ecn = 0) {
  const point = DSCP_POINTS.find((p) => p.dscp === dscp) ?? null;
  const tos = (dscp << 2) | ecn;
  const precedence = dscp >> 3;
  const afClass = dscp >> 3;
  const afDrop = (dscp >> 1) & 3;
  const isAf = (dscp & 1) === 0 && afClass >= 1 && afClass <= 4 && afDrop >= 1 && afDrop <= 3;
  return {
    dscp,
    ecn,
    name: point?.name ?? null,
    alias: point?.alias ?? null,
    point,
    bin: bin(dscp, 6),
    hex: hex(dscp),
    tos,
    tosBin: bin(tos, 8),
    tosHex: hex(tos),
    precedence,
    precedenceName: PRECEDENCE_NAMES[precedence],
    // Mappatura usuale DSCP → 802.1p: i tre bit alti (es. EF 46 → CoS 5).
    cos: precedence,
    ecnName: ecn === 3 ? t('dscp.ecn.3') : ECN_NAMES[ecn],
    af: isAf ? { cls: afClass, drop: afDrop, dropName: t(`dscp.drop.${afDrop}`) } : null,
    isCs: (dscp & 7) === 0,
  };
}

function parseNumber(text) {
  const s = text.trim().toLowerCase();
  if (/^0x[0-9a-f]+$/.test(s)) return parseInt(s.slice(2), 16);
  if (/^0b[01]+$/.test(s)) return parseInt(s.slice(2), 2);
  if (/^[01]+b$/.test(s)) return parseInt(s.slice(0, -1), 2);
  if (/^\d+$/.test(s)) return Number(s);
  return null;
}

// kind: 'dscp' | 'tos' | 'prec'. I nomi PHB (EF, AF41, CS3, DF, LE…) sono riconosciuti sempre.
export function parseValue(text, kind = 'dscp') {
  const s = String(text ?? '').trim();
  if (!s) return { ok: false, error: t('dscp.err.empty') };
  if (/^[a-z]/i.test(s) && !/^0[xb]/i.test(s)) {
    const point = findPoint(s);
    return point ? { ok: true, dscp: point.dscp, ecn: 0, from: 'name' } : { ok: false, error: t('dscp.err.name', { value: s }) };
  }
  const n = parseNumber(s);
  if (n == null) return { ok: false, error: t('dscp.err.number') };
  if (kind === 'tos') {
    if (n > 255) return { ok: false, error: t('dscp.err.tos') };
    return { ok: true, dscp: n >> 2, ecn: n & 3, from: 'tos' };
  }
  if (kind === 'prec') {
    if (n > 7) return { ok: false, error: t('dscp.err.prec') };
    return { ok: true, dscp: n << 3, ecn: 0, from: 'prec' };
  }
  if (n > 63) return { ok: false, error: t('dscp.err.dscp') };
  return { ok: true, dscp: n, ecn: 0, from: 'dscp' };
}

export function familyOf(name) {
  if (!name) return 'altro';
  if (name.startsWith('AF')) return 'AF';
  if (name.startsWith('CS') || name === 'DF') return 'CS';
  if (name === 'EF' || name === 'VOICE-ADMIT') return 'EF';
  return 'altro';
}

// Righe della tabella nella lingua corrente (uso tipico e classe riservata tradotti).
export function tableRows() {
  return DSCP_POINTS.map((p) => ({
    ...dscpInfo(p.dscp), ...p,
    serviceClass: p.serviceClass ?? t('dscp.reserved'),
    use: t(`dscp.use.${p.name}`),
    useAll: tAll(`dscp.use.${p.name}`),
    label: p.alias ? `${p.name} / ${p.alias}` : p.name,
    family: familyOf(p.name),
  }));
}

export const TABLE_ROWS = tableRows();

// ---------------------------------------------------------------- Interfaccia

const FAMILIES = () => [['', t('dscp.famAll')], ['CS', 'CS / DF'], ['AF', 'AF'], ['EF', 'EF'], ['altro', t('dscp.famOther')]];
const KINDS = () => [['dscp', 'DSCP'], ['tos', t('dscp.tosByte')], ['prec', 'IP Precedence']];
const EXAMPLES = [['EF', 'dscp'], ['AF41', 'dscp'], ['CS3', 'dscp'], ['0xB8', 'tos'], ['5', 'prec']];

function segmented(name, labelId, options, className = '') {
  return h('div', { class: `segmented ${className}`.trim(), role: 'radiogroup', 'aria-labelledby': labelId },
    options.map(([value, label]) => h('label', null, h('input', { type: 'radio', name, value }), h('span', null, label))));
}

function kpi(label, value, hl = false) {
  return h('div', { class: hl ? 'kpi kpi--hl' : 'kpi' }, h('div', { class: 'kpi__label' }, label), h('div', { class: 'kpi__value' }, value));
}

function tosBits(info) {
  return h('div', { class: 'bits' },
    h('span', null, [...info.bin].map((b) => h('span', { class: 'bits__net' }, b))),
    h('span', null, [...bin(info.ecn, 2)].map((b) => h('span', { class: 'bits__host' }, b))));
}

function resultView(info) {
  const nodes = [h('div', { class: 'kpis' },
    kpi('PHB', info.name ?? '—', true),
    kpi('DSCP', String(info.dscp), true),
    kpi(t('dscp.tosByte'), info.tosHex),
    kpi('CoS 802.1p', String(info.cos)))];
  nodes.push(kvList([
    { label: t('dscp.phbName'), value: info.name ? [info.name, info.alias ? h('span', { class: 'sub' }, t('dscp.alias', { name: info.alias })) : null] : [badge(t('dscp.nonStandard'), 'warn')], hl: Boolean(info.name) },
    { label: 'DSCP', value: `${info.dscp} · ${info.bin} · ${info.hex}` },
    { label: t('dscp.tosTc'), value: `${info.tos} · ${info.tosHex} · ${info.tosBin}` },
    { label: 'ECN', value: `${bin(info.ecn, 2)} · ${info.ecnName}` },
    { label: 'IP Precedence', value: `${info.precedence} · ${info.precedenceName}` },
    { label: 'CoS 802.1p', value: [String(info.cos), h('span', { class: 'sub' }, t('dscp.cosHint'))] },
    info.af ? { label: t('dscp.afClass'), value: t('dscp.afValue', { cls: info.af.cls, drop: info.af.dropName }) } : null,
    info.point ? { label: t('dscp.serviceClass'), value: h('span', { class: 'sans' }, info.point.serviceClass ?? t('dscp.reserved')) } : null,
    info.point ? { label: t('dscp.definedIn'), value: info.point.rfc } : null,
    info.point ? { label: t('dscp.typicalUse'), value: h('span', { class: 'sans' }, t(`dscp.use.${info.point.name}`)) } : null,
  ]));
  nodes.push(
    h('h3', { class: 'section-title' }, t('dscp.tosTc')),
    tosBits(info),
    h('div', { class: 'bits-legend' }, h('span', null, t('dscp.legendDscp')), h('span', null, t('dscp.legendEcn'))),
  );
  if (!info.name) nodes.push(h('ul', { class: 'notes' }, h('li', { class: 'note note--warn' }, t('dscp.noteNonStandard', { n: info.dscp }))));
  return nodes;
}

export function render(container, params, ctx) {
  const ids = { value: uid('dscp'), kind: uid('kind'), fam: uid('fam') };
  const valueInput = h('input', { id: ids.value, class: 'input input--mono', type: 'text', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'characters', placeholder: 'EF, 46, 0x2E, 0b101110', 'aria-describedby': `${ids.value}-hint ${ids.value}-err` });
  const valueError = h('span', { class: 'field__error', id: `${ids.value}-err`, 'aria-live': 'polite' });
  const kindGroup = segmented(ids.kind, `${ids.kind}-l`, KINDS());

  const reset = () => { valueInput.value = 'EF'; setRadio(kindGroup, 'dscp'); update(); };
  const form = h('form', { novalidate: true },
    h('div', { class: 'field' },
      h('label', { for: ids.value }, t('dscp.value')),
      valueInput,
      h('span', { class: 'field__hint', id: `${ids.value}-hint` }, t('dscp.valueHint')),
      valueError),
    h('fieldset', { class: 'field field--plain' },
      h('legend', { class: 'field__label', id: `${ids.kind}-l` }, t('dscp.interpretAs')), kindGroup),
    h('div', { class: 'examples' },
      h('span', { class: 'examples__label' }, t('ui.examples')),
      EXAMPLES.map(([v, k]) => h('button', { type: 'button', class: 'chip', onclick: () => { valueInput.value = v; setRadio(kindGroup, k); update(); } }, k === 'tos' ? `ToS ${v}` : k === 'prec' ? `Prec ${v}` : v))),
    h('div', { class: 'form-actions' }, h('button', { type: 'button', class: 'btn btn--secondary', onclick: reset }, t('ui.resetBtn'))));
  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('input', update);
  form.addEventListener('change', update);

  const formDl = dashlet({ title: t('dscp.converter'), expandable: false, onReset: reset });
  formDl.body.append(form);
  const resultDl = dashlet({ title: t('ui.result') });

  const famGroup = segmented(ids.fam, `${ids.fam}-l`, FAMILIES(), 'segmented--auto');
  const table = dataTable({
    columns: [
      { key: 'label', label: 'PHB', sortValue: (r) => r.dscp },
      { key: 'dscp', label: 'DSCP', align: 'right', mono: true },
      { key: 'bin', label: t('dscp.colBinary'), mono: true, sortValue: (r) => r.dscp },
      { key: 'hex', label: 'Hex', mono: true, sortValue: (r) => r.dscp },
      { key: 'tos', label: 'ToS', align: 'right', mono: true },
      { key: 'tosHex', label: 'ToS hex', mono: true, sortValue: (r) => r.tos },
      { key: 'precedence', label: 'Prec.', align: 'right', mono: true },
      { key: 'cos', label: 'CoS', align: 'right', mono: true },
      { key: 'serviceClass', label: t('dscp.serviceClass') },
      { key: 'use', label: t('dscp.typicalUse'), wrap: true, sortable: false },
    ],
    pageSize: 25,
    pageSizes: [10, 25, 50],
    filterPlaceholder: t('dscp.search'),
  });
  const tableDl = dashlet({ title: t('dscp.table'), className: 'span-all', flush: true });
  tableDl.body.append(
    h('div', { class: 'dashlet__bar' }, h('span', { class: 'field__label', id: `${ids.fam}-l` }, 'Famiglia'), famGroup),
    table.el);

  container.append(h('div', { class: 'tool-grid' }, formDl.el, resultDl.el, tableDl.el));

  function setRadio(group, value) {
    for (const input of group.querySelectorAll('input')) input.checked = input.value === value;
  }

  function updateTable() {
    const family = famGroup.querySelector('input:checked')?.value || '';
    const rows = tableRows().filter((r) => !family || r.family === family);
    table.setRows(rows);
    tableDl.setSubtitle(t('dscp.codePoints', { n: fmtInt(rows.length) }));
    return family;
  }

  function update() {
    const kind = kindGroup.querySelector('input:checked')?.value ?? 'dscp';
    const parsed = parseValue(valueInput.value, kind);
    valueError.textContent = parsed.ok ? '' : parsed.error;
    if (parsed.ok) valueInput.removeAttribute('aria-invalid');
    else valueInput.setAttribute('aria-invalid', 'true');
    if (parsed.ok) resultDl.body.replaceChildren(...resultView(dscpInfo(parsed.dscp, parsed.ecn)));
    const family = famGroup.querySelector('input:checked')?.value || '';
    ctx.setParams({ v: valueInput.value.trim(), come: kind === 'dscp' ? '' : kind, famiglia: family });
  }

  famGroup.addEventListener('change', () => { updateTable(); update(); });

  valueInput.value = params.get('v') ?? 'EF';
  setRadio(kindGroup, KINDS().some(([k]) => k === params.get('come')) ? params.get('come') : 'dscp');
  setRadio(famGroup, FAMILIES().some(([f]) => f === params.get('famiglia')) ? params.get('famiglia') : '');
  updateTable();
  update();
}

// Anteprima per la Dashboard.
export function preview() {
  const ef = dscpInfo(46);
  const af41 = dscpInfo(34);
  return {
    href: '?v=EF',
    body: kvList([
      { label: 'EF', value: `${ef.dscp} · ${ef.bin} · ToS ${ef.tosHex}`, hl: true },
      { label: 'AF41', value: `${af41.dscp} · ${af41.bin} · ToS ${af41.tosHex}` },
      { label: 'CoS / Precedence', value: `EF → ${ef.cos}, AF41 → ${af41.cos}` },
      { label: 'Code point', value: fmtInt(DSCP_POINTS.length) },
    ], 'kv--compact'),
  };
}
