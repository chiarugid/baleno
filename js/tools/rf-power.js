// Convertitore dBm / mW / W, EIRP e budget di collegamento in spazio libero.
// Le funzioni di calcolo non usano il DOM e sono importate anche da tests/run.mjs.

import { h, fmtDec, kvList, badge, uid } from '../ui/dom.js';
import { dashlet } from '../ui/dashlet.js';
import { t, locale } from '../i18n.js';
import { BANDS, REGULATIONS } from '../../data/rf-limits.js';
import { fsplChart } from './rf-chart.js';

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

// targetRssiDbm: RSSI di progetto, cioè il livello minimo da garantire al client
// (es. −67 dBm per la voce su Wi-Fi). Non è la sensibilità del ricevitore.
export function linkBudget({ eirpDbm, distanceKm, freqMHz, rxGainDbi = 0, rxLossDb = 0, targetRssiDbm = null }) {
  const loss = fspl(distanceKm, freqMHz);
  if (loss == null) return null;
  const rxDbm = eirpDbm - loss + rxGainDbi - rxLossDb;
  const result = { fspl: loss, rxDbm, margin: null, maxDistanceKm: null };
  if (targetRssiDbm != null) {
    result.margin = rxDbm - targetRssiDbm;
    // Distanza alla quale la potenza ricevuta scende all'RSSI di progetto (spazio libero).
    const allowed = eirpDbm + rxGainDbi - rxLossDb - targetRssiDbm;
    result.maxDistanceKm = 10 ** ((allowed - 32.44 - 20 * Math.log10(freqMHz)) / 20);
  }
  return result;
}

// Canali da 20 MHz della banda: elenco completo se pochi, altrimenti intervallo e numero.
export function bandChannels(id) {
  const band = BANDS.find((b) => b.id === id);
  if (!band?.channels) return null;
  const list = [];
  const parts = band.channels.map(([first, last, step]) => {
    const seg = [];
    for (let c = first; c <= last; c += step) seg.push(c);
    list.push(...seg);
    return seg.length <= 4 ? seg.join(', ') : `${first}–${last}`;
  });
  const text = list.length <= 4 ? list.join(', ') : `${parts.join(', ')} (${list.length})`;
  return { list, text };
}

// Bande di una normativa, con la voce "Nessuna verifica" in testa.
export const bandsFor = (reg) => BANDS.filter((b) => !b.id || b.reg === reg);

export const regulationOf = (bandId) => BANDS.find((b) => b.id === bandId)?.reg ?? null;

// Banda equivalente nell'altra normativa (stessa porzione di spettro), per il cambio di normativa.
export function equivalentBand(bandId, reg) {
  const band = BANDS.find((b) => b.id === bandId);
  if (!band?.id) return '';
  if (band.reg === reg) return band.id;
  return BANDS.find((b) => b.id === band.match && b.reg === reg)?.id ?? bandsFor(reg)[1].id;
}

// Frequenza centrale (MHz) di un canale da 20 MHz: 2,4 GHz, 5 GHz o 6 GHz secondo la banda.
export function channelFreq(bandId, channel) {
  const band = BANDS.find((b) => b.id === bandId);
  if (!band?.range) return null;
  const base = band.range[0] < 3000 ? 2407 : band.range[0] >= 5925 ? 5950 : 5000;
  return base + 5 * channel;
}

// Canale rappresentativo della banda per il calcolo: il 6 a 2,4 GHz, altrimenti quello centrale.
export function bandCenter(bandId) {
  const ch = bandChannels(bandId);
  if (!ch) return null;
  const band = BANDS.find((b) => b.id === bandId);
  const channel = band.range[0] < 3000 ? 6 : ch.list[Math.floor((ch.list.length - 1) / 2)];
  return { channel, freqMHz: channelFreq(bandId, channel) };
}

export function bandLabel(id) {
  const label = t(`rf.band.${id || 'none'}.label`);
  const ch = bandChannels(id);
  return ch ? `${label} · ${t('rf.channelList', { list: ch.text })}` : label;
}

export function bandCheck(eirpDbm, bandId) {
  const found = BANDS.find((b) => b.id === bandId && b.eirp != null);
  if (!found) return null;
  const band = { ...found, label: bandLabel(found.id), note: t(`rf.band.${found.id}.note`) };
  return { band, limit: band.eirp, excess: eirpDbm - band.eirp, ok: eirpDbm <= band.eirp + 1e-9 };
}

// Accetta virgola o punto decimale, segno e notazione esponenziale.
export function parseNumber(text) {
  const s = String(text ?? '').trim().replace(',', '.');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return null;
  return Number(s);
}

// ---------------------------------------------------------------- Formattazione

// Valori nei campi: 6 cifre significative, separatore decimale della lingua corrente.
const fmtSig = (n) => new Intl.NumberFormat(locale(), { maximumSignificantDigits: 6, useGrouping: false }).format(n);

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

const DEFAULTS = { dbm: '20', tx: '17', loss: '1', gain: '4', norma: 'etsi', band: '2g4', d: '50', unit: 'm', f: '2437', grx: '2', lrx: '0', rssi: '-67' };
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
  const convDl = dashlet({ title: t('rf.conversion'), expandable: false, onReset: () => { dbm.input.value = DEFAULTS.dbm; fromDbm(); } });
  convDl.body.append(
    h('div', { class: 'field-row field-row--3' }, dbm.el, mw.el, w.el),
    h('div', { class: 'examples' },
      h('span', { class: 'examples__label' }, t('ui.examples')),
      DBM_EXAMPLES.map((x) => h('button', { type: 'button', class: 'chip', onclick: () => { dbm.input.value = x; fromDbm(); } }, `${x.replace('-', '−')} dBm`))),
    h('dl', { class: 'kv kv--compact' }, h('dt', null, t('rf.power')), convPower, h('dt', null, 'dBW'), dbw),
    h('p', { class: 'field__hint' }, t('rf.convHint')));

  // --- EIRP
  const tx = numberField(uid('tx'), t('rf.txPower'), 'dBm');
  const txMw = numberField(uid('txmw'), t('rf.txPower'), 'mW');
  const loss = numberField(uid('loss'), t('rf.cableLoss'), 'dB');
  const gain = numberField(uid('gain'), t('rf.antennaGain'), 'dBi');
  const bandId = uid('band');
  const regId = uid('reg');
  const regSelect = h('select', { id: regId, class: 'input' }, REGULATIONS.map((r) => h('option', { value: r }, t(`rf.reg.${r}`))));
  const bandSelect = h('select', { id: bandId, class: 'input' });
  const fillBands = () => bandSelect.replaceChildren(...bandsFor(regSelect.value).map((b) => h('option', { value: b.id }, bandLabel(b.id))));
  const regNote = h('p', { class: 'field__hint' });
  const eirpOut = h('div');
  const eirpDl = dashlet({ title: 'EIRP', expandable: false, onReset: () => {
    tx.input.value = DEFAULTS.tx; loss.input.value = DEFAULTS.loss; gain.input.value = DEFAULTS.gain; syncTxMw();
    regSelect.value = DEFAULTS.norma; fillBands(); bandSelect.value = DEFAULTS.band; update();
  } });
  eirpDl.body.append(
    h('div', { class: 'field-row field-row--2' }, tx.el, txMw.el),
    h('div', { class: 'field-row field-row--2' }, loss.el, gain.el),
    h('div', { class: 'field-row field-row--reg' },
      h('div', { class: 'field' }, h('label', { for: regId }, t('rf.regulation')), regSelect),
      h('div', { class: 'field' }, h('label', { for: bandId }, t('rf.compareBand')), bandSelect)),
    regNote,
    eirpOut);

  // --- Budget di collegamento
  const dist = numberField(uid('d'), t('rf.distance'));
  const unitSelect = h('select', { class: 'input', 'aria-label': t('rf.distanceUnit') }, h('option', { value: 'm' }, 'm'), h('option', { value: 'km' }, 'km'));
  const distGroup = h('div', { class: 'input-group' });
  dist.input.replaceWith(distGroup);
  distGroup.append(dist.input, unitSelect);
  const freq = numberField(uid('f'), t('rf.frequency'), 'MHz');
  const grx = numberField(uid('grx'), t('rf.rxGain'), 'dBi');
  const lrx = numberField(uid('lrx'), t('rf.rxLoss'), 'dB');
  const sens = numberField(uid('rssi'), t('rf.targetRssi'), 'dBm', { placeholder: t('ui.optional') });
  const budgetOut = h('div');
  const budgetDl = dashlet({ title: t('rf.budgetTitle'), subtitle: t('rf.budgetSub'), className: 'span-all', onReset: () => {
    for (const [f, k] of [[dist, 'd'], [freq, 'f'], [grx, 'grx'], [lrx, 'lrx'], [sens, 'rssi']]) f.input.value = DEFAULTS[k];
    unitSelect.value = DEFAULTS.unit; update();
  } });
  budgetDl.body.append(h('div', { class: 'tool-split' },
    h('div', null,
      h('div', { class: 'field-row field-row--2' }, dist.el, freq.el),
      h('div', { class: 'examples' },
        h('span', { class: 'examples__label' }, t('rf.channels')),
        FREQ_EXAMPLES.map(([f, label]) => h('button', { type: 'button', class: 'chip', title: `${f} MHz`, onclick: () => { freq.input.value = f; update(); } }, label))),
      h('div', { class: 'field-row field-row--3' }, grx.el, lrx.el, sens.el),
      h('p', { class: 'field__hint' }, t('rf.rssiHint')),
      h('p', { class: 'field__hint' }, t('rf.fsplHint'))),
    budgetOut));

  // --- Grafico potenza / distanza
  const chart = fsplChart({ formatPower, dbmToMw, onChange: () => saveParams() });
  const chartDl = dashlet({ title: t('rf.chart.title'), subtitle: t('rf.chart.subtitle'), className: 'span-all' });
  chartDl.body.append(chart.el);

  container.append(h('div', { class: 'tool-grid tool-grid--half' }, convDl.el, eirpDl.el, chartDl.el, budgetDl.el));

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
    if (n == null) return setError(dbm, t('ui.invalidNumber'));
    showConversion(dbmToMw(n), 'dbm');
  }

  function fromLinear(field, factor, source) {
    const n = parseNumber(field.input.value);
    if (n == null) return setError(field, t('ui.invalidNumber'));
    if (n <= 0) return setError(field, t('rf.err.linear'));
    showConversion(n * factor, source);
  }

  dbm.input.addEventListener('input', fromDbm);
  mw.input.addEventListener('input', () => fromLinear(mw, 1, 'mw'));
  w.input.addEventListener('input', () => fromLinear(w, 1000, 'w'));

  function readField(field, { required = true } = {}) {
    const raw = field.input.value.trim();
    if (!raw && !required) { setError(field); return { ok: true, value: null }; }
    const n = parseNumber(raw);
    setError(field, n == null ? t('ui.invalidNumber') : null);
    return { ok: n != null, value: n };
  }

  function update() {
    const fields = { tx: readField(tx), loss: readField(loss), gain: readField(gain) };
    if (!fields.tx.ok || !fields.loss.ok || !fields.gain.ok) { chart.update(null); saveParams(); return; }
    const e = eirp(fields.tx.value, fields.loss.value, fields.gain.value);
    const check = bandCheck(e, bandSelect.value);
    regNote.textContent = t(`rf.regNote.${regSelect.value}`);
    const nodes = [h('div', { class: 'kpis' },
      kpi('EIRP', fmtDec(e, 2), 'dBm', true),
      kpi(t('rf.eirpLinear'), formatPower(dbmToMw(e))),
      kpi(t('rf.bandLimit'), check ? fmtDec(check.limit, 0) : '—', check ? 'dBm' : ''),
      kpi(t('rf.outcome'), check ? (check.ok ? t('rf.within') : t('rf.over')) : '—', '', check ? (check.ok ? 'ok' : 'err') : false))];
    if (check) {
      nodes.push(h('ul', { class: 'notes' },
        h('li', { class: `note${check.ok ? '' : ' note--err'}` },
          badge(check.ok ? t('rf.withinLimit') : t('rf.overBy', { n: fmtDec(check.excess, 2) }), check.ok ? 'ok' : 'err'), ' ',
          check.band.note, check.band.psd != null ? t('rf.psd', { n: check.band.psd }) : ''),
        h('li', { class: 'note' }, t('rf.indicative'))));
    }
    eirpOut.replaceChildren(...nodes);

    // Budget
    const b = { d: readField(dist), f: readField(freq), grx: readField(grx), lrx: readField(lrx), rssi: readField(sens, { required: false }) };
    let budgetNodes;
    if (Object.values(b).every((x) => x.ok)) {
      const distanceKm = unitSelect.value === 'km' ? b.d.value : b.d.value / 1000;
      if (!(distanceKm > 0)) setError(dist, t('rf.err.distance'));
      if (!(b.f.value > 0)) setError(freq, t('rf.err.frequency'));
      const lb = linkBudget({ eirpDbm: e, distanceKm, freqMHz: b.f.value, rxGainDbi: b.grx.value, rxLossDb: b.lrx.value, targetRssiDbm: b.rssi.value });
      if (lb) {
        // Sopra l'RSSI di progetto con almeno 5 dB di riserva: ok; tra 0 e 5: al limite; sotto: insufficiente.
        const marginKind = lb.margin == null ? null : lb.margin >= 5 ? 'ok' : lb.margin >= 0 ? 'warn' : 'err';
        budgetNodes = [
          h('div', { class: 'kpis' },
            kpi('FSPL', fmtDec(lb.fspl, 2), 'dB'),
            kpi(t('rf.rxPower'), fmtDec(lb.rxDbm, 2), 'dBm', true),
            kpi(t('rf.marginRssi'), lb.margin == null ? '—' : fmtDec(lb.margin, 2), lb.margin == null ? '' : 'dB', marginKind ?? false),
            kpi(t('rf.maxDistance'), lb.maxDistanceKm == null ? '—' : formatDistance(lb.maxDistanceKm))),
          kvList([
            { label: 'EIRP', value: `${fmtDec(e, 2)} dBm` },
            { label: '− FSPL', value: `${fmtDec(lb.fspl, 2)} dB` },
            { label: t('rf.plusRxGain'), value: `${fmtDec(b.grx.value, 2)} dBi` },
            { label: t('rf.minusRxLoss'), value: `${fmtDec(b.lrx.value, 2)} dB` },
            { label: t('rf.equalsRx'), value: `${fmtDec(lb.rxDbm, 2)} dBm (${formatPower(dbmToMw(lb.rxDbm))})`, hl: true },
            lb.margin != null ? { label: t('rf.marginLabel'), value: [`${fmtDec(lb.margin, 2)} dB `, badge(marginKind === 'ok' ? t('rf.marginOk') : marginKind === 'warn' ? t('rf.marginWarn') : t('rf.marginErr'), marginKind)] } : null,
            lb.maxDistanceKm != null ? { label: t('rf.distanceToRssi'), value: [formatDistance(lb.maxDistanceKm), h('span', { class: 'sub' }, t('rf.theoretical'))] } : null,
          ], 'kv--compact'),
        ];
      }
    }
    budgetOut.replaceChildren(...(budgetNodes ?? [h('p', { class: 'empty' }, t('rf.incomplete'))]));
    // il grafico usa EIRP, frequenza e lato ricevente del budget, non la sua distanza
    const chartOk = b.f.ok && b.f.value > 0 && b.grx.ok && b.lrx.ok && b.rssi.ok;
    chart.update(chartOk ? { eirpDbm: e, freqMHz: b.f.value, rxGainDbi: b.grx.value, rxLossDb: b.lrx.value } : null, chartOk ? b.rssi.value : null);
    saveParams();
  }

  function saveParams() {
    ctx.setParams({
      dbm: dbm.input.value.trim(), tx: tx.input.value.trim(), loss: loss.input.value.trim(), gain: gain.input.value.trim(),
      norma: regSelect.value === DEFAULTS.norma ? '' : regSelect.value, band: bandSelect.value, d: dist.input.value.trim(), unit: unitSelect.value, f: freq.input.value.trim(),
      grx: grx.input.value.trim(), lrx: lrx.input.value.trim(), rssi: sens.input.value.trim(), ...chart.params(),
    });
  }

  // Potenza Tx in dBm o in mW: chi viene modificato aggiorna l'altro (nell'URL resta il valore in dBm).
  function syncTxMw() {
    const n = parseNumber(tx.input.value);
    txMw.input.value = n == null ? '' : fmtSig(dbmToMw(n));
    setError(txMw);
  }
  tx.input.addEventListener('input', syncTxMw);
  txMw.input.addEventListener('input', () => {
    const n = parseNumber(txMw.input.value);
    if (n == null) return setError(txMw, t('ui.invalidNumber'));
    if (n <= 0) return setError(txMw, t('rf.err.linear'));
    setError(txMw);
    tx.input.value = fmtSig(mwToDbm(n));
    update();
  });
  for (const f of [tx, loss, gain, dist, freq, grx, lrx, sens]) f.input.addEventListener('input', update);
  // Scegliendo la banda, la frequenza del budget (e del grafico) passa al suo canale centrale.
  function followBand() {
    const center = bandCenter(bandSelect.value);
    if (center) freq.input.value = String(center.freqMHz);
  }
  bandSelect.addEventListener('change', () => { followBand(); update(); });
  regSelect.addEventListener('change', () => {
    const next = equivalentBand(bandSelect.value, regSelect.value);
    fillBands();
    bandSelect.value = next;
    followBand();
    update();
  });
  unitSelect.addEventListener('change', update);

  dbm.input.value = v('dbm');
  tx.input.value = v('tx');
  syncTxMw();
  loss.input.value = v('loss');
  gain.input.value = v('gain');
  // la banda dell'URL determina la normativa se norma manca (link vecchi: sempre ETSI)
  const urlBand = BANDS.some((b) => b.id === v('band')) ? v('band') : DEFAULTS.band;
  regSelect.value = REGULATIONS.includes(params.get('norma')) ? params.get('norma') : regulationOf(urlBand) ?? DEFAULTS.norma;
  fillBands();
  bandSelect.value = equivalentBand(urlBand, regSelect.value);
  dist.input.value = v('d');
  unitSelect.value = v('unit') === 'km' ? 'km' : 'm';
  freq.input.value = v('f');
  grx.input.value = v('grx');
  lrx.input.value = v('lrx');
  sens.input.value = params.has('rssi') ? params.get('rssi') : DEFAULTS.rssi;
  chart.init(params);
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
      { label: t('rf.previewFspl'), value: `${fmtDec(fspl(1, 2400), 1)} dB` },
    ], 'kv--compact'),
  };
}
