import { locale } from '../i18n.js';

// Funzioni di supporto per il DOM. I contenuti dinamici passano sempre
// come nodi di testo: niente innerHTML con dati inseriti dall'utente.

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, String(value));
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const child of [children].flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

let idCounter = 0;
export function uid(prefix = 'id') {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

// Formattazione numerica nella lingua corrente (it-IT: 1.234,5 · en-GB: 1,234.5).
const formats = new Map();
function numberFormat(options, key) {
  const id = `${locale()}|${key}`;
  if (!formats.has(id)) formats.set(id, new Intl.NumberFormat(locale(), options));
  return formats.get(id);
}

export function fmtInt(n) {
  return numberFormat(undefined, 'int').format(n);
}

export function fmtDec(n, digits = 1) {
  return numberFormat({ maximumFractionDigits: digits }, `dec${digits}`).format(n);
}

export function kvList(items, className = '') {
  const dl = h('dl', { class: `kv ${className}`.trim() });
  for (const item of items) {
    if (!item) continue;
    dl.append(h('dt', null, item.label), h('dd', { class: item.hl ? 'hl' : null }, item.value));
  }
  return dl;
}

export function badge(text, kind = '') {
  return h('span', { class: kind ? `badge badge--${kind}` : 'badge' }, text);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = h('textarea', { style: 'position:fixed;opacity:0', readonly: true });
    area.value = text;
    document.body.append(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    area.remove();
    return ok;
  }
}

let toastEl = null;
let toastTimer = 0;
export function toast(message) {
  if (!toastEl) {
    toastEl = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastEl);
  }
  toastEl.textContent = message;
  toastEl.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('is-visible'), 1800);
}
