// Dashlet: card con titolo e azioni (espandi, reimposta, altre) a destra.

import { h, uid } from './dom.js';
import { icon } from './icons.js';
import { t } from '../i18n.js';

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
    const btn = iconButton('expand', t('ui.expand'), () => toggleMaximize(el, btn));
    actionsEl.append(btn);
  }
  if (onReset) actionsEl.append(iconButton('reset', t('ui.reset'), onReset));

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

// Sfondo dietro la dashlet espansa: chiude solo se pressione e rilascio
// avvengono entrambi sullo sfondo (un trascinamento dalla card non chiude).
function createBackdrop() {
  const backdrop = h('div', { class: 'dashlet-backdrop', 'aria-hidden': 'true' });
  let pressedOnBackdrop = false;
  backdrop.addEventListener('pointerdown', (e) => { pressedOnBackdrop = e.target === backdrop; });
  backdrop.addEventListener('click', (e) => {
    if (pressedOnBackdrop && e.target === backdrop) closeMaximized();
    pressedOnBackdrop = false;
  });
  return backdrop;
}

function toggleMaximize(el, btn) {
  if (maximized?.el === el) {
    closeMaximized();
    return;
  }
  closeMaximized();
  const backdrop = createBackdrop();
  document.body.append(backdrop);
  el.classList.add('is-max');
  setButton(btn, 'shrink', t('ui.shrink'));
  maximized = { el, btn, backdrop };
  document.addEventListener('keydown', onKey);
}

export function closeMaximized() {
  if (!maximized) return;
  maximized.el.classList.remove('is-max');
  maximized.backdrop.remove();
  setButton(maximized.btn, 'expand', t('ui.expand'));
  document.removeEventListener('keydown', onKey);
  maximized = null;
}
