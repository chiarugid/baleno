// Parser ASN.1 DER essenziale, scritto per questo sito (nessuna dipendenza esterna).
// Copre ciò che serve a leggere certificati X.509 e richieste PKCS#10:
// TLV con lunghezze in forma breve e lunga, tag universali e context-specific,
// OID, INTEGER, BIT STRING, OCTET STRING, stringhe di testo e date.
// Non usa il DOM: è importato anche da tests/run.mjs.

export class Asn1Error extends Error {}

const MAX_DEPTH = 32;

export const CLASS = { UNIVERSAL: 0, APPLICATION: 1, CONTEXT: 2, PRIVATE: 3 };

export const TAG = {
  BOOLEAN: 1, INTEGER: 2, BIT_STRING: 3, OCTET_STRING: 4, NULL: 5, OID: 6,
  UTF8_STRING: 12, SEQUENCE: 16, SET: 17, NUMERIC_STRING: 18, PRINTABLE_STRING: 19,
  T61_STRING: 20, IA5_STRING: 22, UTC_TIME: 23, GENERALIZED_TIME: 24,
  VISIBLE_STRING: 26, UNIVERSAL_STRING: 28, BMP_STRING: 30,
};

// Legge un nodo TLV a partire da offset; i nodi costruiti hanno i figli in children.
export function parseDer(bytes, offset = 0, end = bytes.length, depth = 0) {
  if (depth > MAX_DEPTH) throw new Asn1Error('nesting');
  if (offset + 2 > end) throw new Asn1Error('truncated');
  const start = offset;
  const first = bytes[offset++];
  const cls = first >> 6;
  const constructed = (first & 0x20) !== 0;
  let tag = first & 0x1f;
  if (tag === 0x1f) {
    // tag in forma lunga (base 128)
    tag = 0;
    let b;
    do {
      if (offset >= end) throw new Asn1Error('truncated');
      b = bytes[offset++];
      tag = tag * 128 + (b & 0x7f);
    } while (b & 0x80);
  }
  if (offset >= end) throw new Asn1Error('truncated');
  let length = bytes[offset++];
  if (length & 0x80) {
    const count = length & 0x7f;
    if (count === 0) throw new Asn1Error('indefinite');
    if (count > 4) throw new Asn1Error('length');
    length = 0;
    for (let i = 0; i < count; i++) {
      if (offset >= end) throw new Asn1Error('truncated');
      length = length * 256 + bytes[offset++];
    }
  }
  const contentStart = offset;
  const contentEnd = contentStart + length;
  if (contentEnd > end) throw new Asn1Error('truncated');
  const node = {
    cls, constructed, tag, start, contentStart, end: contentEnd,
    content: bytes.subarray(contentStart, contentEnd),
    raw: bytes.subarray(start, contentEnd),
    children: null,
  };
  if (constructed) {
    node.children = [];
    let pos = contentStart;
    while (pos < contentEnd) {
      const child = parseDer(bytes, pos, contentEnd, depth + 1);
      node.children.push(child);
      pos = child.end;
    }
  }
  return node;
}

// Un intero documento DER: un solo nodo radice, senza byte in eccesso.
export function parseDocument(bytes) {
  const root = parseDer(bytes, 0, bytes.length);
  if (root.end !== bytes.length) throw new Asn1Error('trailing');
  return root;
}

export const is = (node, tag, cls = CLASS.UNIVERSAL) => Boolean(node) && node.cls === cls && node.tag === tag;

export function expect(node, tag, cls = CLASS.UNIVERSAL) {
  if (!is(node, tag, cls)) throw new Asn1Error('structure');
  return node;
}

// OCTET STRING / BIT STRING che incapsulano a loro volta DER (estensioni, chiavi).
export function parseInner(bytes) {
  return parseDocument(bytes);
}

export function decodeOid(content) {
  if (!content.length) throw new Asn1Error('oid');
  const parts = [];
  let value = 0n;
  for (let i = 0; i < content.length; i++) {
    value = (value << 7n) | BigInt(content[i] & 0x7f);
    if (!(content[i] & 0x80)) {
      if (!parts.length) {
        // il primo sottoidentificativo codifica i primi due archi
        const first = value < 80n ? value / 40n : 2n;
        parts.push(first, value - first * 40n);
      } else parts.push(value);
      value = 0n;
    } else if (i === content.length - 1) throw new Asn1Error('oid');
  }
  return parts.join('.');
}

export const oidOf = (node) => decodeOid(expect(node, TAG.OID).content);

export function toHex(bytes, sep = ':') {
  return [...bytes].map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(sep);
}

// INTEGER come BigInt con segno (complemento a due).
export function integerValue(node) {
  const c = expect(node, TAG.INTEGER).content;
  if (!c.length) throw new Asn1Error('integer');
  let v = 0n;
  for (const b of c) v = (v << 8n) | BigInt(b);
  if (c[0] & 0x80) v -= 1n << BigInt(c.length * 8);
  return v;
}

// Byte significativi di un INTEGER senza segno (es. modulo RSA, numero di serie).
export function unsignedBytes(node) {
  let c = expect(node, TAG.INTEGER).content;
  while (c.length > 1 && c[0] === 0) c = c.subarray(1);
  return c;
}

export function bitLength(bytes) {
  let i = 0;
  while (i < bytes.length && bytes[i] === 0) i++;
  if (i === bytes.length) return 0;
  return (bytes.length - i - 1) * 8 + (32 - Math.clz32(bytes[i]));
}

// BIT STRING: { unused, bytes }.
export function bitString(node) {
  const c = expect(node, TAG.BIT_STRING).content;
  if (!c.length || c[0] > 7) throw new Asn1Error('bitstring');
  return { unused: c[0], bytes: c.subarray(1) };
}

// Bit impostati di una BIT STRING come insieme di indici (bit 0 = il più significativo).
export function bitsSet(node) {
  const { unused, bytes } = bitString(node);
  const set = [];
  const total = bytes.length * 8 - unused;
  for (let i = 0; i < total; i++) if (bytes[i >> 3] & (0x80 >> (i & 7))) set.push(i);
  return set;
}

export function booleanValue(node) {
  const c = expect(node, TAG.BOOLEAN).content;
  return c.length === 1 && c[0] !== 0;
}

const utf8 = new TextDecoder('utf-8', { fatal: false });
const latin1 = new TextDecoder('latin1');

export function stringValue(node) {
  if (node.cls !== CLASS.UNIVERSAL) return utf8.decode(node.content);
  switch (node.tag) {
    case TAG.BMP_STRING: {
      let s = '';
      for (let i = 0; i + 1 < node.content.length; i += 2) s += String.fromCharCode((node.content[i] << 8) | node.content[i + 1]);
      return s;
    }
    case TAG.UNIVERSAL_STRING: {
      let s = '';
      for (let i = 0; i + 3 < node.content.length; i += 4) {
        s += String.fromCodePoint(((node.content[i] << 24) | (node.content[i + 1] << 16) | (node.content[i + 2] << 8) | node.content[i + 3]) >>> 0);
      }
      return s;
    }
    case TAG.T61_STRING: return latin1.decode(node.content);
    default: return utf8.decode(node.content);
  }
}

// UTCTime (YYMMDDhhmm[ss]Z) e GeneralizedTime (YYYYMMDDhhmmss[.f]Z) → Date UTC.
export function timeValue(node) {
  const s = latin1.decode(node.content);
  let m;
  if (is(node, TAG.UTC_TIME)) {
    m = /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?Z$/.exec(s);
    if (!m) throw new Asn1Error('time');
    const yy = Number(m[1]);
    // RFC 5280: YY >= 50 → 19YY, altrimenti 20YY
    return new Date(Date.UTC(yy >= 50 ? 1900 + yy : 2000 + yy, Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0)));
  }
  if (is(node, TAG.GENERALIZED_TIME)) {
    m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\.\d+)?Z$/.exec(s);
    if (!m) throw new Asn1Error('time');
    return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6])));
  }
  throw new Asn1Error('time');
}

// Base64 → byte, tollerante a spazi e a capo.
export function base64ToBytes(text) {
  const clean = String(text).replace(/[\s\r\n]+/g, '');
  if (!clean || !/^[A-Za-z0-9+/]+={0,2}$/.test(clean) || clean.length % 4 === 1) throw new Asn1Error('base64');
  const bin = atob(clean.padEnd(Math.ceil(clean.length / 4) * 4, '='));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
