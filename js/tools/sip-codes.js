// Tabella dei codici di risposta SIP con mappatura Q.850 (RFC 3398).
// Le funzioni di ricerca non usano il DOM e sono importate anche da tests/run.mjs.

import { h, fmtInt, kvList, uid } from '../ui/dom.js';
import { dashlet } from '../ui/dashlet.js';
import { dataTable } from '../ui/table.js';
import { t, tn, tAll } from '../i18n.js';
import { SIP_CODES, Q850, SIP_TO_Q850, Q850_TO_SIP } from '../../data/sip-codes.js';

export const CLASS_DIGITS = ['1', '2', '3', '4', '5', '6'];

export function codeClass(code) {
  const digit = Math.floor(code / 100);
  return { digit, label: digit >= 1 && digit <= 6 ? t(`sipclass.${digit}`) : null };
}

export const description = (code) => t(`sipcode.desc.${code}`);

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
  return entry ? { ...entry, description: description(entry.code), ...codeClass(entry.code), q850: q850For(entry.code) } : null;
}

// La ricerca testuale guarda la descrizione in entrambe le lingue.
export function filterCodes({ classe = null, query = '' } = {}) {
  const q = query.trim().toLowerCase();
  return SIP_CODES
    .filter((c) => !classe || Math.floor(c.code / 100) === Number(classe))
    .filter((c) => !q || `${c.code} ${c.reason} ${tAll(`sipcode.desc.${c.code}`)} ${c.rfc}`.toLowerCase().includes(q))
    .map((c) => ({ ...c, description: description(c.code), ...codeClass(c.code), q850: q850For(c.code) }));
}

function q850Text(q) {
  if (!q) return '—';
  if (q.byWarning) return t('sipcodes.byWarning');
  return `${q.cause} · ${q.name}`;
}

// ---------------------------------------------------------------- Interfaccia

export function render(container, params, ctx) {
  const groupId = uid('cls');
  const options = [['', t('sipcodes.all')], ...CLASS_DIGITS.map((d) => [d, `${d}xx`])];
  const classGroup = h('div', { class: 'segmented segmented--auto', role: 'radiogroup', 'aria-labelledby': groupId },
    options.map(([value, label]) => h('label', { title: value ? t(`sipclass.${value}`) : t('sipcodes.allClasses') },
      h('input', { type: 'radio', name: groupId, value }), h('span', null, label))));

  const table = dataTable({
    columns: [
      { key: 'code', label: t('sipcodes.code'), mono: true },
      { key: 'reason', label: t('sipcodes.reason') },
      { key: 'label', label: t('sipcodes.class') },
      { key: 'description', label: t('sipcodes.meaning'), wrap: true, sortable: false },
      { key: 'rfc', label: 'RFC', sortValue: (r) => Number(r.rfc.replace(/\D/g, '')) },
      { key: 'q850', label: t('sipcodes.q850Col'), format: (r) => q850Text(r.q850), sortValue: (r) => r.q850?.cause ?? (r.q850 ? 999 : 1000) },
    ],
    pageSize: 25,
    pageSizes: [10, 25, 50, 100],
    filterPlaceholder: t('sipcodes.search'),
    emptyText: t('sipcodes.noCodes'),
  });
  const codesDl = dashlet({ title: t('sipcodes.codesTitle'), className: 'span-all', flush: true });
  codesDl.body.append(
    h('div', { class: 'dashlet__bar' }, h('span', { class: 'field__label', id: groupId }, t('sipcodes.class')), classGroup),
    table.el);

  const causesTable = dataTable({
    columns: [
      { key: 'cause', label: t('sipcodes.cause'), mono: true },
      { key: 'name', label: t('sipcodes.q850Desc'), wrap: true },
      { key: 'sip', label: t('sipcodes.sipResponse'), wrap: true, format: (r) => r.sipText, sortValue: (r) => r.sip ?? 0 },
    ],
    pageSize: 50,
    pageSizes: [10, 25, 50],
    filterPlaceholder: t('sipcodes.searchCause'),
  });
  causesTable.setRows(Q850_TO_SIP.map((r) => {
    const sip = r.sip == null ? null : findCode(r.sip);
    return {
      ...r,
      name: Q850[r.cause],
      sipText: sip ? `${sip.code} ${sip.reason}${r.note ? ` (${t(`sipcodes.note.${r.note}`)})` : ''}` : t('sipcodes.noResponse'),
    };
  }));
  const causesDl = dashlet({ title: t('sipcodes.causesTitle'), subtitle: t('sipcodes.causesSub'), flush: true });
  causesDl.body.append(causesTable.el);

  const infoDl = dashlet({ title: t('sipcodes.infoTitle'), expandable: false });
  infoDl.body.append(
    h('p', { class: 'muted', style: 'margin:0 0 12px' }, t('sipcodes.infoText')),
    kvList([
      { label: t('sipcodes.example'), value: reasonHeader(486) },
      { label: t('sipcodes.hangup'), value: 'Reason: Q.850;cause=16;text="Normal call clearing"' },
      { label: t('sipcodes.sourceLabel'), value: h('span', { class: 'muted sans' }, t('sipcodes.sourceText')) },
    ], 'kv--compact'));

  container.append(h('div', { class: 'tool-grid tool-grid--half' }, codesDl.el, infoDl.el, causesDl.el));

  function update() {
    const classe = classGroup.querySelector('input:checked')?.value || null;
    const rows = filterCodes({ classe });
    table.setRows(rows);
    codesDl.setSubtitle(tn('sipcodes.count', rows.length, { n: fmtInt(rows.length) })
      + (classe ? t('sipcodes.classSuffix', { digit: classe, label: t(`sipclass.${classe}`).toLowerCase() }) : ''));
    ctx.setParams({ classe: classe ?? '' });
  }

  const initial = CLASS_DIGITS.includes(params.get('classe')) ? params.get('classe') : '';
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
      { label: t('sipcodes.registered'), value: fmtInt(SIP_CODES.length), hl: true },
      row(486),
      row(404),
      row(503),
    ], 'kv--compact'),
  };
}
