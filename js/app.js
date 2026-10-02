// Avvio: navigazione (routing con #), sidebar, tema, lingua, ricerca strumenti.

import { h, badge, fmtInt } from './ui/dom.js';
import { icon } from './ui/icons.js';
import { dashlet, closeMaximized } from './ui/dashlet.js';
import { t, tAll, getLang, setLang, resolveLang, isLang } from './i18n.js';
import { countVisit, browserStorage } from './visits.js';
import { GUIDES, renderGuide, guideMeta, L } from './guides.js';

const SECTIONS = [
  { id: 'indirizzamento', icon: 'network' },
  { id: 'voce', icon: 'phone' },
  { id: 'qos', icon: 'qos' },
  { id: 'wireless', icon: 'wifi' },
  { id: 'l2', icon: 'l2' },
  { id: 'sicurezza', icon: 'key' },
];

const TOOLS = [
  { id: 'subnet', section: 'indirizzamento', load: () => import('./tools/subnet.js') },
  { id: 'banda', section: 'voce', load: () => import('./tools/voip-bw.js') },
  { id: 'sip', section: 'voce', load: () => import('./tools/sip-parser.js') },
  { id: 'codici', section: 'voce', load: () => import('./tools/sip-codes.js') },
  { id: 'mos', section: 'voce', load: () => import('./tools/mos.js') },
  { id: 'pattern', section: 'voce', load: () => import('./tools/cucm.js') },
  { id: 'dscp', section: 'qos', load: () => import('./tools/dscp.js') },
  { id: 'potenza', section: 'wireless', load: () => import('./tools/rf-power.js') },
  { id: 'mac', section: 'l2', load: () => import('./tools/mac.js') },
  { id: 'certificati', section: 'sicurezza', load: () => import('./tools/certs.js') },
];

// Guide pratiche: procedure passo per passo (contenuti in data/guides/).
const GUIDE_SECTION = { id: 'guide', icon: 'book' };
const guidePath = (g) => `#/${GUIDE_SECTION.id}/${g.id}`;

// Strumenti di terze parti: solo link, aperti in una nuova scheda; nessuna risorsa caricata da fuori.
const EXTERNAL_SECTION = { id: 'esterni', icon: 'external' };
const EXTERNAL = [
  {
    id: 'wcae',
    url: 'https://cway.cisco.com/tools/WirelessAnalyzer/',
    links: [
      { key: 'desktop', url: 'https://github.com/CiscoDevNet/wcae' },
      { key: 'docs', url: 'https://developer.cisco.com/docs/wireless-troubleshooting-tools/' },
    ],
  },
];

const sectionById = Object.fromEntries(SECTIONS.map((s) => [s.id, s]));
const toolPath = (tool) => `#/${tool.section}/${tool.id}`;
const sectionTitle = (s) => t(`section.${s.id}.title`);
const toolTitle = (tool) => t(`tool.${tool.id}.title`);
const toolDesc = (tool) => t(`tool.${tool.id}.desc`);

const root = document.documentElement;
const mqMobile = matchMedia('(max-width: 767px)');
const mqDark = matchMedia('(prefers-color-scheme: dark)');

function store(key, value) {
  try { localStorage.setItem(key, value); } catch { /* storage non disponibile */ }
}

function read(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

// ---------------------------------------------------------------- Testi statici

// Elementi di index.html marcati con data-i18n (testo) o data-i18n-attr ("attr:chiave;…").
function applyStaticText() {
  root.lang = getLang();
  document.title = t('app.docTitle');
  document.querySelector('meta[name="description"]')?.setAttribute('content', t('app.metaDescription'));
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-attr]')) {
    for (const pair of el.dataset.i18nAttr.split(';')) {
      const [attr, key] = pair.split(':');
      el.setAttribute(attr, t(key));
    }
  }
  for (const btn of document.querySelectorAll('[data-lang]')) btn.setAttribute('aria-pressed', String(btn.dataset.lang === getLang()));
}

// ---------------------------------------------------------------- Contatore visite

// Conta una volta per sessione, all'avvio; i cambi di pagina interni non incrementano.
const visitCount = countVisit(browserStorage('localStorage'), browserStorage('sessionStorage'));

function renderVisits() {
  for (const el of document.querySelectorAll('[data-visits]')) {
    el.hidden = visitCount == null;
    if (visitCount == null) continue;
    el.textContent = t('app.visits', { n: fmtInt(visitCount) });
    el.title = t('app.visitsTitle');
  }
}

// ---------------------------------------------------------------- Sidebar

const navEl = document.getElementById('nav');
const navToggle = document.getElementById('nav-toggle');
const scrim = document.getElementById('scrim');

function buildNav() {
  const items = [
    h('li', null, h('a', { class: 'nav__link', href: '#/', dataset: { route: '' }, title: t('app.dashboard') },
      icon('dashboard'), h('span', { class: 'nav__label' }, t('app.dashboard')))),
  ];
  for (const section of SECTIONS) {
    const tools = TOOLS.filter((tool) => tool.section === section.id);
    items.push(h('li', null,
      h('a', { class: 'nav__link', href: `#/${section.id}`, dataset: { route: section.id }, title: sectionTitle(section) },
        icon(section.icon), h('span', { class: 'nav__label' }, sectionTitle(section))),
      h('ul', null, tools.map((tool) => h('li', null,
        h('a', { class: 'nav__sublink', href: toolPath(tool), dataset: { route: `${section.id}/${tool.id}` } }, toolTitle(tool)))))));
  }
  items.push(h('li', null,
    h('a', { class: 'nav__link', href: `#/${GUIDE_SECTION.id}`, dataset: { route: GUIDE_SECTION.id }, title: t('section.guide.title') },
      icon(GUIDE_SECTION.icon), h('span', { class: 'nav__label' }, t('section.guide.title'))),
    h('ul', null, GUIDES.map((g) => h('li', null,
      h('a', { class: 'nav__sublink', href: guidePath(g), dataset: { route: `${GUIDE_SECTION.id}/${g.id}` } }, L(g.navTitle ?? g.title)))))));
  items.push(h('li', null,
    h('a', { class: 'nav__link', href: `#/${EXTERNAL_SECTION.id}`, dataset: { route: EXTERNAL_SECTION.id }, title: t('section.esterni.title') },
      icon(EXTERNAL_SECTION.icon), h('span', { class: 'nav__label' }, t('section.esterni.title'))),
    h('ul', null, EXTERNAL.map((ext) => h('li', null,
      h('a', { class: 'nav__sublink', href: `#/${EXTERNAL_SECTION.id}`, dataset: { route: `${EXTERNAL_SECTION.id}/${ext.id}` } }, t(`ext.${ext.id}.short`)))))));
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
    navToggle.setAttribute('aria-label', open ? t('app.menuClose') : t('app.menuOpen'));
    navToggle.title = navToggle.getAttribute('aria-label');
  }
}

function syncToggleState() {
  if (mqMobile.matches) {
    const open = root.classList.contains('nav-open');
    navToggle.setAttribute('aria-expanded', String(open));
    navToggle.setAttribute('aria-label', open ? t('app.menuClose') : t('app.menuOpen'));
  } else {
    setNavOpen(false);
    const collapsed = root.classList.contains('sidebar-collapsed');
    navToggle.setAttribute('aria-expanded', String(!collapsed));
    navToggle.setAttribute('aria-label', collapsed ? t('app.menuExpand') : t('app.menuCollapse'));
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
  const label = dark ? t('app.themeLight') : t('app.themeDark');
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

// ---------------------------------------------------------------- Lingua

const LANG_KEY = 'rebluc.lang';

// Riflette la lingua corrente nell'hash (?lang=…), conservando gli altri parametri.
function syncLangInUrl() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, query = ''] = raw.split('?');
  const params = new URLSearchParams(query);
  if (params.get('lang') === getLang()) return;
  params.set('lang', getLang());
  history.replaceState(null, '', `#${path}?${params}`);
}

// Ricostruisce tutto ciò che contiene testo: statici, sidebar, pagina corrente.
function refreshLanguage() {
  applyStaticText();
  renderVisits();
  buildNav();
  syncToggleState();
  syncThemeButton();
  closeSearch();
}

function changeLang(lang) {
  if (!isLang(lang) || lang === getLang()) return;
  setLang(lang);
  store(LANG_KEY, lang);
  syncLangInUrl();
  refreshLanguage();
  route({ focus: false });
}

for (const btn of document.querySelectorAll('[data-lang]')) {
  btn.addEventListener('click', () => changeLang(btn.dataset.lang));
}

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

// Cerca nei testi di entrambe le lingue: "subnet calculator" e "calcolatore subnet" trovano lo stesso strumento.
function searchTools(query) {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const external = EXTERNAL.filter((ext) => {
    const hay = normalize([tAll(`ext.${ext.id}.title`), tAll('section.esterni.title'), tAll(`ext.${ext.id}.keywords`)].join(' '));
    return words.every((w) => hay.includes(w));
  }).map((ext) => ({ id: ext.id, section: EXTERNAL_SECTION.id, external: true }));
  const guides = GUIDES.filter((g) => {
    const hay = normalize([...g.title, ...g.keywords, ...g.summary, tAll('section.guide.title')].join(' '));
    return words.every((w) => hay.includes(w));
  }).map((g) => ({ id: g.id, section: GUIDE_SECTION.id, guide: g }));
  return [...TOOLS.filter((tool) => {
    const hay = normalize([
      tAll(`tool.${tool.id}.title`), tAll(`section.${tool.section}.title`),
      tAll(`tool.${tool.id}.keywords`), tAll(`tool.${tool.id}.desc`),
    ].join(' '));
    return words.every((w) => hay.includes(w));
  }), ...guides, ...external];
}

const hitTitle = (hit) => (hit.guide ? L(hit.guide.navTitle ?? hit.guide.title) : hit.external ? t(`ext.${hit.id}.short`) : toolTitle(hit));
const hitSection = (hit) => (hit.guide ? t('section.guide.title') : hit.external ? t('section.esterni.title') : sectionTitle(sectionById[hit.section]));

function renderSearch() {
  const query = searchInput.value.trim();
  if (!query) { closeSearch(); return; }
  searchHits = searchTools(query);
  searchIndex = 0;
  const items = searchHits.map((tool, i) => h('li', {
    id: `sr-${tool.id}`, role: 'option', 'aria-selected': String(i === searchIndex),
    onmousedown: (e) => { e.preventDefault(); openHit(tool); },
  }, h('span', null, hitTitle(tool)), h('span', { class: 'sr-section' }, hitSection(tool))));
  if (!items.length) items.push(h('li', { class: 'sr-empty', role: 'presentation' }, t('app.searchNone')));
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
  location.hash = tool.guide ? guidePath(tool.guide) : tool.external ? `#/${EXTERNAL_SECTION.id}` : toolPath(tool);
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

// Ogni pagina con risultati ricorda che sono indicativi e vanno verificati da chi li usa.
function pageHead(title, description) {
  return h('div', { class: 'page-head' }, h('h1', null, title), description ? h('p', null, description) : null,
    h('p', { class: 'disclaimer', role: 'note' }, icon('info'), h('span', null, t('app.disclaimer'))));
}

async function toolCard(tool) {
  const section = sectionById[tool.section];
  let href = toolPath(tool);
  const card = dashlet({
    title: toolTitle(tool),
    subtitle: sectionTitle(section),
    expandable: false,
    className: 'dashlet--link',
    actions: [{ icon: 'arrowRight', label: t('app.open', { name: toolTitle(tool) }), onclick: () => { location.hash = href; } }],
  });
  if (tool.load) {
    const mod = await tool.load();
    const pv = mod.preview();
    href += pv.href ?? '';
    card.body.append(h('p', { class: 'muted', style: 'margin:0 0 10px' }, toolDesc(tool)), pv.body);
  } else {
    card.body.append(h('p', { class: 'muted', style: 'margin:0 0 12px' }, toolDesc(tool)), badge(t('app.inDevelopment'), 'warn'));
  }
  card.el.append(h('div', { class: 'dashlet__foot' }, h('a', { href }, tool.load ? t('app.openTool') : t('app.details'))));
  card.el.addEventListener('click', (e) => {
    if (e.target.closest('a, button')) return;
    location.hash = href;
  });
  return card.el;
}

async function renderDashboard() {
  setCrumbs([{ title: t('app.dashboard') }]);
  document.title = `${t('app.dashboard')} · rebluc`;
  const cards = await Promise.all(TOOLS.map(toolCard));
  return [
    pageHead(t('app.dashboard'), t('app.dashboardIntro')),
    h('div', { class: 'dash-grid' }, cards),
  ];
}

async function renderSection(section) {
  setCrumbs([{ title: sectionTitle(section) }]);
  document.title = `${sectionTitle(section)} · rebluc`;
  const cards = await Promise.all(TOOLS.filter((tool) => tool.section === section.id).map(toolCard));
  return [pageHead(sectionTitle(section), t(`section.${section.id}.desc`)), h('div', { class: 'dash-grid' }, cards)];
}

async function renderTool(section, tool, params) {
  setCrumbs([{ title: sectionTitle(section), href: `#/${section.id}` }, { title: toolTitle(tool) }]);
  document.title = `${toolTitle(tool)} · rebluc`;
  const head = pageHead(toolTitle(tool), toolDesc(tool));
  if (!tool.load) {
    const card = dashlet({ title: t('app.inDevelopment'), expandable: false });
    card.body.append(h('p', { class: 'empty' }, t('app.comingSoon')));
    return [head, card.el];
  }
  const mod = await tool.load();
  const holder = h('div');
  const ctx = {
    // I parametri dello strumento restano nell'hash insieme alla lingua.
    setParams(values) {
      const qs = new URLSearchParams(Object.entries(values).filter(([, v]) => v));
      qs.set('lang', getLang());
      history.replaceState(null, '', `${toolPath(tool)}?${qs}`);
    },
  };
  return [head, holder, () => mod.render(holder, params, ctx)];
}

function externalCard(ext) {
  const card = dashlet({ title: t(`ext.${ext.id}.title`), subtitle: t(`ext.${ext.id}.vendor`), expandable: false, className: 'dashlet--ext' });
  const linkAttrs = (url) => ({ href: url, target: '_blank', rel: 'noopener noreferrer' });
  card.body.append(
    h('p', { style: 'margin:0 0 10px' }, t(`ext.${ext.id}.desc`)),
    h('ul', { class: 'ext-facts' }, ['input', 'output', 'versions'].map((k) => h('li', null, h('strong', null, `${t(`ext.label.${k}`)}: `), t(`ext.${ext.id}.${k}`)))),
    h('ul', { class: 'notes' },
      h('li', { class: 'note note--warn' }, t(`ext.${ext.id}.privacy`)),
      h('li', { class: 'note' }, t('ext.notAffiliated', { vendor: t(`ext.${ext.id}.vendor`) }))),
    h('div', { class: 'form-actions ext-actions' },
      h('a', { class: 'btn btn--primary', ...linkAttrs(ext.url) }, t(`ext.${ext.id}.open`), icon('external'), h('span', { class: 'visually-hidden' }, ` (${t('ext.newTab')})`)),
      ext.links.map((l) => h('a', { class: 'btn btn--secondary', ...linkAttrs(l.url) }, t(`ext.${ext.id}.${l.key}`), icon('external'), h('span', { class: 'visually-hidden' }, ` (${t('ext.newTab')})`)))));
  card.el.id = `ext-${ext.id}`;
  return card.el;
}

function renderExternal() {
  setCrumbs([{ title: t('section.esterni.title') }]);
  document.title = `${t('section.esterni.title')} · rebluc`;
  return [
    h('div', { class: 'page-head' }, h('h1', null, t('section.esterni.title')), h('p', null, t('section.esterni.desc')),
      h('p', { class: 'disclaimer', role: 'note' }, icon('info'), h('span', null, t('ext.disclaimer')))),
    h('div', { class: 'dash-grid' }, EXTERNAL.map(externalCard)),
  ];
}

function guideHead(title, description) {
  return h('div', { class: 'page-head' }, h('h1', null, title), description ? h('p', null, description) : null,
    h('p', { class: 'disclaimer', role: 'note' }, icon('info'), h('span', null, t('guide.disclaimer'))));
}

function renderGuideIndex() {
  setCrumbs([{ title: t('section.guide.title') }]);
  document.title = `${t('section.guide.title')} · rebluc`;
  const cards = GUIDES.map((g) => {
    const card = dashlet({ title: L(g.title), expandable: false, className: 'dashlet--link',
      actions: [{ icon: 'arrowRight', label: t('app.open', { name: L(g.title) }), onclick: () => { location.hash = guidePath(g); } }] });
    card.body.append(h('p', { class: 'muted', style: 'margin:0 0 8px' }, L(g.summary)), h('p', { class: 'guide-meta', style: 'margin:0' }, guideMeta(g)));
    card.el.append(h('div', { class: 'dashlet__foot' }, h('a', { href: guidePath(g) }, t('guide.read'))));
    card.el.addEventListener('click', (e) => { if (!e.target.closest('a, button')) location.hash = guidePath(g); });
    return card.el;
  });
  return [guideHead(t('section.guide.title'), t('section.guide.desc')), h('div', { class: 'dash-grid' }, cards)];
}

function renderGuidePage(g) {
  setCrumbs([{ title: t('section.guide.title'), href: `#/${GUIDE_SECTION.id}` }, { title: L(g.navTitle ?? g.title) }]);
  document.title = `${L(g.navTitle ?? g.title)} · rebluc`;
  return [guideHead(L(g.title), L(g.summary)), renderGuide(g)];
}

function renderNotFound() {
  setCrumbs([{ title: t('app.dashboard'), href: '#/' }, { title: t('app.notFound') }]);
  document.title = `${t('app.notFound')} · rebluc`;
  const card = dashlet({ title: t('app.notFound'), expandable: false });
  card.body.append(h('p', { class: 'empty' }, `${t('app.notFoundText')} `, h('a', { href: '#/' }, t('app.backHome'))));
  return [card.el];
}

async function route({ focus = true } = {}) {
  const token = ++renderToken;
  closeMaximized();
  setNavOpen(false);
  const { parts, params } = parseHash();

  // Un link con ?lang=… diverso dalla lingua attiva la cambia (e diventa la preferenza).
  const urlLang = params.get('lang');
  if (isLang(urlLang) && urlLang !== getLang()) {
    setLang(urlLang);
    store(LANG_KEY, urlLang);
    refreshLanguage();
  }
  syncLangInUrl();

  const [sectionId, toolId, ...rest] = parts;
  const section = sectionById[sectionId];
  const tool = section && TOOLS.find((x) => x.section === section.id && x.id === toolId);

  let nodes;
  try {
    if (!sectionId) { nodes = await renderDashboard(); updateNav(null, null); }
    else if (sectionId === GUIDE_SECTION.id && !toolId) { nodes = renderGuideIndex(); updateNav(GUIDE_SECTION.id, null); }
    else if (sectionId === GUIDE_SECTION.id && GUIDES.some((g) => g.id === toolId) && !rest.length) { nodes = renderGuidePage(GUIDES.find((g) => g.id === toolId)); updateNav(GUIDE_SECTION.id, toolId); }
    else if (sectionId === EXTERNAL_SECTION.id && !toolId) { nodes = renderExternal(); updateNav(EXTERNAL_SECTION.id, null); }
    else if (section && !toolId) { nodes = await renderSection(section); updateNav(section.id, null); }
    else if (tool && !rest.length) { nodes = await renderTool(section, tool, params); updateNav(section.id, tool.id); }
    else { nodes = renderNotFound(); updateNav('-', null); }
  } catch (err) {
    console.error(err);
    const card = dashlet({ title: t('app.error'), expandable: false });
    card.body.append(h('p', { class: 'empty' }, t('app.loadError')));
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

setLang(resolveLang(parseHash().params.get('lang'), read(LANG_KEY)));
applyStaticText();
renderVisits();
buildNav();
syncToggleState();
syncThemeButton();
window.addEventListener('hashchange', () => route());
route({ focus: false });
