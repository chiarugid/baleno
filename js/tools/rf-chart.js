// Grafico potenza ricevuta / distanza per lo strumento dBm / mW / EIRP.
// Modello log-distanza: fino a 1 m spazio libero (FSPL), oltre la perdita cresce di 10·n dB
// per decade (n = 2 è lo spazio libero), più l'attenuazione delle pareti attraversate.
// SVG disegnato a mano, nessuna libreria: cursore con tooltip, distanza scelta con
// cursore, campo numerico o clic sul grafico.

import { h, fmtDec, uid } from '../ui/dom.js';
import { t, locale } from '../i18n.js';

export const RANGES = [20, 100, 500, 2000, 10000];
export const DEFAULT_RANGE = 100;

// Esponenti indicativi per ambiente; "custom" lascia scegliere n.
export const ENVIRONMENTS = [
  { id: 'free', n: 2 },
  { id: 'open', n: 2.5 },
  { id: 'office', n: 3 },
  { id: 'solid', n: 3.5 },
  { id: 'custom', n: null },
];
export const LIMITS = { n: [1.5, 6], walls: [0, 20], wallLoss: [0, 40] };
const DEFAULT_MODEL = { env: 'free', n: 2, walls: 0, wallLoss: 4 };

const SVG_NS = 'http://www.w3.org/2000/svg';
function s(tag, attrs, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs ?? {})) if (v != null) el.setAttribute(k, String(v));
  for (const c of children.flat()) if (c != null) el.append(c);
  return el;
}

const fsplDb = (meters, freqMHz) => 20 * Math.log10(meters / 1000) + 20 * Math.log10(freqMHz) + 32.44;

// Attenuazione a una distanza: spazio libero, componente dovuta alla distanza col modello, pareti, totale.
export function pathLoss(meters, freqMHz, { n = 2, walls = 0, wallLoss = 0 } = {}) {
  if (!(meters > 0) || !(freqMHz > 0)) return null;
  const fspl = fsplDb(meters, freqMHz);
  const ref = fsplDb(1, freqMHz);
  const distanceLoss = meters <= 1 ? fspl : ref + 10 * n * Math.log10(meters);
  const wallsLoss = walls * wallLoss;
  return { fspl, ref, distanceLoss, wallsLoss, total: distanceLoss + wallsLoss };
}

// Potenza ricevuta in dBm col modello scelto (rxDbm) e in spazio libero (rxFree).
export function rxAtMeters({ eirpDbm, freqMHz, rxGainDbi = 0, rxLossDb = 0 }, meters, model) {
  const pl = pathLoss(meters, freqMHz, model);
  if (!pl) return null;
  const base = eirpDbm + rxGainDbi - rxLossDb;
  return { ...pl, loss: pl.total, rxDbm: base - pl.total, rxFree: base - pl.fspl };
}

// Distanza alla quale la potenza scende a targetDbm col modello; null se già sotto a 0,1 m.
export function distanceAt(link, model, targetDbm) {
  const { n = 2, walls = 0, wallLoss = 0 } = model ?? {};
  const budget = link.eirpDbm + (link.rxGainDbi ?? 0) - (link.rxLossDb ?? 0) - targetDbm - walls * wallLoss;
  const ref = fsplDb(1, link.freqMHz);
  if (budget >= ref) return 10 ** ((budget - ref) / (10 * n));
  // entro 1 m vale lo spazio libero
  const d = 10 ** ((budget - 32.44 - 20 * Math.log10(link.freqMHz)) / 20) * 1000;
  return d >= 0.1 ? d : null;
}

// Campioni della curva tra rangeM/200 e rangeM.
export function fsplProfile(link, rangeM, samples = 200, model) {
  const out = [];
  for (let i = 1; i <= samples; i++) {
    const m = (rangeM * i) / samples;
    out.push({ m, ...rxAtMeters(link, m, model) });
  }
  return out;
}

// Etichette dell'asse x: passi "tondi" in metri.
function niceStep(max, target = 5) {
  const raw = max / target;
  const pow = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((k) => k * pow).find((x) => x >= raw);
}

// Valori nei campi: separatore decimale della lingua, senza raggruppamento.
const fieldNum = (n, digits = n >= 100 ? 0 : 1) => new Intl.NumberFormat(locale(), { maximumFractionDigits: digits, useGrouping: false }).format(n);
const parseField = (text) => {
  const v = String(text ?? '').trim().replace(',', '.');
  return /^[-+]?(\d+\.?\d*|\.\d+)$/.test(v) ? Number(v) : null;
};

const fmtM = (m) => (m >= 1000 ? `${fmtDec(m / 1000, 2)} km` : `${fmtDec(m, m >= 10 ? 0 : 1)} m`);

const isFree = (model) => model.n === 2 && model.walls * model.wallLoss === 0;

export function envLabel(id, n) {
  return id === 'custom' ? t('rf.env.custom') : t(`rf.env.${id}`, { n: fmtDec(n, 1) });
}

export function fsplChart({ formatPower, dbmToMw, onChange }) {
  const ids = { range: uid('rng'), dist: uid('gd'), slider: uid('gds'), env: uid('env'), n: uid('envn'), walls: uid('pw'), wl: uid('pl') };
  const field = (id, label, unit, input, error) => h('div', { class: 'field' },
    h('label', { for: id }, label, unit ? h('span', { class: 'field__unit' }, ` (${unit})`) : null), input, error);
  const numInput = (id) => h('input', { id, class: 'input input--mono', type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false', 'aria-describedby': `${id}-err` });
  const errorEl = (id) => h('span', { class: 'field__error', id: `${id}-err`, 'aria-live': 'polite' });

  const rangeSelect = h('select', { id: ids.range, class: 'input' }, RANGES.map((r) => h('option', { value: r }, `0 – ${fmtM(r)}`)));
  const distInput = numInput(ids.dist);
  const distError = errorEl(ids.dist);
  const slider = h('input', { id: ids.slider, class: 'range', type: 'range', min: 1, max: 1000, step: 1 });
  const envSelect = h('select', { id: ids.env, class: 'input' }, ENVIRONMENTS.map((e) => h('option', { value: e.id }, envLabel(e.id, e.n))));
  const nInput = numInput(ids.n);
  const nError = errorEl(ids.n);
  const wallsInput = numInput(ids.walls);
  const wallsError = errorEl(ids.walls);
  const wlInput = numInput(ids.wl);
  const wlError = errorEl(ids.wl);
  const plot = h('div', { class: 'fspl-plot' });
  const tooltip = h('div', { class: 'fspl-tip', hidden: true, 'aria-hidden': 'true' });
  const legend = h('div', { class: 'fspl-legend' });
  const readout = h('div');
  const table = h('div', { class: 'table-wrap' });

  const el = h('div', null,
    h('div', { class: 'field-row field-row--env' },
      field(ids.env, t('rf.env.label'), null, envSelect),
      field(ids.n, t('rf.env.exponent'), null, nInput, nError),
      field(ids.walls, t('rf.env.walls'), null, wallsInput, wallsError),
      field(ids.wl, t('rf.env.wallLoss'), 'dB', wlInput, wlError)),
    h('p', { class: 'field__hint' }, t('rf.env.hint')),
    h('div', { class: 'field-row field-row--fspl' },
      field(ids.range, t('rf.chart.range'), null, rangeSelect),
      field(ids.dist, t('rf.chart.distance'), 'm', distInput, distError),
      field(ids.slider, t('rf.chart.slider'), null, slider)),
    readout,
    legend,
    h('div', { class: 'fspl-wrap' }, plot, tooltip),
    h('p', { class: 'field__hint' }, t('rf.chart.hint')),
    h('details', { class: 'fspl-table' }, h('summary', null, t('rf.chart.table')), table));

  let link = null;
  let rssi = null;
  let range = DEFAULT_RANGE;
  let distance = 50;
  let geom = null;
  const model = { ...DEFAULT_MODEL };

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
    const n = parseField(distInput.value);
    if (n == null || n <= 0) {
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

  // --- Ambiente
  function syncEnvFields() {
    const env = ENVIRONMENTS.find((e) => e.id === model.env);
    nInput.disabled = model.env !== 'custom';
    if (env.n != null) { model.n = env.n; nInput.value = fieldNum(env.n, 1); setFieldError(nInput, nError); }
  }
  function setFieldError(input, error, message) {
    error.textContent = message ?? '';
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }
  // Legge un campo numerico entro i limiti; restituisce il valore o null (con errore a video).
  function readRange(input, error, [min, max], message, { integer = false } = {}) {
    const v = parseField(input.value);
    if (v == null || v < min || v > max || (integer && !Number.isInteger(v))) { setFieldError(input, error, message); return null; }
    setFieldError(input, error);
    return v;
  }
  function onModelInput() {
    const n = model.env === 'custom' ? readRange(nInput, nError, LIMITS.n, t('rf.env.errExponent')) : model.n;
    const walls = readRange(wallsInput, wallsError, LIMITS.walls, t('rf.env.errWalls'), { integer: true });
    const wallLoss = readRange(wlInput, wlError, LIMITS.wallLoss, t('rf.env.errWallLoss'));
    if (n == null || walls == null || wallLoss == null) return;
    Object.assign(model, { n, walls, wallLoss });
    draw();
    onChange();
  }
  envSelect.addEventListener('change', () => {
    model.env = envSelect.value;
    syncEnvFields();
    if (model.env === 'custom') nInput.focus();
    onModelInput();
  });
  for (const input of [nInput, wallsInput, wlInput]) input.addEventListener('input', onModelInput);

  // --- Valori alla distanza scelta
  function readoutView() {
    const r = rxAtMeters(link, distance, model);
    const free = isFree(model);
    const margin = rssi != null ? r.rxDbm - rssi : null;
    const kind = margin == null ? null : margin >= 5 ? 'ok' : margin >= 0 ? 'warn' : 'err';
    const kpi = (label, value, unit, cls) => h('div', { class: cls ? `kpi kpi--${cls}` : 'kpi' },
      h('div', { class: 'kpi__label' }, label), h('div', { class: 'kpi__value' }, value, unit ? h('small', null, unit) : null));
    const kpis = h('div', { class: margin != null ? 'kpis' : 'kpis kpis--3' },
      kpi(free ? 'FSPL' : t('rf.chart.loss'), fmtDec(r.loss, 2), 'dB'),
      kpi(t('rf.rxPower'), fmtDec(r.rxDbm, 2), 'dBm', 'hl'),
      kpi(t('rf.chart.rxMw'), formatPower(dbmToMw(r.rxDbm)), null),
      margin != null ? kpi(t('rf.marginRssi'), fmtDec(margin, 2), 'dB', kind) : null);
    const vars = {
      eirp: fmtDec(link.eirpDbm, 2), d: fmtM(distance), f: fmtDec(link.freqMHz, 1), grx: fmtDec(link.rxGainDbi, 2),
      lrx: fmtDec(link.rxLossDb, 2), rx: fmtDec(r.rxDbm, 2), fspl: fmtDec(r.fspl, 2), loss: fmtDec(r.loss, 2),
    };
    const lines = [];
    if (free) {
      lines.push(t('rf.chart.steps', vars));
    } else {
      lines.push(t('rf.chart.stepsModel', vars));
      const walls = model.walls * model.wallLoss > 0 ? t('rf.chart.stepsWalls', { w: model.walls, wl: fmtDec(model.wallLoss, 1), tot: fmtDec(r.wallsLoss, 1) }) : '';
      lines.push(distance <= 1
        ? t('rf.chart.stepsNear', { d: vars.d, f: vars.f, dist: fmtDec(r.distanceLoss, 2), walls, free: fmtDec(r.rxFree, 2) })
        : t('rf.chart.stepsLoss', { d: vars.d, f: vars.f, dist: fmtDec(r.distanceLoss, 2), ref: fmtDec(r.ref, 2), n: fmtDec(model.n, 2), m: fmtDec(distance, 1), walls, free: fmtDec(r.rxFree, 2) }));
    }
    if (rssi != null) {
      const dd = distanceAt(link, model, rssi);
      lines.push(dd == null ? t('rf.chart.rssiNone', { rssi: fmtDec(rssi, 0) }) : t('rf.chart.rssiAt', { rssi: fmtDec(rssi, 0), dd: fmtM(dd) }));
    }
    return [kpis, ...lines.map((line) => h('p', { class: 'fspl-steps' }, line))];
  }

  function legendView() {
    if (isFree(model)) return [];
    const item = (lineClass, text) => h('span', { class: 'fspl-legend__item' },
      s('svg', { class: 'fspl-legend__swatch', viewBox: '0 0 24 8', width: 24, height: 8, 'aria-hidden': 'true' },
        s('line', { class: lineClass, x1: 1, x2: 23, y1: 4, y2: 4 })), text);
    const modelText = model.walls * model.wallLoss > 0
      ? `${envLabel(model.env, model.n)} · ${t('rf.chart.legendWalls', { w: model.walls, wl: fmtDec(model.wallLoss, 1) })}`
      : envLabel(model.env, model.n);
    return [item('fspl-line', modelText), item('fspl-line fspl-line--ref', t('rf.chart.legendFree'))];
  }

  function tableView() {
    const free = isFree(model);
    const rows = [];
    for (let i = 1; i <= 10; i++) {
      const m = (range * i) / 10;
      const r = rxAtMeters(link, m, model);
      rows.push(h('tr', null, h('td', { class: 'num' }, fmtM(m)), h('td', { class: 'num' }, fmtDec(r.loss, 2)),
        h('td', { class: 'num' }, fmtDec(r.rxDbm, 2)), h('td', { class: 'num' }, formatPower(dbmToMw(r.rxDbm))),
        free ? null : h('td', { class: 'num' }, fmtDec(r.rxFree, 2))));
    }
    const heads = [t('rf.chart.distance'), `${free ? 'FSPL' : t('rf.chart.loss')} (dB)`, `${t('rf.rxPower')} (dBm)`, `${t('rf.rxPower')} (mW)`];
    if (!free) heads.push(`${t('rf.chart.legendFree')} (dBm)`);
    return h('table', { class: 'table table--plain' },
      h('thead', null, h('tr', null, heads.map((c) => h('th', { class: 'num' }, h('span', null, c))))),
      h('tbody', null, rows));
  }

  function draw() {
    if (!link) return;
    readout.replaceChildren(...readoutView());
    legend.replaceChildren(...legendView());
    const free = isFree(model);
    const width = Math.max(280, plot.clientWidth || 640);
    const height = width < 500 ? 220 : 280;
    const m = { l: 52, r: 16, t: 26, b: 34 };
    const pts = fsplProfile(link, range, 200, model);
    const ys = pts.map((p) => p.rxDbm);
    const sel = rxAtMeters(link, distance, model);
    // in alto: la curva dello spazio libero (la più alta) e il punto scelto, anche se molto vicino
    const top = Math.max(rxAtMeters(link, range / 50).rxFree, sel.rxDbm + 1);
    // sotto la linea dell'RSSI di progetto resta spazio per la sua etichetta
    const bottom = Math.min(...ys, rssi != null ? rssi - 6 : Infinity) - 1;
    const yStep = (top - bottom) > 120 ? 40 : (top - bottom) > 60 ? 20 : 10;
    // bordi su multipli del passo: tacche tonde (−20, −40, …)
    const yLow = Math.floor(bottom / yStep) * yStep;
    const yHigh = Math.ceil(top / yStep) * yStep;
    const x = (v) => m.l + (v / range) * (width - m.l - m.r);
    const y = (v) => m.t + ((yHigh - v) / (yHigh - yLow)) * (height - m.t - m.b);
    geom = { x, y, m, width, height, yHigh };

    const grid = [];
    for (let v = yLow; v <= yHigh; v += yStep) {
      grid.push(s('line', { class: 'fspl-grid', x1: m.l, x2: width - m.r, y1: y(v), y2: y(v) }));
      grid.push(s('text', { class: 'fspl-axis', x: m.l - 8, y: y(v) + 4, 'text-anchor': 'end' }, `${v}`));
    }
    const step = niceStep(range);
    for (let v = 0; v <= range + 1e-9; v += step) {
      grid.push(s('text', { class: 'fspl-axis', x: x(v), y: height - m.b + 18, 'text-anchor': v === 0 ? 'start' : 'middle' }, v === 0 ? '0' : fmtM(v)));
    }
    const clipId = uid('clip');
    const pathOf = (key) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.m).toFixed(1)},${y(p[key]).toFixed(1)}`).join('');
    const svg = s('svg', { class: 'fspl-svg', width, height, viewBox: `0 0 ${width} ${height}`, role: 'img',
      'aria-label': t('rf.chart.aria', { from: fmtDec(rxAtMeters(link, range / 10, model).rxDbm, 1), range: fmtM(range), to: fmtDec(ys[ys.length - 1], 1) }) },
      s('defs', null, s('clipPath', { id: clipId }, s('rect', { x: m.l, y: m.t, width: width - m.l - m.r, height: height - m.t - m.b }))),
      grid,
      s('line', { class: 'fspl-base', x1: m.l, x2: width - m.r, y1: height - m.b, y2: height - m.b }),
      s('text', { class: 'fspl-axis fspl-axis--title', x: m.l - 8, y: 11, 'text-anchor': 'end' }, 'dBm'),
      rssi != null && rssi >= yLow && rssi <= yHigh ? [
        s('line', { class: 'fspl-ref', x1: m.l, x2: width - m.r, y1: y(rssi), y2: y(rssi) }),
        s('text', { class: 'fspl-axis', x: width - m.r, y: y(rssi) + 14, 'text-anchor': 'end' }, t('rf.chart.rssiLine', { n: fmtDec(rssi, 0) })),
      ] : null,
      free ? null : s('path', { class: 'fspl-line fspl-line--ref', d: pathOf('rxFree'), 'clip-path': `url(#${clipId})` }),
      s('path', { class: 'fspl-line', d: pathOf('rxDbm'), 'clip-path': `url(#${clipId})` }),
      s('line', { class: 'fspl-sel', x1: x(distance), x2: x(distance), y1: m.t, y2: height - m.b }),
      s('circle', { class: 'fspl-dot', cx: x(distance), cy: y(sel.rxDbm), r: 5 }),
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
    const r = rxAtMeters(link, meters, model);
    const cx = geom.x(meters);
    cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
    dot.setAttribute('cx', cx); dot.setAttribute('cy', geom.y(r.rxDbm)); dot.setAttribute('visibility', r.rxDbm <= geom.yHigh ? 'visible' : 'hidden');
    tooltip.replaceChildren(
      h('strong', null, fmtM(meters)),
      h('span', null, `${fmtDec(r.rxDbm, 2)} dBm`),
      h('span', null, formatPower(dbmToMw(r.rxDbm))),
      isFree(model)
        ? h('span', { class: 'fspl-tip__muted' }, `FSPL ${fmtDec(r.fspl, 1)} dB`)
        : h('span', { class: 'fspl-tip__muted' }, t('rf.chart.tipFree', { n: fmtDec(r.rxFree, 1) })));
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
    // Valori iniziali dall'URL, senza notificare.
    init(params) {
      const num = (key) => parseField(params.get(key));
      range = RANGES.includes(num('gr')) ? num('gr') : DEFAULT_RANGE;
      rangeSelect.value = String(range);
      const d = num('gd');
      distance = clampDist(d > 0 ? d : 50);
      distInput.value = fieldNum(distance);
      slider.value = String(Math.round((distance / range) * 1000));
      const env = ENVIRONMENTS.find((e) => e.id === params.get('env'))?.id ?? DEFAULT_MODEL.env;
      const inRange = (v, [min, max]) => v != null && v >= min && v <= max;
      model.env = env;
      model.n = env === 'custom' && inRange(num('n'), LIMITS.n) ? num('n') : ENVIRONMENTS.find((e) => e.id === env).n ?? DEFAULT_MODEL.n;
      model.walls = inRange(num('pw'), LIMITS.walls) && Number.isInteger(num('pw')) ? num('pw') : DEFAULT_MODEL.walls;
      model.wallLoss = inRange(num('pl'), LIMITS.wallLoss) ? num('pl') : DEFAULT_MODEL.wallLoss;
      envSelect.value = env;
      nInput.value = fieldNum(model.n, 2);
      wallsInput.value = String(model.walls);
      wlInput.value = fieldNum(model.wallLoss, 1);
      syncEnvFields();
    },
    update(nextLink, nextRssi) {
      link = nextLink;
      rssi = nextRssi;
      if (!link) {
        readout.replaceChildren(h('p', { class: 'empty' }, t('rf.incomplete')));
        legend.replaceChildren();
        plot.replaceChildren();
        table.replaceChildren();
        return;
      }
      draw();
    },
    params: () => ({
      gr: range === DEFAULT_RANGE ? '' : String(range),
      gd: String(Math.round(distance * 10) / 10),
      env: model.env === DEFAULT_MODEL.env ? '' : model.env,
      n: model.env === 'custom' ? String(model.n) : '',
      pw: model.walls ? String(model.walls) : '',
      pl: model.wallLoss !== DEFAULT_MODEL.wallLoss ? String(model.wallLoss) : '',
    }),
  };
}
