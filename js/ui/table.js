// Tabella compatta con ordinamento per colonna, filtro testuale e paginazione.
// Accetta un array di righe (setRows) oppure una sorgente virtuale
// { count, getRow(i) } per elenchi troppo grandi da materializzare (setSource):
// in quel caso ordinamento e filtro sono disattivati.

import { h, fmtInt } from './dom.js';
import { icon } from './icons.js';

const collator = new Intl.Collator('it', { numeric: true, sensitivity: 'base' });

function compare(a, b) {
  if (a == null) return b == null ? 0 : -1;
  if (b == null) return 1;
  if ((typeof a === 'number' || typeof a === 'bigint') && (typeof b === 'number' || typeof b === 'bigint')) {
    return a < b ? -1 : a > b ? 1 : 0;
  }
  return collator.compare(String(a), String(b));
}

export function dataTable({
  columns,
  pageSize = 15,
  pageSizes = [10, 15, 25, 50, 100],
  emptyText = 'Nessun dato',
  filterPlaceholder = 'Filtra…',
  virtualNote = 'Ordinamento e filtro non disponibili per elenchi così lunghi.',
} = {}) {
  const state = { rows: [], source: null, view: [], filter: '', sortKey: null, sortDir: 1, page: 0, pageSize };

  const cellText = (col, row) => {
    const v = col.format ? col.format(row) : row[col.key];
    return v == null ? '' : String(v);
  };

  const filterInput = h('input', {
    type: 'search', class: 'input input--sm', placeholder: filterPlaceholder, 'aria-label': 'Filtra righe',
    oninput: () => { state.filter = filterInput.value.trim().toLowerCase(); state.page = 0; recompute(); },
  });
  const note = h('span', { class: 'table-note' });
  const toolbar = h('div', { class: 'table-toolbar' },
    h('div', { class: 'table-filter' }, icon('search'), filterInput),
    note);

  const headCells = columns.map((col) => {
    const th = h('th', { scope: 'col', class: col.align === 'right' ? 'num' : null });
    if (col.sortable === false) {
      th.append(h('span', null, col.label));
    } else {
      th.append(h('button', { type: 'button', onclick: () => sortBy(col.key) }, col.label, icon('sortNone', 'sort')));
    }
    return th;
  });
  const tbody = h('tbody');
  const table = h('table', { class: 'table' }, h('thead', null, h('tr', null, headCells)), tbody);

  const info = h('span', { class: 'pager__info' });
  const pageLabel = h('span', { class: 'pager__page' });
  const navBtn = (name, label, fn) => h('button', { type: 'button', class: 'icon-btn icon-btn--sm', 'aria-label': label, title: label, onclick: fn }, icon(name));
  const first = navBtn('chevronsLeft', 'Prima pagina', () => goTo(0));
  const prev = navBtn('chevronLeft', 'Pagina precedente', () => goTo(state.page - 1));
  const next = navBtn('chevronRight', 'Pagina successiva', () => goTo(state.page + 1));
  const last = navBtn('chevronsRight', 'Ultima pagina', () => goTo(Infinity));
  const sizeSelect = h('select', {
    class: 'input input--sm', 'aria-label': 'Righe per pagina',
    onchange: () => { state.pageSize = Number(sizeSelect.value); state.page = 0; render(); },
  }, pageSizes.map((n) => h('option', { value: n, selected: n === pageSize }, n)));
  const pager = h('div', { class: 'pager' },
    info,
    h('label', { class: 'pager__size' }, 'Righe', sizeSelect),
    h('div', { class: 'pager__nav' }, first, prev, pageLabel, next, last));

  const el = h('div', { class: 'data-table' }, toolbar, h('div', { class: 'table-wrap' }, table), pager);

  function count() {
    return state.source ? state.source.count : state.view.length;
  }

  function rowAt(i) {
    return state.source ? state.source.getRow(i) : state.view[i];
  }

  function recompute() {
    let rows = state.rows;
    if (state.filter) {
      rows = rows.filter((row) => columns.some((col) => cellText(col, row).toLowerCase().includes(state.filter)));
    }
    if (state.sortKey) {
      const col = columns.find((c) => c.key === state.sortKey);
      const value = col.sortValue ?? ((row) => row[col.key]);
      rows = [...rows].sort((a, b) => compare(value(a), value(b)) * state.sortDir);
    }
    state.view = rows;
    render();
  }

  function sortBy(key) {
    if (state.source) return;
    if (state.sortKey === key) state.sortDir = -state.sortDir;
    else { state.sortKey = key; state.sortDir = 1; }
    recompute();
  }

  function goTo(page) {
    const pages = Math.max(1, Math.ceil(count() / state.pageSize));
    state.page = Math.min(Math.max(0, page), pages - 1);
    render();
  }

  function render() {
    const total = count();
    const pages = Math.max(1, Math.ceil(total / state.pageSize));
    state.page = Math.min(state.page, pages - 1);
    const start = state.page * state.pageSize;
    const end = Math.min(start + state.pageSize, total);

    const trs = [];
    for (let i = start; i < end; i++) {
      const row = rowAt(i);
      trs.push(h('tr', null, columns.map((col) => h('td', {
        class: [col.align === 'right' ? 'num' : '', col.mono ? 'mono' : ''].join(' ').trim() || null,
      }, cellText(col, row)))));
    }
    if (!trs.length) {
      const text = state.filter ? 'Nessuna riga corrisponde al filtro' : emptyText;
      trs.push(h('tr', { class: 'empty-row' }, h('td', { colspan: columns.length }, text)));
    }
    tbody.replaceChildren(...trs);

    headCells.forEach((th, i) => {
      const col = columns[i];
      const btn = th.querySelector('button');
      if (!btn) return;
      btn.disabled = Boolean(state.source);
      const active = !state.source && state.sortKey === col.key;
      if (active) th.setAttribute('aria-sort', state.sortDir > 0 ? 'ascending' : 'descending');
      else th.removeAttribute('aria-sort');
      btn.querySelector('.sort').replaceWith(icon(active ? (state.sortDir > 0 ? 'sortAsc' : 'sortDesc') : 'sortNone', 'sort'));
    });

    filterInput.disabled = Boolean(state.source);
    note.textContent = state.source ? virtualNote : '';
    info.textContent = total ? `${fmtInt(start + 1)}–${fmtInt(end)} di ${fmtInt(total)}` : '0 righe';
    pageLabel.textContent = `${fmtInt(state.page + 1)} / ${fmtInt(pages)}`;
    first.disabled = prev.disabled = state.page === 0;
    next.disabled = last.disabled = state.page >= pages - 1;
  }

  render();

  return {
    el,
    setRows(rows) {
      state.rows = rows;
      state.source = null;
      state.page = 0;
      recompute();
    },
    setSource(source) {
      state.source = source;
      state.rows = [];
      state.view = [];
      state.page = 0;
      render();
    },
  };
}
