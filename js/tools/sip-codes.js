// Tabella dei codici di risposta SIP con mappatura Q.850 (RFC 3398).
// Le funzioni di ricerca non usano il DOM e sono importate anche da tests/run.mjs.

import { h, fmtInt, kvList, uid } from '../ui/dom.js';
import { dashlet } from '../ui/dashlet.js';
import { dataTable } from '../ui/table.js';
import { SIP_CODES, Q850, SIP_TO_Q850, Q850_TO_SIP } from '../../data/sip-codes.js';

export const CLASSES = {
  1: 'Provvisoria',
  2: 'Successo',
  3: 'Redirezione',
  4: 'Errore del client',
  5: 'Errore del server',
  6: 'Errore globale',
};

export function codeClass(code) {
  const digit = Math.floor(code / 100);
  return { digit, label: CLASSES[digit] ?? null };
}

// Causa Q.850 per una risposta SIP: { cause, name } | { byWarning: true } | null.
export function q850For(code) {
  if (!(code in SIP_TO_Q850)) return null;
  const cause = SIP_TO_Q850[code];
  return cause == null ? { byWarning: true } : { cause, name: Q850[cause] };
}

export function reasonHeader(code) {
  const q = q850For(code);
  return q?.cause ? `Reason: Q.850;cause=${q.cause};text="${q.name}"` : null;
}

export function findCode(code) {
  const entry = SIP_CODES.find((c) => c.code === Number(code));
  return entry ? { ...entry, ...codeClass(entry.code), q850: q850For(entry.code) } : null;
}

export function filterCodes({ classe = null, query = '' } = {}) {
  const q = query.trim().toLowerCase();
  return SIP_CODES
    .filter((c) => !classe || Math.floor(c.code / 100) === Number(classe))
    .filter((c) => !q || `${c.code} ${c.reason} ${c.description} ${c.rfc}`.toLowerCase().includes(q))
    .map((c) => ({ ...c, ...codeClass(c.code), q850: q850For(c.code) }));
}

function q850Text(q) {
  if (!q) return '—';
  if (q.byWarning) return 'da Warning';
  return `${q.cause} · ${q.name}`;
}

// ---------------------------------------------------------------- Interfaccia

export function render(container, params, ctx) {
  const groupId = uid('cls');
  const options = [['', 'Tutte'], ...Object.keys(CLASSES).map((d) => [d, `${d}xx`])];
  const classGroup = h('div', { class: 'segmented segmented--auto', role: 'radiogroup', 'aria-labelledby': groupId },
    options.map(([value, label]) => h('label', { title: value ? CLASSES[value] : 'Tutte le classi' },
      h('input', { type: 'radio', name: groupId, value }), h('span', null, label))));

  const table = dataTable({
    columns: [
      { key: 'code', label: 'Codice', mono: true },
      { key: 'reason', label: 'Motivo' },
      { key: 'label', label: 'Classe' },
      { key: 'description', label: 'Significato e causa tipica', wrap: true, sortable: false },
      { key: 'rfc', label: 'RFC', sortValue: (r) => Number(r.rfc.replace(/\D/g, '')) },
      { key: 'q850', label: 'Q.850 (verso ISUP)', format: (r) => q850Text(r.q850), sortValue: (r) => r.q850?.cause ?? (r.q850 ? 999 : 1000) },
    ],
    pageSize: 25,
    pageSizes: [10, 25, 50, 100],
    filterPlaceholder: 'Cerca codice o testo…',
    emptyText: 'Nessun codice',
  });
  const codesDl = dashlet({ title: 'Codici di risposta', className: 'span-all', flush: true });
  codesDl.body.append(
    h('div', { class: 'dashlet__bar' }, h('span', { class: 'field__label', id: groupId }, 'Classe'), classGroup),
    table.el);

  const causesTable = dataTable({
    columns: [
      { key: 'cause', label: 'Causa', mono: true },
      { key: 'name', label: 'Descrizione Q.850', wrap: true },
      { key: 'sip', label: 'Risposta SIP', wrap: true, format: (r) => r.sipText, sortValue: (r) => r.sip ?? 0 },
    ],
    pageSize: 50,
    pageSizes: [10, 25, 50],
    filterPlaceholder: 'Cerca causa…',
  });
  causesTable.setRows(Q850_TO_SIP.map((r) => {
    const sip = r.sip == null ? null : findCode(r.sip);
    return {
      ...r,
      name: Q850[r.cause],
      sipText: sip ? `${sip.code} ${sip.reason}${r.note ? ` (${r.note})` : ''}` : 'nessuna: BYE o CANCEL',
    };
  }));
  const causesDl = dashlet({ title: 'Cause Q.850 → SIP', subtitle: 'da ISUP verso SIP', flush: true });
  causesDl.body.append(causesTable.el);

  const infoDl = dashlet({ title: 'Header Reason e Q.850', expandable: false });
  infoDl.body.append(
    h('p', { class: 'muted', style: 'margin:0 0 12px' },
      'Nei messaggi SIP che chiudono o rifiutano una chiamata (BYE, CANCEL, risposte 4xx–6xx) i gateway verso la rete telefonica riportano spesso la causa ISDN originale nell’header Reason (RFC 3326).'),
    kvList([
      { label: 'Esempio', value: reasonHeader(486) },
      { label: 'Riaggancio', value: 'Reason: Q.850;cause=16;text="Normal call clearing"' },
      { label: 'Fonte', value: h('span', { class: 'muted sans' }, 'RFC 3398 (SIP ↔ ISUP). La mappatura “da Warning” dipende dal codice nell’header Warning; i gateway reali possono discostarsi.') },
    ], 'kv--compact'));

  container.append(h('div', { class: 'tool-grid tool-grid--half' }, codesDl.el, infoDl.el, causesDl.el));

  function update() {
    const classe = classGroup.querySelector('input:checked')?.value || null;
    const rows = filterCodes({ classe });
    table.setRows(rows);
    codesDl.setSubtitle(`${fmtInt(rows.length)} codici${classe ? ` · ${classe}xx ${CLASSES[classe].toLowerCase()}` : ''}`);
    ctx.setParams({ classe: classe ?? '' });
  }

  const initial = CLASSES[params.get('classe')] ? params.get('classe') : '';
  for (const input of classGroup.querySelectorAll('input')) input.checked = input.value === initial;
  classGroup.addEventListener('change', update);
  update();
}

// Anteprima per la Dashboard.
export function preview() {
  const row = (code) => {
    const c = findCode(code);
    return { label: `${c.code} ${c.reason}`, value: c.q850?.cause ? `Q.850 ${c.q850.cause}` : '—' };
  };
  return {
    href: '?classe=4',
    body: kvList([
      { label: 'Codici registrati', value: fmtInt(SIP_CODES.length), hl: true },
      row(486),
      row(404),
      row(503),
    ], 'kv--compact'),
  };
}
