// Convertitore dBm / mW / W, EIRP e budget di collegamento in spazio libero.
// Le funzioni di calcolo non usano il DOM e sono importate anche da tests/run.mjs.

import { h, fmtDec, kvList, badge, uid } from '../ui/dom.js';
import { dashlet } from '../ui/dashlet.js';
import { BANDS } from '../../data/rf-limits.js';

// ---------------------------------------------------------------- Calcoli

export const dbmToMw = (dbm) => 10 ** (dbm / 10);

export function mwToDbm(mw) {
  return mw > 0 ? 10 * Math.log10(mw) : null;
}

// EIRP = potenza del trasmettitore − perdita del cavo + guadagno d'antenna.
export const eirp = (txDbm, cableLossDb = 0, antennaGainDbi = 0) => txDbm - cableLossDb + antennaGainDbi;

// Free Space Path Loss con distanza in km e frequenza in MHz.
export function fspl(distanceKm, freqMHz) {
  if (!(distanceKm > 0) || !(freqMHz > 0)) return null;
  return 20 * Math.log10(distanceKm) + 20 * Math.log10(freqMHz) + 32.44;
}

export function linkBudget({ eirpDbm, distanceKm, freqMHz, rxGainDbi = 0, rxLossDb = 0, sensitivityDbm = null }) {
  const loss = fspl(distanceKm, freqMHz);
  if (loss == null) return null;
  const rxDbm = eirpDbm - loss + rxGainDbi - rxLossDb;
  const result = { fspl: loss, rxDbm, margin: null, maxDistanceKm: null };
  if (sensitivityDbm != null) {
    result.margin = rxDbm - sensitivityDbm;
    // Distanza alla quale la potenza ricevuta eguaglia la sensibilità (spazio libero).
    const allowed = eirpDbm + rxGainDbi - rxLossDb - sensitivityDbm;
    result.maxDistanceKm = 10 ** ((allowed - 32.44 - 20 * Math.log10(freqMHz)) / 20);
  }
  return result;
}

export function bandCheck(eirpDbm, bandId) {
  const band = BANDS.find((b) => b.id === bandId && b.eirp != null);
  if (!band) return null;
  return { band, limit: band.eirp, excess: eirpDbm - band.eirp, ok: eirpDbm <= band.eirp + 1e-9 };
}

// Accetta virgola o punto decimale, segno e notazione esponenziale.
export function parseNumber(text) {
  const s = String(text ?? '').trim().replace(',', '.');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return null;
  return Number(s);
}

// ---------------------------------------------------------------- Formattazione

const sig = new Intl.NumberFormat('it-IT', { maximumSignificantDigits: 6, useGrouping: false });
const fmtSig = (n) => sig.format(n);

export function formatPower(mw) {
  if (mw >= 1000) return `${fmtDec(mw / 1000, 3)} W`;
  if (mw >= 1) return `${fmtDec(mw, 3)} mW`;
  if (mw >= 1e-3) return `${fmtDec(mw * 1e3, 3)} µW`;
  if (mw >= 1e-6) return `${fmtDec(mw * 1e6, 3)} nW`;
  return `${fmtDec(mw * 1e9, 3)} pW`;
}

export function formatDistance(km) {
  if (km >= 1) return `${fmtDec(km, 2)} km`;
  return `${fmtDec(km * 1000, km * 1000 >= 10 ? 0 : 1)} m`;
}

// ---------------------------------------------------------------- Interfaccia

const DEFAULTS = { dbm: '20', tx: '17', loss: '1', gain: '4', band: '2g4', d: '50', unit: 'm', f: '2437', grx: '2', lrx: '0', sens: '-67' };
const DBM_EXAMPLES = ['0', '20', '30', '-67'];
const FREQ_EXAMPLES = [['2412', 'ch 1'], ['2437', 'ch 6'], ['5180', 'ch 36'], ['5500', 'ch 100'], ['6135', '6E ch 37']];

function numberField(id, label, unit, attrs = {}) {
  const input = h('input', { id, class: 'input input--mono', type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false', 'aria-describedby': `${id}-err`, ...attrs });
  const error = h('span', { class: 'field__error', id: `${id}-err`, 'aria-live': 'polite' });
  const el = h('div', { class: 'field' },
    h('label', { for: id }, label, unit ? h('span', { class: 'field__unit' }, ` (${unit})`) : null),
    input, error);
  return { input, error, el };
}

// hl: true per l'evidenza azzurra, oppure 'ok' | 'warn' | 'err' per colorare lo stato.
function kpi(label, value, unit, hl = false) {
  const cls = hl === true ? 'kpi kpi--hl' : hl ? `kpi kpi--${hl}` : 'kpi';
  return h('div', { class: cls },
    h('div', { class: 'kpi__label' }, label),
    h('div', { class: 'kpi__value' }, value, unit ? h('small', null, unit) : null));
}

function setError(field, message) {
  field.error.textContent = message ?? '';
  if (message) field.input.setAttribute('aria-invalid', 'true');
  else field.input.removeAttribute('aria-invalid');
}

export function render(container, params, ctx) {
  const v = (key) => params.get(key) ?? DEFAULTS[key];

  // --- Conversione
  const dbm = numberField(uid('dbm'), 'dBm');
  const mw = numberField(uid('mw'), 'mW');
  const w = numberField(uid('w'), 'W');
  const dbw = h('dd', null);
  const convPower = h('dd', { class: 'hl' });
  const convDl = dashlet({ title: 'Conversione', expandable: false, onReset: () => { dbm.input.value = DEFAULTS.dbm; fromDbm(); } });
  convDl.body.append(
    h('div', { class: 'field-row field-row--3' }, dbm.el, mw.el, w.el),
    h('div', { class: 'examples' },
      h('span', { class: 'examples__label' }, 'Esempi'),
      DBM_EXAMPLES.map((x) => h('button', { type: 'button', class: 'chip', onclick: () => { dbm.input.value = x; fromDbm(); } }, `${x.replace('-', '−')} dBm`))),
    h('dl', { class: 'kv kv--compact' }, h('dt', null, 'Potenza'), convPower, h('dt', null, 'dBW'), dbw),
    h('p', { class: 'field__hint' }, 'P(mW) = 10^(dBm/10). Modifica un campo qualsiasi: gli altri si aggiornano.'));

  // --- EIRP
  const tx = numberField(uid('tx'), 'Potenza Tx', 'dBm');
  const loss = numberField(uid('loss'), 'Perdita cavo', 'dB');
  const gain = numberField(uid('gain'), 'Guadagno antenna', 'dBi');
  const bandId = uid('band');
  const bandSelect = h('select', { id: bandId, class: 'input' }, BANDS.map((b) => h('option', { value: b.id }, b.label)));
  const eirpOut = h('div');
  const eirpDl = dashlet({ title: 'EIRP', expandable: false, onReset: () => {
    tx.input.value = DEFAULTS.tx; loss.input.value = DEFAULTS.loss; gain.input.value = DEFAULTS.gain; bandSelect.value = DEFAULTS.band; update();
  } });
  eirpDl.body.append(
    h('div', { class: 'field-row field-row--3' }, tx.el, loss.el, gain.el),
    h('div', { class: 'field' }, h('label', { for: bandId }, 'Confronta con il limite EIRP della banda'), bandSelect),
    eirpOut);

  // --- Budget di collegamento
  const dist = numberField(uid('d'), 'Distanza');
  const unitSelect = h('select', { class: 'input', 'aria-label': 'Unità della distanza' }, h('option', { value: 'm' }, 'm'), h('option', { value: 'km' }, 'km'));
  const distGroup = h('div', { class: 'input-group' });
  dist.input.replaceWith(distGroup);
  distGroup.append(dist.input, unitSelect);
  const freq = numberField(uid('f'), 'Frequenza', 'MHz');
  const grx = numberField(uid('grx'), 'Guadagno antenna Rx', 'dBi');
  const lrx = numberField(uid('lrx'), 'Perdita cavo Rx', 'dB');
  const sens = numberField(uid('sens'), 'Sensibilità Rx', 'dBm', { placeholder: 'facoltativa' });
  const budgetOut = h('div');
  const budgetDl = dashlet({ title: 'Budget di collegamento', subtitle: 'spazio libero, usa l’EIRP sopra', className: 'span-all', onReset: () => {
    for (const [f, k] of [[dist, 'd'], [freq, 'f'], [grx, 'grx'], [lrx, 'lrx'], [sens, 'sens']]) f.input.value = DEFAULTS[k];
    unitSelect.value = DEFAULTS.unit; update();
  } });
  budgetDl.body.append(h('div', { class: 'tool-split' },
    h('div', null,
      h('div', { class: 'field-row field-row--2' }, dist.el, freq.el),
      h('div', { class: 'examples' },
        h('span', { class: 'examples__label' }, 'Canali'),
        FREQ_EXAMPLES.map(([f, label]) => h('button', { type: 'button', class: 'chip', title: `${f} MHz`, onclick: () => { freq.input.value = f; update(); } }, label))),
      h('div', { class: 'field-row field-row--3' }, grx.el, lrx.el, sens.el),
      h('p', { class: 'field__hint' }, 'FSPL = 20·log₁₀(d km) + 20·log₁₀(f MHz) + 32,44. Non considera muri, ostacoli, zona di Fresnel né multipath: in interni la perdita reale è maggiore.')),
    budgetOut));

  container.append(h('div', { class: 'tool-grid tool-grid--half' }, convDl.el, eirpDl.el, budgetDl.el));

  // --- Logica
  function showConversion(mwValue, source) {
    const dbmValue = mwToDbm(mwValue);
    if (source !== 'dbm') dbm.input.value = fmtSig(dbmValue);
    if (source !== 'mw') mw.input.value = fmtSig(mwValue);
    if (source !== 'w') w.input.value = fmtSig(mwValue / 1000);
    convPower.textContent = `${fmtDec(dbmValue, 2)} dBm = ${formatPower(mwValue)}`;
    dbw.textContent = `${fmtDec(dbmValue - 30, 2)} dBW`;
    for (const f of [dbm, mw, w]) setError(f);
    saveParams();
  }

  function fromDbm() {
    const n = parseNumber(dbm.input.value);
    if (n == null) return setError(dbm, 'Numero non valido.');
    showConversion(dbmToMw(n), 'dbm');
  }

  function fromLinear(field, factor, source) {
    const n = parseNumber(field.input.value);
    if (n == null) return setError(field, 'Numero non valido.');
    if (n <= 0) return setError(field, 'La potenza in scala lineare deve essere maggiore di zero.');
    showConversion(n * factor, source);
  }

  dbm.input.addEventListener('input', fromDbm);
  mw.input.addEventListener('input', () => fromLinear(mw, 1, 'mw'));
  w.input.addEventListener('input', () => fromLinear(w, 1000, 'w'));

  function readField(field, { required = true } = {}) {
    const raw = field.input.value.trim();
    if (!raw && !required) { setError(field); return { ok: true, value: null }; }
    const n = parseNumber(raw);
    setError(field, n == null ? 'Numero non valido.' : null);
    return { ok: n != null, value: n };
  }

  function update() {
    const fields = { tx: readField(tx), loss: readField(loss), gain: readField(gain) };
    if (!fields.tx.ok || !fields.loss.ok || !fields.gain.ok) { saveParams(); return; }
    const e = eirp(fields.tx.value, fields.loss.value, fields.gain.value);
    const check = bandCheck(e, bandSelect.value);
    const nodes = [h('div', { class: 'kpis' },
      kpi('EIRP', fmtDec(e, 2), 'dBm', true),
      kpi('EIRP lineare', formatPower(dbmToMw(e))),
      kpi('Limite banda', check ? fmtDec(check.limit, 0) : '—', check ? 'dBm' : ''),
      kpi('Esito', check ? (check.ok ? 'Entro' : 'Oltre') : '—', '', check ? (check.ok ? 'ok' : 'err') : false))];
    if (check) {
      nodes.push(h('ul', { class: 'notes' },
        h('li', { class: `note${check.ok ? '' : ' note--err'}` },
          badge(check.ok ? 'entro il limite' : `oltre di ${fmtDec(check.excess, 2)} dB`, check.ok ? 'ok' : 'err'), ' ',
          check.band.note, check.band.psd != null ? ` Limite di densità: ${check.band.psd} dBm/MHz.` : ''),
        h('li', { class: 'note' }, 'Valori indicativi: verifica la normativa nazionale e le condizioni d’uso (TPC, DFS, interno/esterno).')));
    }
    eirpOut.replaceChildren(...nodes);

    // Budget
    const b = { d: readField(dist), f: readField(freq), grx: readField(grx), lrx: readField(lrx), sens: readField(sens, { required: false }) };
    let budgetNodes;
    if (Object.values(b).every((x) => x.ok)) {
      const distanceKm = unitSelect.value === 'km' ? b.d.value : b.d.value / 1000;
      if (!(distanceKm > 0)) setError(dist, 'La distanza deve essere maggiore di zero.');
      if (!(b.f.value > 0)) setError(freq, 'La frequenza deve essere maggiore di zero.');
      const lb = linkBudget({ eirpDbm: e, distanceKm, freqMHz: b.f.value, rxGainDbi: b.grx.value, rxLossDb: b.lrx.value, sensitivityDbm: b.sens.value });
      if (lb) {
        const marginKind = lb.margin == null ? null : lb.margin >= 10 ? 'ok' : lb.margin >= 0 ? 'warn' : 'err';
        budgetNodes = [
          h('div', { class: 'kpis' },
            kpi('FSPL', fmtDec(lb.fspl, 2), 'dB'),
            kpi('Potenza ricevuta', fmtDec(lb.rxDbm, 2), 'dBm', true),
            kpi('Margine', lb.margin == null ? '—' : fmtDec(lb.margin, 2), lb.margin == null ? '' : 'dB', marginKind ?? false),
            kpi('Distanza max', lb.maxDistanceKm == null ? '—' : formatDistance(lb.maxDistanceKm))),
          kvList([
            { label: 'EIRP', value: `${fmtDec(e, 2)} dBm` },
            { label: '− FSPL', value: `${fmtDec(lb.fspl, 2)} dB` },
            { label: '+ guadagno Rx', value: `${fmtDec(b.grx.value, 2)} dBi` },
            { label: '− perdita cavo Rx', value: `${fmtDec(b.lrx.value, 2)} dB` },
            { label: '= potenza ricevuta', value: `${fmtDec(lb.rxDbm, 2)} dBm (${formatPower(dbmToMw(lb.rxDbm))})`, hl: true },
            lb.margin != null ? { label: 'Margine sulla sensibilità', value: [`${fmtDec(lb.margin, 2)} dB `, badge(marginKind === 'ok' ? 'buono' : marginKind === 'warn' ? 'scarso' : 'insufficiente', marginKind)] } : null,
            lb.maxDistanceKm != null ? { label: 'Distanza alla sensibilità', value: [formatDistance(lb.maxDistanceKm), h('span', { class: 'sub' }, 'teorica, spazio libero')] } : null,
          ], 'kv--compact'),
        ];
      }
    }
    budgetOut.replaceChildren(...(budgetNodes ?? [h('p', { class: 'empty' }, 'Completa i campi per calcolare il budget.')]));
    saveParams();
  }

  function saveParams() {
    ctx.setParams({
      dbm: dbm.input.value.trim(), tx: tx.input.value.trim(), loss: loss.input.value.trim(), gain: gain.input.value.trim(),
      band: bandSelect.value, d: dist.input.value.trim(), unit: unitSelect.value, f: freq.input.value.trim(),
      grx: grx.input.value.trim(), lrx: lrx.input.value.trim(), sens: sens.input.value.trim(),
    });
  }

  for (const f of [tx, loss, gain, dist, freq, grx, lrx, sens]) f.input.addEventListener('input', update);
  bandSelect.addEventListener('change', update);
  unitSelect.addEventListener('change', update);

  dbm.input.value = v('dbm');
  tx.input.value = v('tx');
  loss.input.value = v('loss');
  gain.input.value = v('gain');
  bandSelect.value = BANDS.some((b) => b.id === v('band')) ? v('band') : DEFAULTS.band;
  dist.input.value = v('d');
  unitSelect.value = v('unit') === 'km' ? 'km' : 'm';
  freq.input.value = v('f');
  grx.input.value = v('grx');
  lrx.input.value = v('lrx');
  sens.input.value = params.has('sens') ? params.get('sens') : DEFAULTS.sens;
  fromDbm();
  update();
}

// Anteprima per la Dashboard.
export function preview() {
  const e = eirp(17, 1, 4);
  return {
    href: '',
    body: kvList([
      { label: '20 dBm', value: formatPower(dbmToMw(20)) },
      { label: '30 dBm', value: formatPower(dbmToMw(30)) },
      { label: 'EIRP 17 − 1 + 4', value: `${fmtDec(e, 0)} dBm`, hl: true },
      { label: 'FSPL 2,4 GHz, 1 km', value: `${fmtDec(fspl(1, 2400), 1)} dB` },
    ], 'kv--compact'),
  };
}
