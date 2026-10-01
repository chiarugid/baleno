// Lettura di certificati X.509 (RFC 5280) e richieste PKCS#10 (RFC 2986) da PEM o DER.
// Solo decodifica: la firma non viene verificata. Errori e avvisi sono codici,
// tradotti dall'interfaccia (js/tools/certs.js). Non usa il DOM.

import {
  Asn1Error, CLASS, TAG, parseDocument, parseInner, is, expect, oidOf, toHex,
  integerValue, unsignedBytes, bitLength, bitString, bitsSet, booleanValue,
  stringValue, timeValue, base64ToBytes,
} from './asn1.js';
import { formatIPv6 } from '../tools/subnet.js';

export class CertError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const DAY = 86400000;

// ---------------------------------------------------------------- Nomi degli OID

export const NAME_ATTRS = {
  '2.5.4.3': 'CN', '2.5.4.4': 'SN', '2.5.4.5': 'serialNumber', '2.5.4.6': 'C', '2.5.4.7': 'L',
  '2.5.4.8': 'ST', '2.5.4.9': 'street', '2.5.4.10': 'O', '2.5.4.11': 'OU', '2.5.4.12': 'title',
  '2.5.4.15': 'businessCategory', '2.5.4.17': 'postalCode', '2.5.4.42': 'GN', '2.5.4.43': 'initials',
  '2.5.4.46': 'dnQualifier', '2.5.4.65': 'pseudonym', '2.5.4.97': 'organizationIdentifier',
  '1.2.840.113549.1.9.1': 'emailAddress', '0.9.2342.19200300.100.1.25': 'DC',
  '0.9.2342.19200300.100.1.1': 'UID', '1.3.6.1.4.1.311.60.2.1.3': 'jurisdictionC',
  '1.3.6.1.4.1.311.60.2.1.2': 'jurisdictionST', '1.3.6.1.4.1.311.60.2.1.1': 'jurisdictionL',
};

export const SIG_ALGS = {
  '1.2.840.113549.1.1.2': { name: 'md2WithRSAEncryption', weak: true },
  '1.2.840.113549.1.1.4': { name: 'md5WithRSAEncryption', weak: true },
  '1.2.840.113549.1.1.5': { name: 'sha1WithRSAEncryption', weak: true },
  '1.2.840.113549.1.1.10': { name: 'RSASSA-PSS' },
  '1.2.840.113549.1.1.11': { name: 'sha256WithRSAEncryption' },
  '1.2.840.113549.1.1.12': { name: 'sha384WithRSAEncryption' },
  '1.2.840.113549.1.1.13': { name: 'sha512WithRSAEncryption' },
  '1.2.840.113549.1.1.14': { name: 'sha224WithRSAEncryption' },
  '1.2.840.10045.4.1': { name: 'ecdsa-with-SHA1', weak: true },
  '1.2.840.10045.4.3.1': { name: 'ecdsa-with-SHA224' },
  '1.2.840.10045.4.3.2': { name: 'ecdsa-with-SHA256' },
  '1.2.840.10045.4.3.3': { name: 'ecdsa-with-SHA384' },
  '1.2.840.10045.4.3.4': { name: 'ecdsa-with-SHA512' },
  '1.2.840.10040.4.3': { name: 'dsa-with-SHA1', weak: true },
  '2.16.840.1.101.3.4.3.2': { name: 'dsa-with-SHA256' },
  '1.3.101.112': { name: 'Ed25519' },
  '1.3.101.113': { name: 'Ed448' },
};

const KEY_ALGS = {
  '1.2.840.113549.1.1.1': 'RSA',
  '1.2.840.113549.1.1.10': 'RSA-PSS',
  '1.2.840.10045.2.1': 'EC',
  '1.2.840.10040.4.1': 'DSA',
  '1.3.101.110': 'X25519',
  '1.3.101.111': 'X448',
  '1.3.101.112': 'Ed25519',
  '1.3.101.113': 'Ed448',
};

export const CURVES = {
  '1.2.840.10045.3.1.1': { name: 'P-192 (prime192v1)', bits: 192 },
  '1.3.132.0.33': { name: 'P-224 (secp224r1)', bits: 224 },
  '1.2.840.10045.3.1.7': { name: 'P-256 (prime256v1)', bits: 256 },
  '1.3.132.0.34': { name: 'P-384 (secp384r1)', bits: 384 },
  '1.3.132.0.35': { name: 'P-521 (secp521r1)', bits: 521 },
  '1.3.132.0.10': { name: 'secp256k1', bits: 256 },
  '1.3.36.3.3.2.8.1.1.7': { name: 'brainpoolP256r1', bits: 256 },
  '1.3.36.3.3.2.8.1.1.11': { name: 'brainpoolP384r1', bits: 384 },
  '1.3.36.3.3.2.8.1.1.13': { name: 'brainpoolP512r1', bits: 512 },
};

const FIXED_KEY_BITS = { X25519: 256, Ed25519: 256, X448: 448, Ed448: 456 };

export const EXTENSIONS = {
  '2.5.29.14': 'subjectKeyIdentifier',
  '2.5.29.15': 'keyUsage',
  '2.5.29.17': 'subjectAltName',
  '2.5.29.18': 'issuerAltName',
  '2.5.29.19': 'basicConstraints',
  '2.5.29.30': 'nameConstraints',
  '2.5.29.31': 'cRLDistributionPoints',
  '2.5.29.32': 'certificatePolicies',
  '2.5.29.35': 'authorityKeyIdentifier',
  '2.5.29.36': 'policyConstraints',
  '2.5.29.37': 'extKeyUsage',
  '2.5.29.54': 'inhibitAnyPolicy',
  '1.3.6.1.5.5.7.1.1': 'authorityInfoAccess',
  '1.3.6.1.5.5.7.1.3': 'qcStatements',
  '1.3.6.1.5.5.7.1.24': 'tlsFeature',
  '1.3.6.1.4.1.11129.2.4.2': 'signedCertificateTimestampList',
  '1.3.6.1.4.1.11129.2.4.3': 'ctPrecertificatePoison',
  '2.16.840.1.113730.1.1': 'nsCertType',
  '2.16.840.1.113730.1.13': 'nsComment',
  '1.3.6.1.4.1.311.20.2': 'msCertificateTemplateName',
  '1.3.6.1.4.1.311.21.7': 'msCertificateTemplate',
  '1.3.6.1.4.1.311.21.10': 'msApplicationPolicies',
};

export const KEY_USAGE_BITS = [
  'digitalSignature', 'nonRepudiation', 'keyEncipherment', 'dataEncipherment',
  'keyAgreement', 'keyCertSign', 'cRLSign', 'encipherOnly', 'decipherOnly',
];

export const EKU_NAMES = {
  '1.3.6.1.5.5.7.3.1': 'serverAuth',
  '1.3.6.1.5.5.7.3.2': 'clientAuth',
  '1.3.6.1.5.5.7.3.3': 'codeSigning',
  '1.3.6.1.5.5.7.3.4': 'emailProtection',
  '1.3.6.1.5.5.7.3.5': 'ipsecEndSystem',
  '1.3.6.1.5.5.7.3.6': 'ipsecTunnel',
  '1.3.6.1.5.5.7.3.7': 'ipsecUser',
  '1.3.6.1.5.5.7.3.8': 'timeStamping',
  '1.3.6.1.5.5.7.3.9': 'OCSPSigning',
  '1.3.6.1.5.5.7.3.17': 'ipsecIKE',
  '1.3.6.1.5.2.3.4': 'pkinitClientAuth',
  '1.3.6.1.5.2.3.5': 'pkinitKDC',
  '1.3.6.1.4.1.311.20.2.2': 'msSmartcardLogin',
  '1.3.6.1.4.1.311.10.3.4': 'msEFS',
  '2.5.29.37.0': 'anyExtendedKeyUsage',
};

const POLICY_NAMES = {
  '2.5.29.32.0': 'anyPolicy',
  '2.23.140.1.1': 'EV',
  '2.23.140.1.2.1': 'DV',
  '2.23.140.1.2.2': 'OV',
  '2.23.140.1.2.3': 'IV',
};

const ACCESS_METHODS = { '1.3.6.1.5.5.7.48.1': 'OCSP', '1.3.6.1.5.5.7.48.2': 'caIssuers' };

const OID_EXTENSION_REQUEST = '1.2.840.113549.1.9.14';
const OID_CHALLENGE_PASSWORD = '1.2.840.113549.1.9.7';
const OID_UPN = '1.3.6.1.4.1.311.20.2.3';

// ---------------------------------------------------------------- PEM

const CERT_LABELS = ['CERTIFICATE', 'X509 CERTIFICATE', 'TRUSTED CERTIFICATE'];
const CSR_LABELS = ['CERTIFICATE REQUEST', 'NEW CERTIFICATE REQUEST'];

// Estrae i blocchi PEM. Le chiavi private sono segnalate e mai decodificate.
// Senza intestazioni BEGIN/END prova a leggere il testo come base64 di un DER.
export function parsePem(text) {
  const src = String(text ?? '');
  const out = { blocks: [], privateKey: false, unsupported: [] };
  const re = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/g;
  let m;
  let found = false;
  while ((m = re.exec(src))) {
    found = true;
    const label = m[1].trim();
    if (/PRIVATE KEY/.test(label)) { out.privateKey = true; continue; }
    const kind = CERT_LABELS.includes(label) ? 'cert' : CSR_LABELS.includes(label) ? 'csr' : null;
    if (!kind) { out.unsupported.push(label); continue; }
    // eventuali intestazioni "Proc-Type:" in stile RFC 1421 non sono base64
    const body = m[2].split(/\r?\n/).filter((line) => !line.includes(':')).join('');
    try {
      out.blocks.push({ kind, label, der: base64ToBytes(body) });
    } catch {
      out.blocks.push({ kind, label, error: 'base64' });
    }
  }
  if (!found && /-----BEGIN/.test(src)) {
    if (/PRIVATE KEY/.test(src)) out.privateKey = true;
    else out.blocks.push({ kind: null, error: 'pemIncomplete' });
  } else if (!found && src.trim()) {
    try {
      out.blocks.push({ kind: null, der: base64ToBytes(src) });
    } catch {
      out.blocks.push({ kind: null, error: 'notPem' });
    }
  }
  return out;
}

// ---------------------------------------------------------------- Strutture comuni

function algorithm(node) {
  const seq = expect(node, TAG.SEQUENCE);
  const oid = oidOf(seq.children[0]);
  return { oid, params: seq.children[1] ?? null };
}

function sigAlgInfo(node) {
  const { oid } = algorithm(node);
  const known = SIG_ALGS[oid];
  return { oid, name: known?.name ?? oid, weak: Boolean(known?.weak) };
}

// Name: SEQUENCE OF SET OF { OID, valore }; ordine di codifica conservato.
export function decodeName(node) {
  const attrs = [];
  for (const rdn of expect(node, TAG.SEQUENCE).children) {
    for (const atv of expect(rdn, TAG.SET).children) {
      expect(atv, TAG.SEQUENCE);
      const oid = oidOf(atv.children[0]);
      attrs.push({ oid, key: NAME_ATTRS[oid] ?? oid, value: stringValue(atv.children[1]) });
    }
  }
  return attrs;
}

export const nameToString = (attrs) => attrs.map((a) => `${a.key}=${a.value}`).join(', ');
const nameGet = (attrs, key) => attrs.filter((a) => a.key === key).map((a) => a.value);

function formatIp(bytes) {
  if (bytes.length === 4) return [...bytes].join('.');
  if (bytes.length === 16) {
    let v = 0n;
    for (const b of bytes) v = (v << 8n) | BigInt(b);
    return formatIPv6(v);
  }
  // nameConstraints: indirizzo + maschera
  if (bytes.length === 8 || bytes.length === 32) {
    const half = bytes.length / 2;
    return `${formatIp(bytes.subarray(0, half))}/${formatIp(bytes.subarray(half))}`;
  }
  return toHex(bytes);
}

// GeneralName (RFC 5280 §4.2.1.6), con tag context-specific impliciti.
function generalName(node) {
  if (node.cls !== CLASS.CONTEXT) return { type: 'unknown', value: toHex(node.raw) };
  switch (node.tag) {
    case 0: {
      const oid = oidOf(node.children[0]);
      const inner = node.children[1]?.children?.[0];
      const value = inner ? stringValue(inner) : '';
      return { type: 'otherName', oid, value: oid === OID_UPN ? `UPN: ${value}` : `${oid}: ${value}` };
    }
    case 1: return { type: 'email', value: stringValue(node) };
    case 2: return { type: 'dns', value: stringValue(node) };
    case 4: return { type: 'dirName', value: nameToString(decodeName(node.children[0])) };
    case 6: return { type: 'uri', value: stringValue(node) };
    case 7: return { type: 'ip', value: formatIp(node.content) };
    case 8: return { type: 'rid', value: oidOf({ ...node, cls: CLASS.UNIVERSAL, tag: TAG.OID }) };
    default: return { type: 'unknown', value: toHex(node.content) };
  }
}

const generalNames = (node) => expect(node, TAG.SEQUENCE).children.map(generalName);

// Tutti gli URI presenti in una struttura (punti di distribuzione CRL).
function collectUris(node, out = []) {
  if (node.cls === CLASS.CONTEXT && node.tag === 6 && !node.constructed) out.push(stringValue(node));
  for (const child of node.children ?? []) collectUris(child, out);
  return out;
}

// ---------------------------------------------------------------- Chiave pubblica

export function decodePublicKey(node) {
  const spki = expect(node, TAG.SEQUENCE);
  const alg = algorithm(spki.children[0]);
  const { bytes } = bitString(spki.children[1]);
  const type = KEY_ALGS[alg.oid] ?? alg.oid;
  const key = { type, oid: alg.oid, bits: null, curve: null, exponent: null, spki: spki.raw };
  if (type === 'RSA' || type === 'RSA-PSS') {
    const seq = parseInner(bytes);
    key.bits = bitLength(unsignedBytes(seq.children[0]));
    key.exponent = integerValue(seq.children[1]);
  } else if (type === 'EC') {
    if (alg.params && is(alg.params, TAG.OID)) {
      const curveOid = oidOf(alg.params);
      const curve = CURVES[curveOid];
      key.curve = curve?.name ?? curveOid;
      key.bits = curve?.bits ?? null;
    } else {
      key.curve = 'explicit';
    }
  } else if (type === 'DSA') {
    if (alg.params && is(alg.params, TAG.SEQUENCE)) key.bits = bitLength(unsignedBytes(alg.params.children[0]));
  } else if (FIXED_KEY_BITS[type]) {
    key.bits = FIXED_KEY_BITS[type];
  }
  return key;
}

// ---------------------------------------------------------------- Estensioni

function decodeExtensionValue(name, inner) {
  switch (name) {
    case 'subjectAltName':
    case 'issuerAltName':
      return generalNames(inner);
    case 'keyUsage':
      return bitsSet(inner).map((i) => KEY_USAGE_BITS[i] ?? `bit${i}`);
    case 'extKeyUsage':
      return expect(inner, TAG.SEQUENCE).children.map((n) => {
        const oid = oidOf(n);
        return { oid, name: EKU_NAMES[oid] ?? oid };
      });
    case 'basicConstraints': {
      const kids = expect(inner, TAG.SEQUENCE).children;
      let ca = false;
      let pathLen = null;
      for (const k of kids) {
        if (is(k, TAG.BOOLEAN)) ca = booleanValue(k);
        else if (is(k, TAG.INTEGER)) pathLen = Number(integerValue(k));
      }
      return { ca, pathLen };
    }
    case 'subjectKeyIdentifier':
      return toHex(expect(inner, TAG.OCTET_STRING).content);
    case 'authorityKeyIdentifier': {
      const out = { keyId: null, issuer: null, serial: null };
      for (const k of expect(inner, TAG.SEQUENCE).children) {
        if (k.cls !== CLASS.CONTEXT) continue;
        if (k.tag === 0) out.keyId = toHex(k.content);
        else if (k.tag === 1) out.issuer = k.children.map(generalName);
        else if (k.tag === 2) out.serial = toHex(k.content);
      }
      return out;
    }
    case 'cRLDistributionPoints':
      return collectUris(inner);
    case 'authorityInfoAccess':
      return expect(inner, TAG.SEQUENCE).children.map((ad) => {
        const oid = oidOf(ad.children[0]);
        return { method: ACCESS_METHODS[oid] ?? oid, name: generalName(ad.children[1]) };
      });
    case 'certificatePolicies':
      return expect(inner, TAG.SEQUENCE).children.map((pi) => {
        const oid = oidOf(pi.children[0]);
        return { oid, name: POLICY_NAMES[oid] ?? null };
      });
    case 'nsComment':
      return stringValue(inner);
    default:
      return null;
  }
}

// Extensions: SEQUENCE OF { OID, critical BOOLEAN DEFAULT FALSE, OCTET STRING }.
export function decodeExtensions(node) {
  const list = [];
  for (const ext of expect(node, TAG.SEQUENCE).children) {
    const kids = expect(ext, TAG.SEQUENCE).children;
    const oid = oidOf(kids[0]);
    const critical = is(kids[1], TAG.BOOLEAN) ? booleanValue(kids[1]) : false;
    const octets = expect(kids[kids.length - 1], TAG.OCTET_STRING).content;
    const name = EXTENSIONS[oid] ?? null;
    let value = null;
    let error = false;
    try {
      value = name ? decodeExtensionValue(name, parseInner(octets)) : null;
    } catch {
      error = true;
    }
    list.push({ oid, name, critical, value, error, raw: octets });
  }
  return list;
}

// Riassunto delle estensioni più usate, comune a certificati e CSR.
function summarize(extensions) {
  const get = (name) => extensions.find((e) => e.name === name && !e.error)?.value ?? null;
  return {
    san: get('subjectAltName') ?? [],
    keyUsage: get('keyUsage'),
    extKeyUsage: get('extKeyUsage'),
    basicConstraints: get('basicConstraints'),
    ski: get('subjectKeyIdentifier'),
    aki: get('authorityKeyIdentifier')?.keyId ?? null,
    crl: get('cRLDistributionPoints') ?? [],
    aia: get('authorityInfoAccess') ?? [],
    policies: get('certificatePolicies') ?? [],
  };
}

// Estensioni critiche che il decoder non conosce: un client conforme rifiuterebbe il certificato.
const DECODED = new Set(['subjectAltName', 'issuerAltName', 'keyUsage', 'extKeyUsage', 'basicConstraints',
  'subjectKeyIdentifier', 'authorityKeyIdentifier', 'cRLDistributionPoints', 'authorityInfoAccess',
  'certificatePolicies', 'nsComment']);

// ---------------------------------------------------------------- Certificato

function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function keyWarnings(key, out) {
  if ((key.type === 'RSA' || key.type === 'RSA-PSS' || key.type === 'DSA') && key.bits && key.bits < 2048) out.push({ code: 'smallKey', bits: key.bits });
  if (key.type === 'EC' && key.bits && key.bits < 256) out.push({ code: 'smallKey', bits: key.bits });
}

export function decodeCertificate(der, now = new Date()) {
  const root = parseDocument(der);
  const [tbs, sigAlgNode, sigValue] = expect(root, TAG.SEQUENCE).children;
  if (!tbs || !sigAlgNode || !sigValue || root.children.length !== 3) throw new CertError('structure');
  expect(sigValue, TAG.BIT_STRING);
  const f = expect(tbs, TAG.SEQUENCE).children;
  let i = 0;
  let version = 1;
  if (is(f[0], 0, CLASS.CONTEXT)) {
    version = Number(integerValue(f[0].children[0])) + 1;
    i = 1;
  }
  const serialNode = f[i++];
  const tbsSig = sigAlgInfo(f[i++]);
  const issuerNode = f[i++];
  const validity = expect(f[i++], TAG.SEQUENCE);
  const subjectNode = f[i++];
  const spkiNode = f[i++];
  let extensions = [];
  for (; i < f.length; i++) {
    if (is(f[i], 3, CLASS.CONTEXT)) extensions = decodeExtensions(f[i].children[0]);
  }

  const serialBytes = unsignedBytes(serialNode);
  const issuer = decodeName(issuerNode);
  const subject = decodeName(subjectNode);
  const notBefore = timeValue(validity.children[0]);
  const notAfter = timeValue(validity.children[1]);
  const sig = sigAlgInfo(sigAlgNode);
  const key = decodePublicKey(spkiNode);
  const ext = summarize(extensions);
  const selfIssued = sameBytes(issuerNode.raw, subjectNode.raw);
  const isCa = Boolean(ext.basicConstraints?.ca);

  const cert = {
    kind: 'cert',
    version,
    serial: toHex(serialBytes),
    serialDecimal: integerValue(serialNode).toString(),
    signature: sig,
    tbsSignatureMismatch: tbsSig.oid !== sig.oid,
    issuer,
    subject,
    issuerDer: issuerNode.raw,
    subjectDer: subjectNode.raw,
    commonName: nameGet(subject, 'CN')[0] ?? null,
    notBefore,
    notAfter,
    daysLeft: Math.floor((notAfter - now) / DAY),
    lifetimeDays: Math.round((notAfter - notBefore) / DAY),
    status: now < notBefore ? 'notYetValid' : now > notAfter ? 'expired' : 'valid',
    key,
    extensions,
    ...ext,
    isCa,
    selfIssued,
    der,
  };
  cert.warnings = certWarnings(cert);
  return cert;
}

function certWarnings(c) {
  const w = [];
  if (c.status === 'expired') w.push({ code: 'expired', days: -c.daysLeft });
  else if (c.status === 'notYetValid') w.push({ code: 'notYetValid' });
  else if (c.daysLeft < 30) w.push({ code: 'expiresSoon', days: c.daysLeft });
  if (c.signature.weak && !c.selfIssued) w.push({ code: 'weakSig', alg: c.signature.name });
  else if (c.signature.weak) w.push({ code: 'weakSigRoot', alg: c.signature.name });
  if (c.tbsSignatureMismatch) w.push({ code: 'sigMismatch' });
  keyWarnings(c.key, w);
  if (c.version < 3) w.push({ code: 'oldVersion', version: c.version });
  if (!c.isCa && !c.san.length) w.push({ code: 'noSan' });
  const tlsServer = c.extKeyUsage?.some((e) => e.name === 'serverAuth');
  // CA/Browser Forum: certificati TLS emessi dal 1° settembre 2020 al massimo 398 giorni
  if (tlsServer && !c.isCa && !c.selfIssued && c.lifetimeDays > 398 && c.notBefore >= new Date(Date.UTC(2020, 8, 1))) {
    w.push({ code: 'longLifetime', days: c.lifetimeDays });
  }
  if (c.isCa && c.keyUsage && !c.keyUsage.includes('keyCertSign')) w.push({ code: 'caNoCertSign' });
  if (!c.isCa && c.keyUsage?.includes('keyCertSign')) w.push({ code: 'certSignNotCa' });
  for (const e of c.extensions) {
    if (e.error) w.push({ code: 'extError', ext: e.name ?? e.oid });
    else if (e.critical && !DECODED.has(e.name)) w.push({ code: 'unknownCritical', ext: e.name ?? e.oid });
  }
  return w;
}

// ---------------------------------------------------------------- CSR (PKCS#10)

export function decodeCsr(der) {
  const root = parseDocument(der);
  const [info, sigAlgNode, sigValue] = expect(root, TAG.SEQUENCE).children;
  if (!info || !sigAlgNode || !sigValue || root.children.length !== 3) throw new CertError('structure');
  expect(sigValue, TAG.BIT_STRING);
  const f = expect(info, TAG.SEQUENCE).children;
  const version = Number(integerValue(f[0])) + 1;
  const subject = decodeName(f[1]);
  const key = decodePublicKey(f[2]);
  const attributes = [];
  let extensions = [];
  let challengePassword = false;
  if (f[3] && is(f[3], 0, CLASS.CONTEXT)) {
    for (const attr of f[3].children) {
      const oid = oidOf(attr.children[0]);
      attributes.push(oid);
      if (oid === OID_EXTENSION_REQUEST) extensions = decodeExtensions(attr.children[1].children[0]);
      if (oid === OID_CHALLENGE_PASSWORD) challengePassword = true;
    }
  }
  const sig = sigAlgInfo(sigAlgNode);
  const csr = {
    kind: 'csr',
    version,
    subject,
    commonName: nameGet(subject, 'CN')[0] ?? null,
    key,
    signature: sig,
    attributes,
    challengePassword,
    extensions,
    ...summarize(extensions),
    der,
  };
  const w = [];
  if (sig.weak) w.push({ code: 'weakSig', alg: sig.name });
  keyWarnings(key, w);
  if (!csr.san.length) w.push({ code: 'noSanCsr' });
  if (challengePassword) w.push({ code: 'challengePassword' });
  for (const e of extensions) if (e.error) w.push({ code: 'extError', ext: e.name ?? e.oid });
  csr.warnings = w;
  return csr;
}

// ---------------------------------------------------------------- Riconoscimento

// Certificato o CSR? Il TBSCertificate inizia con [0] version o con il serial seguito
// da un AlgorithmIdentifier; il CertificationRequestInfo con version, Name, SPKI, [0].
export function detectKind(der) {
  const root = parseDocument(der);
  const info = root.children?.[0];
  if (!is(root, TAG.SEQUENCE) || !is(info, TAG.SEQUENCE) || !info.children.length) throw new CertError('structure');
  if (is(info.children[0], 0, CLASS.CONTEXT)) return 'cert';
  const last = info.children[info.children.length - 1];
  if (info.children.length === 4 && is(info.children[1], TAG.SEQUENCE) && is(last, 0, CLASS.CONTEXT)) return 'csr';
  if (info.children.length === 3) return 'csr';
  return 'cert';
}

// Decodifica un blocco qualsiasi; gli errori diventano { error: codice }.
export function decodeAny(der, kind = null, now = new Date()) {
  try {
    const k = kind ?? detectKind(der);
    return k === 'csr' ? decodeCsr(der) : decodeCertificate(der, now);
  } catch (err) {
    if (err instanceof CertError) return { error: err.code };
    if (err instanceof Asn1Error) return { error: 'asn1', detail: err.message };
    return { error: 'structure' };
  }
}

// Testo incollato (PEM, base64 nudo) o byte di un file (PEM o DER binario).
export function decodeInput(input, now = new Date()) {
  let pem;
  if (input instanceof Uint8Array) {
    if (input[0] === 0x30) pem = { blocks: [{ kind: null, der: input }], privateKey: false, unsupported: [] };
    else pem = parsePem(new TextDecoder().decode(input));
  } else {
    pem = parsePem(input);
  }
  const items = pem.blocks.map((b) => (b.error ? { error: b.error } : decodeAny(b.der, b.kind, now)));
  // catena: per ogni certificato, quale altro elemento dell'input lo ha emesso
  items.forEach((item, idx) => {
    if (item.kind !== 'cert') return;
    const found = items.findIndex((other, j) => j !== idx && other.kind === 'cert' && sameBytes(other.subjectDer, item.issuerDer));
    item.issuedBy = item.selfIssued ? idx : found;
  });
  return { items, privateKey: pem.privateKey, unsupported: pem.unsupported };
}

// ---------------------------------------------------------------- Impronte

async function digest(alg, bytes) {
  return new Uint8Array(await crypto.subtle.digest(alg, bytes));
}

function toBase64(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

// Impronte calcolate sui byte DER con Web Crypto; pin SPKI in base64 (RFC 7469).
export async function fingerprints(item) {
  const [sha1, sha256, spki] = await Promise.all([
    digest('SHA-1', item.der),
    digest('SHA-256', item.der),
    digest('SHA-256', item.key.spki),
  ]);
  return { sha1: toHex(sha1), sha256: toHex(sha256), spkiSha256: toBase64(spki) };
}
