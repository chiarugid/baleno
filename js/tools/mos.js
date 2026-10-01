// Stima della qualità voce con l'E-model (ITU-T G.107): fattore R e MOS.
// Le funzioni di calcolo non usano il DOM e sono importate anche da tests/run.mjs.

import { h, fmtDec, kvList, badge, uid } from '../ui/dom.js';
import { dashlet } from '../ui/dashlet.js';
import { dataTable } from '../ui/table.js';
import { EMODEL_CODECS, ADVANTAGE, CATEGORIES } from '../../data/emodel.js';

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
  return CATEGORIES.find((c) => r >= c.min);
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
  if (!p) return { ok: false, field: 'codec', error: 'Codec sconosciuto.' };
  if (!Number.isFinite(delayMs) || delayMs < 0) return { ok: false, field: 'delay', error: 'Il ritardo deve essere un numero maggiore o uguale a zero.' };
  if (!Number.isFinite(lossPct) || lossPct < 0 || lossPct > 100) return { ok: false, field: 'loss', error: 'La perdita deve essere tra 0 e 100%.' };
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
  return h('div', { class: 'rscale', role: 'img', 'aria-label': `Fattore R ${fmtDec(r, 1)} su una scala da 0 a 100` },
    h('div', { class: 'rscale__bar' }, bands.map(([a, b, s]) => h('span', { class: `rscale__band rscale__band--${s}`, style: `flex-grow:${b - a}` })),
      h('span', { class: 'rscale__marker', style: `left:${pos}%` })),
    h('div', { class: 'rscale__ticks', 'aria-hidden': 'true' }, ['0', '50', '60', '70', '80', '90', '100'].map((t) => h('span', { style: `left:${t}%` }, t))));
}

function resultView(m, delayParts) {
  const nodes = [
    h('div', { class: 'kpis' },
      kpi('Fattore R', fmtDec(m.r, 1), '', m.category.state),
      kpi('MOS', fmtDec(m.mos, 2), '', m.category.state),
      kpi('Qualità (G.109)', m.category.label, '', m.category.state),
      kpi('Ritardo one-way', fmtDec(m.delayMs, 0), 'ms', m.overG114 ? 'warn' : false)),
    scale(m.r),
    h('h3', { class: 'section-title' }, 'Calcolo'),
    kvList([
      { label: 'R0 (rumore e base)', value: fmtDec(R0, 1) },
      { label: '− Is (simultaneo)', value: fmtDec(m.is, 1) },
      { label: '− Id (ritardo)', value: [fmtDec(m.id, 2), h('span', { class: 'sub' }, `${fmtDec(m.delayMs, 0)} ms one-way${delayParts ? ` = ${delayParts}` : ''}`)] },
      { label: '− Ie,eff (codec e perdita)', value: [fmtDec(m.ieEff, 2), h('span', { class: 'sub' }, `Ie ${fmtDec(m.ie, 1)}, Bpl ${fmtDec(m.bpl, 1)}, perdita ${fmtDec(m.lossPct, 2)}%`)] },
      { label: '+ A (vantaggio)', value: fmtDec(m.advantage, 0) },
      { label: '= R', value: fmtDec(m.r, 2), hl: true },
      { label: 'MOS', value: fmtDec(m.mos, 2), hl: true },
    ]),
  ];
  const notes = [];
  if (m.delayMs > 400) notes.push(h('li', { class: 'note note--err' }, badge('G.114', 'err'), ` Ritardo one-way di ${fmtDec(m.delayMs, 0)} ms: oltre 400 ms è inaccettabile per la conversazione.`));
  else if (m.overG114) notes.push(h('li', { class: 'note note--warn' }, badge('G.114', 'warn'), ` Ritardo one-way di ${fmtDec(m.delayMs, 0)} ms, oltre i 150 ms raccomandati: la conversazione diventa meno interattiva.`));
  if (m.codec.estimate) notes.push(h('li', { class: 'note note--warn' }, badge('stima', 'warn'), ` ${m.codec.name}: ${m.codec.source}.`));
  if (m.r < 50) notes.push(h('li', { class: 'note note--err' }, 'R sotto 50: qualità non raccomandata (G.109).'));
  notes.push(h('li', { class: 'note' }, 'Ipotesi: perdita casuale (BurstR = 1), Is = 0, Id ≈ 0,024·d + 0,11·(d − 177,3) oltre 177,3 ms (approssimazione dell’Id di G.107 di Cole e Rosenbluth, ACM SIGCOMM CCR 2001). È una stima di pianificazione, non una misura.'));
  nodes.push(h('ul', { class: 'notes' }, notes));
  return nodes;
}

export function render(container, params, ctx) {
  const v = (key) => params.get(key) ?? DEFAULTS[key];
  const ids = { codec: uid('codec'), br: uid('br'), mode: uid('mode'), a: uid('a') };

  const codecSelect = h('select', { id: ids.codec, class: 'input' }, EMODEL_CODECS.map((c) => h('option', { value: c.id }, c.name)));
  const opus = EMODEL_CODECS.find((c) => c.variants);
  const brSelect = h('select', { id: ids.br, class: 'input' }, opus.variants.map((x) => h('option', { value: x.bitrate }, `${x.bitrate} kbit/s (Ie ${x.ie})`)));
  const brField = h('div', { class: 'field' }, h('label', { for: ids.br }, 'Bitrate Opus'), brSelect);
  const codecHint = h('span', { class: 'field__hint' });

  const modeGroup = segmented(ids.mode, `${ids.mode}-l`, [['parti', 'Componenti'], ['totale', 'Totale']]);
  const total = numberField(uid('d'), 'Ritardo one-way', 'ms');
  const net = numberField(uid('net'), 'Rete', 'ms');
  const jb = numberField(uid('jb'), 'Jitter buffer', 'ms');
  const pt = numberField(uid('pt'), 'Packetization', 'ms');
  const partsRow = h('div', { class: 'field-row field-row--3' }, net.el, jb.el, pt.el);
  const loss = numberField(uid('loss'), 'Perdita pacchetti', '%');
  const aSelect = h('select', { id: ids.a, class: 'input' }, ADVANTAGE.map((x) => h('option', { value: x.value }, x.label)));

  const reset = () => { fill(DEFAULTS); update(); };
  const form = h('form', { novalidate: true },
    h('div', { class: 'field' }, h('label', { for: ids.codec }, 'Codec'), codecSelect, codecHint),
    brField,
    h('fieldset', { class: 'field field--plain' }, h('legend', { class: 'field__label', id: `${ids.mode}-l` }, 'Ritardo'), modeGroup),
    partsRow,
    total.el,
    loss.el,
    h('div', { class: 'field' }, h('label', { for: ids.a }, 'Fattore di vantaggio A'), aSelect,
      h('span', { class: 'field__hint' }, 'Quanto l’utente tollera la qualità in cambio della comodità (G.107).')),
    h('div', { class: 'form-actions' }, h('button', { type: 'button', class: 'btn btn--secondary', onclick: reset }, 'Reset')));
  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('input', update);
  form.addEventListener('change', update);

  const formDl = dashlet({ title: 'Parametri', expandable: false, onReset: reset });
  formDl.body.append(form);
  const resultDl = dashlet({ title: 'Risultato' });

  const table = dataTable({
    columns: [
      { key: 'name', label: 'Codec' },
      { key: 'ieEff', label: 'Ie,eff', align: 'right', format: (r) => fmtDec(r.ieEff, 1) },
      { key: 'r', label: 'R', align: 'right', format: (r) => fmtDec(r.r, 1) },
      { key: 'mos', label: 'MOS', align: 'right', format: (r) => fmtDec(r.mos, 2) },
      { key: 'quality', label: 'Qualità' },
      { key: 'note', label: 'Nota', sortable: false },
    ],
    pageSize: 10,
    pageSizes: [10, 25],
    filterPlaceholder: 'Filtra codec…',
  });
  const compareDl = dashlet({ title: 'Confronto codec', className: 'span-all', flush: true });
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
    aSelect.value = ADVANTAGE.some((a) => String(a.value) === String(x.a)) ? String(x.a) : DEFAULTS.a;
  }

  function read(field, label) {
    const n = parse(field.input.value);
    field.error.textContent = n == null ? `${label}: inserisci un numero ≥ 0.` : '';
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
    codecHint.textContent = `Ie ${fmtDec(p.ie, 1)}, Bpl ${fmtDec(p.bpl, 1)} · ${codec.source}`;
    const byParts = mode() === 'parti';
    partsRow.hidden = !byParts;
    total.el.hidden = byParts;

    let delay;
    let parts = '';
    if (byParts) {
      const n = read(net, 'Rete'); const j = read(jb, 'Jitter buffer'); const k = read(pt, 'Packetization');
      if (n == null || j == null || k == null) return;
      delay = oneWayDelay({ network: n, jitterBuffer: j, packetization: k });
      parts = `${fmtDec(n, 0)} rete + ${fmtDec(j, 0)} jitter buffer + ${fmtDec(k, 0)} packetization`;
    } else {
      delay = read(total, 'Ritardo');
      if (delay == null) return;
    }
    const lossPct = read(loss, 'Perdita');
    if (lossPct == null) return;
    if (lossPct > 100) { loss.error.textContent = 'La perdita deve essere tra 0 e 100%.'; loss.input.setAttribute('aria-invalid', 'true'); return; }

    const advantage = Number(aSelect.value);
    const m = emodel({ codec: codec.id, bitrate: brSelect.value, delayMs: delay, lossPct, advantage });
    resultDl.body.replaceChildren(...resultView(m, parts));

    table.setRows(EMODEL_CODECS.flatMap((c) => (c.variants ? c.variants.map((x) => x.bitrate) : [null]).map((bitrate) => {
      const r = emodel({ codec: c.id, bitrate, delayMs: delay, lossPct, advantage });
      return { ...r, name: bitrate ? `Opus ${bitrate} kbit/s` : c.name, quality: r.category.label, note: c.estimate ? 'stima' : '' };
    })));
    compareDl.setSubtitle(`stesso ritardo (${fmtDec(delay, 0)} ms) e perdita (${fmtDec(lossPct, 2)}%)`);

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
      { label: 'Soglia G.114', value: `${G114_LIMIT} ms one-way` },
    ], 'kv--compact'),
  };
}
