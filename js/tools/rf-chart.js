// Grafico potenza ricevuta / distanza in spazio libero (FSPL) per lo strumento dBm / mW / EIRP.
// SVG disegnato a mano, nessuna libreria: una sola serie, cursore con tooltip,
// distanza scelta con cursore, campo numerico o clic sul grafico.

import { h, fmtDec, kvList, uid } from '../ui/dom.js';
import { t, locale } from '../i18n.js';

export const RANGES = [20, 100, 500, 2000, 10000];
export const DEFAULT_RANGE = 100;

const SVG_NS = 'http://www.w3.org/2000/svg';
function s(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs ?? {})) if (v != null) el.setAttribute(k, String(v));
  for (const c of children.flat()) if (c != null) el.append(c);
  return el;
}

// Potenza ricevuta in dBm a distanza d (metri) con FSPL; null se non calcolabile.
export function rxAtMeters({ eirpDbm, freqMHz, rxGainDbi = 0, rxLossDb = 0 }, meters) {
  if (!(meters > 0) || !(freqMHz > 0)) return null;
  const loss = 20 * Math.log10(meters / 1000) + 20 * Math.log10(freqMHz) + 32.44;
  return { fspl: loss, rxDbm: eirpDbm - loss + rxGainDbi - rxLossDb };
}

// Campioni della curva tra rangeM/200 e rangeM.
export function fsplProfile(link, rangeM, samples = 200) {
  const out = [];
  for (let i = 1; i <= samples; i++) {
    const m = (rangeM * i) / samples;
    out.push({ m, ...rxAtMeters(link, m) });
  }
  return out;
}

// Etichette dell'asse x: passi "tondi" in metri.
function niceStep(max, target = 5) {
  const raw = max / target;
  const pow = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((k) => k * pow).find((x) => x >= raw);
}

// Valore nel campo distanza: separatore decimale della lingua, senza raggruppamento.
const fieldNum = (n) => new Intl.NumberFormat(locale(), { maximumFractionDigits: n >= 100 ? 0 : 1, useGrouping: false }).format(n);

const fmtM = (m) => (m >= 1000 ? `${fmtDec(m / 1000, 2)} km` : `${fmtDec(m, m >= 10 ? 0 : 1)} m`);

export function fsplChart({ formatPower, dbmToMw, onChange }) {
  const ids = { range: uid('rng'), dist: uid('gd'), slider: uid('gds') };
  const rangeSelect = h('select', { id: ids.range, class: 'input' }, RANGES.map((r) => h('option', { value: r }, `0 – ${fmtM(r)}`)));
  const distInput = h('input', { id: ids.dist, class: 'input input--mono', type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false', 'aria-describedby': `${ids.dist}-err` });
  const distError = h('span', { class: 'field__error', id: `${ids.dist}-err`, 'aria-live': 'polite' });
  const slider = h('input', { id: ids.slider, class: 'range', type: 'range', min: 1, max: 1000, step: 1 });
  const plot = h('div', { class: 'fspl-plot' });
  const tooltip = h('div', { class: 'fspl-tip', hidden: true, 'aria-hidden': 'true' });
  const readout = h('div');
  const table = h('div', { class: 'table-wrap' });

  const el = h('div', null,
    h('div', { class: 'field-row field-row--fspl' },
      h('div', { class: 'field' }, h('label', { for: ids.range }, t('rf.chart.range')), rangeSelect),
      h('div', { class: 'field' }, h('label', { for: ids.dist }, t('rf.chart.distance'), h('span', { class: 'field__unit' }, ' (m)')), distInput, distError),
      h('div', { class: 'field' }, h('label', { for: ids.slider }, t('rf.chart.slider')), slider)),
    readout,
    h('div', { class: 'fspl-wrap' }, plot, tooltip),
    h('p', { class: 'field__hint' }, t('rf.chart.hint')),
    h('details', { class: 'fspl-table' }, h('summary', null, t('rf.chart.table')), table));

  let link = null;
  let rssi = null;
  let range = DEFAULT_RANGE;
  let distance = 50;
  let geom = null;

  const clampDist = (m) => Math.min(range, Math.max(range / 1000, m));

  function setDistance(m, { fromInput = false } = {}) {
    distance = clampDist(m);
    if (!fromInput) distInput.value = fieldNum(distance);
    slider.value = String(Math.round((distance / range) * 1000));
    draw();
    onChange();
  }

  rangeSelect.addEventListener('change', () => {
    range = Number(rangeSelect.value);
    setDistance(Math.min(distance, range));
  });
  slider.addEventListener('input', () => setDistance((Number(slider.value) / 1000) * range));
  distInput.addEventListener('input', () => {
    const n = Number(distInput.value.trim().replace(',', '.'));
    if (!distInput.value.trim() || !Number.isFinite(n) || n <= 0) {
      distError.textContent = t('rf.err.distance');
      distInput.setAttribute('aria-invalid', 'true');
      return;
    }
    distError.textContent = '';
    distInput.removeAttribute('aria-invalid');
    // una distanza oltre la scala allarga la scala
    if (n > range) {
      range = RANGES.find((r) => r >= n) ?? RANGES[RANGES.length - 1];
      rangeSelect.value = String(range);
    }
    setDistance(n, { fromInput: true });
  });

  function readoutView() {
    const r = rxAtMeters(link, distance);
    const margin = rssi != null ? r.rxDbm - rssi : null;
    const kind = margin == null ? null : margin >= 5 ? 'ok' : margin >= 0 ? 'warn' : 'err';
    const kpi = (label, value, unit, cls) => h('div', { class: cls ? `kpi kpi--${cls}` : 'kpi' },
      h('div', { class: 'kpi__label' }, label), h('div', { class: 'kpi__value' }, value, unit ? h('small', null, unit) : null));
    const kpis = h('div', { class: margin != null ? 'kpis' : 'kpis kpis--3' },
      kpi('FSPL', fmtDec(r.fspl, 2), 'dB'),
      kpi(t('rf.rxPower'), fmtDec(r.rxDbm, 2), 'dBm', 'hl'),
      kpi(t('rf.chart.rxMw'), formatPower(dbmToMw(r.rxDbm)), null),
      margin != null ? kpi(t('rf.marginRssi'), fmtDec(margin, 2), 'dB', kind) : null);
    const steps = h('p', { class: 'fspl-steps' },
      t('rf.chart.steps', {
        eirp: fmtDec(link.eirpDbm, 2), fspl: fmtDec(r.fspl, 2), d: fmtM(distance), f: fmtDec(link.freqMHz, 1),
        grx: fmtDec(link.rxGainDbi, 2), lrx: fmtDec(link.rxLossDb, 2), rx: fmtDec(r.rxDbm, 2),
      }));
    return [kpis, steps];
  }

  function tableView() {
    const rows = [];
    for (let i = 1; i <= 10; i++) {
      const m = (range * i) / 10;
      const r = rxAtMeters(link, m);
      rows.push(h('tr', null, h('td', { class: 'num' }, fmtM(m)), h('td', { class: 'num' }, fmtDec(r.fspl, 2)),
        h('td', { class: 'num' }, fmtDec(r.rxDbm, 2)), h('td', { class: 'num' }, formatPower(dbmToMw(r.rxDbm)))));
    }
    return h('table', { class: 'table table--plain' },
      h('thead', null, h('tr', null, [t('rf.chart.distance'), 'FSPL (dB)', `${t('rf.rxPower')} (dBm)`, `${t('rf.rxPower')} (mW)`].map((c) => h('th', { class: 'num' }, h('span', null, c))))),
      h('tbody', null, rows));
  }

  function draw() {
    if (!link) return;
    readout.replaceChildren(...readoutView());
    const width = Math.max(280, plot.clientWidth || 640);
    const height = width < 500 ? 220 : 280;
    const m = { l: 52, r: 16, t: 26, b: 34 };
    const pts = fsplProfile(link, range);
    const ys = pts.map((p) => p.rxDbm);
    const yHigh = Math.ceil(rxAtMeters(link, range / 50).rxDbm / 10) * 10;
    // sotto la linea dell'RSSI di progetto resta spazio per la sua etichetta
    const yLow = Math.floor((Math.min(...ys, rssi != null ? rssi - 6 : Infinity) - 1) / 10) * 10;
    const x = (v) => m.l + (v / range) * (width - m.l - m.r);
    const y = (v) => m.t + ((yHigh - v) / (yHigh - yLow)) * (height - m.t - m.b);
    geom = { x, y, m, width, height, yHigh };

    const grid = [];
    const yStep = (yHigh - yLow) > 60 ? 20 : 10;
    for (let v = yLow; v <= yHigh; v += yStep) {
      grid.push(s('line', { class: 'fspl-grid', x1: m.l, x2: width - m.r, y1: y(v), y2: y(v) }));
      grid.push(s('text', { class: 'fspl-axis', x: m.l - 8, y: y(v) + 4, 'text-anchor': 'end' }, `${v}`));
    }
    const step = niceStep(range);
    for (let v = 0; v <= range + 1e-9; v += step) {
      grid.push(s('text', { class: 'fspl-axis', x: x(v), y: height - m.b + 18, 'text-anchor': v === 0 ? 'start' : 'middle' }, v === 0 ? '0' : fmtM(v)));
    }
    const clipId = uid('clip');
    const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.m).toFixed(1)},${y(p.rxDbm).toFixed(1)}`).join('');
    const r = rxAtMeters(link, distance);
    const svg = s('svg', { class: 'fspl-svg', width, height, viewBox: `0 0 ${width} ${height}`, role: 'img',
      'aria-label': t('rf.chart.aria', { from: fmtDec(rxAtMeters(link, range / 10).rxDbm, 1), range: fmtM(range), to: fmtDec(ys[ys.length - 1], 1) }) },
      s('defs', null, s('clipPath', { id: clipId }, s('rect', { x: m.l, y: m.t, width: width - m.l - m.r, height: height - m.t - m.b }))),
      grid,
      s('line', { class: 'fspl-base', x1: m.l, x2: width - m.r, y1: height - m.b, y2: height - m.b }),
      s('text', { class: 'fspl-axis fspl-axis--title', x: m.l - 8, y: 11, 'text-anchor': 'end' }, 'dBm'),
      rssi != null && rssi >= yLow && rssi <= yHigh ? [
        s('line', { class: 'fspl-ref', x1: m.l, x2: width - m.r, y1: y(rssi), y2: y(rssi) }),
        s('text', { class: 'fspl-axis', x: width - m.r, y: y(rssi) + 14, 'text-anchor': 'end' }, t('rf.chart.rssiLine', { n: fmtDec(rssi, 0) })),
      ] : null,
      s('path', { class: 'fspl-line', d: path, 'clip-path': `url(#${clipId})` }),
      r.rxDbm <= yHigh ? [
        s('line', { class: 'fspl-sel', x1: x(distance), x2: x(distance), y1: m.t, y2: height - m.b }),
        s('circle', { class: 'fspl-dot', cx: x(distance), cy: y(r.rxDbm), r: 5 }),
      ] : null,
      s('line', { class: 'fspl-cross', x1: 0, x2: 0, y1: m.t, y2: height - m.b, visibility: 'hidden' }),
      s('circle', { class: 'fspl-dot fspl-dot--hover', cx: 0, cy: 0, r: 4, visibility: 'hidden' }));
    plot.replaceChildren(svg);
    table.replaceChildren(tableView());
  }

  // Hover: cursore verticale e tooltip; clic o trascinamento: sceglie la distanza.
  const toMeters = (ev) => {
    const rect = plot.getBoundingClientRect();
    const px = ev.clientX - rect.left;
    return ((px - geom.m.l) / (geom.width - geom.m.l - geom.m.r)) * range;
  };
  let dragging = false;
  plot.addEventListener('pointermove', (ev) => {
    if (!geom || !link) return;
    const meters = toMeters(ev);
    const svg = plot.querySelector('svg');
    const cross = svg.querySelector('.fspl-cross');
    const dot = svg.querySelector('.fspl-dot--hover');
    if (meters <= 0 || meters > range) { cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); tooltip.hidden = true; return; }
    if (dragging) { setDistance(meters); return; }
    const r = rxAtMeters(link, meters);
    const cx = geom.x(meters);
    cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
    dot.setAttribute('cx', cx); dot.setAttribute('cy', geom.y(r.rxDbm)); dot.setAttribute('visibility', r.rxDbm <= geom.yHigh ? 'visible' : 'hidden');
    tooltip.replaceChildren(h('strong', null, fmtM(meters)), h('span', null, `${fmtDec(r.rxDbm, 2)} dBm`), h('span', null, formatPower(dbmToMw(r.rxDbm))), h('span', { class: 'fspl-tip__muted' }, `FSPL ${fmtDec(r.fspl, 1)} dB`));
    tooltip.hidden = false;
    const left = Math.min(cx + 12, geom.width - tooltip.offsetWidth - 4);
    tooltip.style.left = `${left < cx + 12 ? cx - tooltip.offsetWidth - 12 : left}px`;
    tooltip.style.top = `${Math.max(4, Math.min(geom.y(r.rxDbm) - 20, geom.height - tooltip.offsetHeight - 4))}px`;
  });
  plot.addEventListener('pointerleave', () => {
    tooltip.hidden = true;
    plot.querySelector('.fspl-cross')?.setAttribute('visibility', 'hidden');
    plot.querySelector('.fspl-dot--hover')?.setAttribute('visibility', 'hidden');
  });
  plot.addEventListener('pointerdown', (ev) => {
    if (!geom || !link) return;
    const meters = toMeters(ev);
    if (meters <= 0 || meters > range) return;
    dragging = true;
    plot.setPointerCapture(ev.pointerId);
    setDistance(meters);
  });
  plot.addEventListener('pointerup', () => { dragging = false; });
  plot.addEventListener('pointercancel', () => { dragging = false; });

  if (typeof ResizeObserver !== 'undefined') {
    let lastWidth = 0;
    new ResizeObserver(() => {
      if (plot.clientWidth !== lastWidth) { lastWidth = plot.clientWidth; draw(); }
    }).observe(plot);
  }

  return {
    el,
    // Imposta scala e distanza iniziali (dall'URL) senza notificare.
    init(r, d) {
      range = RANGES.includes(r) ? r : DEFAULT_RANGE;
      rangeSelect.value = String(range);
      distance = clampDist(d > 0 ? d : range / 2);
      distInput.value = fieldNum(distance);
      slider.value = String(Math.round((distance / range) * 1000));
    },
    update(nextLink, nextRssi) {
      link = nextLink;
      rssi = nextRssi;
      if (!link) {
        readout.replaceChildren(h('p', { class: 'empty' }, t('rf.incomplete')));
        plot.replaceChildren();
        table.replaceChildren();
        return;
      }
      draw();
    },
    params: () => ({ gr: range === DEFAULT_RANGE ? '' : String(range), gd: String(Math.round(distance * 10) / 10) }),
  };
}
