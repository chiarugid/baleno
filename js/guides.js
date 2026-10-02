// Guide pratiche: indice e pagina di ogni guida.
// Il contenuto sta in data/guides/<id>.js come coppie [italiano, inglese];
// qui solo la resa. Nessun innerHTML: tutto il testo passa come nodi.

import { h, copyText, toast } from './ui/dom.js';
import { iconButton } from './ui/dashlet.js';
import { t, getLang } from './i18n.js';
import wlanreport from '../data/guides/wlanreport.js';

export const GUIDES = [wlanreport];

// Testo nella lingua corrente: coppia [it, en] oppure stringa uguale per entrambe.
export const L = (v) => (Array.isArray(v) ? v[getLang() === 'en' ? 1 : 0] : v);

// Tutte le coppie di testo di una guida (per i test di completezza).
export function guideTexts(guide) {
  const out = [];
  const walk = (v) => {
    if (Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === 'string')) out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => { if (k !== 'code' && k !== 'console' && k !== 'url') walk(x); });
  };
  walk(guide);
  return out;
}

async function copy(text) {
  toast((await copyText(text)) ? t('guide.copied') : t('ui.copyFailed'));
}

function codeBlock(block) {
  return h('div', { class: 'guide-code' },
    block.shell ? h('div', { class: 'guide-code__shell' }, L(block.shell)) : null,
    h('div', { class: 'guide-code__row' },
      h('pre', null, h('code', null, block.code)),
      iconButton('copy', t('guide.copyCommand'), () => copy(block.code))),
    block.note ? h('p', { class: 'guide-code__note' }, L(block.note)) : null);
}

function tableBlock(table) {
  return h('div', { class: 'table-wrap' }, h('table', { class: 'table table--plain guide-table' },
    h('thead', null, h('tr', null, table.head.map((c) => h('th', null, h('span', null, L(c)))))),
    h('tbody', null, table.rows.map((row) => h('tr', null, row.map((c, i) => h('td', { class: i === 0 ? 'guide-table__key' : null }, L(c))))))));
}

// Anteprima del rapporto wlanreport con dati inventati, nello stile del rapporto originale.
function wlanReportMock() {
  const reasons = [
    [['Rete disconnessa dall’utente.', 'Network disconnected by the user.'], 3],
    [['Driver disconnesso.', 'Driver disconnected.'], 2],
    [['La connessione non è riuscita, perché non era visibile alcun punto di accesso collegabile', 'The connection failed because no connectable access point was visible'], 1],
  ];
  const durations = [['0 - 1 minutes', 2], ['1 - 5 minutes', 3], ['5 - 10 minutes', 0], ['10 - 30 minutes', 1], ['30 - 60 minutes', 1], ['60 - 360 minutes', 2], ['360+ minutes', 1]];
  const max = Math.max(...durations.map(([, n]) => n));
  const events = [
    ['wlan', '8000', '09:12:04', ['Avvio connessione a «Ufficio-WiFi».', 'Starting connection to “Ufficio-WiFi”.']],
    ['wlan', '8001', '09:12:06', ['Connessione riuscita a «Ufficio-WiFi».', 'Successfully connected to “Ufficio-WiFi”.']],
    ['ncsi', '4042', '09:12:09', ['Connettività: Internet.', 'Connectivity: Internet.']],
    ['wlan', '8003', '09:15:41', ['Disconnessione da «Ufficio-WiFi». Motivo: Driver disconnesso.', 'Disconnected from “Ufficio-WiFi”. Reason: Driver disconnected.']],
  ];
  const sessionRow = (cls) => h('span', { class: `wr-dot wr-dot--${cls}`, 'aria-hidden': 'true' });
  return h('figure', { class: 'wr-mock' },
    h('div', { class: 'wr-mock__badge' }, t('guide.mockBadge')),
    h('div', { class: 'wr-chart', 'aria-hidden': 'true' },
      ['ok', 'ok', 'warn', 'err', 'ok', 'warn'].map((c, i) => h('div', { class: 'wr-chart__row' },
        h('span', { class: 'wr-chart__label' }, `S${i + 1}`),
        h('span', { class: `wr-chart__bar wr-chart__bar--${c}`, style: `width:${[70, 35, 18, 6, 55, 12][i]}%` }),
        c === 'err' ? sessionRow('err') : null))),
    h('div', { class: 'wr-grid' },
      h('div', null,
        h('h4', null, 'Session Success/Failures'),
        h('table', { class: 'wr-table' }, h('tbody', null,
          h('tr', null, h('td', null, 'Successes'), h('td', { class: 'num' }, '4')),
          h('tr', null, h('td', null, 'Failures'), h('td', { class: 'num' }, '1')),
          h('tr', null, h('td', null, 'Warnings'), h('td', { class: 'num' }, '5')))),
        h('h4', null, 'Disconnect Reasons'),
        h('table', { class: 'wr-table' }, h('tbody', null, reasons.map(([r, n]) => h('tr', null, h('td', null, L(r)), h('td', { class: 'num' }, String(n))))))),
      h('div', null,
        h('h4', null, 'Session Durations'),
        h('div', { class: 'wr-bars' }, durations.map(([label, n]) => h('div', { class: 'wr-bars__row' },
          h('span', { class: 'wr-bars__label' }, label),
          h('span', { class: 'wr-bars__track' }, h('span', { class: 'wr-bars__fill', style: `width:${(n / max) * 100}%` })),
          h('span', { class: 'wr-bars__n' }, String(n))))))),
    h('h4', null, 'Wireless Sessions'),
    h('div', { class: 'table-wrap' }, h('table', { class: 'wr-table wr-events' },
      h('thead', null, h('tr', null, h('th', null, 'EventId'), h('th', null, 'Time'), h('th', null, 'Message'))),
      h('tbody', null, events.map(([cls, id, time, msg]) => h('tr', { class: `wr-ev wr-ev--${cls}` },
        h('td', null, id), h('td', null, time), h('td', null, L(msg))))))),
    h('figcaption', null, t('guide.mockCaption')));
}

const MOCKS = { wlanreport: wlanReportMock };

function blockView(block) {
  if (block.p) return h('p', null, L(block.p));
  if (block.list) return h('ul', { class: 'guide-list' }, block.list.map((item) => h('li', null, L(item))));
  if (block.code) return codeBlock(block);
  if (block.console) {
    // lang: lingua dell'output reale (es. Windows in italiano), indipendente dalla lingua del sito
    return h('figure', { class: 'guide-console' },
      h('pre', { lang: block.lang ?? null }, h('code', null, block.console)),
      block.caption ? h('figcaption', null, L(block.caption)) : null);
  }
  if (block.table) return tableBlock(block.table);
  if (block.warn) return h('ul', { class: 'notes' }, h('li', { class: 'note note--warn' }, L(block.warn)));
  if (block.mock) return MOCKS[block.mock]();
  return null;
}

export function guideMeta(guide) {
  return `${L(guide.topic)} · ${L(guide.level)} · ${t('guide.minutes', { n: guide.minutes })}`;
}

export function renderGuide(guide) {
  const toc = h('nav', { class: 'guide-toc', 'aria-label': t('guide.toc') },
    h('ol', null, guide.sections.map((s, i) => h('li', null,
      h('button', { type: 'button', class: 'link-btn', onclick: () => document.getElementById(`gs-${i}`)?.scrollIntoView({ behavior: 'smooth' }) }, L(s.title))))));
  return h('article', { class: 'guide' },
    h('p', { class: 'guide-meta' }, guideMeta(guide)),
    toc,
    guide.sections.map((s, i) => h('section', { class: 'guide-section', id: `gs-${i}` },
      h('h2', null, L(s.title)),
      s.blocks.map(blockView))),
    h('section', { class: 'guide-section' },
      h('h2', null, t('guide.sources')),
      h('ul', { class: 'guide-list' }, guide.sources.map((src) => h('li', null,
        h('a', { href: L(src.url), target: '_blank', rel: 'noopener noreferrer' }, L(src.label)),
        h('span', { class: 'visually-hidden' }, ` (${t('ext.newTab')})`))))));
}
