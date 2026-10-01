// Dashlet: card con titolo e azioni (espandi, reimposta, altre) a destra.

import { h, uid } from './dom.js';
import { icon } from './icons.js';

let maximized = null;

export function iconButton(name, label, onclick) {
  return h('button', { type: 'button', class: 'icon-btn icon-btn--sm', 'aria-label': label, title: label, onclick }, icon(name));
}

export function dashlet({ title, subtitle, actions = [], expandable = true, onReset, className = '', flush = false } = {}) {
  const titleId = uid('dl');
  const titleEl = h('h2', { class: 'dashlet__title', id: titleId }, title, subtitle ? h('small', null, subtitle) : null);
  const actionsEl = h('div', { class: 'dashlet__actions' });
  const body = h('div', { class: flush ? 'dashlet__body dashlet__body--flush' : 'dashlet__body' });
  const el = h('section', { class: `dashlet ${className}`.trim(), 'aria-labelledby': titleId },
    h('header', { class: 'dashlet__head' }, titleEl, actionsEl),
    body);

  for (const action of actions) actionsEl.append(iconButton(action.icon, action.label, action.onclick));
  if (expandable) {
    const btn = iconButton('expand', 'Espandi', () => toggleMaximize(el, btn));
    actionsEl.append(btn);
  }
  if (onReset) actionsEl.append(iconButton('reset', 'Reimposta', onReset));

  return {
    el,
    body,
    actionsEl,
    setSubtitle(text) {
      titleEl.querySelector('small')?.remove();
      if (text) titleEl.append(h('small', null, text));
    },
  };
}

function setButton(btn, name, label) {
  btn.replaceChildren(icon(name));
  btn.setAttribute('aria-label', label);
  btn.title = label;
}

function onKey(event) {
  if (event.key === 'Escape') closeMaximized();
}

function toggleMaximize(el, btn) {
  if (maximized?.el === el) {
    closeMaximized();
    return;
  }
  closeMaximized();
  el.classList.add('is-max');
  document.body.classList.add('has-max');
  setButton(btn, 'shrink', 'Riduci');
  maximized = { el, btn };
  document.addEventListener('keydown', onKey);
}

export function closeMaximized() {
  if (!maximized) return;
  maximized.el.classList.remove('is-max');
  setButton(maximized.btn, 'expand', 'Espandi');
  document.body.classList.remove('has-max');
  document.removeEventListener('keydown', onKey);
  maximized = null;
}
