// Icone SVG inline (tratto, 24×24). Markup statico: unico punto in cui si usa innerHTML.

const paths = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  network: '<rect x="9" y="2.5" width="6" height="5" rx="1"/><rect x="2.5" y="16.5" width="6" height="5" rx="1"/><rect x="15.5" y="16.5" width="6" height="5" rx="1"/><path d="M12 7.5V12M5.5 16.5V12h13v4.5"/>',
  phone: '<path d="M21 16.4v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 1.1 3.7 2 2 0 0 1 3.1 1.5h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L7.1 9.4a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  qos: '<path d="M3 21h18"/><path d="M6 21v-5M11 21V10M16 21V6M21 21V3" />',
  l2: '<rect x="3" y="4.5" width="18" height="15" rx="1.5"/><path d="M8 15.5v-4h2v-2h4v2h2v4z"/>',
  wifi: '<path d="M2 8.8a15 15 0 0 1 20 0M5.2 12.3a10.5 10.5 0 0 1 13.6 0M8.5 15.8a5.5 5.5 0 0 1 7 0"/><circle cx="12" cy="19.3" r="1.1"/>',
  book: '<path d="M12 6.5C10.3 5 7.8 4.5 4 4.5v13c3.8 0 6.3.5 8 2 1.7-1.5 4.2-2 8-2v-13c-3.8 0-6.3.5-8 2z"/><path d="M12 6.5v13"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3L21 2M17 6l3 3M14 9l2.5 2.5"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16.5V11M12 7.5h.01"/>',
  expand: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
  shrink: '<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>',
  reset: '<path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 3v5h5"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  chevronLeft: '<path d="M15 6l-6 6 6 6"/>',
  chevronRight: '<path d="M9 6l6 6-6 6"/>',
  chevronsLeft: '<path d="M11 17l-5-5 5-5M18 17l-5-5 5-5"/>',
  chevronsRight: '<path d="M13 17l5-5-5-5M6 17l5-5-5-5"/>',
  sortAsc: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  sortDesc: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  sortNone: '<path d="M8 9l4-4 4 4M8 15l4 4 4-4"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  close: '<path d="M18 6L6 18M6 6l12 12"/>',
};

export function iconMarkup(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name] ?? ''}</svg>`;
}

export function icon(name, className = '') {
  const span = document.createElement('span');
  span.className = `icon ${className}`.trim();
  span.innerHTML = iconMarkup(name);
  return span;
}
