// Parser SIP/SDP con rilevamento delle anomalie più comuni.
// parseSip() non usa il DOM ed è importata anche da tests/run.mjs.
// Il messaggio incollato resta nella pagina: non finisce nell'URL né altrove.

import { h, fmtInt, kvList, badge, uid } from '../ui/dom.js';
import { dashlet } from '../ui/dashlet.js';
import { dataTable } from '../ui/table.js';
import { parseIPv4, ipv4Type, parseIPv6, ipv6Type } from './subnet.js';

// ---------------------------------------------------------------- Dati di riferimento

const COMPACT = {
  a: 'Accept-Contact', b: 'Referred-By', c: 'Content-Type', d: 'Request-Disposition', e: 'Content-Encoding',
  f: 'From', i: 'Call-ID', j: 'Reject-Contact', k: 'Supported', l: 'Content-Length', m: 'Contact',
  n: 'Identity-Info', o: 'Event', r: 'Refer-To', s: 'Subject', t: 'To', u: 'Allow-Events', v: 'Via',
  x: 'Session-Expires', y: 'Identity',
};

const CANONICAL = Object.fromEntries([
  ...Object.values(COMPACT),
  'Accept', 'Accept-Encoding', 'Accept-Language', 'Alert-Info', 'Allow', 'Authentication-Info', 'Authorization',
  'Call-Info', 'Content-Disposition', 'Content-Language', 'CSeq', 'Date', 'Error-Info', 'Expires', 'In-Reply-To',
  'Max-Forwards', 'Min-Expires', 'Min-SE', 'MIME-Version', 'Organization', 'P-Asserted-Identity', 'P-Preferred-Identity',
  'Path', 'Priority', 'Privacy', 'Proxy-Authenticate', 'Proxy-Authorization', 'Proxy-Require', 'RAck', 'Reason',
  'Record-Route', 'Remote-Party-ID', 'Reply-To', 'Require', 'Retry-After', 'Route', 'RSeq', 'Server',
  'Service-Route', 'Subscription-State', 'Timestamp', 'Unsupported', 'User-Agent', 'Warning', 'WWW-Authenticate',
].map((name) => [name.toLowerCase(), name]));

const METHODS = ['INVITE', 'ACK', 'BYE', 'CANCEL', 'OPTIONS', 'REGISTER', 'PRACK', 'SUBSCRIBE', 'NOTIFY', 'PUBLISH', 'INFO', 'REFER', 'MESSAGE', 'UPDATE'];

// Header che possono comparire una sola volta.
const SINGLE = ['to', 'from', 'call-id', 'cseq', 'max-forwards', 'content-length', 'content-type', 'expires'];

const STATUS_CLASS = { 1: 'Provvisoria', 2: 'Successo', 3: 'Redirezione', 4: 'Errore del client', 5: 'Errore del server', 6: 'Errore globale' };

// Payload type statici (RFC 3551).
const STATIC_PT = {
  0: ['PCMU', 8000], 3: ['GSM', 8000], 4: ['G723', 8000], 5: ['DVI4', 8000], 6: ['DVI4', 16000], 7: ['LPC', 8000],
  8: ['PCMA', 8000], 9: ['G722', 8000], 10: ['L16', 44100, 2], 11: ['L16', 44100], 12: ['QCELP', 8000], 13: ['CN', 8000],
  14: ['MPA', 90000], 15: ['G728', 8000], 16: ['DVI4', 11025], 17: ['DVI4', 22050], 18: ['G729', 8000],
  25: ['CelB', 90000], 26: ['JPEG', 90000], 28: ['nv', 90000], 31: ['H261', 90000], 32: ['MPV', 90000],
  33: ['MP2T', 90000], 34: ['H263', 90000],
};

// Richieste sempre in-dialog: il To deve avere il tag. INVITE, CANCEL, OPTIONS e simili
// possono essere iniziali, quindi il tag mancante lì non è un'anomalia.
const IN_DIALOG = ['ACK', 'BYE', 'PRACK', 'UPDATE', 'INFO', 'NOTIFY'];

const DIRECTIONS = ['sendrecv', 'sendonly', 'recvonly', 'inactive'];
const DIRECTION_LABEL = { sendrecv: 'sendrecv (bidirezionale)', sendonly: 'sendonly (solo invio)', recvonly: 'recvonly (solo ricezione)', inactive: 'inactive (nessun flusso)' };

// ---------------------------------------------------------------- Funzioni di supporto

const utf8 = new TextEncoder();
// "Privato (RFC 1918)" → "privato, RFC 1918" per l'uso dentro una frase.
const lc = (kind) => kind
  .replace(/[A-Za-z][\w-]*/g, (w) => (w === w.toUpperCase() ? w : w.toLowerCase()))
  .replace(/ \((.+)\)$/, ', $1');
const byteLength = (s) => utf8.encode(s).length;

// Tipo di indirizzo "non pubblico" (privato, CGNAT, link-local, loopback, ULA) o null.
export function nonPublicKind(address) {
  const v4 = parseIPv4(address);
  if (v4 != null) {
    if (v4 === 0) return 'Non specificato (0.0.0.0)';
    const type = ipv4Type(v4);
    return /Privato|CGNAT|Link-local|Loopback/.test(type) ? type : null;
  }
  const v6 = parseIPv6(address.replace(/^\[|\]$/g, ''));
  if (v6 != null) {
    if (v6 === 0n) return 'Non specificato (::)';
    const type = ipv6Type(v6);
    return /Unique Local|Link-local|Loopback/.test(type) ? type : null;
  }
  return null;
}

function ipv4Literals(text) {
  return [...text.matchAll(/(?<![\d.])(\d{1,3}(?:\.\d{1,3}){3})(?![\d.])/g)].map((m) => m[1]).filter((ip) => parseIPv4(ip) != null);
}

function headerParam(value, name) {
  const m = new RegExp(`;\\s*${name}\\s*=\\s*([^;,\\s>]+)`, 'i').exec(value);
  return m ? m[1] : null;
}

// I parametri di header (es. ;tag=) stanno fuori dalle parentesi angolari della URI.
function outsideAngle(value) {
  const close = value.lastIndexOf('>');
  return close >= 0 ? value.slice(close + 1) : value;
}

function splitHostPort(sentBy) {
  const v6 = /^\[([^\]]+)\](?::(\d+))?$/.exec(sentBy);
  if (v6) return { host: v6[1], port: v6[2] ? Number(v6[2]) : null };
  const [host, port] = sentBy.split(':');
  return { host, port: port ? Number(port) : null };
}

export function viaNat(via) {
  const none = { detected: false };
  if (!via) return none;
  const m = /^SIP\/2\.0\/([A-Z]+)\s+([^;\s]+)/i.exec(via);
  if (!m) return none;
  const transport = m[1].toUpperCase();
  const { host, port } = splitHostPort(m[2]);
  const sentPort = port ?? (transport === 'TLS' ? 5061 : 5060);
  const received = headerParam(via, 'received');
  const rport = headerParam(via, 'rport');
  const isIp = (a) => parseIPv4(a) != null || parseIPv6(a) != null;
  const evidence = [];
  if (received && isIp(received) && !nonPublicKind(received) && received !== host) evidence.push(`received=${received}`);
  if (rport && /^\d+$/.test(rport) && Number(rport) !== sentPort) evidence.push(`rport=${rport} invece di ${sentPort}`);
  return {
    detected: evidence.length > 0,
    evidence: evidence.join(', '),
    host,
    sentByKind: isIp(host) ? nonPublicKind(host) : null,
  };
}

// ---------------------------------------------------------------- SDP

function parseSdp(lines, issues, nat = { detected: false }) {
  const sdp = { version: null, origin: null, name: null, timing: null, connection: null, direction: null, attributes: [], media: [] };
  let cur = null;
  const add = (level, message) => issues.push({ level, area: 'sdp', message });

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line) continue;
    const m = /^([a-z])=(.*)$/.exec(line);
    if (!m) {
      add('warn', `Riga SDP non valida: "${line.slice(0, 60)}"`);
      continue;
    }
    const [, type, value] = m;
    const target = cur ?? sdp;
    switch (type) {
      case 'v': sdp.version = value; break;
      case 'o': {
        const [username, sessId, sessVersion, netType, addrType, address] = value.split(/\s+/);
        sdp.origin = { username, sessId, sessVersion, netType, addrType, address };
        break;
      }
      case 's': sdp.name = value; break;
      case 't': sdp.timing = value; break;
      case 'c': {
        const [netType, addrType, address = ''] = value.split(/\s+/);
        target.connection = { netType, addrType, address: address.split('/')[0] };
        break;
      }
      case 'm': {
        const [mediaType, portText = '', proto = '', ...formats] = value.split(/\s+/);
        const [port, count] = portText.split('/').map(Number);
        cur = {
          type: mediaType, port, portCount: count || 1, proto, formats, connection: null, direction: null,
          rtpmap: {}, fmtp: {}, ptime: null, maxptime: null, rtcp: null, crypto: [], fingerprint: null, attributes: [],
        };
        sdp.media.push(cur);
        break;
      }
      case 'a': {
        const colon = value.indexOf(':');
        const name = colon < 0 ? value : value.slice(0, colon);
        const val = colon < 0 ? '' : value.slice(colon + 1);
        target.attributes.push({ name, value: val });
        if (DIRECTIONS.includes(name)) target.direction = name;
        else if (cur && name === 'rtpmap') {
          const rm = /^(\d+)\s+([^/\s]+)\/(\d+)(?:\/(\d+))?/.exec(val);
          if (rm) cur.rtpmap[rm[1]] = { name: rm[2], rate: Number(rm[3]), channels: rm[4] ? Number(rm[4]) : null };
          else add('warn', `a=rtpmap non valido: "${val}"`);
        } else if (cur && name === 'fmtp') {
          const fm = /^(\d+)\s+(.*)$/.exec(val);
          if (fm) cur.fmtp[fm[1]] = fm[2];
        } else if (cur && name === 'ptime') cur.ptime = Number(val);
        else if (cur && name === 'maxptime') cur.maxptime = Number(val);
        else if (cur && name === 'rtcp') cur.rtcp = val;
        else if (cur && name === 'crypto') cur.crypto.push(val);
        else if (name === 'fingerprint') target.fingerprint = val;
        break;
      }
      default: break;
    }
  }

  if (sdp.version == null) add('err', 'SDP: manca la riga obbligatoria v=.');
  else if (sdp.version !== '0') add('warn', `SDP: versione v=${sdp.version}, atteso v=0.`);
  if (!sdp.origin) add('err', 'SDP: manca la riga obbligatoria o= (origine).');
  if (sdp.name == null) add('err', 'SDP: manca la riga obbligatoria s= (nome sessione).');
  if (sdp.timing == null) add('err', 'SDP: manca la riga obbligatoria t= (tempi).');
  if (!sdp.media.length) add('warn', 'SDP senza righe m=: nessun flusso media offerto.');

  if (sdp.origin?.address) {
    const kind = nonPublicKind(sdp.origin.address);
    if (kind && !kind.startsWith('Non specificato')) add('info', `o= contiene l'indirizzo ${sdp.origin.address} (${lc(kind)}): è solo informativo, ma rivela la rete interna.`);
  }

  sdp.media.forEach((media, i) => {
    const label = `m=${media.type} #${i + 1}`;
    media.effectiveConnection = media.connection ?? sdp.connection;
    media.effectiveDirection = media.direction ?? sdp.direction ?? 'sendrecv';
    media.rtcpMux = [...media.attributes, ...sdp.attributes].some((a) => a.name === 'rtcp-mux');
    media.effectiveFingerprint = media.fingerprint ?? sdp.fingerprint;
    media.codecs = media.formats.map((pt) => {
      const map = media.rtpmap[pt];
      const fixed = STATIC_PT[pt];
      return {
        pt,
        name: map?.name ?? fixed?.[0] ?? null,
        rate: map?.rate ?? fixed?.[1] ?? null,
        channels: map?.channels ?? fixed?.[2] ?? null,
        fmtp: media.fmtp[pt] ?? null,
        source: map ? 'rtpmap' : fixed ? 'statico' : null,
      };
    });

    const isRtp = /RTP\//.test(media.proto);
    if (!media.effectiveConnection) add('err', `${label}: nessuna riga c= (né di sessione né di media), indirizzo media sconosciuto.`);
    else {
      const address = media.effectiveConnection.address;
      const kind = nonPublicKind(address);
      if (kind?.startsWith('Non specificato')) add('info', `${label}: c=${address}, convenzione storica per la messa in attesa (hold).`);
      else if (kind) {
        add(nat.detected ? 'warn' : 'info', `${label}: indirizzo media ${address} non pubblico (${lc(kind)}). Attraverso un NAT l'audio può risultare assente o unidirezionale.${nat.detected ? ` NAT rilevato dal Via (${nat.evidence}).` : ''}`);
      }
    }
    if (media.port === 0) add('info', `${label}: porta 0, flusso disattivato o rifiutato.`);
    else if (!Number.isInteger(media.port) || media.port < 0 || media.port > 65535) add('err', `${label}: porta non valida.`);
    else if (isRtp && media.port % 2 === 1 && !media.rtcpMux) add('info', `${label}: porta RTP dispari (${media.port}); senza rtcp-mux, per convenzione RTP usa porte pari.`);

    if (isRtp) {
      for (const codec of media.codecs) {
        const n = Number(codec.pt);
        if (!codec.source && n >= 96 && n <= 127) add('err', `${label}: payload type dinamico ${codec.pt} senza a=rtpmap.`);
        else if (!codec.source) add('warn', `${label}: payload type ${codec.pt} sconosciuto e senza a=rtpmap.`);
      }
      for (const pt of Object.keys(media.rtpmap)) {
        if (!media.formats.includes(pt)) add('warn', `${label}: a=rtpmap per il payload ${pt}, che non compare nella riga m=.`);
      }
      const secure = /SAVP/.test(media.proto);
      // Chiavi SRTP: SDES (a=crypto) oppure DTLS-SRTP (a=fingerprint, di sessione o di media).
      if (secure && !media.crypto.length && !media.effectiveFingerprint) add('warn', `${label}: profilo ${media.proto} (SRTP) senza a=crypto né a=fingerprint: chiavi non negoziate.`);
      if (!secure && media.crypto.length) add('info', `${label}: a=crypto presente ma profilo ${media.proto} non sicuro; la cifratura verrà ignorata.`);
    }
    if (media.effectiveDirection !== 'sendrecv' && media.port !== 0) {
      add('info', `${label}: direzione ${media.effectiveDirection}${media.effectiveDirection === 'sendonly' || media.effectiveDirection === 'inactive' ? ' (tipico della messa in attesa)' : ''}.`);
    }
  });

  return sdp;
}

// ---------------------------------------------------------------- SIP

export function parseSip(text) {
  const issues = [];
  const add = (level, area, message) => issues.push({ level, area, message });
  const lines = String(text ?? '').split(/\r\n|\n|\r/);

  // Salta righe vuote o di log prima della start line.
  const startRe = /^(?:([A-Za-z]+)\s+(\S+)\s+(SIP\/\d+\.\d+)|(SIP\/\d+\.\d+)\s+(\d{3})(?:\s+(.*))?)\s*$/;
  let start = lines.findIndex((l) => startRe.test(l.trim()));
  if (start < 0) {
    const first = lines.find((l) => l.trim());
    if (!first) return { ok: false, empty: true, issues: [] };
    add('err', 'start', 'Start line non riconosciuta: attesa "METODO URI SIP/2.0" oppure "SIP/2.0 codice motivo".');
    return { ok: false, issues };
  }
  const skipped = lines.slice(0, start).filter((l) => l.trim()).length;
  if (skipped) add('info', 'start', `Ignorate ${skipped} righe prima della start line (es. intestazioni di log).`);

  const m = startRe.exec(lines[start].trim());
  const msg = { ok: true, issues, headers: [], body: '', bodyBytes: 0, sdp: null, startLine: lines[start].trim() };
  if (m[1]) {
    msg.kind = 'request';
    msg.method = m[1];
    msg.uri = m[2];
    msg.version = m[3];
    if (!METHODS.includes(msg.method)) {
      add(msg.method === msg.method.toUpperCase() ? 'warn' : 'err', 'start', `Metodo "${msg.method}" non standard${msg.method === msg.method.toUpperCase() ? '' : ' (i metodi sono case-sensitive e maiuscoli)'}.`);
    }
    if (!/^(sips?|tel):/i.test(msg.uri)) add('warn', 'start', `Request-URI "${msg.uri}" senza schema sip:, sips: o tel:.`);
  } else {
    msg.kind = 'response';
    msg.version = m[4];
    msg.status = Number(m[5]);
    msg.reason = (m[6] ?? '').trim();
    msg.statusClass = STATUS_CLASS[Math.floor(msg.status / 100)] ?? null;
    if (msg.status < 100 || msg.status > 699) add('err', 'start', `Codice di stato ${msg.status} fuori dall'intervallo 100–699.`);
  }
  if (msg.version !== 'SIP/2.0') add('err', 'start', `Versione "${msg.version}", attesa SIP/2.0.`);

  // Header (con continuazioni su più righe) fino alla riga vuota.
  let i = start + 1;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') break;
    if (/^[ \t]/.test(line) && msg.headers.length) {
      msg.headers.at(-1).value += ` ${line.trim()}`;
      continue;
    }
    const colon = line.indexOf(':');
    if (colon <= 0) {
      add('err', 'header', `Riga di header senza ":" — "${line.trim().slice(0, 60)}".`);
      continue;
    }
    const name = line.slice(0, colon).trim();
    const lower = name.toLowerCase();
    const compact = lower.length === 1 && COMPACT[lower] ? COMPACT[lower] : null;
    msg.headers.push({
      index: msg.headers.length + 1,
      name,
      canonical: compact ?? CANONICAL[lower] ?? name,
      compact: Boolean(compact),
      value: line.slice(colon + 1).trim(),
    });
  }
  const hasSeparator = i < lines.length;

  const all = (name) => msg.headers.filter((hd) => hd.canonical.toLowerCase() === name.toLowerCase()).map((hd) => hd.value);
  const get = (name) => all(name)[0] ?? null;
  msg.get = get;

  // Corpo: le righe vengono ricomposte con CRLF, come sul cavo.
  let bodyLines = hasSeparator ? lines.slice(i + 1) : [];
  while (bodyLines.length && bodyLines.at(-1).trim() === '') bodyLines = bodyLines.slice(0, -1);
  msg.body = bodyLines.join('\r\n');
  msg.bodyBytes = bodyLines.reduce((n, l) => n + byteLength(l) + 2, 0);

  // Header obbligatori (RFC 3261 §8.1.1 e §8.2.6).
  const required = ['To', 'From', 'CSeq', 'Call-ID', 'Via'];
  if (msg.kind === 'request') required.push('Max-Forwards');
  if (msg.kind === 'request' && msg.method === 'INVITE') required.push('Contact');
  for (const name of required) if (!get(name)) add('err', 'header', `Manca l'header obbligatorio ${name}.`);

  for (const name of SINGLE) {
    const count = all(name).length;
    if (count > 1) add('warn', 'header', `Header ${CANONICAL[name] ?? name} ripetuto ${count} volte.`);
  }
  for (const hd of msg.headers) if (!hd.value) add('warn', 'header', `Header ${hd.canonical} vuoto.`);

  const cseq = get('CSeq');
  if (cseq) {
    const cm = /^(\d+)\s+([A-Za-z]+)$/.exec(cseq);
    if (!cm) add('err', 'header', `CSeq "${cseq}" non valido: atteso "numero METODO".`);
    else {
      msg.cseqNumber = Number(cm[1]);
      msg.cseqMethod = cm[2];
      if (msg.kind === 'request' && cm[2] !== msg.method) add('err', 'header', `Il metodo in CSeq (${cm[2]}) non coincide con quello della richiesta (${msg.method}).`);
      if (msg.cseqNumber >= 2 ** 31) add('err', 'header', 'Il numero di CSeq deve essere inferiore a 2^31.');
    }
  }

  const maxForwards = get('Max-Forwards');
  if (maxForwards != null) {
    if (!/^\d+$/.test(maxForwards)) add('err', 'header', `Max-Forwards "${maxForwards}" non numerico.`);
    else if (Number(maxForwards) === 0) add('warn', 'header', 'Max-Forwards a 0: il prossimo hop risponderà 483 Too Many Hops.');
  }

  all('Via').forEach((via, n) => {
    const branch = headerParam(via, 'branch');
    if (!/^SIP\/2\.0\/[A-Z]+\s+\S+/i.test(via)) add('err', 'header', `Via #${n + 1} non valido: "${via.slice(0, 60)}".`);
    if (!branch) add('warn', 'header', `Via #${n + 1} senza parametro branch.`);
    else if (!branch.startsWith('z9hG4bK')) add('warn', 'header', `Via #${n + 1}: branch senza il prefisso z9hG4bK (RFC 3261), transazioni RFC 2543.`);
  });

  // NAT: il Via in cima riporta received= pubblico diverso dal sent-by, o rport= diverso dalla porta.
  msg.nat = viaNat(get('Via'));
  const natNote = msg.nat.detected ? ` NAT rilevato dal Via (${msg.nat.evidence}).` : '';
  const privLevel = msg.nat.detected ? 'warn' : 'info';
  if (msg.nat.sentByKind) {
    add('info', 'header', `Via in cima con indirizzo ${msg.nat.host} (${lc(msg.nat.sentByKind)}): il mittente è in rete interna.${natNote}`);
  }

  for (const contact of all('Contact')) {
    for (const ip of ipv4Literals(contact)) {
      const kind = nonPublicKind(ip);
      if (kind) add(privLevel, 'header', `Contact con indirizzo ${ip} non pubblico (${lc(kind)}): attraverso un NAT le richieste in-dialog e il BYE potrebbero non arrivare.${natNote}`);
    }
  }

  const from = get('From');
  if (from && msg.kind === 'request' && !headerParam(outsideAngle(from), 'tag')) add('warn', 'header', 'From senza parametro tag.');
  const to = get('To');
  const toTag = to ? headerParam(outsideAngle(to), 'tag') : null;
  if (to && !toTag) {
    if (msg.kind === 'response' && msg.status !== 100) {
      add('warn', 'header', `Risposta ${msg.status} con To senza tag: lo UAS deve aggiungerlo.`);
    } else if (msg.kind === 'request' && msg.method === 'NOTIFY') {
      // NOTIFY fuori dialogo (es. MWI senza SUBSCRIBE) è prassi diffusa, non un errore.
      add('info', 'header', 'NOTIFY senza tag nel To: possibile NOTIFY unsolicited (MWI), inviato fuori da una sottoscrizione.');
    } else if (msg.kind === 'request' && IN_DIALOG.includes(msg.method)) {
      add('warn', 'header', `${msg.method} senza tag nel To: è una richiesta in-dialog e deve riportare il tag del dialogo.`);
    }
  }

  // Corpo e Content-Length.
  const contentType = get('Content-Type');
  const clText = get('Content-Length');
  if (clText != null) {
    if (!/^\d+$/.test(clText)) add('err', 'body', `Content-Length "${clText}" non numerico.`);
    else {
      const declared = Number(clText);
      const candidates = new Set([msg.bodyBytes, Math.max(0, msg.bodyBytes - 2), bodyLines.reduce((n, l) => n + byteLength(l) + 1, 0)]);
      msg.contentLength = declared;
      if (!candidates.has(declared)) {
        add('err', 'body', declared > msg.bodyBytes
          ? `Content-Length ${declared} ma il corpo è di ${msg.bodyBytes} byte: messaggio troncato o lunghezza errata.`
          : `Content-Length ${declared} ma il corpo è di ${msg.bodyBytes} byte (calcolati con fine riga CRLF): lunghezza errata.`);
      }
    }
  } else if (bodyLines.length) {
    add('warn', 'body', 'Corpo presente senza Content-Length (obbligatorio su TCP/TLS).');
  }
  if (bodyLines.length && !contentType) add('err', 'body', 'Corpo presente senza Content-Type.');
  if (!bodyLines.length && contentType && /sdp/i.test(contentType)) add('warn', 'body', 'Content-Type application/sdp ma il corpo è vuoto.');

  const looksSdp = bodyLines[0]?.trim().startsWith('v=');
  if (bodyLines.length && (/application\/sdp/i.test(contentType ?? '') || looksSdp)) {
    if (looksSdp && contentType && !/application\/sdp/i.test(contentType)) add('warn', 'body', `Il corpo sembra SDP ma Content-Type è "${contentType}".`);
    msg.sdp = parseSdp(bodyLines, issues, msg.nat);
  }
  if (msg.kind === 'request' && msg.method === 'INVITE' && !bodyLines.length) {
    add('info', 'body', 'INVITE senza SDP: offerta tardiva (delayed offer), l\'SDP arriverà nel 200 OK.');
  }

  return msg;
}

export function issueCounts(issues) {
  return issues.reduce((acc, it) => ({ ...acc, [it.level]: acc[it.level] + 1 }), { err: 0, warn: 0, info: 0 });
}

// ---------------------------------------------------------------- Esempi

function withLength(message) {
  const [head, body = ''] = message.split('\n\n');
  const length = body ? body.split('\n').reduce((n, l) => n + byteLength(l) + 2, 0) : 0;
  return `${head.replace('Content-Length: ?', `Content-Length: ${length}`)}\n\n${body}`.trimEnd();
}

export const EXAMPLES = {
  invite: withLength(`INVITE sip:bob@biloxi.example.com SIP/2.0
Via: SIP/2.0/UDP 192.0.2.10:5060;branch=z9hG4bK74bf9;rport
Max-Forwards: 70
From: Alice <sip:alice@atlanta.example.com>;tag=9fxced76sl
To: Bob <sip:bob@biloxi.example.com>
Call-ID: 3848276298220188511@atlanta.example.com
CSeq: 1 INVITE
Contact: <sip:alice@192.0.2.10:5060;transport=udp>
Allow: INVITE, ACK, CANCEL, BYE, OPTIONS, UPDATE, REFER
Supported: replaces, timer
User-Agent: Softphone/1.0
Content-Type: application/sdp
Content-Length: ?

v=0
o=alice 2890844526 2890844526 IN IP4 192.0.2.10
s=-
c=IN IP4 192.0.2.10
t=0 0
m=audio 49170 RTP/AVP 0 8 18 101
a=rtpmap:0 PCMU/8000
a=rtpmap:8 PCMA/8000
a=rtpmap:18 G729/8000
a=fmtp:18 annexb=no
a=rtpmap:101 telephone-event/8000
a=fmtp:101 0-16
a=ptime:20
a=sendrecv`),

  ok200: withLength(`SIP/2.0 200 OK
Via: SIP/2.0/UDP 192.0.2.10:5060;branch=z9hG4bK74bf9;rport=5060;received=192.0.2.10
From: Alice <sip:alice@atlanta.example.com>;tag=9fxced76sl
To: Bob <sip:bob@biloxi.example.com>;tag=8321234356
Call-ID: 3848276298220188511@atlanta.example.com
CSeq: 1 INVITE
Contact: <sip:bob@198.51.100.20:5060>
Allow: INVITE, ACK, CANCEL, BYE, OPTIONS
Server: PBX/2.4
Content-Type: application/sdp
Content-Length: ?

v=0
o=bob 2808844564 2808844564 IN IP4 198.51.100.20
s=-
c=IN IP4 198.51.100.20
t=0 0
m=audio 3456 RTP/AVP 0 101
a=rtpmap:0 PCMU/8000
a=rtpmap:101 telephone-event/8000
a=fmtp:101 0-16
a=ptime:20
a=sendrecv`),

  register: withLength(`REGISTER sip:registrar.example.com SIP/2.0
Via: SIP/2.0/TLS 203.0.113.5:5061;branch=z9hG4bKnashds7
Max-Forwards: 70
From: Bob <sips:bob@example.com>;tag=a73kszlfl
To: Bob <sips:bob@example.com>
Call-ID: 1j9FpLxk3uxtm8tn@203.0.113.5
CSeq: 2 REGISTER
Contact: <sips:bob@203.0.113.5:5061>;expires=3600
Expires: 3600
User-Agent: DeskPhone/5.1
Content-Length: ?`),

  anomalie: `INVITE sip:200@pbx.example.com SIP/2.0
Via: SIP/2.0/UDP 192.168.1.50:5060;branch=1234abcd
From: "Interno 101" <sip:101@pbx.example.com>
To: <sip:200@pbx.example.com>
Call-ID: a84b4c76e66710@192.168.1.50
CSeq: 102 BYE
Contact: <sip:101@192.168.1.50:5060>
Content-Type: application/sdp
Content-Length: 120

v=0
o=- 0 0 IN IP4 192.168.1.50
s=-
c=IN IP4 192.168.1.50
t=0 0
m=audio 10001 RTP/SAVP 0 101
a=rtpmap:0 PCMU/8000
a=sendonly`,
};

// ---------------------------------------------------------------- Interfaccia

const LEVEL = { err: ['Errore', 'err'], warn: ['Attenzione', 'warn'], info: ['Info', 'info'] };

function plainTable(head, rows) {
  return h('div', { class: 'table-wrap' }, h('table', { class: 'table table--plain' },
    h('thead', null, h('tr', null, head.map((c) => h('th', { class: c.num ? 'num' : null }, h('span', null, c.label))))),
    h('tbody', null, rows.map((r) => h('tr', null, r.map((cell, i) => h('td', { class: [head[i].num ? 'num' : '', head[i].mono ? 'mono' : ''].join(' ').trim() || null }, cell)))))));
}

function summaryView(msg) {
  const counts = issueCounts(msg.issues);
  const media = msg.sdp?.media ?? [];
  const kindText = msg.kind === 'request' ? msg.method : `${msg.status} ${msg.reason}`.trim();
  const kpis = h('div', { class: 'kpis' },
    h('div', { class: 'kpi kpi--hl' }, h('div', { class: 'kpi__label' }, msg.kind === 'request' ? 'Richiesta' : 'Risposta'), h('div', { class: 'kpi__value' }, kindText)),
    h('div', { class: 'kpi' }, h('div', { class: 'kpi__label' }, 'Header'), h('div', { class: 'kpi__value' }, fmtInt(msg.headers.length))),
    h('div', { class: 'kpi' }, h('div', { class: 'kpi__label' }, 'Flussi media'), h('div', { class: 'kpi__value' }, fmtInt(media.length))),
    h('div', { class: 'kpi' }, h('div', { class: 'kpi__label' }, 'Anomalie'), h('div', { class: 'kpi__value' }, fmtInt(counts.err + counts.warn),
      h('small', null, counts.err ? `${counts.err} err.` : counts.warn ? `${counts.warn} avv.` : 'ok'))));

  const items = msg.kind === 'request'
    ? [
      { label: 'Metodo', value: msg.method, hl: true },
      { label: 'Request-URI', value: msg.uri },
      { label: 'Versione', value: msg.version },
    ]
    : [
      { label: 'Codice', value: [String(msg.status), msg.statusClass ? h('span', { class: 'sub' }, msg.statusClass) : null], hl: true },
      { label: 'Motivo', value: msg.reason || '—' },
      { label: 'Versione', value: msg.version },
    ];
  for (const name of ['Call-ID', 'From', 'To', 'CSeq', 'User-Agent', 'Server']) {
    const value = msg.get(name);
    if (value) items.push({ label: name, value });
  }
  if (msg.body) items.push({ label: 'Corpo', value: `${fmtInt(msg.bodyBytes)} byte${msg.get('Content-Type') ? ` · ${msg.get('Content-Type')}` : ''}` });
  return [kpis, kvList(items)];
}

function issuesView(issues) {
  if (!issues.length) return [h('p', { class: 'empty' }, badge('Nessuna anomalia rilevata', 'ok'))];
  const order = { err: 0, warn: 1, info: 2 };
  const sorted = [...issues].sort((a, b) => order[a.level] - order[b.level]);
  return [h('ul', { class: 'notes notes--flush' }, sorted.map((it) => h('li', { class: `note note--${it.level}` },
    badge(LEVEL[it.level][0], LEVEL[it.level][1]), ' ', it.message)))];
}

function sdpView(sdp, nat) {
  const nodes = [kvList([
    sdp.origin ? { label: 'Origine (o=)', value: `${sdp.origin.username} · ${sdp.origin.address ?? '—'}` } : null,
    { label: 'Sessione (s=)', value: sdp.name ?? '—' },
    { label: 'Connessione (c=)', value: sdp.connection ? `${sdp.connection.addrType} ${sdp.connection.address}` : '— (solo a livello media)' },
    sdp.direction ? { label: 'Direzione di sessione', value: DIRECTION_LABEL[sdp.direction] } : null,
  ])];

  sdp.media.forEach((media, i) => {
    const conn = media.effectiveConnection;
    const kind = conn ? nonPublicKind(conn.address) : null;
    nodes.push(
      h('h3', { class: 'section-title' }, `Flusso ${i + 1} · ${media.type}`),
      kvList([
        { label: 'Indirizzo media', value: [conn ? conn.address : '—', kind ? h('span', { class: 'sub' }, badge(kind.startsWith('Non specificato') ? 'hold' : 'non pubblico', kind.startsWith('Non specificato') || !nat.detected ? 'info' : 'warn')) : null], hl: true },
        { label: 'Porta RTP', value: media.port === 0 ? '0 (disattivato)' : String(media.port), hl: true },
        media.rtcp ? { label: 'RTCP', value: media.rtcp } : null,
        { label: 'Protocollo', value: [media.proto, /SAVP/.test(media.proto) ? h('span', { class: 'sub' }, badge(media.crypto.length ? 'SRTP SDES' : media.effectiveFingerprint ? 'SRTP DTLS' : 'SRTP senza chiavi', media.crypto.length || media.effectiveFingerprint ? 'ok' : 'warn')) : null] },
        { label: 'Direzione', value: DIRECTION_LABEL[media.effectiveDirection] ?? media.effectiveDirection },
        media.ptime ? { label: 'ptime', value: `${media.ptime} ms${media.maxptime ? ` (max ${media.maxptime} ms)` : ''}` } : null,
      ], 'kv--compact'),
    );
    if (media.codecs.length) {
      nodes.push(plainTable(
        [{ label: 'PT', num: true, mono: true }, { label: 'Codec' }, { label: 'Clock (Hz)', num: true, mono: true }, { label: 'Origine' }, { label: 'fmtp', mono: true }],
        media.codecs.map((c) => [c.pt, c.name ?? badge('sconosciuto', 'err'), c.rate ? fmtInt(c.rate) : '—', c.source ?? '—', c.fmtp ?? '']),
      ));
    }
  });
  return nodes;
}

export function render(container, params, ctx) {
  const inputId = uid('sip');
  const textarea = h('textarea', {
    id: inputId, class: 'input input--mono textarea textarea--code', rows: 22, wrap: 'off', spellcheck: 'false',
    autocomplete: 'off', autocapitalize: 'off', placeholder: 'Incolla qui un messaggio SIP (request o risposta, con eventuale SDP)…',
  });
  const exampleButtons = [['INVITE con SDP', 'invite'], ['200 OK', 'ok200'], ['REGISTER', 'register'], ['Con anomalie', 'anomalie']]
    .map(([label, key]) => h('button', { type: 'button', class: 'chip', onclick: () => { textarea.value = EXAMPLES[key]; ctx.setParams({ esempio: key }); update(); } }, label));

  const clear = () => { textarea.value = ''; update(); textarea.focus(); };
  const inputDl = dashlet({ title: 'Messaggio SIP', expandable: false, onReset: clear });
  inputDl.body.append(
    h('div', { class: 'field' },
      h('label', { for: inputId }, 'Testo del messaggio'),
      textarea,
      h('span', { class: 'field__hint' }, 'L’analisi avviene mentre scrivi. Il testo resta nel browser e non viene salvato nell’indirizzo della pagina.')),
    h('div', { class: 'examples' }, h('span', { class: 'examples__label' }, 'Esempi'), exampleButtons),
    h('div', { class: 'form-actions' }, h('button', { type: 'button', class: 'btn btn--secondary', onclick: clear }, 'Reset')));

  const summaryDl = dashlet({ title: 'Riepilogo' });
  const issuesDl = dashlet({ title: 'Anomalie' });
  const headersTable = dataTable({
    columns: [
      { key: 'index', label: '#', align: 'right' },
      { key: 'canonical', label: 'Header', format: (r) => (r.compact ? `${r.canonical} (${r.name})` : r.name) },
      { key: 'value', label: 'Valore', mono: true, wrap: true },
    ],
    pageSize: 25,
    filterPlaceholder: 'Filtra header…',
    emptyText: 'Nessun header',
  });
  const headersDl = dashlet({ title: 'Header', className: 'span-all', flush: true });
  headersDl.body.append(headersTable.el);
  const sdpDl = dashlet({ title: 'SDP', className: 'span-all' });

  container.append(h('div', { class: 'tool-grid tool-grid--half' },
    inputDl.el,
    h('div', { class: 'stack-col' }, summaryDl.el, issuesDl.el),
    headersDl.el,
    sdpDl.el));

  let timer = 0;
  textarea.addEventListener('input', () => {
    ctx.setParams({}); // il testo modificato non è più l'esempio dell'URL
    clearTimeout(timer);
    timer = setTimeout(update, 150);
  });

  function update() {
    clearTimeout(timer);
    const msg = parseSip(textarea.value);
    if (msg.empty) {
      summaryDl.body.replaceChildren(h('p', { class: 'empty' }, 'Incolla un messaggio o scegli un esempio.'));
      issuesDl.body.replaceChildren(h('p', { class: 'empty' }, '—'));
      issuesDl.setSubtitle('');
      headersDl.el.hidden = true;
      sdpDl.el.hidden = true;
      return;
    }
    const counts = issueCounts(msg.issues);
    issuesDl.setSubtitle([counts.err && `${counts.err} errori`, counts.warn && `${counts.warn} avvisi`, counts.info && `${counts.info} info`].filter(Boolean).join(' · '));
    issuesDl.body.replaceChildren(...issuesView(msg.issues));
    if (!msg.ok) {
      summaryDl.body.replaceChildren(h('p', { class: 'empty' }, 'Messaggio non riconosciuto come SIP.'));
      headersDl.el.hidden = true;
      sdpDl.el.hidden = true;
      return;
    }
    summaryDl.body.replaceChildren(...summaryView(msg));
    headersDl.el.hidden = false;
    headersDl.setSubtitle(`${fmtInt(msg.headers.length)} righe`);
    headersTable.setRows(msg.headers);
    sdpDl.el.hidden = !msg.sdp;
    if (msg.sdp) {
      sdpDl.setSubtitle(`${fmtInt(msg.sdp.media.length)} ${msg.sdp.media.length === 1 ? 'flusso' : 'flussi'}`);
      sdpDl.body.replaceChildren(...sdpView(msg.sdp, msg.nat));
    }
  }

  // L'esempio si carica solo su richiesta esplicita dall'URL (?esempio=invite), mai il testo.
  const example = params.get('esempio');
  textarea.value = EXAMPLES[example] ?? '';
  update();
}

// Anteprima per la Dashboard.
export function preview() {
  const msg = parseSip(EXAMPLES.invite);
  const media = msg.sdp.media[0];
  const counts = issueCounts(msg.issues);
  return {
    href: '?esempio=invite',
    body: kvList([
      { label: 'Messaggio', value: `${msg.method} ${msg.uri}` },
      { label: 'Header', value: fmtInt(msg.headers.length) },
      { label: 'Media', value: `${media.effectiveConnection.address}:${media.port}`, hl: true },
      { label: 'Codec', value: media.codecs.map((c) => c.name).join(', ') },
      { label: 'Anomalie', value: counts.err + counts.warn ? badge(`${counts.err + counts.warn}`, 'warn') : badge('nessuna', 'ok') },
    ], 'kv--compact'),
  };
}
