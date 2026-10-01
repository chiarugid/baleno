// Avvio: navigazione (routing con #), sidebar, tema, ricerca strumenti.

import { h, badge } from './ui/dom.js';
import { icon } from './ui/icons.js';
import { dashlet, closeMaximized } from './ui/dashlet.js';

const SECTIONS = [
  { id: 'indirizzamento', title: 'Indirizzamento', icon: 'network', description: 'Calcolo di reti, maschere e sottoreti IPv4 e IPv6.' },
  { id: 'voce', title: 'Voce', icon: 'phone', description: 'Dimensionamento della banda VoIP e analisi dei messaggi SIP.' },
  { id: 'qos', title: 'QoS', icon: 'qos', description: 'Marcature DSCP, CoS e ToS con i relativi PHB.' },
  { id: 'wireless', title: 'Wireless', icon: 'wifi', description: 'Potenze RF, EIRP e budget di collegamento.' },
  { id: 'l2', title: 'Strumenti L2', icon: 'l2', description: 'Formati degli indirizzi MAC e produttori (OUI).' },
];

const TOOLS = [
  {
    id: 'subnet', section: 'indirizzamento', title: 'Calcolatore subnet',
    description: 'Rete, broadcast, range host, wildcard e suddivisione in sottoreti IPv4/IPv6.',
    keywords: 'ip ipv4 ipv6 cidr maschera netmask wildcard broadcast sottoreti vlsm prefisso',
    load: () => import('./tools/subnet.js'),
  },
  {
    id: 'banda', section: 'voce', title: 'Calcolatore banda',
    description: 'Banda per chiamata e per N chiamate con codec, packetization e overhead di rete.',
    keywords: 'voip codec g711 g722 g729 opus bandwidth ethernet rtp udp 802.1q ipsec gre',
    load: () => import('./tools/voip-bw.js'),
  },
  {
    id: 'sip', section: 'voce', title: 'Parser SIP',
    description: 'Scompone messaggi SIP e SDP ed evidenzia le anomalie più comuni.',
    keywords: 'sip sdp invite header codec media rtp content-length',
    load: () => import('./tools/sip-parser.js'),
  },
  {
    id: 'codici', section: 'voce', title: 'Codici di risposta SIP',
    description: 'Tutti i codici di risposta SIP con significato, RFC e mappatura verso le cause Q.850.',
    keywords: 'sip risposta errore codice 404 486 487 503 q.850 q850 reason isup causa',
    load: () => import('./tools/sip-codes.js'),
  },
  {
    id: 'dscp', section: 'qos', title: 'Tabella DSCP',
    description: 'DSCP, CoS, ToS e PHB in decimale, binario ed esadecimale, con ricerca.',
    keywords: 'dscp cos tos phb ef af cs qos marcatura precedenza ecn traffic class 802.1p',
    load: () => import('./tools/dscp.js'),
  },
  {
    id: 'potenza', section: 'wireless', title: 'dBm / mW / EIRP',
    description: 'Conversione dBm ↔ mW ↔ W, EIRP con limiti ETSI indicativi e budget di collegamento in spazio libero.',
    keywords: 'dbm mw watt eirp potenza antenna dbi fspl link budget wifi wi-fi rf etsi sensibilità',
    load: () => import('./tools/rf-power.js'),
  },
  {
    id: 'mac', section: 'l2', title: 'Convertitore MAC',
    description: 'Formati Cisco, due punti, trattini, senza separatori e lookup vendor OUI.',
    keywords: 'mac oui vendor ethernet indirizzo hardware produttore eui-64 hsrp vrrp multicast',
    load: () => import('./tools/mac.js'),
  },
];

const sectionById = Object.fromEntries(SECTIONS.map((s) => [s.id, s]));
const toolPath = (t) => `#/${t.section}/${t.id}`;

const root = document.documentElement;
const mqMobile = matchMedia('(max-width: 767px)');
const mqDark = matchMedia('(prefers-color-scheme: dark)');

function store(key, value) {
  try { localStorage.setItem(key, value); } catch { /* storage non disponibile */ }
}

// ---------------------------------------------------------------- Sidebar

const navEl = document.getElementById('nav');
const navToggle = document.getElementById('nav-toggle');
const scrim = document.getElementById('scrim');

function buildNav() {
  const items = [
    h('li', null, h('a', { class: 'nav__link', href: '#/', dataset: { route: '' }, title: 'Dashboard' },
      icon('dashboard'), h('span', { class: 'nav__label' }, 'Dashboard'))),
  ];
  for (const section of SECTIONS) {
    const tools = TOOLS.filter((t) => t.section === section.id);
    items.push(h('li', null,
      h('a', { class: 'nav__link', href: `#/${section.id}`, dataset: { route: section.id }, title: section.title },
        icon(section.icon), h('span', { class: 'nav__label' }, section.title)),
      h('ul', null, tools.map((t) => h('li', null,
        h('a', { class: 'nav__sublink', href: toolPath(t), dataset: { route: `${section.id}/${t.id}` } }, t.title))))));
  }
  navEl.replaceChildren(...items);
}

function updateNav(sectionId, toolId) {
  for (const link of navEl.querySelectorAll('a')) {
    const route = link.dataset.route;
    const active = link.classList.contains('nav__link')
      ? route === (sectionId ?? '')
      : route === `${sectionId}/${toolId}`;
    link.classList.toggle('is-active', active);
    if (active && (link.classList.contains('nav__sublink') || !toolId)) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}

function setNavOpen(open) {
  root.classList.toggle('nav-open', open);
  scrim.hidden = !open;
  if (mqMobile.matches) {
    navToggle.setAttribute('aria-expanded', String(open));
    navToggle.setAttribute('aria-label', open ? 'Chiudi menu' : 'Apri menu');
    navToggle.title = navToggle.getAttribute('aria-label');
  }
}

function syncToggleState() {
  if (mqMobile.matches) {
    const open = root.classList.contains('nav-open');
    navToggle.setAttribute('aria-expanded', String(open));
    navToggle.setAttribute('aria-label', open ? 'Chiudi menu' : 'Apri menu');
  } else {
    setNavOpen(false);
    const collapsed = root.classList.contains('sidebar-collapsed');
    navToggle.setAttribute('aria-expanded', String(!collapsed));
    navToggle.setAttribute('aria-label', collapsed ? 'Espandi menu' : 'Comprimi menu');
  }
  navToggle.title = navToggle.getAttribute('aria-label');
}

navToggle.addEventListener('click', () => {
  if (mqMobile.matches) {
    setNavOpen(!root.classList.contains('nav-open'));
  } else {
    const collapsed = root.classList.toggle('sidebar-collapsed');
    store('rebluc-sidebar', collapsed ? 'collapsed' : 'open');
  }
  syncToggleState();
});
scrim.addEventListener('click', () => setNavOpen(false));
mqMobile.addEventListener('change', syncToggleState);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && root.classList.contains('nav-open')) setNavOpen(false);
});

// ---------------------------------------------------------------- Tema

const themeBtn = document.getElementById('theme-toggle');

function effectiveTheme() {
  return root.dataset.theme || (mqDark.matches ? 'dark' : 'light');
}

function syncThemeButton() {
  const dark = effectiveTheme() === 'dark';
  themeBtn.replaceChildren(icon(dark ? 'sun' : 'moon'));
  const label = dark ? 'Passa al tema chiaro' : 'Passa al tema scuro';
  themeBtn.setAttribute('aria-label', label);
  themeBtn.title = label;
}

themeBtn.addEventListener('click', () => {
  const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
  root.dataset.theme = next;
  store('rebluc-theme', next);
  syncThemeButton();
});
mqDark.addEventListener('change', syncThemeButton);

// ---------------------------------------------------------------- Info

const infoDialog = document.getElementById('info-dialog');
document.getElementById('info-btn').addEventListener('click', () => infoDialog.showModal());
infoDialog.addEventListener('click', (e) => {
  if (e.target === infoDialog || e.target.closest('[data-close]')) infoDialog.close();
});

// ---------------------------------------------------------------- Ricerca

const searchInput = document.getElementById('tool-search');
const searchList = document.getElementById('search-results');
let searchHits = [];
let searchIndex = 0;

const normalize = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function searchTools(query) {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return TOOLS.filter((t) => {
    const hay = normalize(`${t.title} ${sectionById[t.section].title} ${t.keywords} ${t.description}`);
    return words.every((w) => hay.includes(w));
  });
}

function renderSearch() {
  const query = searchInput.value.trim();
  if (!query) { closeSearch(); return; }
  searchHits = searchTools(query);
  searchIndex = 0;
  const items = searchHits.map((t, i) => h('li', {
    id: `sr-${t.id}`, role: 'option', 'aria-selected': String(i === searchIndex),
    onmousedown: (e) => { e.preventDefault(); openHit(t); },
  }, h('span', null, t.title), h('span', { class: 'sr-section' }, sectionById[t.section].title)));
  if (!items.length) items.push(h('li', { class: 'sr-empty', role: 'presentation' }, 'Nessuno strumento trovato'));
  searchList.replaceChildren(...items);
  searchList.hidden = false;
  searchInput.setAttribute('aria-expanded', 'true');
  syncSearchSelection();
}

function syncSearchSelection() {
  [...searchList.querySelectorAll('[role="option"]')].forEach((li, i) => li.setAttribute('aria-selected', String(i === searchIndex)));
  const hit = searchHits[searchIndex];
  if (hit) searchInput.setAttribute('aria-activedescendant', `sr-${hit.id}`);
  else searchInput.removeAttribute('aria-activedescendant');
}

function closeSearch() {
  searchList.hidden = true;
  searchInput.setAttribute('aria-expanded', 'false');
  searchInput.removeAttribute('aria-activedescendant');
}

function openHit(tool) {
  searchInput.value = '';
  closeSearch();
  root.classList.remove('search-open');
  searchInput.blur();
  location.hash = toolPath(tool);
}

searchInput.addEventListener('input', renderSearch);
searchInput.addEventListener('focus', renderSearch);
searchInput.addEventListener('blur', () => setTimeout(closeSearch, 100));
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (!searchHits.length) return;
    e.preventDefault();
    searchIndex = (searchIndex + (e.key === 'ArrowDown' ? 1 : -1) + searchHits.length) % searchHits.length;
    syncSearchSelection();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (searchHits[searchIndex]) openHit(searchHits[searchIndex]);
  } else if (e.key === 'Escape') {
    searchInput.value = '';
    closeSearch();
    root.classList.remove('search-open');
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable) return;
  e.preventDefault();
  root.classList.add('search-open');
  searchInput.focus();
});
document.getElementById('search-toggle').addEventListener('click', () => {
  const open = root.classList.toggle('search-open');
  if (open) searchInput.focus();
});

// ---------------------------------------------------------------- Pagine

const pageEl = document.getElementById('page');
const crumbEl = document.getElementById('breadcrumb');
const mainEl = document.getElementById('main');
let renderToken = 0;

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  return { parts: path.split('/').filter(Boolean), params: new URLSearchParams(query) };
}

function setCrumbs(items) {
  crumbEl.replaceChildren(h('ol', null, items.map((item, i) => h('li', null,
    i === items.length - 1
      ? h('span', { 'aria-current': 'page' }, item.title)
      : h('a', { href: item.href }, item.title)))));
}

function pageHead(title, description) {
  return h('div', { class: 'page-head' }, h('h1', null, title), description ? h('p', null, description) : null);
}

async function toolCard(tool) {
  const section = sectionById[tool.section];
  let href = toolPath(tool);
  const card = dashlet({
    title: tool.title,
    subtitle: section.title,
    expandable: false,
    className: 'dashlet--link',
    actions: [{ icon: 'arrowRight', label: `Apri ${tool.title}`, onclick: () => { location.hash = href; } }],
  });
  if (tool.load) {
    const mod = await tool.load();
    const pv = mod.preview();
    href += pv.href ?? '';
    card.body.append(h('p', { class: 'muted', style: 'margin:0 0 10px' }, tool.description), pv.body);
  } else {
    card.body.append(h('p', { class: 'muted', style: 'margin:0 0 12px' }, tool.description), badge('In sviluppo', 'warn'));
  }
  card.el.append(h('div', { class: 'dashlet__foot' }, h('a', { href }, tool.load ? 'Apri strumento ›' : 'Dettagli ›')));
  card.el.addEventListener('click', (e) => {
    if (e.target.closest('a, button')) return;
    location.hash = href;
  });
  return card.el;
}

async function renderDashboard() {
  setCrumbs([{ title: 'Dashboard' }]);
  document.title = 'Dashboard · rebluc';
  const cards = await Promise.all(TOOLS.map(toolCard));
  return [
    pageHead('Dashboard', 'Strumenti di rete e VoIP. Tutti i calcoli avvengono nel browser: nessun dato lascia il dispositivo.'),
    h('div', { class: 'dash-grid' }, cards),
  ];
}

async function renderSection(section) {
  setCrumbs([{ title: section.title }]);
  document.title = `${section.title} · rebluc`;
  const cards = await Promise.all(TOOLS.filter((t) => t.section === section.id).map(toolCard));
  return [pageHead(section.title, section.description), h('div', { class: 'dash-grid' }, cards)];
}

async function renderTool(section, tool, params) {
  setCrumbs([{ title: section.title, href: `#/${section.id}` }, { title: tool.title }]);
  document.title = `${tool.title} · rebluc`;
  const head = pageHead(tool.title, tool.description);
  if (!tool.load) {
    const card = dashlet({ title: 'In sviluppo', expandable: false });
    card.body.append(h('p', { class: 'empty' }, 'Questo strumento sarà disponibile a breve.'));
    return [head, card.el];
  }
  const mod = await tool.load();
  const holder = h('div');
  const ctx = {
    setParams(values) {
      const qs = new URLSearchParams(Object.entries(values).filter(([, v]) => v)).toString();
      history.replaceState(null, '', `${toolPath(tool)}${qs ? `?${qs}` : ''}`);
    },
  };
  return [head, holder, () => mod.render(holder, params, ctx)];
}

function renderNotFound() {
  setCrumbs([{ title: 'Dashboard', href: '#/' }, { title: 'Pagina non trovata' }]);
  document.title = 'Pagina non trovata · rebluc';
  const card = dashlet({ title: 'Pagina non trovata', expandable: false });
  card.body.append(h('p', { class: 'empty' }, 'L’indirizzo non corrisponde a nessuno strumento. ', h('a', { href: '#/' }, 'Torna alla Dashboard')));
  return [card.el];
}

async function route({ focus = true } = {}) {
  const token = ++renderToken;
  closeMaximized();
  setNavOpen(false);
  const { parts, params } = parseHash();
  const [sectionId, toolId, ...rest] = parts;
  const section = sectionById[sectionId];
  const tool = section && TOOLS.find((t) => t.section === section.id && t.id === toolId);

  let nodes;
  try {
    if (!sectionId) { nodes = await renderDashboard(); updateNav(null, null); }
    else if (section && !toolId) { nodes = await renderSection(section); updateNav(section.id, null); }
    else if (tool && !rest.length) { nodes = await renderTool(section, tool, params); updateNav(section.id, tool.id); }
    else { nodes = renderNotFound(); updateNav('-', null); }
  } catch (err) {
    console.error(err);
    const card = dashlet({ title: 'Errore', expandable: false });
    card.body.append(h('p', { class: 'empty' }, 'Impossibile caricare la pagina. Ricarica e riprova.'));
    nodes = [card.el];
  }
  if (token !== renderToken) return;

  const after = typeof nodes.at(-1) === 'function' ? nodes.pop() : null;
  pageEl.replaceChildren(...nodes);
  after?.();
  window.scrollTo(0, 0);
  if (focus) mainEl.focus({ preventScroll: true });
}

// ---------------------------------------------------------------- Avvio

buildNav();
syncToggleState();
syncThemeButton();
window.addEventListener('hashchange', () => route());
route({ focus: false });
