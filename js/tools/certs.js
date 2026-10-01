// Decoder di certificati X.509 e CSR PKCS#10 (PEM o DER), interamente nel browser.
// Il parser è in js/lib/asn1.js e js/lib/x509.js; qui solo testi e interfaccia.
// Le funzioni di testo non usano il DOM e sono importate anche da tests/run.mjs.

import { h, append, fmtInt, kvList, badge, copyText, toast, uid } from '../ui/dom.js';
import { dashlet, iconButton } from '../ui/dashlet.js';
import { t, tn, locale } from '../i18n.js';
import { decodeInput, fingerprints, nameToString } from '../lib/x509.js';
import { CERT_EXAMPLES } from '../../data/cert-examples.js';

const MAX_FILE = 1024 * 1024;

// ---------------------------------------------------------------- Testi

const dateFormats = new Map();
export function fmtDate(date) {
  const loc = locale();
  if (!dateFormats.has(loc)) {
    dateFormats.set(loc, new Intl.DateTimeFormat(loc, {
      year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC',
    }));
  }
  return `${dateFormats.get(loc).format(date)} UTC`;
}

export function errorText(item) {
  return t(`cert.err.${item.error}`, { detail: item.detail ?? '' });
}

export function warningText(w, item) {
  switch (w.code) {
    case 'expired': return t('cert.w.expired', { date: fmtDate(item.notAfter) });
    case 'notYetValid': return t('cert.w.notYetValid', { date: fmtDate(item.notBefore) });
    case 'expiresSoon': return w.days <= 0 ? t('cert.w.expiresToday') : tn('cert.w.expiresSoon', w.days, { n: fmtInt(w.days) });
    case 'longLifetime': return t('cert.w.longLifetime', { n: fmtInt(w.days) });
    default: return t(`cert.w.${w.code}`, w);
  }
}

// Avvisi gravi in rosso, gli altri in giallo.
const SEVERE = new Set(['expired', 'weakSig', 'sigMismatch', 'smallKey', 'unknownCritical', 'extError']);
const severity = (w) => (SEVERE.has(w.code) ? 'err' : 'warn');

export function keyText(key) {
  if (key.type === 'EC') return key.curve ? `EC ${key.curve}` : 'EC';
  if (key.bits) return `${key.type} ${fmtInt(key.bits)} bit`;
  return key.type;
}

export function statusText(item) {
  if (item.status === 'expired') return t('cert.status.expired');
  if (item.status === 'notYetValid') return t('cert.status.notYetValid');
  return t('cert.status.valid');
}

function roleText(item) {
  if (item.kind === 'csr') return t('cert.kind.csr');
  if (item.isCa) return item.selfIssued ? t('cert.role.root') : t('cert.role.intermediate');
  return item.selfIssued ? t('cert.role.selfSigned') : t('cert.role.leaf');
}

const SAN_LABELS = { dns: 'DNS', ip: 'IP', email: 'Email', uri: 'URI', dirName: 'DirName', otherName: 'otherName', rid: 'RID', unknown: '?' };

// Testo semplice incollato o PEM ricostruito da un DER binario.
export function derToPem(der, label = 'CERTIFICATE') {
  let bin = '';
  for (const b of der) bin += String.fromCharCode(b);
  const b64 = btoa(bin).match(/.{1,64}/g).join('\n');
  return `-----BEGIN ${label}-----\n${b64}\n-----END ${label}-----\n`;
}

// ---------------------------------------------------------------- Interfaccia

async function copy(text, what) {
  toast((await copyText(text)) ? t('cert.copiedWhat', { what }) : t('ui.copyFailed'));
}

function withCopy(value, label) {
  return h('span', { class: 'cert-copy' }, h('span', { class: 'cert-copy__text' }, value), iconButton('copy', t('cert.copyWhat', { what: label }), () => copy(value, label)));
}

const section = (title, ...content) => h('div', { class: 'cert-section' }, h('h3', { class: 'section-title' }, title), content);

function nameList(attrs) {
  if (!attrs.length) return h('p', { class: 'empty' }, t('cert.emptyName'));
  return kvList(attrs.map((a) => ({ label: a.key, value: a.value, hl: a.key === 'CN' })));
}

function kpi(label, value, sub, kind = '') {
  return h('div', { class: kind ? `kpi kpi--${kind}` : 'kpi' },
    h('div', { class: 'kpi__label' }, label),
    h('div', { class: 'kpi__value' }, value, sub ? h('small', null, sub) : null));
}

function kpisView(item) {
  const nodes = [];
  if (item.kind === 'cert') {
    const kind = item.status === 'valid' ? (item.daysLeft < 30 ? 'warn' : 'ok') : 'err';
    const sub = item.status === 'valid'
      ? tn('cert.daysLeft', item.daysLeft, { n: fmtInt(item.daysLeft) })
      : item.status === 'expired' ? tn('cert.daysAgo', -item.daysLeft, { n: fmtInt(-item.daysLeft) }) : '';
    nodes.push(kpi(t('cert.statusLabel'), statusText(item), sub, kind));
    nodes.push(kpi(t('cert.notAfter'), fmtDate(item.notAfter)));
  }
  nodes.push(kpi(t('cert.key'), keyText(item.key), null, 'hl'));
  nodes.push(kpi(t('cert.type'), roleText(item)));
  return h('div', { class: 'kpis' }, nodes);
}

function sanView(san) {
  if (!san.length) return h('p', { class: 'empty' }, t('cert.noSan'));
  return kvList(san.map((s) => ({ label: SAN_LABELS[s.type] ?? s.type, value: s.value })));
}

function ekuText(e) {
  const key = `cert.eku.${e.name}`;
  const desc = t(key);
  return desc === key ? e.name : `${e.name} · ${desc}`;
}

function criticalBadge(item, name) {
  const ext = item.extensions.find((e) => e.name === name);
  return ext?.critical ? [' ', badge(t('cert.critical'), 'warn')] : null;
}

function extensionsView(item) {
  const rows = [];
  if (item.basicConstraints) {
    const bc = item.basicConstraints;
    const value = bc.ca ? (bc.pathLen != null ? t('cert.bcCaPath', { n: bc.pathLen }) : t('cert.bcCa')) : t('cert.bcNotCa');
    rows.push({ label: 'Basic Constraints', value: h('span', { class: 'sans' }, value, criticalBadge(item, 'basicConstraints')), hl: bc.ca });
  }
  if (item.keyUsage) rows.push({ label: 'Key Usage', value: h('span', null, item.keyUsage.join(', '), criticalBadge(item, 'keyUsage')) });
  if (item.extKeyUsage) {
    rows.push({ label: 'Extended Key Usage', value: h('span', { class: 'cert-lines' }, item.extKeyUsage.map((e) => h('span', null, ekuText(e))), criticalBadge(item, 'extKeyUsage')) });
  }
  if (item.ski) rows.push({ label: 'Subject Key Identifier', value: withCopy(item.ski, 'SKI') });
  if (item.aki) rows.push({ label: 'Authority Key Identifier', value: withCopy(item.aki, 'AKI') });
  if (item.crl.length) rows.push({ label: t('cert.crl'), value: h('span', { class: 'cert-lines' }, item.crl.map((u) => h('span', null, u))) });
  for (const a of item.aia) rows.push({ label: a.method === 'OCSP' ? 'OCSP' : a.method === 'caIssuers' ? t('cert.caIssuers') : a.method, value: a.name.value });
  if (item.policies.length) rows.push({ label: t('cert.policies'), value: h('span', { class: 'cert-lines' }, item.policies.map((p) => h('span', null, p.name ? `${p.name} (${p.oid})` : p.oid))) });

  const shown = new Set(['basicConstraints', 'keyUsage', 'extKeyUsage', 'subjectKeyIdentifier', 'authorityKeyIdentifier',
    'cRLDistributionPoints', 'authorityInfoAccess', 'certificatePolicies', 'subjectAltName']);
  const others = item.extensions.filter((e) => !shown.has(e.name) || e.error);
  for (const e of others) {
    const value = e.name === 'nsComment' && !e.error ? e.value : e.name ? t('cert.extPresent') : e.oid;
    rows.push({ label: e.name ?? t('cert.extUnknown'), value: h('span', { class: 'sans' }, value, e.critical ? [' ', badge(t('cert.critical'), 'warn')] : null) });
  }
  if (!rows.length) return h('p', { class: 'empty' }, t('cert.noExtensions'));
  return kvList(rows);
}

function itemView(item, index, all) {
  const n = index + 1;
  const title = item.kind === 'csr' ? t('cert.titleCsr', { n }) : t('cert.titleCert', { n });
  const dl = dashlet({ title, subtitle: item.commonName ?? (item.subject.length ? nameToString(item.subject) : ''), className: 'span-all cert-item' });
  dl.el.id = `cert-item-${n}`;

  const notes = item.warnings.map((w) => h('li', { class: `note note--${severity(w)}` }, warningText(w, item)));
  const left = [section(t('cert.subject'), nameList(item.subject))];
  if (item.kind === 'cert') {
    let issuedBy = null;
    if (item.selfIssued) issuedBy = t('cert.selfIssued');
    else if (item.issuedBy >= 0) issuedBy = t('cert.issuedByItem', { n: item.issuedBy + 1, cn: all[item.issuedBy].commonName ?? '' });
    left.push(section(t('cert.issuer'), issuedBy ? h('p', { class: 'cert-issued' }, issuedBy) : null, item.selfIssued ? null : nameList(item.issuer)));
    left.push(section(t('cert.validity'), kvList([
      { label: t('cert.notBefore'), value: fmtDate(item.notBefore) },
      { label: t('cert.notAfter'), value: fmtDate(item.notAfter), hl: true },
      { label: t('cert.remaining'), value: h('span', { class: 'sans' }, item.status === 'valid' ? tn('cert.days', item.daysLeft, { n: fmtInt(item.daysLeft) }) : statusText(item)) },
      { label: t('cert.lifetime'), value: h('span', { class: 'sans' }, tn('cert.days', item.lifetimeDays, { n: fmtInt(item.lifetimeDays) })) },
    ])));
  }
  left.push(section(item.kind === 'csr' ? t('cert.sanRequested') : 'Subject Alternative Name', sanView(item.san)));

  const details = [
    { label: t('cert.version'), value: item.kind === 'csr' ? `PKCS#10 v${item.version}` : `X.509 v${item.version}` },
    item.kind === 'cert' ? { label: t('cert.serial'), value: withCopy(item.serial, t('cert.serial')) } : null,
    item.kind === 'cert' && item.serial.length <= 23 ? { label: t('cert.serialDec'), value: item.serialDecimal } : null,
    { label: t('cert.sigAlg'), value: item.signature.name, hl: !item.signature.weak },
    { label: t('cert.keyAlg'), value: item.key.type, hl: true },
    item.key.bits ? { label: t('cert.keySize'), value: `${fmtInt(item.key.bits)} bit` } : null,
    item.key.curve ? { label: t('cert.curve'), value: item.key.curve } : null,
    item.key.exponent != null ? { label: t('cert.exponent'), value: fmtInt(item.key.exponent) } : null,
  ];
  const fpHost = h('div', null, h('p', { class: 'empty' }, t('cert.computing')));
  const right = [
    section(t('cert.details'), kvList(details)),
    section(t('cert.extensions'), extensionsView(item)),
    section(t('cert.fingerprints'), fpHost),
  ];

  append(dl.body, [
    kpisView(item),
    notes.length ? h('ul', { class: 'notes' }, notes) : null,
    h('div', { class: 'cert-grid' }, h('div', { class: 'cert-col' }, left), h('div', { class: 'cert-col' }, right))]);

  fingerprints(item).then((fp) => {
    fpHost.replaceChildren(kvList([
      { label: 'SHA-256', value: withCopy(fp.sha256, 'SHA-256'), hl: true },
      { label: 'SHA-1', value: withCopy(fp.sha1, 'SHA-1') },
      { label: t('cert.spkiPin'), value: withCopy(fp.spkiSha256, t('cert.spkiPin')) },
    ]), h('p', { class: 'field__hint' }, item.kind === 'csr' ? t('cert.fpHintCsr') : t('cert.fpHint')));
  }, () => {
    fpHost.replaceChildren(h('p', { class: 'empty' }, t('cert.fpUnavailable')));
  });
  return dl.el;
}

function summaryView(result) {
  const nodes = [];
  const ok = result.items.filter((i) => !i.error);
  if (ok.length) {
    const rows = ok.map((item) => {
      const n = result.items.indexOf(item) + 1;
      const state = item.kind === 'cert'
        ? badge(statusText(item), item.status === 'valid' ? (item.daysLeft < 30 ? 'warn' : 'ok') : 'err')
        : badge(t('cert.kind.csr'), 'info');
      const warn = item.warnings.length ? [' ', badge(tn('cert.warnCount', item.warnings.length, { n: item.warnings.length }), 'warn')] : null;
      return {
        // pulsante e non link: l'hash dell'URL è riservato al routing
        label: h('button', { type: 'button', class: 'link-btn', onclick: () => document.getElementById(`cert-item-${n}`)?.scrollIntoView({ behavior: 'smooth' }) }, `#${n} ${roleText(item)}`),
        value: h('span', { class: 'sans' }, item.commonName ?? '—', ' ', state, warn),
      };
    });
    nodes.push(kvList(rows));
  }
  const notes = [];
  if (result.privateKey) notes.push(h('li', { class: 'note note--err' }, t('cert.privateKey')));
  for (const label of result.unsupported) notes.push(h('li', { class: 'note note--warn' }, t('cert.unsupported', { label })));
  result.items.forEach((item, i) => {
    if (item.error) notes.push(h('li', { class: 'note note--err' }, t('cert.blockError', { n: i + 1, msg: errorText(item) })));
  });
  if (notes.length) nodes.push(h('ul', { class: 'notes' }, notes));
  if (!nodes.length) nodes.push(h('p', { class: 'empty' }, t('cert.nothingFound')));
  return nodes;
}

export function render(container, params, ctx) {
  const ids = { text: uid('cert'), file: uid('certfile') };
  const textarea = h('textarea', {
    id: ids.text, class: 'input input--mono textarea textarea--code', rows: 16, wrap: 'off', spellcheck: 'false',
    autocomplete: 'off', autocapitalize: 'off', placeholder: '-----BEGIN CERTIFICATE-----\n…\n-----END CERTIFICATE-----',
    'aria-describedby': `${ids.text}-hint`,
  });
  const fileInput = h('input', { id: ids.file, type: 'file', accept: '.pem,.crt,.cer,.der,.csr,.req,.txt', hidden: true, tabindex: '-1' });
  const fileButton = h('button', { type: 'button', class: 'btn btn--secondary', onclick: () => fileInput.click() }, t('cert.openFile'));
  const exampleButtons = CERT_EXAMPLES.map((ex) => h('button', { type: 'button', class: 'chip', onclick: () => {
    textarea.value = ex.pem;
    lastText = null;
    ctx.setParams({ esempio: ex.id });
    update();
  } }, t(`cert.ex.${ex.id}`)));

  const clear = () => { textarea.value = ''; lastText = ''; ctx.setParams({}); update(); textarea.focus(); };
  const inputDl = dashlet({ title: t('cert.inputTitle'), expandable: false, onReset: clear });
  inputDl.body.append(
    h('div', { class: 'field' },
      h('label', { for: ids.text }, t('cert.inputLabel')),
      textarea,
      h('span', { class: 'field__hint', id: `${ids.text}-hint` }, t('cert.inputHint'))),
    h('div', { class: 'examples' }, h('span', { class: 'examples__label' }, t('ui.examples')), exampleButtons),
    h('div', { class: 'form-actions' }, fileInput, fileButton, h('button', { type: 'button', class: 'btn btn--secondary', onclick: clear }, t('ui.resetBtn'))),
    h('ul', { class: 'notes' }, h('li', { class: 'note' }, h('strong', null, t('cert.localOnly')), ' ', t('cert.localOnlyDetail'))));

  const summaryDl = dashlet({ title: t('cert.summary') });
  const itemsHost = h('div', { class: 'span-all stack-col' });
  container.append(h('div', { class: 'tool-grid tool-grid--half' }, inputDl.el, summaryDl.el, itemsHost));

  async function loadFile(file) {
    if (!file) return;
    if (file.size > MAX_FILE) { toast(t('cert.fileTooBig')); return; }
    const bytes = new Uint8Array(await file.arrayBuffer());
    // DER binario: lo si mostra come PEM, così il testo resta modificabile
    if (bytes[0] === 0x30) {
      const probe = decodeInput(bytes);
      const label = probe.items[0]?.kind === 'csr' ? 'CERTIFICATE REQUEST' : 'CERTIFICATE';
      textarea.value = derToPem(bytes, label);
    } else {
      textarea.value = new TextDecoder().decode(bytes);
    }
    lastText = textarea.value;
    ctx.setParams({});
    update();
  }
  fileInput.addEventListener('change', () => { loadFile(fileInput.files[0]); fileInput.value = ''; });
  textarea.addEventListener('dragover', (e) => { e.preventDefault(); });
  textarea.addEventListener('drop', (e) => {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();
    loadFile(e.dataTransfer.files[0]);
  });

  let timer = 0;
  textarea.addEventListener('input', () => {
    ctx.setParams({}); // il testo modificato non è più l'esempio dell'URL
    lastText = textarea.value;
    clearTimeout(timer);
    timer = setTimeout(update, 150);
  });

  function update() {
    clearTimeout(timer);
    if (!textarea.value.trim()) {
      summaryDl.setSubtitle('');
      summaryDl.body.replaceChildren(h('p', { class: 'empty' }, t('cert.emptyHint')));
      itemsHost.replaceChildren();
      return;
    }
    const result = decodeInput(textarea.value);
    const certs = result.items.filter((i) => i.kind === 'cert').length;
    const csrs = result.items.filter((i) => i.kind === 'csr').length;
    summaryDl.setSubtitle([certs && tn('cert.countCert', certs, { n: certs }), csrs && tn('cert.countCsr', csrs, { n: csrs })].filter(Boolean).join(' · '));
    summaryDl.body.replaceChildren(...summaryView(result));
    itemsHost.replaceChildren(...result.items.map((item, i) => (item.error ? null : itemView(item, i, result.items))).filter(Boolean));
  }

  // L'esempio si carica solo su richiesta dall'URL (?esempio=rsa); il testo incollato mai.
  const example = CERT_EXAMPLES.find((ex) => ex.id === params.get('esempio'));
  textarea.value = example?.pem ?? lastText ?? '';
  update();
}

// Ultimo testo inserito, per ricostruire la pagina al cambio di lingua (solo in memoria).
let lastText = null;

// Anteprima per la Dashboard.
export function preview() {
  const item = decodeInput(CERT_EXAMPLES[0].pem).items[0];
  return {
    href: '?esempio=rsa',
    body: kvList([
      { label: 'CN', value: item.commonName, hl: true },
      { label: t('cert.notAfter'), value: fmtDate(item.notAfter) },
      { label: t('cert.key'), value: keyText(item.key) },
      { label: 'SAN', value: fmtInt(item.san.length) },
    ], 'kv--compact'),
  };
}
