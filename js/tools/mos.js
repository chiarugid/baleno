// Stima della qualità voce con l'E-model (ITU-T G.107): fattore R e MOS.
// Le funzioni di calcolo non usano il DOM e sono importate anche da tests/run.mjs.

import { h, fmtDec, kvList, badge, uid } from '../ui/dom.js';
import { dashlet } from '../ui/dashlet.js';
import { dataTable } from '../ui/table.js';
import { t } from '../i18n.js';
import { EMODEL_CODECS, ADVANTAGE, CATEGORIES } from '../../data/emodel.js';

// Nome e fonte del codec nella lingua corrente.
export const codecName = (c) => t(`mos.codec.${c.id}`);
const codecSource = (c) => (c.estimate ? t(`mos.source.${c.id}`) : t('mos.source.g113'));

export const R0 = 93.2;
export const G114_LIMIT = 150;

// Degrado da ritardo one-way (ms): Id ≈ 0,024·d + 0,11·(d − 177,3)·H(d − 177,3),
// approssimazione dell'Id di G.107 con i parametri di default da R. G. Cole e
// J. H. Rosenbluth, "Voice over IP Performance Monitoring", ACM SIGCOMM CCR 31(2), 2001.
// H è il gradino: il secondo termine vale 0 fino a 177,3 ms e non è mai negativo.
export function delayImpairment(oneWayMs) {
  const d = Math.max(0, oneWayMs);
  return 0.024 * d + (d > 177.3 ? 0.11 * (d - 177.3) : 0);
}

// Ie,eff = Ie + (95 − Ie) · Ppl / (Ppl + Bpl), perdita casuale (BurstR = 1).
export function effectiveIe(ie, bpl, lossPct) {
  const ppl = Math.max(0, lossPct);
  return ie + (95 - ie) * (ppl / (ppl + bpl));
}

export function rToMos(r) {
  if (r <= 0) return 1;
  if (r >= 100) return 4.5;
  return 1 + 0.035 * r + r * (r - 60) * (100 - r) * 7e-6;
}

export function category(r) {
  const c = CATEGORIES.find((x) => r >= x.min);
  return { ...c, label: t(`mos.cat.${c.id}`) };
}

export function codecParams(codecId, bitrate) {
  const codec = EMODEL_CODECS.find((c) => c.id === codecId);
  if (!codec) return null;
  if (!codec.variants) return { codec, ie: codec.ie, bpl: codec.bpl };
  const variant = codec.variants.find((v) => v.bitrate === Number(bitrate)) ?? codec.variants.at(-1);
  return { codec, ie: variant.ie, bpl: variant.bpl, bitrate: variant.bitrate };
}

export function oneWayDelay({ network = 0, jitterBuffer = 0, packetization = 0 }) {
  return network + jitterBuffer + packetization;
}

export function emodel({ codec = 'g711', bitrate, delayMs = 0, lossPct = 0, advantage = 0, is = 0 } = {}) {
  const p = codecParams(codec, bitrate);
  if (!p) return { ok: false, field: 'codec', error: t('mos.err.codec') };
  if (!Number.isFinite(delayMs) || delayMs < 0) return { ok: false, field: 'delay', error: t('mos.err.delay') };
  if (!Number.isFinite(lossPct) || lossPct < 0 || lossPct > 100) return { ok: false, field: 'loss', error: t('mos.err.loss') };
  const id = delayImpairment(delayMs);
  const ieEff = effectiveIe(p.ie, p.bpl, lossPct);
  const r = R0 - is - id - ieEff + advantage;
  const mos = rToMos(r);
  return {
    ok: true, codec: p.codec, bitrate: p.bitrate ?? null, ie: p.ie, bpl: p.bpl,
    delayMs, lossPct, advantage, is, id, ieEff, r, mos,
    category: category(r),
    overG114: delayMs > G114_LIMIT,
  };
}

// ---------------------------------------------------------------- Interfaccia

const DEFAULTS = { codec: 'g711', br: '24', mode: 'parti', d: '100', net: '40', jb: '40', pt: '20', loss: '0', a: '0' };

function parse(text) {
  const s = String(text ?? '').trim().replace(',', '.');
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : null;
}

function kpi(label, value, unit, state = false) {
  const cls = state === true ? 'kpi kpi--hl' : state ? `kpi kpi--${state}` : 'kpi';
  return h('div', { class: cls }, h('div', { class: 'kpi__label' }, label), h('div', { class: 'kpi__value' }, value, unit ? h('small', null, unit) : null));
}

function numberField(id, label, unit) {
  const input = h('input', { id, class: 'input input--mono', type: 'text', inputmode: 'decimal', autocomplete: 'off', 'aria-describedby': `${id}-err` });
  const error = h('span', { class: 'field__error', id: `${id}-err`, 'aria-live': 'polite' });
  return { input, error, el: h('div', { class: 'field' }, h('label', { for: id }, label, unit ? h('span', { class: 'field__unit' }, ` (${unit})`) : null), input, error) };
}

function segmented(name, labelId, options) {
  return h('div', { class: 'segmented', role: 'radiogroup', 'aria-labelledby': labelId },
    options.map(([value, label]) => h('label', null, h('input', { type: 'radio', name, value }), h('span', null, label))));
}

// Scala R 0–100 con le fasce G.109 e un indicatore sul valore calcolato.
function scale(r) {
  const bands = [[0, 50, 'err'], [50, 60, 'err'], [60, 70, 'err'], [70, 80, 'warn'], [80, 90, 'ok'], [90, 100, 'ok']];
  const pos = Math.min(100, Math.max(0, r));
  return h('div', { class: 'rscale', role: 'img', 'aria-label': t('mos.scaleAria', { r: fmtDec(r, 1) }) },
    h('div', { class: 'rscale__bar' }, bands.map(([a, b, s]) => h('span', { class: `rscale__band rscale__band--${s}`, style: `flex-grow:${b - a}` })),
      h('span', { class: 'rscale__marker', style: `left:${pos}%` })),
    h('div', { class: 'rscale__ticks', 'aria-hidden': 'true' }, ['0', '50', '60', '70', '80', '90', '100'].map((n) => h('span', { style: `left:${n}%` }, n))));
}

function resultView(m, delayParts) {
  const nodes = [
    h('div', { class: 'kpis' },
      kpi(t('mos.rFactor'), fmtDec(m.r, 1), '', m.category.state),
      kpi('MOS', fmtDec(m.mos, 2), '', m.category.state),
      kpi(t('mos.quality'), m.category.label, '', m.category.state),
      kpi(t('mos.oneWay'), fmtDec(m.delayMs, 0), 'ms', m.overG114 ? 'warn' : false)),
    scale(m.r),
    h('h3', { class: 'section-title' }, t('mos.calculation')),
    kvList([
      { label: t('mos.r0'), value: fmtDec(R0, 1) },
      { label: t('mos.is'), value: fmtDec(m.is, 1) },
      { label: t('mos.id'), value: [fmtDec(m.id, 2), h('span', { class: 'sub' }, t('mos.idSub', { n: fmtDec(m.delayMs, 0), parts: delayParts ? ` = ${delayParts}` : '' }))] },
      { label: t('mos.ieEff'), value: [fmtDec(m.ieEff, 2), h('span', { class: 'sub' }, t('mos.ieSub', { ie: fmtDec(m.ie, 1), bpl: fmtDec(m.bpl, 1), loss: fmtDec(m.lossPct, 2) }))] },
      { label: t('mos.a'), value: fmtDec(m.advantage, 0) },
      { label: '= R', value: fmtDec(m.r, 2), hl: true },
      { label: 'MOS', value: fmtDec(m.mos, 2), hl: true },
    ]),
  ];
  const notes = [];
  if (m.delayMs > 400) notes.push(h('li', { class: 'note note--err' }, badge('G.114', 'err'), t('mos.g114Err', { n: fmtDec(m.delayMs, 0) })));
  else if (m.overG114) notes.push(h('li', { class: 'note note--warn' }, badge('G.114', 'warn'), t('mos.g114Warn', { n: fmtDec(m.delayMs, 0) })));
  if (m.codec.estimate) notes.push(h('li', { class: 'note note--warn' }, badge(t('mos.estimate'), 'warn'), ` ${codecName(m.codec)}: ${codecSource(m.codec)}.`));
  if (m.r < 50) notes.push(h('li', { class: 'note note--err' }, t('mos.below50')));
  notes.push(h('li', { class: 'note' }, t('mos.assumptions')));
  nodes.push(h('ul', { class: 'notes' }, notes));
  return nodes;
}

export function render(container, params, ctx) {
  const v = (key) => params.get(key) ?? DEFAULTS[key];
  const ids = { codec: uid('codec'), br: uid('br'), mode: uid('mode'), a: uid('a') };

  const codecSelect = h('select', { id: ids.codec, class: 'input' }, EMODEL_CODECS.map((c) => h('option', { value: c.id }, codecName(c))));
  const opus = EMODEL_CODECS.find((c) => c.variants);
  const brSelect = h('select', { id: ids.br, class: 'input' }, opus.variants.map((x) => h('option', { value: x.bitrate }, `${x.bitrate} kbit/s (Ie ${x.ie})`)));
  const brField = h('div', { class: 'field' }, h('label', { for: ids.br }, t('mos.opusBitrate')), brSelect);
  const codecHint = h('span', { class: 'field__hint' });

  const modeGroup = segmented(ids.mode, `${ids.mode}-l`, [['parti', t('mos.parts')], ['totale', t('mos.total')]]);
  const total = numberField(uid('d'), t('mos.oneWay'), 'ms');
  const net = numberField(uid('net'), t('mos.network'), 'ms');
  const jb = numberField(uid('jb'), 'Jitter buffer', 'ms');
  const pt = numberField(uid('pt'), 'Packetization', 'ms');
  const partsRow = h('div', { class: 'field-row field-row--3' }, net.el, jb.el, pt.el);
  const loss = numberField(uid('loss'), t('mos.loss'), '%');
  const aSelect = h('select', { id: ids.a, class: 'input' }, ADVANTAGE.map((x) => h('option', { value: x }, t(`mos.adv.${x}`))));

  const reset = () => { fill(DEFAULTS); update(); };
  const form = h('form', { novalidate: true },
    h('div', { class: 'field' }, h('label', { for: ids.codec }, t('voip.codec')), codecSelect, codecHint),
    brField,
    h('fieldset', { class: 'field field--plain' }, h('legend', { class: 'field__label', id: `${ids.mode}-l` }, t('mos.delay')), modeGroup),
    partsRow,
    total.el,
    loss.el,
    h('div', { class: 'field' }, h('label', { for: ids.a }, t('mos.advantage')), aSelect,
      h('span', { class: 'field__hint' }, t('mos.advantageHint'))),
    h('div', { class: 'form-actions' }, h('button', { type: 'button', class: 'btn btn--secondary', onclick: reset }, t('ui.resetBtn'))));
  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('input', update);
  form.addEventListener('change', update);

  const formDl = dashlet({ title: t('ui.parameters'), expandable: false, onReset: reset });
  formDl.body.append(form);
  const resultDl = dashlet({ title: t('ui.result') });

  const table = dataTable({
    columns: [
      { key: 'name', label: t('voip.codec') },
      { key: 'ieEff', label: 'Ie,eff', align: 'right', format: (r) => fmtDec(r.ieEff, 1) },
      { key: 'r', label: 'R', align: 'right', format: (r) => fmtDec(r.r, 1) },
      { key: 'mos', label: 'MOS', align: 'right', format: (r) => fmtDec(r.mos, 2) },
      { key: 'quality', label: t('mos.colQuality') },
      { key: 'note', label: t('mos.colNote'), sortable: false },
    ],
    pageSize: 10,
    pageSizes: [10, 25],
    filterPlaceholder: t('voip.filterCodec'),
  });
  const compareDl = dashlet({ title: t('voip.compare'), className: 'span-all', flush: true });
  compareDl.body.append(table.el);

  container.append(h('div', { class: 'tool-grid' }, formDl.el, resultDl.el, compareDl.el));

  const mode = () => modeGroup.querySelector('input:checked')?.value ?? 'parti';
  const setRadio = (value) => { for (const i of modeGroup.querySelectorAll('input')) i.checked = i.value === value; };

  function fill(x) {
    codecSelect.value = EMODEL_CODECS.some((c) => c.id === x.codec) ? x.codec : DEFAULTS.codec;
    brSelect.value = opus.variants.some((o) => String(o.bitrate) === String(x.br)) ? String(x.br) : DEFAULTS.br;
    setRadio(x.mode === 'totale' ? 'totale' : 'parti');
    total.input.value = x.d;
    net.input.value = x.net;
    jb.input.value = x.jb;
    pt.input.value = x.pt;
    loss.input.value = x.loss;
    aSelect.value = ADVANTAGE.some((a) => String(a) === String(x.a)) ? String(x.a) : DEFAULTS.a;
  }

  function read(field, label) {
    const n = parse(field.input.value);
    field.error.textContent = n == null ? t('mos.err.field', { label }) : '';
    if (n == null) field.input.setAttribute('aria-invalid', 'true');
    else field.input.removeAttribute('aria-invalid');
    return n;
  }

  let lastCodec = codecSelect.value;
  function update() {
    const codec = EMODEL_CODECS.find((c) => c.id === codecSelect.value);
    // Cambiando codec, la packetization predefinita segue il codec (es. 30 ms per G.723.1).
    if (codec.id !== lastCodec) { pt.input.value = String(codec.ptime); lastCodec = codec.id; }
    brField.hidden = !codec.variants;
    const p = codecParams(codec.id, brSelect.value);
    codecHint.textContent = `Ie ${fmtDec(p.ie, 1)}, Bpl ${fmtDec(p.bpl, 1)} · ${codecSource(codec)}`;
    const byParts = mode() === 'parti';
    partsRow.hidden = !byParts;
    total.el.hidden = byParts;

    let delay;
    let parts = '';
    if (byParts) {
      const n = read(net, t('mos.network')); const j = read(jb, 'Jitter buffer'); const k = read(pt, 'Packetization');
      if (n == null || j == null || k == null) return;
      delay = oneWayDelay({ network: n, jitterBuffer: j, packetization: k });
      parts = t('mos.partsText', { net: fmtDec(n, 0), jb: fmtDec(j, 0), pt: fmtDec(k, 0) });
    } else {
      delay = read(total, t('mos.delay'));
      if (delay == null) return;
    }
    const lossPct = read(loss, t('mos.lossShort'));
    if (lossPct == null) return;
    if (lossPct > 100) { loss.error.textContent = t('mos.err.loss'); loss.input.setAttribute('aria-invalid', 'true'); return; }

    const advantage = Number(aSelect.value);
    const m = emodel({ codec: codec.id, bitrate: brSelect.value, delayMs: delay, lossPct, advantage });
    resultDl.body.replaceChildren(...resultView(m, parts));

    table.setRows(EMODEL_CODECS.flatMap((c) => (c.variants ? c.variants.map((x) => x.bitrate) : [null]).map((bitrate) => {
      const r = emodel({ codec: c.id, bitrate, delayMs: delay, lossPct, advantage });
      return { ...r, name: bitrate ? `Opus ${bitrate} kbit/s` : codecName(c), quality: r.category.label, note: c.estimate ? t('mos.estimate') : '' };
    })));
    compareDl.setSubtitle(t('mos.compareSub', { delay: fmtDec(delay, 0), loss: fmtDec(lossPct, 2) }));

    ctx.setParams({
      codec: codec.id, br: codec.variants ? brSelect.value : '', mode: byParts ? '' : 'totale',
      d: byParts ? '' : total.input.value.trim(), net: byParts ? net.input.value.trim() : '', jb: byParts ? jb.input.value.trim() : '',
      pt: byParts ? pt.input.value.trim() : '', loss: loss.input.value.trim(), a: aSelect.value === '0' ? '' : aSelect.value,
    });
  }

  fill({ codec: v('codec'), br: v('br'), mode: v('mode'), d: v('d'), net: v('net'), jb: v('jb'), pt: v('pt'), loss: v('loss'), a: v('a') });
  lastCodec = codecSelect.value;
  update();
}

// Anteprima per la Dashboard.
export function preview() {
  const a = emodel({ codec: 'g711', delayMs: 100, lossPct: 0 });
  const b = emodel({ codec: 'g729a', delayMs: 100, lossPct: 1 });
  return {
    href: '',
    body: kvList([
      { label: 'G.711, 100 ms, 0%', value: `R ${fmtDec(a.r, 1)} · MOS ${fmtDec(a.mos, 2)}`, hl: true },
      { label: 'G.729A, 100 ms, 1%', value: `R ${fmtDec(b.r, 1)} · MOS ${fmtDec(b.mos, 2)}` },
      { label: t('mos.g114Threshold'), value: `${G114_LIMIT} ms one-way` },
    ], 'kv--compact'),
  };
}
