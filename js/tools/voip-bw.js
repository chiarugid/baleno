// Calcolatore banda VoIP.
// calcVoip() e formatRate() non usano il DOM e sono importate anche da tests/run.mjs.

import { h, fmtInt, fmtDec, kvList, uid } from '../ui/dom.js';
import { dashlet } from '../ui/dashlet.js';
import { dataTable } from '../ui/table.js';
import { t, tn } from '../i18n.js';
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
  calls = 1, bidirectional = false, ipVersion = 4, activity = 1,
} = {}) {
  const c = CODECS.find((x) => x.id === codec);
  if (!c) return { ok: false, field: 'codec', error: t('voip.err.codec') };

  const rate = c.variable ? Number(bitrate ?? c.bitrate) : c.bitrate;
  if (c.variable && !(Number.isFinite(rate) && rate >= c.min && rate <= c.max)) {
    return { ok: false, field: 'bitrate', error: t('voip.err.bitrate', { codec: c.name, min: c.min, max: c.max }) };
  }
  if (!PTIMES.includes(ptime)) return { ok: false, field: 'ptime', error: t('voip.err.ptime') };
  if (!Number.isInteger(calls) || calls < 1 || calls > MAX_CALLS) {
    return { ok: false, field: 'calls', error: t('voip.err.calls', { max: fmtInt(MAX_CALLS) }) };
  }
  if (ipVersion !== 4 && ipVersion !== 6) return { ok: false, field: 'ip', error: t('voip.err.ip') };
  if (!Number.isFinite(activity) || activity <= 0 || activity > 1) {
    return { ok: false, field: 'activity', error: t('voip.err.activity') };
  }
  const ipBytes = ipVersion === 6 ? HEADERS.ipv6 : HEADERS.ip;
  const srtpProfile = SRTP.find((x) => x.id === srtp);
  if (!srtpProfile) return { ok: false, field: 'srtp', error: t('voip.err.srtp') };
  const mode = IPSEC_MODES.find((x) => x.id === ipsec);
  const enc = IPSEC_CIPHERS.find((x) => x.id === cipher);
  const auth = IPSEC_INTEGRITY.find((x) => x.id === integrity);
  if (!mode || !enc || !auth) return { ok: false, field: 'ipsec', error: t('voip.err.ipsec') };

  const payload = Math.ceil((rate * ptime) / 8);
  const layers = [{ id: 'payload', label: t('voip.layer.payload', { codec: c.name }), bytes: payload }];
  let packet = payload;
  if (srtpProfile.tag) {
    layers.push({ id: 'srtp', label: t('voip.layer.srtp', { profile: srtpProfile.label.replace('AES-CM + ', '') }), bytes: srtpProfile.tag });
    packet += srtpProfile.tag;
  }
  layers.push(
    { id: 'rtp', label: 'RTP', bytes: HEADERS.rtp },
    { id: 'udp', label: 'UDP', bytes: HEADERS.udp },
    { id: 'ip', label: `IPv${ipVersion}`, bytes: ipBytes },
  );
  packet += HEADERS.rtp + HEADERS.udp + ipBytes;

  if (gre) {
    layers.push({ id: 'gre', label: t('voip.layer.gre'), bytes: HEADERS.gre });
    packet += HEADERS.gre;
  }

  let ipsecLabel = null;
  if (mode.id !== 'none') {
    // Tunnel: si cifra l'intero pacchetto e si aggiunge un nuovo IP.
    // Transport: si cifra solo ciò che segue l'intestazione IP, che resta.
    const icv = enc.icv ?? auth.icv;
    const authLabel = enc.icv ? t('voip.gcmIntegrity') : auth.label;
    const keptIp = gre ? HEADERS.ip : ipBytes;
    const protectedLen = mode.id === 'tunnel' ? packet : packet - keptIp;
    const encrypted = padTo(protectedLen + HEADERS.espTrailer, enc.block);
    const padding = encrypted - protectedLen - HEADERS.espTrailer;
    const newIp = mode.id === 'tunnel' ? HEADERS.ip : 0;
    const overhead = newIp + HEADERS.espHeader + enc.iv + (encrypted - protectedLen) + icv;
    ipsecLabel = enc.icv ? `${mode.label} · ${enc.label}` : `${mode.label} · ${enc.label} + ${auth.label}`;
    layers.push({
      id: 'ipsec',
      label: t('voip.layer.ipsec', { mode: mode.label }),
      bytes: overhead,
      detail: [
        newIp ? `IPv4 ${newIp}` : null,
        `ESP ${HEADERS.espHeader}`,
        `IV ${enc.iv}`,
        `padding ${padding}`,
        `trailer ${HEADERS.espTrailer}`,
        `ICV ${icv} (${authLabel})`,
      ].filter(Boolean).join(' + '),
    });
    packet += overhead;
    if (natt) {
      layers.push({ id: 'natt', label: t('voip.layer.natt'), bytes: HEADERS.natt });
      packet += HEADERS.natt;
    }
  }

  const l3Bytes = packet;
  let frameBytes = packet;
  if (ethernet) {
    layers.push({ id: 'ethernet', label: t('voip.layer.ethernet'), bytes: HEADERS.ethernet });
    frameBytes += HEADERS.ethernet;
    if (dot1q) {
      layers.push({ id: 'dot1q', label: '802.1Q', bytes: HEADERS.dot1q });
      frameBytes += HEADERS.dot1q;
    }
  }
  let wireBytes = frameBytes;
  if (ethernet && preamble) {
    layers.push({ id: 'preamble', label: t('voip.layer.preamble'), bytes: HEADERS.preamble });
    wireBytes += HEADERS.preamble;
  }

  const directions = bidirectional ? 2 : 1;
  // byte per pacchetto × pacchetti/s ÷ 1000, per il numero di versi scelto
  const kbps = (bytes) => ((bytes * 8) / ptime) * directions;
  const perCall = kbps(wireBytes);
  // VAD: il fattore di attività riduce la banda media, non la dimensione dei pacchetti.
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
    activity,
    ipVersion,
    ipBytes,
    ppsAvg: (1000 / ptime) * directions * activity,
    kbpsPerCallAvg: perCall * activity,
    kbpsTotalAvg: perCall * calls * activity,
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
  calls: 10, bidirectional: false, ipVersion: 4, activity: 1,
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
    ipVersion: params.get('ip') === '6' ? 6 : 4,
    activity: params.has('vad') ? parseActivity(params.get('vad')) ?? DEFAULTS.activity : DEFAULTS.activity,
  };
}

function parseActivity(text) {
  const s = String(text ?? '').trim().replace(',', '.');
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : null;
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
  const bar = h('div', { class: 'stack', role: 'img', 'aria-label': t('voip.compositionAria', { parts: r.layers.map((l) => `${l.label} ${t('voip.bytesUnit', { n: l.bytes })}`).join(', ') }) },
    r.layers.map((l, i) => h('span', { class: `seg ${segClass(i)}`, style: `flex-grow:${l.bytes}`, title: `${l.label}: ${l.bytes} B` })));
  const rows = r.layers.map((l, i) => h('tr', null,
    h('td', null, h('span', { class: `swatch ${segClass(i)}` }), l.label, l.detail ? h('span', { class: 'muted' }, ` (${l.detail})`) : null),
    h('td', { class: 'num mono' }, fmtInt(l.bytes)),
    h('td', { class: 'num mono' }, `${fmtDec((l.bytes / total) * 100, 1)}%`)));
  rows.push(h('tr', { class: 'total-row' },
    h('td', null, t('voip.totalPerPacket')),
    h('td', { class: 'num mono' }, fmtInt(total)),
    h('td', { class: 'num mono' }, '100%')));
  return [
    bar,
    h('div', { class: 'table-wrap' }, h('table', { class: 'table table--plain' },
      h('thead', null, h('tr', null, h('th', null, h('span', null, t('voip.colLayer'))), h('th', { class: 'num' }, h('span', null, t('voip.colBytes'))), h('th', { class: 'num' }, h('span', null, t('voip.colShare'))))),
      h('tbody', null, rows))),
  ];
}

function resultView(r) {
  const vad = r.activity < 1;
  const [perValue, perUnit] = splitRate(vad ? r.kbpsPerCallAvg : r.kbpsPerCall);
  const [totValue, totUnit] = splitRate(vad ? r.kbpsTotalAvg : r.kbpsTotal);
  const both = r.directions === 2;
  const notes = [h('li', { class: 'note' }, both
    ? t('voip.noteBoth')
    : t('voip.noteOne'))];
  if (r.codec.variable) notes.push(h('li', { class: 'note' }, t('voip.noteVariable', { codec: r.codec.name, rate: r.rate })));
  if (r.codec.id === 'g722') notes.push(h('li', { class: 'note' }, t('voip.noteG722')));
  if (vad) {
    notes.push(h('li', { class: 'note' }, t('voip.noteVad', { factor: fmtDec(r.activity, 2), pct: fmtDec(r.activity * 100, 0) })));
  }
  if (r.ipVersion === 6) {
    notes.push(h('li', { class: 'note' }, `${t('voip.noteIpv6', { n: r.ipBytes })}${r.layers.some((l) => l.id === 'gre' || l.id === 'ipsec') ? t('voip.noteIpv6Outer') : ''}`));
  }
  const dir = both ? t('voip.twoWays') : '';
  const avg = vad ? t('voip.avg') : '';

  return [
    h('div', { class: 'kpis' },
      kpi(t('voip.perCall', { avg, dir }), perValue, perUnit, true),
      kpi(tn('voip.calls', r.calls, { n: fmtInt(r.calls), avg, dir }), totValue, totUnit, true),
      kpi(t('voip.pps', { avg, dir }), fmtDec(vad ? r.ppsAvg : r.pps, 2), 'pps'),
      kpi(t('voip.overhead'), fmtDec(r.overheadPct, 1), '%')),
    kvList([
      { label: t('voip.codec'), value: `${r.codec.name} · ${r.rate} kbps` },
      { label: t('voip.packetization'), value: `${r.ptime} ms` },
      r.srtp.tag ? { label: 'SRTP', value: r.srtp.label } : null,
      r.ipsecLabel ? { label: 'IPsec', value: r.ipsecLabel } : null,
      { label: t('voip.ipHeader'), value: `IPv${r.ipVersion} · ${r.ipBytes} B` },
      { label: t('voip.rtpPayload'), value: `${fmtInt(r.payload)} B` },
      { label: t('voip.ipPacket'), value: `${fmtInt(r.l3Bytes)} B` },
      r.wireBytes !== r.l3Bytes ? { label: t('voip.wireBytes'), value: `${fmtInt(r.wireBytes)} B` } : null,
      { label: t('voip.payloadBw'), value: formatRate(r.kbpsPayload) },
      { label: t('voip.ipBw'), value: formatRate(r.kbpsL3) },
      { label: vad ? t('voip.callBwPeak') : t('voip.callBw'), value: formatRate(r.kbpsPerCall), hl: !vad },
      { label: t(vad ? 'voip.totalBwPeak' : 'voip.totalBw', { n: fmtInt(r.calls) }), value: formatRate(r.kbpsTotal), hl: !vad },
      vad ? { label: t('voip.avgBw', { factor: fmtDec(r.activity, 2) }), value: t('voip.avgBwValue', { call: formatRate(r.kbpsPerCallAvg), total: formatRate(r.kbpsTotalAvg) }), hl: true } : null,
      { label: t('voip.counting'), value: both ? t('voip.bidirectional') : t('voip.perDirection') },
    ]),
    h('h3', { class: 'section-title' }, t('voip.composition')),
    ...compositionView(r),
    h('ul', { class: 'notes' }, notes),
  ];
}

export function render(container, params, ctx) {
  const ids = { codec: uid('codec'), ptime: uid('pt'), dir: uid('dir'), calls: uid('calls') };
  const codecGroup = segmented(ids.codec, `${ids.codec}-l`, CODECS.map((c) => ({ value: c.id, label: c.name })));
  const ptimeGroup = segmented(ids.ptime, `${ids.ptime}-l`, PTIMES.map((p) => ({ value: String(p), label: `${p} ms` })));
  const dirGroup = segmented(ids.dir, `${ids.dir}-l`, [{ value: '1', label: t('voip.perDirection') }, { value: '2', label: t('voip.bidirectional') }]);
  const opus = CODECS.find((c) => c.variable);
  const bitrate = selectField(uid('br'), t('voip.bitrateOf', { codec: opus.name }), OPUS_BITRATES.map((b) => ({ id: String(b), label: `${b} kbps` })));
  const codecHint = h('span', { class: 'field__hint' });
  const srtp = selectField(uid('srtp'), 'SRTP', SRTP.map((s) => ({ id: s.id, label: s.tag ? `${s.label} (+${s.tag} B)` : t('ui.none') })));

  const eth = checkbox('Ethernet', t('voip.ethernetHint'));
  const dot1q = checkbox('802.1Q', '+4 B');
  const pre = checkbox(t('voip.preamble'), t('voip.preambleHint'));
  const gre = checkbox('GRE', t('voip.greHint'));
  const natt = checkbox('NAT-T', '+8 B (UDP 4500)');
  const ipsec = selectField(uid('ipsec'), 'IPsec', IPSEC_MODES.map((m) => ({ id: m.id, label: m.label ?? t('ui.none') })));
  const cipher = selectField(uid('enc'), t('voip.cipher'), IPSEC_CIPHERS);
  const integrity = selectField(uid('auth'), t('voip.integrity'), IPSEC_INTEGRITY.map((a) => ({ id: a.id, label: `${a.label} (ICV ${a.icv} B)` })));
  const integrityHint = h('span', { class: 'field__hint' });
  integrity.el.append(integrityHint);
  const ipId = uid('ip');
  const ipGroup = segmented(ipId, `${ipId}-l`, [{ value: '4', label: 'IPv4 (20 B)' }, { value: '6', label: 'IPv6 (40 B)' }]);
  const vadId = uid('vad');
  const vadInput = h('input', { id: vadId, class: 'input input--mono', type: 'text', inputmode: 'decimal', autocomplete: 'off', 'aria-describedby': `${vadId}-hint ${vadId}-err` });
  const vadError = h('span', { class: 'field__error', id: `${vadId}-err`, 'aria-live': 'polite' });
  const vadField = h('div', { class: 'field' },
    h('label', { for: vadId }, t('voip.vadLabel')),
    vadInput,
    h('span', { class: 'field__hint', id: `${vadId}-hint` }, t('voip.vadHint')),
    vadError);
  const callsInput = h('input', { id: ids.calls, class: 'input input--mono', type: 'number', min: 1, max: MAX_CALLS, step: 1, inputmode: 'numeric', 'aria-describedby': `${ids.calls}-err` });
  const callsError = h('span', { class: 'field__error', id: `${ids.calls}-err`, 'aria-live': 'polite' });

  const reset = () => { fill(DEFAULTS); update(); };
  const form = h('form', { novalidate: true },
    h('fieldset', { class: 'field field--plain' },
      h('legend', { class: 'field__label', id: `${ids.codec}-l` }, t('voip.codec')), codecGroup, codecHint),
    bitrate.el,
    h('fieldset', { class: 'field field--plain' },
      h('legend', { class: 'field__label', id: `${ids.ptime}-l` }, t('voip.packetization')), ptimeGroup),
    srtp.el,
    h('fieldset', { class: 'field field--plain' },
      h('legend', { class: 'field__label', id: `${ipId}-l` }, t('voip.ipHeader')), ipGroup),
    h('fieldset', { class: 'group' },
      h('legend', null, t('voip.layer2')),
      eth.el, dot1q.el, pre.el),
    h('fieldset', { class: 'group' },
      h('legend', null, t('voip.tunnel')),
      gre.el, ipsec.el, cipher.el, integrity.el, natt.el),
    h('div', { class: 'field' }, h('label', { for: ids.calls }, t('voip.callsLabel')), callsInput, callsError),
    vadField,
    h('fieldset', { class: 'field field--plain' },
      h('legend', { class: 'field__label', id: `${ids.dir}-l` }, t('voip.dirLabel')), dirGroup),
    h('div', { class: 'form-actions' },
      h('button', { type: 'button', class: 'btn btn--secondary', onclick: reset }, t('ui.resetBtn'))));
  // Ricalcolo automatico a ogni modifica.
  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('input', update);
  form.addEventListener('change', update);

  const formDl = dashlet({ title: t('ui.parameters'), expandable: false, onReset: reset });
  formDl.body.append(form);
  const resultDl = dashlet({ title: t('ui.result') });

  const table = dataTable({
    columns: [
      { key: 'codec', label: t('voip.codec') },
      { key: 'ptime', label: t('voip.packetization'), align: 'right', format: (r) => `${r.ptime} ms` },
      { key: 'payload', label: t('voip.colPayload'), align: 'right' },
      { key: 'wireBytes', label: t('voip.colTotal'), align: 'right' },
      { key: 'pps', label: 'pps', align: 'right', format: (r) => fmtDec(r.pps, 2) },
      { key: 'kbpsPerCallAvg', label: t('voip.colPerCall'), align: 'right', format: (r) => formatRate(r.kbpsPerCallAvg) },
      { key: 'kbpsTotalAvg', label: t('voip.colTotalCalls'), align: 'right', format: (r) => formatRate(r.kbpsTotalAvg) },
    ],
    pageSize: 15,
    filterPlaceholder: t('voip.filterCodec'),
  });
  const compareDl = dashlet({ title: t('voip.compare'), className: 'span-all', flush: true });
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
    setRadio(ipGroup, v.ipVersion);
    vadInput.value = fmtDec(v.activity, 2);
  }

  function syncControls() {
    const codec = CODECS.find((c) => c.id === radioValue(codecGroup));
    bitrate.el.hidden = !codec.variable;
    const detail = t(`voip.codec.${codec.id}`);
    codecHint.textContent = codec.variable ? detail : `${detail} · ${codec.bitrate} kbps`;
    dot1q.input.disabled = !eth.input.checked;
    pre.input.disabled = !eth.input.checked;
    const noIpsec = ipsec.select.value === 'none';
    const gcm = cipher.select.value === 'gcm';
    cipher.select.disabled = noIpsec;
    integrity.select.disabled = noIpsec || gcm;
    integrityHint.textContent = gcm ? t('voip.gcmHint') : '';
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
      ipVersion: radioValue(ipGroup) === '6' ? 6 : 4,
      activity: parseActivity(vadInput.value) ?? NaN,
    };
  }

  function update() {
    syncControls();
    callsError.textContent = '';
    callsInput.removeAttribute('aria-invalid');
    vadError.textContent = '';
    vadInput.removeAttribute('aria-invalid');
    const v = values();
    const r = calcVoip(v);
    if (!r.ok) {
      const target = r.field === 'calls' ? [callsInput, callsError] : r.field === 'activity' ? [vadInput, vadError] : null;
      if (target) {
        target[1].textContent = r.error;
        target[0].setAttribute('aria-invalid', 'true');
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
    compareDl.setSubtitle(t('voip.compareSub', {
      ip: v.ipVersion,
      calls: t(v.calls === 1 ? 'voip.compareCallsOne' : 'voip.compareCallsOther', { n: fmtInt(v.calls) }),
      dir: v.bidirectional ? t('voip.compareDirBoth') : t('voip.compareDirOne'),
    }) + (v.activity < 1 ? t('voip.compareVad', { factor: fmtDec(v.activity, 2) }) : ''));

    const b = (x) => (x ? '1' : '0');
    const withIpsec = v.ipsec !== 'none';
    ctx.setParams({
      codec: v.codec, br: r.codec.variable ? String(v.bitrate) : '', pt: String(v.ptime),
      srtp: v.srtp === 'none' ? '' : v.srtp,
      eth: b(v.ethernet), q: b(v.dot1q), pre: b(v.preamble), gre: b(v.gre),
      ipsec: withIpsec ? v.ipsec : '', enc: withIpsec ? v.cipher : '',
      auth: withIpsec && v.cipher !== 'gcm' ? v.integrity : '', natt: b(v.natt),
      n: String(v.calls), dir: v.bidirectional ? '2' : '1',
      ip: v.ipVersion === 6 ? '6' : '', vad: v.activity < 1 ? String(v.activity) : '',
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
      { label: t('voip.codec'), value: 'G.711 · 20 ms' },
      { label: t('voip.frameEthernet'), value: `${r.wireBytes} B · ${fmtInt(r.pps)} pps` },
      { label: t('voip.colPerCall'), value: formatRate(r.kbpsPerCall), hl: true },
      { label: t('voip.previewCalls'), value: formatRate(r.kbpsTotal) },
    ], 'kv--compact'),
  };
}
