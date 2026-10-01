// Calcolatore banda VoIP.
// calcVoip() e formatRate() non usano il DOM e sono importate anche da tests/run.mjs.

import { h, fmtInt, fmtDec, kvList, uid } from '../ui/dom.js';
import { dashlet } from '../ui/dashlet.js';
import { dataTable } from '../ui/table.js';
import { CODECS, OPUS_BITRATES, PTIMES, HEADERS, SRTP, IPSEC_MODES, IPSEC_CIPHERS, IPSEC_INTEGRITY } from '../../data/codecs.js';

const MAX_CALLS = 100000;

const padTo = (n, block) => Math.ceil(n / block) * block;

// Banda di una chiamata (per direzione o bidirezionale) e di N chiamate.
// Le intestazioni si aggiungono dall'interno verso l'esterno:
// payload → SRTP tag → RTP/UDP/IP → GRE → IPsec (ESP) → NAT-T → Ethernet/802.1Q → preambolo+IFG.
export function calcVoip({
  codec = 'g711', bitrate, ptime = 20, srtp = 'none',
  ethernet = true, dot1q = false, preamble = false,
  gre = false, ipsec = 'none', cipher = 'cbc', integrity = 'sha1', natt = false,
  calls = 1, bidirectional = false,
} = {}) {
  const c = CODECS.find((x) => x.id === codec);
  if (!c) return { ok: false, field: 'codec', error: 'Codec sconosciuto.' };

  const rate = c.variable ? Number(bitrate ?? c.bitrate) : c.bitrate;
  if (c.variable && !(Number.isFinite(rate) && rate >= c.min && rate <= c.max)) {
    return { ok: false, field: 'bitrate', error: `Il bitrate di ${c.name} deve essere tra ${c.min} e ${c.max} kbps.` };
  }
  if (!PTIMES.includes(ptime)) return { ok: false, field: 'ptime', error: 'Packetization non supportata.' };
  if (!Number.isInteger(calls) || calls < 1 || calls > MAX_CALLS) {
    return { ok: false, field: 'calls', error: `Il numero di chiamate deve essere un intero tra 1 e ${fmtInt(MAX_CALLS)}.` };
  }
  const srtpProfile = SRTP.find((x) => x.id === srtp);
  if (!srtpProfile) return { ok: false, field: 'srtp', error: 'Profilo SRTP sconosciuto.' };
  const mode = IPSEC_MODES.find((x) => x.id === ipsec);
  const enc = IPSEC_CIPHERS.find((x) => x.id === cipher);
  const auth = IPSEC_INTEGRITY.find((x) => x.id === integrity);
  if (!mode || !enc || !auth) return { ok: false, field: 'ipsec', error: 'Profilo IPsec sconosciuto.' };

  const payload = Math.ceil((rate * ptime) / 8);
  const layers = [{ id: 'payload', label: `Payload ${c.name}`, bytes: payload }];
  let packet = payload;
  if (srtpProfile.tag) {
    layers.push({ id: 'srtp', label: `SRTP auth tag (${srtpProfile.label.replace('AES-CM + ', '')})`, bytes: srtpProfile.tag });
    packet += srtpProfile.tag;
  }
  layers.push(
    { id: 'rtp', label: 'RTP', bytes: HEADERS.rtp },
    { id: 'udp', label: 'UDP', bytes: HEADERS.udp },
    { id: 'ip', label: 'IP', bytes: HEADERS.ip },
  );
  packet += HEADERS.rtp + HEADERS.udp + HEADERS.ip;

  if (gre) {
    layers.push({ id: 'gre', label: 'GRE (IP esterno + GRE)', bytes: HEADERS.gre });
    packet += HEADERS.gre;
  }

  let ipsecLabel = null;
  if (mode.id !== 'none') {
    // Tunnel: si cifra l'intero pacchetto e si aggiunge un nuovo IP.
    // Transport: si cifra solo ciò che segue l'intestazione IP, che resta.
    const icv = enc.icv ?? auth.icv;
    const authLabel = enc.icv ? 'integrità GCM' : auth.label;
    const protectedLen = mode.id === 'tunnel' ? packet : packet - HEADERS.ip;
    const encrypted = padTo(protectedLen + HEADERS.espTrailer, enc.block);
    const padding = encrypted - protectedLen - HEADERS.espTrailer;
    const newIp = mode.id === 'tunnel' ? HEADERS.ip : 0;
    const overhead = newIp + HEADERS.espHeader + enc.iv + (encrypted - protectedLen) + icv;
    ipsecLabel = enc.icv ? `${mode.label} · ${enc.label}` : `${mode.label} · ${enc.label} + ${auth.label}`;
    layers.push({
      id: 'ipsec',
      label: `IPsec ${mode.label}`,
      bytes: overhead,
      detail: [
        newIp ? `IP ${newIp}` : null,
        `ESP ${HEADERS.espHeader}`,
        `IV ${enc.iv}`,
        `padding ${padding}`,
        `trailer ${HEADERS.espTrailer}`,
        `ICV ${icv} (${authLabel})`,
      ].filter(Boolean).join(' + '),
    });
    packet += overhead;
    if (natt) {
      layers.push({ id: 'natt', label: 'NAT-T (UDP 4500)', bytes: HEADERS.natt });
      packet += HEADERS.natt;
    }
  }

  const l3Bytes = packet;
  let frameBytes = packet;
  if (ethernet) {
    layers.push({ id: 'ethernet', label: 'Ethernet (header + FCS)', bytes: HEADERS.ethernet });
    frameBytes += HEADERS.ethernet;
    if (dot1q) {
      layers.push({ id: 'dot1q', label: '802.1Q', bytes: HEADERS.dot1q });
      frameBytes += HEADERS.dot1q;
    }
  }
  let wireBytes = frameBytes;
  if (ethernet && preamble) {
    layers.push({ id: 'preamble', label: 'Preambolo + IFG', bytes: HEADERS.preamble });
    wireBytes += HEADERS.preamble;
  }

  const directions = bidirectional ? 2 : 1;
  // byte per pacchetto × pacchetti/s ÷ 1000, per il numero di versi scelto
  const kbps = (bytes) => ((bytes * 8) / ptime) * directions;
  const perCall = kbps(wireBytes);
  return {
    ok: true,
    codec: c,
    rate,
    ptime,
    srtp: srtpProfile,
    ipsecLabel,
    directions,
    pps: (1000 / ptime) * directions,
    payload,
    layers,
    l3Bytes,
    frameBytes,
    wireBytes,
    calls,
    kbpsPayload: kbps(payload),
    kbpsL3: kbps(l3Bytes),
    kbpsPerCall: perCall,
    kbpsTotal: perCall * calls,
    overheadPct: ((wireBytes - payload) / wireBytes) * 100,
  };
}

export function formatRate(kbps) {
  return kbps < 1000 ? `${fmtDec(kbps, 1)} kbps` : `${fmtDec(kbps / 1000, 2)} Mbps`;
}

// ---------------------------------------------------------------- Interfaccia

const DEFAULTS = {
  codec: 'g711', bitrate: 24, ptime: 20, srtp: 'none',
  ethernet: true, dot1q: false, preamble: false,
  gre: false, ipsec: 'none', cipher: 'cbc', integrity: 'sha1', natt: false,
  calls: 10, bidirectional: false,
};

function readParams(params) {
  const flag = (key, fallback) => (params.has(key) ? params.get(key) === '1' : fallback);
  const pick = (key, list, fallback) => (list.some((x) => x.id === params.get(key)) ? params.get(key) : fallback);
  const ptime = Number(params.get('pt'));
  return {
    codec: pick('codec', CODECS, DEFAULTS.codec),
    bitrate: params.has('br') ? Number(params.get('br')) : DEFAULTS.bitrate,
    ptime: PTIMES.includes(ptime) ? ptime : DEFAULTS.ptime,
    srtp: pick('srtp', SRTP, DEFAULTS.srtp),
    ethernet: flag('eth', DEFAULTS.ethernet),
    dot1q: flag('q', DEFAULTS.dot1q),
    preamble: flag('pre', DEFAULTS.preamble),
    gre: flag('gre', DEFAULTS.gre),
    ipsec: pick('ipsec', IPSEC_MODES, DEFAULTS.ipsec),
    cipher: pick('enc', IPSEC_CIPHERS, DEFAULTS.cipher),
    integrity: pick('auth', IPSEC_INTEGRITY, DEFAULTS.integrity),
    natt: flag('natt', DEFAULTS.natt),
    calls: params.has('n') ? Number(params.get('n')) : DEFAULTS.calls,
    bidirectional: params.get('dir') === '2',
  };
}

function segmented(name, labelId, options) {
  return h('div', { class: 'segmented', role: 'radiogroup', 'aria-labelledby': labelId },
    options.map((o) => h('label', null, h('input', { type: 'radio', name, value: o.value }), h('span', null, o.label))));
}

function checkbox(label, hint) {
  const input = h('input', { type: 'checkbox' });
  return { input, el: h('label', { class: 'check' }, input, h('span', null, label, hint ? h('small', null, hint) : null)) };
}

function selectField(id, label, options) {
  const select = h('select', { id, class: 'input' }, options.map((o) => h('option', { value: o.id }, o.label)));
  return { select, el: h('div', { class: 'field' }, h('label', { for: id }, label), select) };
}

function kpi(label, value, unit, hl = false) {
  return h('div', { class: hl ? 'kpi kpi--hl' : 'kpi' },
    h('div', { class: 'kpi__label' }, label),
    h('div', { class: 'kpi__value' }, value, unit ? h('small', null, unit) : null));
}

function splitRate(kbps) {
  const text = formatRate(kbps);
  const i = text.lastIndexOf(' ');
  return [text.slice(0, i), text.slice(i + 1)];
}

const segClass = (i) => `seg-${i === 0 ? 'payload' : Math.min(i, 6)}`;

function compositionView(r) {
  const total = r.wireBytes;
  const bar = h('div', { class: 'stack', role: 'img', 'aria-label': `Composizione del pacchetto: ${r.layers.map((l) => `${l.label} ${l.bytes} byte`).join(', ')}` },
    r.layers.map((l, i) => h('span', { class: `seg ${segClass(i)}`, style: `flex-grow:${l.bytes}`, title: `${l.label}: ${l.bytes} B` })));
  const rows = r.layers.map((l, i) => h('tr', null,
    h('td', null, h('span', { class: `swatch ${segClass(i)}` }), l.label, l.detail ? h('span', { class: 'muted' }, ` (${l.detail})`) : null),
    h('td', { class: 'num mono' }, fmtInt(l.bytes)),
    h('td', { class: 'num mono' }, `${fmtDec((l.bytes / total) * 100, 1)}%`)));
  rows.push(h('tr', { class: 'total-row' },
    h('td', null, 'Totale per pacchetto'),
    h('td', { class: 'num mono' }, fmtInt(total)),
    h('td', { class: 'num mono' }, '100%')));
  return [
    bar,
    h('div', { class: 'table-wrap' }, h('table', { class: 'table table--plain' },
      h('thead', null, h('tr', null, h('th', null, h('span', null, 'Livello')), h('th', { class: 'num' }, h('span', null, 'Byte')), h('th', { class: 'num' }, h('span', null, 'Quota')))),
      h('tbody', null, rows))),
  ];
}

function resultView(r) {
  const [perValue, perUnit] = splitRate(r.kbpsPerCall);
  const [totValue, totUnit] = splitRate(r.kbpsTotal);
  const both = r.directions === 2;
  const notes = [h('li', { class: 'note' }, both
    ? 'Valori bidirezionali: somma dei due versi. Su un collegamento full-duplex ogni verso ne porta la metà.'
    : 'Valori per direzione: ogni chiamata occupa questa banda in ciascun verso del collegamento.')];
  if (r.codec.variable) notes.push(h('li', { class: 'note' }, `${r.codec.name} è a bitrate variabile: il calcolo assume ${r.rate} kbps costanti.`));
  if (r.codec.id === 'g722') notes.push(h('li', { class: 'note' }, 'G.722 campiona a 16 kHz ma il bitrate (64 kbps) e quindi la banda coincidono con G.711.'));
  const dirLabel = both ? ' (2 versi)' : '';

  return [
    h('div', { class: 'kpis' },
      kpi(`Per chiamata${dirLabel}`, perValue, perUnit, true),
      kpi(`${fmtInt(r.calls)} ${r.calls === 1 ? 'chiamata' : 'chiamate'}${dirLabel}`, totValue, totUnit, true),
      kpi(`Pacchetti/s${dirLabel}`, fmtDec(r.pps, 2), 'pps'),
      kpi('Overhead', fmtDec(r.overheadPct, 1), '%')),
    kvList([
      { label: 'Codec', value: `${r.codec.name} · ${r.rate} kbps` },
      { label: 'Packetization', value: `${r.ptime} ms` },
      r.srtp.tag ? { label: 'SRTP', value: r.srtp.label } : null,
      r.ipsecLabel ? { label: 'IPsec', value: r.ipsecLabel } : null,
      { label: 'Payload RTP', value: `${fmtInt(r.payload)} B` },
      { label: 'Pacchetto IP (L3)', value: `${fmtInt(r.l3Bytes)} B` },
      r.wireBytes !== r.l3Bytes ? { label: 'Byte su cavo', value: `${fmtInt(r.wireBytes)} B` } : null,
      { label: 'Banda payload', value: formatRate(r.kbpsPayload) },
      { label: 'Banda IP (L3)', value: formatRate(r.kbpsL3) },
      { label: 'Banda per chiamata', value: formatRate(r.kbpsPerCall), hl: true },
      { label: `Banda per ${fmtInt(r.calls)}`, value: formatRate(r.kbpsTotal), hl: true },
      { label: 'Conteggio', value: both ? 'Bidirezionale' : 'Per direzione' },
    ]),
    h('h3', { class: 'section-title' }, 'Composizione del pacchetto'),
    ...compositionView(r),
    h('ul', { class: 'notes' }, notes),
  ];
}

export function render(container, params, ctx) {
  const ids = { codec: uid('codec'), ptime: uid('pt'), dir: uid('dir'), calls: uid('calls') };
  const codecGroup = segmented(ids.codec, `${ids.codec}-l`, CODECS.map((c) => ({ value: c.id, label: c.name })));
  const ptimeGroup = segmented(ids.ptime, `${ids.ptime}-l`, PTIMES.map((p) => ({ value: String(p), label: `${p} ms` })));
  const dirGroup = segmented(ids.dir, `${ids.dir}-l`, [{ value: '1', label: 'Per direzione' }, { value: '2', label: 'Bidirezionale' }]);
  const opus = CODECS.find((c) => c.variable);
  const bitrate = selectField(uid('br'), `Bitrate ${opus.name}`, OPUS_BITRATES.map((b) => ({ id: String(b), label: `${b} kbps` })));
  const codecHint = h('span', { class: 'field__hint' });
  const srtp = selectField(uid('srtp'), 'SRTP', SRTP.map((s) => ({ id: s.id, label: s.tag ? `${s.label} (+${s.tag} B)` : s.label })));

  const eth = checkbox('Ethernet', '18 B (header + FCS)');
  const dot1q = checkbox('802.1Q', '+4 B');
  const pre = checkbox('Preambolo + IFG', '+20 B, banda fisica sul cavo');
  const gre = checkbox('GRE', '+24 B (IP esterno + GRE)');
  const natt = checkbox('NAT-T', '+8 B (UDP 4500)');
  const ipsec = selectField(uid('ipsec'), 'IPsec', IPSEC_MODES);
  const cipher = selectField(uid('enc'), 'Cifratura', IPSEC_CIPHERS);
  const integrity = selectField(uid('auth'), 'Integrità', IPSEC_INTEGRITY.map((a) => ({ id: a.id, label: `${a.label} (ICV ${a.icv} B)` })));
  const integrityHint = h('span', { class: 'field__hint' });
  integrity.el.append(integrityHint);
  const callsInput = h('input', { id: ids.calls, class: 'input input--mono', type: 'number', min: 1, max: MAX_CALLS, step: 1, inputmode: 'numeric', 'aria-describedby': `${ids.calls}-err` });
  const callsError = h('span', { class: 'field__error', id: `${ids.calls}-err`, 'aria-live': 'polite' });

  const reset = () => { fill(DEFAULTS); update(); };
  const form = h('form', { novalidate: true },
    h('fieldset', { class: 'field field--plain' },
      h('legend', { class: 'field__label', id: `${ids.codec}-l` }, 'Codec'), codecGroup, codecHint),
    bitrate.el,
    h('fieldset', { class: 'field field--plain' },
      h('legend', { class: 'field__label', id: `${ids.ptime}-l` }, 'Packetization'), ptimeGroup),
    srtp.el,
    h('fieldset', { class: 'group' },
      h('legend', null, 'Livello 2'),
      eth.el, dot1q.el, pre.el),
    h('fieldset', { class: 'group' },
      h('legend', null, 'Tunnel e cifratura'),
      gre.el, ipsec.el, cipher.el, integrity.el, natt.el),
    h('div', { class: 'field' }, h('label', { for: ids.calls }, 'Numero di chiamate'), callsInput, callsError),
    h('fieldset', { class: 'field field--plain' },
      h('legend', { class: 'field__label', id: `${ids.dir}-l` }, 'Conteggio banda'), dirGroup),
    h('div', { class: 'form-actions' },
      h('button', { type: 'button', class: 'btn btn--secondary', onclick: reset }, 'Reset')));
  // Ricalcolo automatico a ogni modifica.
  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('input', update);
  form.addEventListener('change', update);

  const formDl = dashlet({ title: 'Parametri', expandable: false, onReset: reset });
  formDl.body.append(form);
  const resultDl = dashlet({ title: 'Risultato' });

  const table = dataTable({
    columns: [
      { key: 'codec', label: 'Codec' },
      { key: 'ptime', label: 'Packetization', align: 'right', format: (r) => `${r.ptime} ms` },
      { key: 'payload', label: 'Payload (B)', align: 'right' },
      { key: 'wireBytes', label: 'Totale (B)', align: 'right' },
      { key: 'pps', label: 'pps', align: 'right', format: (r) => fmtDec(r.pps, 2) },
      { key: 'kbpsPerCall', label: 'Per chiamata', align: 'right', format: (r) => formatRate(r.kbpsPerCall) },
      { key: 'kbpsTotal', label: 'Totale N chiamate', align: 'right', format: (r) => formatRate(r.kbpsTotal) },
    ],
    pageSize: 15,
    filterPlaceholder: 'Filtra codec…',
  });
  const compareDl = dashlet({ title: 'Confronto codec', className: 'span-all', flush: true });
  compareDl.body.append(table.el);

  container.append(h('div', { class: 'tool-grid' }, formDl.el, resultDl.el, compareDl.el));

  const radioValue = (group) => group.querySelector('input:checked')?.value;
  const setRadio = (group, value) => {
    for (const input of group.querySelectorAll('input')) input.checked = input.value === String(value);
  };

  function fill(v) {
    setRadio(codecGroup, v.codec);
    setRadio(ptimeGroup, v.ptime);
    setRadio(dirGroup, v.bidirectional ? 2 : 1);
    bitrate.select.value = String(OPUS_BITRATES.includes(v.bitrate) ? v.bitrate : DEFAULTS.bitrate);
    srtp.select.value = v.srtp;
    eth.input.checked = v.ethernet;
    dot1q.input.checked = v.dot1q;
    pre.input.checked = v.preamble;
    gre.input.checked = v.gre;
    ipsec.select.value = v.ipsec;
    cipher.select.value = v.cipher;
    integrity.select.value = v.integrity;
    natt.input.checked = v.natt;
    callsInput.value = Number.isInteger(v.calls) && v.calls >= 1 ? String(v.calls) : String(DEFAULTS.calls);
  }

  function syncControls() {
    const codec = CODECS.find((c) => c.id === radioValue(codecGroup));
    bitrate.el.hidden = !codec.variable;
    codecHint.textContent = codec.variable ? codec.detail : `${codec.detail} · ${codec.bitrate} kbps`;
    dot1q.input.disabled = !eth.input.checked;
    pre.input.disabled = !eth.input.checked;
    const noIpsec = ipsec.select.value === 'none';
    const gcm = cipher.select.value === 'gcm';
    cipher.select.disabled = noIpsec;
    integrity.select.disabled = noIpsec || gcm;
    integrityHint.textContent = gcm ? 'AES-GCM include l’integrità (ICV 16 B): nessuna HMAC separata.' : '';
    natt.input.disabled = noIpsec;
  }

  function values() {
    const noIpsec = ipsec.select.value === 'none';
    return {
      codec: radioValue(codecGroup),
      bitrate: Number(bitrate.select.value),
      ptime: Number(radioValue(ptimeGroup)),
      srtp: srtp.select.value,
      ethernet: eth.input.checked,
      dot1q: eth.input.checked && dot1q.input.checked,
      preamble: eth.input.checked && pre.input.checked,
      gre: gre.input.checked,
      ipsec: ipsec.select.value,
      cipher: cipher.select.value,
      integrity: integrity.select.value,
      natt: !noIpsec && natt.input.checked,
      calls: Number(callsInput.value),
      bidirectional: radioValue(dirGroup) === '2',
    };
  }

  function update() {
    syncControls();
    callsError.textContent = '';
    callsInput.removeAttribute('aria-invalid');
    const v = values();
    const r = calcVoip(v);
    if (!r.ok) {
      if (r.field === 'calls') {
        callsError.textContent = r.error;
        callsInput.setAttribute('aria-invalid', 'true');
      }
      return; // resta visibile l'ultimo risultato valido
    }
    resultDl.body.replaceChildren(...resultView(r));

    const rows = [];
    for (const c of CODECS) {
      for (const ptime of PTIMES) {
        const row = calcVoip({ ...v, codec: c.id, ptime });
        rows.push({ ...row, codec: c.variable ? `${c.name} ${row.rate} kbps` : c.name });
      }
    }
    table.setRows(rows);
    compareDl.setSubtitle(`stesse intestazioni · ${fmtInt(v.calls)} ${v.calls === 1 ? 'chiamata' : 'chiamate'} · ${v.bidirectional ? 'bidirezionale' : 'per direzione'}`);

    const b = (x) => (x ? '1' : '0');
    const withIpsec = v.ipsec !== 'none';
    ctx.setParams({
      codec: v.codec, br: r.codec.variable ? String(v.bitrate) : '', pt: String(v.ptime),
      srtp: v.srtp === 'none' ? '' : v.srtp,
      eth: b(v.ethernet), q: b(v.dot1q), pre: b(v.preamble), gre: b(v.gre),
      ipsec: withIpsec ? v.ipsec : '', enc: withIpsec ? v.cipher : '',
      auth: withIpsec && v.cipher !== 'gcm' ? v.integrity : '', natt: b(v.natt),
      n: String(v.calls), dir: v.bidirectional ? '2' : '1',
    });
  }

  fill(readParams(params));
  update();
}

// Anteprima per la Dashboard.
export function preview() {
  const r = calcVoip({ codec: 'g711', ptime: 20, calls: 10 });
  return {
    href: '?codec=g711&pt=20&n=10',
    body: kvList([
      { label: 'Codec', value: 'G.711 · 20 ms' },
      { label: 'Frame Ethernet', value: `${r.wireBytes} B · ${fmtInt(r.pps)} pps` },
      { label: 'Per chiamata', value: formatRate(r.kbpsPerCall), hl: true },
      { label: '10 chiamate', value: formatRate(r.kbpsTotal) },
    ], 'kv--compact'),
  };
}
