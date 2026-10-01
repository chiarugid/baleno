// Tester di route/translation pattern in stile CUCM: corrispondenza con un numero
// chiamato e trasformazioni (discard digits, strip, transform mask, prefisso).
// Le funzioni di calcolo non usano il DOM e sono importate anche da tests/run.mjs.

import { h, fmtInt, kvList, badge, uid } from '../ui/dom.js';
import { dashlet } from '../ui/dashlet.js';

// ---------------------------------------------------------------- Parsing del pattern

const DIGITS = '0123456789';

function describeSet(chars, negated) {
  return negated ? `una cifra tranne ${chars.join('')}` : `una cifra tra ${chars.join('')}`;
}

// Restituisce { ok, tokens, dotIndex } oppure { ok: false, error } / { ok: false, unsupported }.
export function parsePattern(pattern) {
  const p = String(pattern ?? '').trim();
  if (!p) return { ok: false, error: 'Inserisci un pattern.' };
  if (p.includes('@')) {
    return { ok: false, unsupported: true, error: 'La macro @ (piano di numerazione NANP) non è supportata: richiederebbe di simulare l’intero piano nordamericano e i relativi filtri. Nessuna corrispondenza viene calcolata.' };
  }
  const tokens = [];
  let dotIndex = -1;
  for (let i = 0; i < p.length; i++) {
    const ch = p[i];
    if (ch === 'X' || ch === 'x') tokens.push({ src: ch, label: 'X: una cifra 0–9', chars: DIGITS, min: 1, max: 1 });
    else if (ch === '!') tokens.push({ src: '!', label: '!: una o più cifre 0–9', chars: DIGITS, min: 1, max: Infinity });
    else if (DIGITS.includes(ch) || ch === '*' || ch === '#') tokens.push({ src: ch, label: `${ch} letterale`, chars: ch, min: 1, max: 1 });
    else if (ch === '\\') {
      if (p[i + 1] !== '+') return { ok: false, error: `Posizione ${i + 1}: "\\" è ammesso solo come \\+ (più letterale).` };
      tokens.push({ src: '\\+', label: '\\+: segno + letterale', chars: '+', min: 1, max: 1 });
      i++;
    } else if (ch === '.') {
      if (dotIndex >= 0) return { ok: false, error: 'Un pattern può contenere un solo punto (.).' };
      dotIndex = tokens.length;
    } else if (ch === '[') {
      const end = p.indexOf(']', i);
      if (end < 0) return { ok: false, error: `Posizione ${i + 1}: parentesi [ senza ].` };
      let body = p.slice(i + 1, end);
      const negated = body.startsWith('^');
      if (negated) body = body.slice(1);
      if (!body) return { ok: false, error: `Posizione ${i + 1}: insieme [] vuoto.` };
      const set = new Set();
      for (let k = 0; k < body.length; k++) {
        const a = body[k];
        if (!DIGITS.includes(a)) return { ok: false, error: `Nell’insieme [${body}] sono ammesse solo cifre e intervalli (es. [2-9]).` };
        if (body[k + 1] === '-') {
          const b = body[k + 2];
          if (b == null || !DIGITS.includes(b) || b < a) return { ok: false, error: `Intervallo non valido in [${body}].` };
          for (let c = Number(a); c <= Number(b); c++) set.add(String(c));
          k += 2;
        } else set.add(a);
      }
      const chosen = [...set].sort();
      const chars = negated ? [...DIGITS].filter((c) => !set.has(c)).join('') : chosen.join('');
      if (!chars) return { ok: false, error: `L’insieme [^${body}] esclude tutte le cifre.` };
      tokens.push({ src: p.slice(i, end + 1), label: `${p.slice(i, end + 1)}: ${describeSet(chosen, negated)}`, chars, min: 1, max: 1 });
      i = end;
    } else if (ch === '?' || ch === '+') {
      const prev = tokens.at(-1);
      if (!prev || prev.max !== 1 || prev.quantified) return { ok: false, error: `Posizione ${i + 1}: "${ch}" deve seguire una cifra o un carattere jolly singolo.` };
      prev.src += ch;
      prev.min = ch === '?' ? 0 : 1;
      prev.max = Infinity;
      prev.quantified = true;
      prev.label = `${prev.src}: ${ch === '?' ? 'zero o più' : 'una o più'} occorrenze di ${prev.label.split(':')[0]}`;
    } else return { ok: false, error: `Posizione ${i + 1}: carattere "${ch}" non ammesso.` };
  }
  if (!tokens.length) return { ok: false, error: 'Il pattern non contiene cifre.' };
  return { ok: true, tokens, dotIndex };
}

// Quanti numeri descrive il pattern (null se la lunghezza è variabile).
export function patternCount(tokens) {
  if (tokens.some((t) => t.max === Infinity)) return null;
  return tokens.reduce((n, t) => n * BigInt(t.chars.length), 1n);
}

// ---------------------------------------------------------------- Corrispondenza

// Backtracking sui token; registra quanta parte del numero è stata consumata
// per spiegare i non-match e riconoscere le corrispondenze parziali.
export function matchPattern(tokens, dialed) {
  let deepest = { si: 0, ti: 0 };
  let partial = false;
  const caps = new Array(tokens.length);

  function go(ti, si) {
    if (si > deepest.si || (si === deepest.si && ti > deepest.ti)) deepest = { si, ti };
    if (ti === tokens.length) return si === dialed.length;
    const t = tokens[ti];
    let n = 0;
    while (n < t.max && si + n < dialed.length && t.chars.includes(dialed[si + n])) n++;
    if (si + n === dialed.length && n < t.max) partial = true;
    // Prima le corrispondenze più lunghe (comportamento greedy), poi si arretra.
    for (let k = n; k >= t.min; k--) {
      caps[ti] = dialed.slice(si, si + k);
      if (go(ti + 1, si + k)) return true;
    }
    if (si + n === dialed.length && n < t.min) partial = true;
    return false;
  }

  if (go(0, 0)) return { match: true, captures: caps.slice() };
  // Corrispondenza parziale: il numero potrebbe ancora combaciare aggiungendo cifre.
  const needsMore = partial && deepest.si === dialed.length;
  return { match: false, partial: needsMore, failAt: deepest.si, failToken: deepest.ti };
}

// ---------------------------------------------------------------- Trasformazioni

export const DISCARD = [
  { id: '', label: 'Nessuna (NoDigits)' },
  { id: 'predot', label: 'PreDot' },
  { id: 'predot-trailing', label: 'PreDot Trailing-#' },
  { id: 'trailing', label: 'Trailing-#' },
];

// Maschera applicata da destra: X conserva la cifra in quella posizione, gli altri
// caratteri la sostituiscono; le cifre oltre la lunghezza della maschera cadono.
export function applyMask(number, mask) {
  if (!mask) return number;
  const out = [];
  for (let i = 1; i <= mask.length; i++) {
    const m = mask[mask.length - i];
    const d = number[number.length - i];
    if (m === 'X' || m === 'x') { if (d != null) out.push(d); } else out.push(m);
  }
  return out.reverse().join('');
}

export function validateMask(mask) {
  return !mask || /^[0-9Xx*#+]+$/.test(mask);
}

export function testPattern({ pattern, dialed, discard = '', strip = 0, mask = '', prefix = '' }) {
  const parsed = parsePattern(pattern);
  if (!parsed.ok) return { ok: false, unsupported: Boolean(parsed.unsupported), field: 'pattern', error: parsed.error };
  const number = String(dialed ?? '').trim();
  if (!number) return { ok: false, field: 'dialed', error: 'Inserisci il numero chiamato.' };
  if (!/^[0-9*#+]+$/.test(number)) return { ok: false, field: 'dialed', error: 'Il numero può contenere solo cifre, *, # e +.' };
  if (!validateMask(mask)) return { ok: false, field: 'mask', error: 'La maschera ammette cifre, X, *, # e +.' };
  if (prefix && !/^[0-9*#+]+$/.test(prefix)) return { ok: false, field: 'prefix', error: 'Il prefisso ammette cifre, *, # e +.' };
  if (!Number.isInteger(strip) || strip < 0) return { ok: false, field: 'strip', error: 'Le cifre da rimuovere devono essere un intero ≥ 0.' };
  if (discard.startsWith('predot') && parsed.dotIndex < 0) {
    return { ok: false, field: 'discard', error: 'PreDot richiede un punto (.) nel pattern.' };
  }

  const { tokens, dotIndex } = parsed;
  const m = matchPattern(tokens, number);
  const base = { ok: true, tokens, dotIndex, count: patternCount(tokens), variable: tokens.some((t) => t.max === Infinity), dialed: number };
  if (!m.match) {
    const at = m.failAt;
    let reason;
    if (m.partial) reason = 'Il numero è l’inizio di una corrispondenza: CUCM attenderebbe altre cifre (o la scadenza dell’interdigit timeout).';
    else if (at >= number.length) reason = `Il numero è troppo corto: dopo ${number.length} cifre il pattern richiede ancora ${tokens.slice(m.failToken).map((t) => t.src).join('')}.`;
    else reason = `Alla posizione ${at + 1} la cifra "${number[at]}" non è ammessa da ${tokens[m.failToken]?.src ?? 'fine pattern'}${m.failToken >= tokens.length ? ' (il numero è più lungo del pattern)' : ''}.`;
    return { ...base, match: false, partial: m.partial, reason };
  }

  const steps = [];
  let current = number;
  const preDot = dotIndex > 0 ? m.captures.slice(0, dotIndex).join('') : '';
  if (discard.startsWith('predot')) {
    const next = current.slice(preDot.length);
    steps.push({ rule: 'Discard Digits: PreDot', before: current, after: next, detail: preDot ? `Rimosse le cifre prima del punto ("${preDot}").` : 'Nessuna cifra prima del punto.' });
    current = next;
  }
  if (discard === 'predot-trailing' || discard === 'trailing') {
    const next = current.endsWith('#') ? current.slice(0, -1) : current;
    steps.push({ rule: 'Discard Digits: Trailing-#', before: current, after: next, detail: next !== current ? 'Rimosso il # finale.' : 'Nessun # finale da rimuovere.' });
    current = next;
  }
  if (strip > 0) {
    const next = current.slice(strip);
    steps.push({ rule: `Strip: ${strip} cifre iniziali`, before: current, after: next, detail: `Rimosse "${current.slice(0, strip)}".` });
    current = next;
  }
  if (mask) {
    const next = applyMask(current, mask);
    steps.push({ rule: `Called Party Transform Mask: ${mask}`, before: current, after: next, detail: 'Maschera allineata a destra: X conserva la cifra, gli altri caratteri la sostituiscono.' });
    current = next;
  }
  if (prefix) {
    const next = prefix + current;
    steps.push({ rule: `Prefix Digits: ${prefix}`, before: current, after: next, detail: 'Cifre aggiunte in testa.' });
    current = next;
  }
  return { ...base, match: true, captures: m.captures, preDot, steps, result: current };
}

// ---------------------------------------------------------------- Interfaccia

const DEFAULTS = { p: '9.[2-9]XXXXXXXXX', n: '94085551234', ddi: 'predot', strip: '0', mask: '', prefix: '', tipo: 'route' };
const EXAMPLES = [
  { label: '9.[2-9]XXXXXXXXX', p: '9.[2-9]XXXXXXXXX', n: '94085551234', ddi: 'predot' },
  { label: '9.!# variabile', p: '9.!#', n: '900390612345678#', ddi: 'predot-trailing' },
  { label: 'Interni 4XXX → DID', p: '4XXX', n: '4123', ddi: '', mask: '+390612XXXX' },
  { label: '\\+39! → nazionale', p: '\\+39!', n: '+390612345678', ddi: '', strip: '3' },
  { label: '[^0]XX esclusione', p: '[^0]XX', n: '055', ddi: '' },
];

function textField(id, label, hint, attrs = {}) {
  const input = h('input', { id, class: 'input input--mono', type: 'text', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off', 'aria-describedby': `${id}-hint ${id}-err`, ...attrs });
  const error = h('span', { class: 'field__error', id: `${id}-err`, 'aria-live': 'polite' });
  return { input, error, el: h('div', { class: 'field' }, h('label', { for: id }, label), input, hint ? h('span', { class: 'field__hint', id: `${id}-hint` }, hint) : null, error) };
}

function kpi(label, value, state = false) {
  const cls = state === true ? 'kpi kpi--hl' : state ? `kpi kpi--${state}` : 'kpi';
  return h('div', { class: cls }, h('div', { class: 'kpi__label' }, label), h('div', { class: 'kpi__value' }, value));
}

function tokenTable(res) {
  const rows = res.tokens.map((t, i) => [
    i === res.dotIndex ? h('span', null, h('span', { class: 'cucm-dot' }, '.'), ' ', t.src) : t.src,
    t.label.split(': ').slice(1).join(': ') || t.label,
    res.match ? (res.captures[i] || '—') : '',
  ]);
  return h('div', { class: 'table-wrap' }, h('table', { class: 'table table--plain' },
    h('thead', null, h('tr', null, ['Elemento', 'Significato', res.match ? 'Cifre consumate' : ''].map((x) => h('th', null, h('span', null, x))))),
    h('tbody', null, rows.map((r) => h('tr', null, h('td', { class: 'mono' }, r[0]), h('td', null, r[1]), h('td', { class: 'mono' }, r[2]))))));
}

function resultView(res) {
  if (!res.ok) {
    return [
      h('div', { class: 'kpis' }, kpi('Esito', res.unsupported ? 'Non supportato' : 'Pattern non valido', res.unsupported ? 'warn' : 'err')),
      h('ul', { class: 'notes' }, h('li', { class: `note ${res.unsupported ? 'note--warn' : 'note--err'}` }, res.error)),
    ];
  }
  const countText = res.count == null ? 'variabile' : fmtInt(res.count);
  const nodes = [h('div', { class: 'kpis' },
    kpi('Esito', res.match ? 'Corrisponde' : res.partial ? 'Parziale' : 'Non corrisponde', res.match ? 'ok' : res.partial ? 'warn' : 'err'),
    kpi('Numero risultante', res.match ? res.result || '(vuoto)' : '—', res.match ? true : false),
    kpi('Cifre', res.match ? String(res.result.length) : '—'),
    kpi('Numeri coperti', countText))];

  if (res.match) {
    nodes.push(h('h3', { class: 'section-title' }, 'Passaggi'));
    const steps = [
      { rule: 'Corrispondenza', before: res.dialed, after: res.dialed, detail: `Il numero combacia con il pattern${res.dotIndex > 0 ? `; prima del punto: "${res.preDot}"` : ''}.` },
      ...res.steps,
    ];
    nodes.push(h('ol', { class: 'steps' }, steps.map((s) => h('li', null,
      h('div', { class: 'steps__rule' }, s.rule),
      h('div', { class: 'steps__change mono' }, s.before === s.after ? s.after : [h('span', { class: 'muted' }, s.before), ' → ', h('strong', null, s.after)]),
      h('div', { class: 'steps__detail' }, s.detail)))));
    if (!res.steps.length) nodes.push(h('p', { class: 'field__hint' }, 'Nessuna trasformazione configurata: il numero passa invariato.'));
  } else {
    nodes.push(h('ul', { class: 'notes' }, h('li', { class: `note ${res.partial ? 'note--warn' : 'note--err'}` }, res.reason)));
  }
  nodes.push(h('h3', { class: 'section-title' }, 'Analisi del pattern'), tokenTable(res));
  const notes = [];
  if (res.variable) notes.push(h('li', { class: 'note' }, 'Pattern a lunghezza variabile (! , ? o +): senza # finale CUCM instrada allo scadere dell’interdigit timeout (T302, 15 s di default).'));
  notes.push(h('li', { class: 'note' }, 'Ordine delle trasformazioni: Discard Digits, strip, Called Party Transform Mask, Prefix Digits. Il tester valuta un solo pattern: la scelta del “closest match” fra più pattern e i Calling Search Space non sono simulati.'));
  nodes.push(h('ul', { class: 'notes' }, notes));
  return nodes;
}

export function render(container, params, ctx) {
  const v = (key) => params.get(key) ?? DEFAULTS[key];
  const pattern = textField(uid('pat'), 'Pattern', 'X, !, [2-9], [^0], . , #, *, \\+ letterale, ? e + come ripetizioni. La macro @ non è supportata.', { placeholder: '9.[2-9]XXXXXXXXX' });
  const dialed = textField(uid('num'), 'Numero chiamato', 'Cifre, *, # e +.', { inputmode: 'tel', placeholder: '94085551234' });
  const tipoId = uid('tipo');
  const tipoSelect = h('select', { id: tipoId, class: 'input' }, h('option', { value: 'route' }, 'Route pattern'), h('option', { value: 'translation' }, 'Translation pattern'));
  const ddiId = uid('ddi');
  const ddiSelect = h('select', { id: ddiId, class: 'input' }, DISCARD.map((d) => h('option', { value: d.id }, d.label)));
  const ddiError = h('span', { class: 'field__error', 'aria-live': 'polite' });
  const strip = textField(uid('strip'), 'Strip: cifre iniziali da rimuovere', null, { inputmode: 'numeric' });
  const mask = textField(uid('mask'), 'Called Party Transform Mask', 'Es. +390612XXXX. Vuota = nessuna maschera.');
  const prefix = textField(uid('prefix'), 'Prefix Digits', 'Cifre aggiunte in testa dopo la maschera.');
  const tipoNote = h('span', { class: 'field__hint' });

  const reset = () => { fill(DEFAULTS); update(); };
  const form = h('form', { novalidate: true },
    pattern.el,
    dialed.el,
    h('div', { class: 'field' }, h('label', { for: tipoId }, 'Tipo'), tipoSelect, tipoNote),
    h('fieldset', { class: 'group' },
      h('legend', null, 'Trasformazioni del chiamato'),
      h('div', { class: 'field' }, h('label', { for: ddiId }, 'Discard Digits'), ddiSelect, ddiError),
      strip.el, mask.el, prefix.el),
    h('div', { class: 'examples' },
      h('span', { class: 'examples__label' }, 'Esempi'),
      EXAMPLES.map((ex) => h('button', { type: 'button', class: 'chip', onclick: () => { fill({ ...DEFAULTS, ...ex, strip: ex.strip ?? '0', mask: ex.mask ?? '', prefix: ex.prefix ?? '', tipo: tipoSelect.value }); update(); } }, ex.label))),
    h('div', { class: 'form-actions' }, h('button', { type: 'button', class: 'btn btn--secondary', onclick: reset }, 'Reset')));
  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('input', update);
  form.addEventListener('change', update);

  const formDl = dashlet({ title: 'Pattern e numero', expandable: false, onReset: reset });
  formDl.body.append(form);
  const resultDl = dashlet({ title: 'Risultato' });
  container.append(h('div', { class: 'tool-grid' }, formDl.el, resultDl.el));

  function fill(x) {
    pattern.input.value = x.p;
    dialed.input.value = x.n;
    ddiSelect.value = DISCARD.some((d) => d.id === x.ddi) ? x.ddi : '';
    strip.input.value = x.strip;
    mask.input.value = x.mask;
    prefix.input.value = x.prefix;
    tipoSelect.value = x.tipo === 'translation' ? 'translation' : 'route';
  }

  function update() {
    tipoNote.textContent = tipoSelect.value === 'translation'
      ? 'Il numero risultante viene poi rianalizzato con il Calling Search Space del translation pattern.'
      : 'Il numero risultante è quello inviato al gateway o al trunk.';
    const stripRaw = strip.input.value.trim();
    const stripN = stripRaw === '' ? 0 : /^\d+$/.test(stripRaw) ? Number(stripRaw) : -1;
    const res = testPattern({
      pattern: pattern.input.value, dialed: dialed.input.value, discard: ddiSelect.value,
      strip: stripN, mask: mask.input.value.trim(), prefix: prefix.input.value.trim(),
    });
    const fields = { pattern, dialed, strip, mask, prefix };
    for (const [key, f] of Object.entries(fields)) {
      const msg = !res.ok && res.field === key && !res.unsupported ? res.error : '';
      f.error.textContent = msg;
      if (msg) f.input.setAttribute('aria-invalid', 'true'); else f.input.removeAttribute('aria-invalid');
    }
    ddiError.textContent = !res.ok && res.field === 'discard' ? res.error : '';
    if (!res.ok && ['dialed', 'strip', 'mask', 'prefix', 'discard'].includes(res.field)) {
      resultDl.body.replaceChildren(h('p', { class: 'empty' }, 'Correggi i campi evidenziati.'));
    } else {
      resultDl.body.replaceChildren(...resultView(res));
    }
    ctx.setParams({
      p: pattern.input.value.trim(), n: dialed.input.value.trim(), ddi: ddiSelect.value,
      strip: stripRaw === '0' ? '' : stripRaw, mask: mask.input.value.trim(), prefix: prefix.input.value.trim(),
      tipo: tipoSelect.value === 'route' ? '' : 'translation',
    });
  }

  fill({ p: v('p'), n: v('n'), ddi: params.has('ddi') ? params.get('ddi') : DEFAULTS.ddi, strip: v('strip'), mask: v('mask'), prefix: v('prefix'), tipo: v('tipo') });
  update();
}

// Anteprima per la Dashboard.
export function preview() {
  const r = testPattern({ pattern: '9.[2-9]XXXXXXXXX', dialed: '94085551234', discard: 'predot' });
  const m = testPattern({ pattern: '4XXX', dialed: '4123', mask: '+390612XXXX' });
  return {
    href: '',
    body: kvList([
      { label: '9.[2-9]XXXXXXXXX', value: [badge('match', 'ok'), ` → ${r.result}`] },
      { label: 'PreDot su', value: '94085551234' },
      { label: '4XXX + maschera', value: `4123 → ${m.result}`, hl: true },
    ], 'kv--compact'),
  };
}
