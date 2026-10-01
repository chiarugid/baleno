// Test dei calcoli: node tests/run.mjs (Node 18+, nessuna dipendenza).

import assert from 'node:assert/strict';
import * as subnet from '../js/tools/subnet.js';
import { calcVoip, formatRate } from '../js/tools/voip-bw.js';
import { parseSip, EXAMPLES as SIP_EXAMPLES, splitHeaderList, parseNameAddr, parseReason, describeEvents, hasSbcHeaders } from '../js/tools/sip-parser.js';
import { findCode, filterCodes, q850For, reasonHeader, codeClass } from '../js/tools/sip-codes.js';
import { SIP_CODES, Q850, SIP_TO_Q850, Q850_TO_SIP } from '../data/sip-codes.js';
import { dscpInfo, parseValue, findPoint, TABLE_ROWS } from '../js/tools/dscp.js';
import { emodel, rToMos, delayImpairment, effectiveIe, oneWayDelay, category, R0 } from '../js/tools/mos.js';
import { parsePattern, matchPattern, testPattern, applyMask, patternCount } from '../js/tools/cucm.js';
import { dbmToMw, mwToDbm, eirp, fspl, linkBudget, bandCheck, parseNumber, formatPower, formatDistance } from '../js/tools/rf-power.js';
import { parseMac, formatMac, lookupVendor, macInfo, specialAddress, eui64LinkLocal, extractMacs, OUI_COUNT } from '../js/tools/mac.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok    ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${err.message.split('\n').join('\n        ')}`);
  }
}

const { calc, subdivide, formatIPv4: v4, formatIPv6: v6, formatIPv6Expanded, parseIPv4, parseIPv6 } = subnet;

function ipv4(addr, mask) {
  const r = calc(addr, mask);
  assert.ok(r.ok, `calc(${addr}) fallito: ${r.error}`);
  return {
    network: v4(r.network), prefix: r.prefix, mask: v4(r.mask), wildcard: v4(r.wildcard),
    broadcast: r.broadcast == null ? null : v4(r.broadcast),
    first: v4(r.first), last: v4(r.last), usable: r.usable, total: r.total, type: r.type,
  };
}

console.log('Subnet IPv4');

test('192.168.10.0/26', () => {
  assert.deepEqual(ipv4('192.168.10.0/26'), {
    network: '192.168.10.0', prefix: 26, mask: '255.255.255.192', wildcard: '0.0.0.63',
    broadcast: '192.168.10.63', first: '192.168.10.1', last: '192.168.10.62',
    usable: 62, total: 64, type: 'Privato (RFC 1918)',
  });
});

test('172.16.5.130/27 (host dentro la rete)', () => {
  const r = ipv4('172.16.5.130/27');
  assert.equal(r.network, '172.16.5.128');
  assert.equal(r.broadcast, '172.16.5.159');
  assert.equal(r.first, '172.16.5.129');
  assert.equal(r.last, '172.16.5.158');
  assert.equal(r.usable, 30);
});

test('maschera puntata: 10.0.0.0 255.255.252.0 = /22', () => {
  const r = ipv4('10.0.0.0 255.255.252.0');
  assert.equal(r.prefix, 22);
  assert.equal(r.broadcast, '10.0.3.255');
  assert.equal(r.usable, 1022);
});

test('maschera in campo separato e prefisso con slash', () => {
  assert.equal(ipv4('192.168.1.77', '255.255.255.0').network, '192.168.1.0');
  assert.equal(ipv4('192.168.1.77', '/25').broadcast, '192.168.1.127');
});

test('/31 punto-punto (RFC 3021) e /32', () => {
  const p2p = ipv4('10.0.0.1/31');
  assert.equal(p2p.broadcast, null);
  assert.equal(p2p.first, '10.0.0.0');
  assert.equal(p2p.last, '10.0.0.1');
  assert.equal(p2p.usable, 2);
  const host = ipv4('10.1.1.1/32');
  assert.equal(host.usable, 1);
  assert.equal(host.first, '10.1.1.1');
});

test('/0 e /8', () => {
  const all = ipv4('0.0.0.0/0');
  assert.equal(all.total, 2 ** 32);
  assert.equal(all.broadcast, '255.255.255.255');
  assert.equal(ipv4('10.20.30.40/8').usable, 16777214);
});

test('tipi di indirizzo', () => {
  assert.equal(ipv4('100.64.1.1/32').type, 'CGNAT (RFC 6598)');
  assert.equal(ipv4('8.8.8.8/32').type, 'Pubblico');
  assert.equal(ipv4('169.254.10.1/16').type, 'Link-local (APIPA)');
  assert.equal(ipv4('255.255.255.255/32').type, 'Broadcast limitato');
  assert.equal(ipv4('240.0.0.1/4').type, 'Riservato (classe E)');
  assert.equal(ipv4('224.0.0.5/32').type, 'Multicast');
});

test('input non validi', () => {
  assert.equal(parseIPv4('256.1.1.1'), null);
  assert.equal(parseIPv4('01.2.3.4'), null);
  assert.equal(parseIPv4('1.2.3'), null);
  assert.equal(calc('192.168.1.0', '').field, 'prefix');
  assert.equal(calc('192.168.1.0/33').ok, false);
  assert.match(calc('192.168.1.0', '255.0.255.0').error, /contigui/);
  assert.equal(calc('').field, 'address');
});

console.log('Subnet IPv6');

test('2001:db8:acad::/48', () => {
  const r = calc('2001:db8:acad::/48');
  assert.ok(r.ok);
  assert.equal(v6(r.network), '2001:db8:acad::');
  assert.equal(v6(r.last), '2001:db8:acad:ffff:ffff:ffff:ffff:ffff');
  assert.equal(r.total, 1n << 80n);
  assert.equal(r.type, 'Documentazione (RFC 3849)');
});

test('host dentro una /64', () => {
  const r = calc('2001:db8:1:2:aaaa:bbbb:cccc:dddd/64');
  assert.equal(v6(r.network), '2001:db8:1:2::');
  assert.equal(v6(r.last), '2001:db8:1:2:ffff:ffff:ffff:ffff');
});

test('forma compressa RFC 5952', () => {
  assert.equal(v6(parseIPv6('2001:0db8:0000:0000:0001:0000:0000:0001')), '2001:db8::1:0:0:1');
  assert.equal(v6(parseIPv6('2001:db8:0:1:1:1:1:1')), '2001:db8:0:1:1:1:1:1');
  assert.equal(v6(parseIPv6('2001:db8:0:0:1:0:0:0')), '2001:db8:0:0:1::');
  assert.equal(v6(parseIPv6('0:0:0:0:0:0:0:0')), '::');
  assert.equal(v6(parseIPv6('::1')), '::1');
  assert.equal(v6(parseIPv6('FE80:0:0:0:0:0:0:0')), 'fe80::');
  assert.equal(v6(parseIPv6('::ffff:192.0.2.1')), '::ffff:192.0.2.1');
  assert.equal(formatIPv6Expanded(parseIPv6('::1')), '0000:0000:0000:0000:0000:0000:0000:0001');
});

test('tipi IPv6', () => {
  assert.equal(calc('fe80::1/64').type, 'Link-local');
  assert.equal(calc('fd12:3456::1/48').type, 'Unique Local (ULA)');
  assert.equal(calc('2a00:1450::1/32').type, 'Global unicast');
  assert.equal(calc('ff02::1/128').type, 'Multicast');
});

test('IPv6 non validi', () => {
  for (const bad of ['1::2::3', '12345::', '1:2:3:4:5:6:7:8:9', ':1:2::', '1:2:3:4:5:6:7', 'g::1', '::1.2.3.256']) {
    assert.equal(parseIPv6(bad), null, bad);
  }
  assert.match(calc('2001:db8::', '255.255.0.0').error, /IPv6/);
});

console.log('Suddivisione');

test('192.168.10.0/26 in /28', () => {
  const s = subdivide(calc('192.168.10.0/26'), 'prefix', '28');
  assert.ok(s.ok);
  assert.equal(s.count, 4);
  assert.deepEqual(s.getRow(1), {
    index: 2, sortNet: parseIPv4('192.168.10.16'), network: '192.168.10.16/28',
    first: '192.168.10.17', last: '192.168.10.30', broadcast: '192.168.10.31', usable: 14,
  });
  assert.equal(s.getRow(3).broadcast, '192.168.10.63');
});

test('per numero di sottoreti (arrotonda a potenza di 2)', () => {
  const s = subdivide(calc('10.0.0.0/24'), 'count', '5');
  assert.equal(s.newPrefix, 27);
  assert.equal(s.count, 8);
  assert.equal(s.requested, 5n);
});

test('per host per sottorete', () => {
  const base = calc('10.0.0.0/24');
  assert.equal(subdivide(base, 'hosts', '50').newPrefix, 26);
  assert.equal(subdivide(base, 'hosts', '62').newPrefix, 26);
  assert.equal(subdivide(base, 'hosts', '63').newPrefix, 25);
  assert.equal(subdivide(base, 'hosts', '2').newPrefix, 31);
  assert.equal(subdivide(base, 'hosts', '1').newPrefix, 32);
});

test('errori di suddivisione', () => {
  const base = calc('192.168.10.0/26');
  assert.equal(subdivide(base, 'prefix', '26').ok, false);
  assert.equal(subdivide(base, 'prefix', '33').ok, false);
  assert.match(subdivide(base, 'hosts', '100').error, /\/25/);
  assert.equal(subdivide(base, 'prefix', 'abc').ok, false);
});

test('IPv6 /48 in /64 e limite 2^32', () => {
  const s = subdivide(calc('2001:db8:acad::/48'), 'prefix', '64');
  assert.equal(s.count, 65536);
  assert.equal(s.getRow(1).network, '2001:db8:acad:1::/64');
  assert.equal(s.getRow(65535).last, '2001:db8:acad:ffff:ffff:ffff:ffff:ffff');
  assert.ok(subdivide(calc('2001:db8::/32'), 'prefix', '64').ok);
  assert.match(subdivide(calc('2001:db8::/32'), 'prefix', '65').error, /2\^33/);
});

test('suddivisione IPv4 grande: /8 in /30 (righe calcolate al volo)', () => {
  const s = subdivide(calc('10.0.0.0/8'), 'prefix', '30');
  assert.equal(s.count, 4194304);
  assert.equal(s.getRow(4194303).network, '10.255.255.252/30');
});

console.log('Suddivisione: limiti');

const { LIMITS, splitPlan, subnetsCsv } = subnet;

test('tre limiti distinti: calcolo, visualizzazione piena, esportazione', () => {
  assert.deepEqual(LIMITS, { calcBits: 32, displayRows: 4096, exportRows: 65536 });
  assert.ok(LIMITS.displayRows < LIMITS.exportRows && LIMITS.exportRows < 2 ** LIMITS.calcBits);
});

test('entro la soglia di visualizzazione: ordinamento e filtro pieni, nessun avviso', () => {
  for (const n of [1, 16, 4096]) {
    const plan = splitPlan(n);
    assert.equal(plan.mode, 'full', String(n));
    assert.equal(plan.exportable, true);
    assert.deepEqual(plan.notes, []);
  }
  const s = subdivide(calc('10.0.0.0/12'), 'prefix', '24');
  assert.equal(s.count, 4096);
  assert.equal(splitPlan(s.count).mode, 'full');
});

test('oltre la soglia: si sfoglia tutto, avviso su ordinamento/filtro per pagina, nessun blocco', () => {
  const s = subdivide(calc('10.0.0.0/12'), 'prefix', '25');
  assert.equal(s.ok, true, 'la suddivisione non viene bloccata');
  assert.equal(s.count, 8192);
  const plan = splitPlan(s.count);
  assert.equal(plan.mode, 'paged');
  assert.equal(plan.exportable, true);
  assert.deepEqual(plan.notes, ['Oltre 4096 righe: la tabella sfoglia tutte le 8192 sottoreti, ma ordinamento e filtro agiscono solo sulla pagina corrente.']);
  // tutte le righe restano raggiungibili, anche l'ultima
  assert.equal(s.getRow(8191).network, '10.15.255.128/25');
  assert.equal(splitPlan(4097).mode, 'paged');
});

test('oltre il limite di esportazione: tabella sfogliabile, CSV disattivato', () => {
  const s = subdivide(calc('10.0.0.0/8'), 'prefix', '30');
  assert.equal(s.ok, true);
  assert.equal(s.count, 4194304);
  const plan = splitPlan(s.count);
  assert.equal(plan.mode, 'paged');
  assert.equal(plan.exportable, false);
  assert.equal(plan.notes.length, 2);
  assert.equal(plan.notes[1], 'Esportazione CSV disponibile fino a 65.536 righe: questa suddivisione ne ha 4.194.304. Scegli un nuovo prefisso più corto o suddividi una rete più piccola.');
  assert.equal(subnetsCsv(s, 4).ok, false);
  assert.equal(splitPlan(65536).exportable, true);
  assert.equal(splitPlan(65537).exportable, false);
});

test('oltre il limite di calcolo: errore esplicito', () => {
  assert.equal(subdivide(calc('2001:db8::/32'), 'prefix', '64').ok, true, '2^32 ammesso');
  assert.equal(subdivide(calc('2001:db8::/32'), 'prefix', '65').error, 'Troppe sottoreti (2^33): il massimo calcolabile è 2^32.');
});

test('CSV: intestazione, separatore ";" e righe', () => {
  const csv = subnetsCsv(subdivide(calc('192.168.10.0/26'), 'prefix', '28'), 4);
  assert.equal(csv.ok, true);
  assert.equal(csv.rows, 4);
  const lines = csv.text.trimEnd().split('\r\n');
  assert.equal(lines.length, 5);
  assert.equal(lines[0], '#;Rete;Primo host;Ultimo host;Broadcast;Host utilizzabili');
  assert.equal(lines[2], '2;192.168.10.16/28;192.168.10.17;192.168.10.30;192.168.10.31;14');
  const v6 = subnetsCsv(subdivide(calc('2001:db8:acad::/48'), 'prefix', '50'), 6);
  assert.equal(v6.text.split('\r\n')[1], '1;2001:db8:acad::/50;2001:db8:acad::;2001:db8:acad:3fff:ffff:ffff:ffff:ffff;302231454903657293676544');
});

console.log('Banda VoIP');

const close = (actual, expected, msg) => assert.ok(Math.abs(actual - expected) < 1e-9, `${msg ?? ''} atteso ${expected}, ottenuto ${actual}`);

test('G.711 20 ms su Ethernet = 87,2 kbps', () => {
  const r = calcVoip({ codec: 'g711', ptime: 20 });
  assert.equal(r.payload, 160);
  assert.equal(r.l3Bytes, 200);
  assert.equal(r.wireBytes, 218);
  assert.equal(r.pps, 50);
  close(r.kbpsL3, 80);
  close(r.kbpsPerCall, 87.2);
  assert.equal(formatRate(r.kbpsPerCall), '87,2 kbps');
});

test('G.729 20 ms su Ethernet = 31,2 kbps; 30 ms = 23,47 kbps', () => {
  close(calcVoip({ codec: 'g729', ptime: 20 }).kbpsPerCall, 31.2);
  close(calcVoip({ codec: 'g729', ptime: 30 }).kbpsPerCall, (88 * 8) / 30);
});

test('G.711 10/30 ms e G.722 = G.711', () => {
  close(calcVoip({ codec: 'g711', ptime: 10 }).kbpsPerCall, 110.4);
  close(calcVoip({ codec: 'g711', ptime: 30 }).kbpsPerCall, (298 * 8) / 30);
  close(calcVoip({ codec: 'g722', ptime: 20 }).kbpsPerCall, 87.2);
});

test('802.1Q (+4 B) e preambolo + IFG (+20 B)', () => {
  assert.equal(calcVoip({ dot1q: true }).wireBytes, 222);
  close(calcVoip({ dot1q: true }).kbpsPerCall, 88.8);
  assert.equal(calcVoip({ dot1q: true, preamble: true }).wireBytes, 242);
  assert.equal(calcVoip({ ethernet: false, dot1q: true, preamble: true }).wireBytes, 200, 'senza Ethernet niente L2');
});

test('IPsec ESP tunnel AES-CBC/SHA1: padding a 16 B', () => {
  const r = calcVoip({ ipsec: 'tunnel', cipher: 'cbc' });
  // 200 + 2 trailer = 202 -> 208; 20 IP + 8 ESP + 16 IV + 208 + 12 ICV = 264
  assert.equal(r.l3Bytes, 264);
  assert.equal(r.wireBytes, 282);
  close(r.kbpsPerCall, 112.8);
});

test('IPsec ESP tunnel AES-GCM e NAT-T', () => {
  assert.equal(calcVoip({ ipsec: 'tunnel', cipher: 'gcm' }).l3Bytes, 256);
  assert.equal(calcVoip({ ipsec: 'tunnel', cipher: 'gcm', natt: true }).l3Bytes, 264);
  assert.equal(calcVoip({ natt: true }).l3Bytes, 200, 'NAT-T ignorato senza IPsec');
});

test('GRE e GRE + IPsec transport (stile DMVPN)', () => {
  assert.equal(calcVoip({ gre: true }).l3Bytes, 224);
  // GRE 224; transport protegge 204 + 2 = 206 -> 208 (blocco 4); 20 + 8 + 8 + 208 + 16 = 260
  assert.equal(calcVoip({ gre: true, ipsec: 'transport', cipher: 'gcm' }).l3Bytes, 260);
  // CBC: 206 -> 208 (blocco 16); 20 + 8 + 16 + 208 + 12 = 264
  assert.equal(calcVoip({ gre: true, ipsec: 'transport', cipher: 'cbc' }).l3Bytes, 264);
});

test('Opus a bitrate scelto e N chiamate', () => {
  const r = calcVoip({ codec: 'opus', bitrate: 24, ptime: 20, calls: 25 });
  assert.equal(r.payload, 60);
  close(r.kbpsPerCall, 47.2);
  close(r.kbpsTotal, 1180);
  assert.equal(formatRate(r.kbpsTotal), '1,18 Mbps');
});

test('input non validi', () => {
  assert.equal(calcVoip({ codec: 'gsm' }).ok, false);
  assert.equal(calcVoip({ ptime: 25 }).field, 'ptime');
  assert.equal(calcVoip({ calls: 0 }).field, 'calls');
  assert.equal(calcVoip({ calls: 2.5 }).field, 'calls');
  assert.equal(calcVoip({ codec: 'opus', bitrate: 4 }).field, 'bitrate');
  assert.equal(calcVoip({ ipsec: 'xyz' }).field, 'ipsec');
  assert.equal(calcVoip({ ipsec: 'tunnel', integrity: 'md5' }).field, 'ipsec');
  assert.equal(calcVoip({ srtp: 'sha1-64' }).field, 'srtp');
});

test('SRTP HMAC-SHA1-80 (+10 B) e HMAC-SHA1-32 (+4 B)', () => {
  const s80 = calcVoip({ srtp: 'sha1-80' });
  assert.equal(s80.l3Bytes, 210);
  assert.equal(s80.wireBytes, 228);
  close(s80.kbpsPerCall, 91.2);
  const s32 = calcVoip({ srtp: 'sha1-32' });
  assert.equal(s32.wireBytes, 222);
  close(s32.kbpsPerCall, 88.8);
  close(calcVoip({ codec: 'g729', srtp: 'sha1-80' }).kbpsPerCall, 35.2);
  assert.equal(calcVoip({ srtp: 'none' }).wireBytes, 218);
});

test('SRTP dentro IPsec: il tag entra nel padding ESP', () => {
  // 210 + 2 = 212 -> 224 (blocco 16); 20 + 8 + 16 + 224 + 12 = 280
  assert.equal(calcVoip({ srtp: 'sha1-80', ipsec: 'tunnel', cipher: 'cbc' }).l3Bytes, 280);
});

test('integrità IPsec selezionabile: SHA1-96 = 12 B, SHA-256-128 = 16 B', () => {
  const sha1 = calcVoip({ ipsec: 'tunnel', cipher: 'cbc', integrity: 'sha1' });
  const sha256 = calcVoip({ ipsec: 'tunnel', cipher: 'cbc', integrity: 'sha256' });
  assert.equal(sha1.l3Bytes, 264);
  assert.equal(sha256.l3Bytes, 268);
  close(sha256.kbpsPerCall, 114.4);
  assert.match(sha256.layers.find((l) => l.id === 'ipsec').detail, /ICV 16 \(HMAC-SHA-256-128\)/);
  assert.match(sha1.layers.find((l) => l.id === 'ipsec').detail, /ICV 12 \(HMAC-SHA1-96\)/);
  assert.equal(sha256.ipsecLabel, 'ESP tunnel · AES-CBC + HMAC-SHA-256-128');
  // GCM ha integrità propria: la scelta HMAC non cambia il risultato
  assert.equal(calcVoip({ ipsec: 'tunnel', cipher: 'gcm', integrity: 'sha256' }).l3Bytes, 256);
});

test('per direzione e bidirezionale', () => {
  const one = calcVoip({ calls: 10 });
  const both = calcVoip({ calls: 10, bidirectional: true });
  close(one.kbpsPerCall, 87.2);
  close(both.kbpsPerCall, 174.4);
  close(both.kbpsTotal, 1744);
  assert.equal(both.pps, 100);
  assert.equal(both.wireBytes, 218, 'la dimensione del pacchetto non cambia');
  assert.equal(formatRate(both.kbpsTotal), '1,74 Mbps');
});

test('IPv6: +20 B rispetto a IPv4, overhead ricalcolato, payload invariato', () => {
  const v4 = calcVoip({ codec: 'g711', ptime: 20 });
  const v6 = calcVoip({ codec: 'g711', ptime: 20, ipVersion: 6 });
  assert.equal(v6.payload, v4.payload, 'il payload CBR non cambia');
  assert.equal(v6.payload, 160);
  assert.equal(v6.l3Bytes - v4.l3Bytes, 20);
  assert.equal(v6.wireBytes - v4.wireBytes, 20);
  assert.equal(v6.wireBytes, 238);
  close(v6.kbpsPerCall, 95.2);
  close(v4.overheadPct, (58 / 218) * 100);
  close(v6.overheadPct, (78 / 238) * 100);
  assert.equal(v6.layers.find((l) => l.id === 'ip').label, 'IPv6');
  assert.equal(v6.layers.find((l) => l.id === 'ip').bytes, 40);
  // G.729: stessa differenza di 20 B
  assert.equal(calcVoip({ codec: 'g729', ipVersion: 6 }).wireBytes - calcVoip({ codec: 'g729' }).wireBytes, 20);
});

test('IPv6 con GRE e IPsec: intestazioni esterne IPv4, transport conserva l’IP giusto', () => {
  // transport senza GRE: resta l'intestazione IPv6 (40 B); 220 − 40 = 180 + 2 → 184 (blocco 4)
  assert.equal(calcVoip({ ipVersion: 6, ipsec: 'transport', cipher: 'gcm' }).l3Bytes, 220 + 8 + 8 + (184 - 180) + 16);
  // con GRE resta l'IPv4 esterno (20 B): 244 − 20 = 224 + 2 → 228
  assert.equal(calcVoip({ ipVersion: 6, gre: true, ipsec: 'transport', cipher: 'gcm' }).l3Bytes, 244 + 8 + 8 + (228 - 224) + 16);
  // tunnel: nuovo IP esterno IPv4 da 20 B
  assert.match(calcVoip({ ipVersion: 6, ipsec: 'tunnel', cipher: 'cbc' }).layers.find((l) => l.id === 'ipsec').detail, /^IPv4 20 \+/);
  // IPv4 invariato rispetto a prima
  assert.equal(calcVoip({ gre: true, ipsec: 'transport', cipher: 'gcm' }).l3Bytes, 260);
});

test('VAD 0,6: banda media al 60%, pacchetto e picco invariati', () => {
  const off = calcVoip({ codec: 'g711', ptime: 20, calls: 10 });
  const vad = calcVoip({ codec: 'g711', ptime: 20, calls: 10, activity: 0.6 });
  assert.equal(vad.wireBytes, off.wireBytes, 'dimensione del pacchetto invariata');
  assert.equal(vad.payload, off.payload);
  close(vad.kbpsPerCall, 87.2, 'picco');
  close(vad.kbpsPerCallAvg, 87.2 * 0.6);
  close(vad.kbpsTotalAvg, 872 * 0.6);
  close(vad.kbpsPerCallAvg / vad.kbpsPerCall, 0.6);
  close(vad.ppsAvg, 30);
  close(vad.overheadPct, off.overheadPct, 'overhead percentuale invariato');
  // default: VAD disattivato, media = picco
  close(off.kbpsPerCallAvg, off.kbpsPerCall);
  assert.equal(off.activity, 1);
});

test('VAD e versione IP non validi', () => {
  for (const a of [0, -0.1, 1.01, NaN]) assert.equal(calcVoip({ activity: a }).field, 'activity', String(a));
  assert.equal(calcVoip({ activity: 1 }).ok, true);
  assert.equal(calcVoip({ ipVersion: 5 }).field, 'ip');
});

console.log('Parser SIP');

const issuesOf = (msg, level) => msg.issues.filter((i) => !level || i.level === level).map((i) => i.message);
const hasIssue = (msg, level, re) => assert.ok(issuesOf(msg, level).some((m) => re.test(m)), `atteso ${level} ${re}; trovati: ${JSON.stringify(issuesOf(msg))}`);

test('esempio INVITE: struttura, SDP e nessuna anomalia', () => {
  const m = parseSip(SIP_EXAMPLES.invite);
  assert.equal(m.kind, 'request');
  assert.equal(m.method, 'INVITE');
  assert.equal(m.uri, 'sip:bob@biloxi.example.com');
  assert.equal(m.headers.length, 12);
  assert.equal(m.get('CSeq'), '1 INVITE');
  assert.equal(m.contentLength, m.bodyBytes);
  assert.deepEqual(issuesOf(m), []);
  const media = m.sdp.media[0];
  assert.equal(media.port, 49170);
  assert.equal(media.effectiveConnection.address, '192.0.2.10');
  assert.equal(media.effectiveDirection, 'sendrecv');
  assert.equal(media.ptime, 20);
  assert.deepEqual(media.codecs.map((c) => c.name), ['PCMU', 'PCMA', 'G729', 'telephone-event']);
  assert.equal(media.codecs[2].fmtp, 'annexb=no');
});

test('esempi 200 OK e REGISTER senza anomalie', () => {
  const ok = parseSip(SIP_EXAMPLES.ok200);
  assert.equal(ok.kind, 'response');
  assert.equal(ok.status, 200);
  assert.equal(ok.reason, 'OK');
  assert.equal(ok.statusClass, 'Successo');
  assert.deepEqual(issuesOf(ok), []);
  const reg = parseSip(SIP_EXAMPLES.register);
  assert.equal(reg.method, 'REGISTER');
  assert.equal(reg.sdp, null);
  assert.deepEqual(issuesOf(reg), []);
});

test('esempio con anomalie: tutte rilevate', () => {
  const m = parseSip(SIP_EXAMPLES.anomalie);
  hasIssue(m, 'err', /Max-Forwards/);
  hasIssue(m, 'err', /CSeq \(BYE\).*\(INVITE\)/);
  hasIssue(m, 'warn', /Content-Length non corrisponde \(atteso 120, calcolato 133\)/);
  hasIssue(m, 'err', /dinamico 101 senza a=rtpmap/);
  hasIssue(m, 'warn', /branch senza il prefisso z9hG4bK/);
  hasIssue(m, 'warn', /From senza parametro tag/);
  hasIssue(m, 'info', /indirizzo media 192\.168\.1\.50 non pubblico/);
  hasIssue(m, 'info', /Contact con indirizzo 192\.168\.1\.50/);
  hasIssue(m, 'warn', /SAVP.*senza a=crypto/);
  hasIssue(m, 'info', /sendonly/);
  hasIssue(m, 'info', /porta RTP dispari/);
});

test('fine riga CRLF o LF danno lo stesso Content-Length', () => {
  const crlf = parseSip(SIP_EXAMPLES.invite.replace(/\n/g, '\r\n'));
  assert.deepEqual(issuesOf(crlf), []);
  assert.equal(crlf.bodyBytes, parseSip(SIP_EXAMPLES.invite).bodyBytes);
});

test('Content-Length corretto: verificato, nessun avviso', () => {
  const m = parseSip(SIP_EXAMPLES.invite);
  assert.deepEqual(m.contentLengthCheck, { status: 'verified', declared: 285, computed: 285 });
  assert.ok(!issuesOf(m).some((t) => /Content-Length/.test(t)));
  // anche senza corpo: Content-Length 0 è verificato
  assert.equal(parseSip(SIP_EXAMPLES.register).contentLengthCheck.status, 'verified');
});

test('Content-Length con mismatch reale: avviso arancio con atteso e calcolato', () => {
  const withCl = (n) => parseSip(SIP_EXAMPLES.invite.replace(/Content-Length: \d+/, `Content-Length: ${n}`));
  const clWarnings = (m) => m.issues.filter((i) => /^Content-Length non corrisponde/.test(i.message));
  const LINE_END = ' Potrebbe mancare un fine riga nel corpo originale (CRLF finale assente o LF al posto di CRLF).';
  const SHORT = ' Il corpo è più corto del dichiarato: un’ipotesi è che il messaggio sia troncato.';
  const cases = [
    // [dichiarato, testo atteso dell'avviso]
    [900, `Content-Length non corrisponde (atteso 900, calcolato 285).${SHORT}`],
    [286, `Content-Length non corrisponde (atteso 286, calcolato 285).${SHORT}`],
    [250, 'Content-Length non corrisponde (atteso 250, calcolato 285).'],
    // senza il solo CRLF finale: −2 byte, qualunque sia il numero di righe
    [283, `Content-Length non corrisponde (atteso 283, calcolato 285).${LINE_END}`],
    // LF al posto di CRLF: −14 byte, uno per ciascuna delle 14 righe del corpo
    [271, `Content-Length non corrisponde (atteso 271, calcolato 285).${LINE_END}`],
  ];
  for (const [declared, text] of cases) {
    const m = withCl(declared);
    const warns = clWarnings(m);
    assert.equal(warns.length, 1, `un solo avviso per ${declared}`);
    assert.equal(warns[0].level, 'warn', `livello arancio per ${declared}`);
    assert.equal(warns[0].message, text);
    assert.deepEqual(m.contentLengthCheck, { status: 'mismatch', declared, computed: 285 });
    assert.ok(!m.issues.some((i) => i.level === 'err' && /Content-Length/.test(i.message)), `nessun errore per ${declared}`);
  }
  // l'indizio sul fine riga non è legato ai 2 byte: un corpo di una sola riga
  const oneLine = parseSip('MESSAGE sip:a@x SIP/2.0\nVia: SIP/2.0/UDP 192.0.2.1;branch=z9hG4bK1\nMax-Forwards: 70\nFrom: <sip:b@x>;tag=1\nTo: <sip:a@x>\nCall-ID: 1\nCSeq: 1 MESSAGE\nContent-Type: text/plain\nContent-Length: 4\n\nciao');
  assert.equal(clWarnings(oneLine)[0].message, `Content-Length non corrisponde (atteso 4, calcolato 6).${LINE_END}`);
});

test('header compatti, continuazione su più righe e righe di log iniziali', () => {
  const m = parseSip([
    '12:00:01.123 Received from udp:192.0.2.1:5060',
    'OPTIONS sip:pbx.example.com SIP/2.0',
    'v: SIP/2.0/UDP 192.0.2.1:5060;branch=z9hG4bK1',
    'f: <sip:mon@example.com>;tag=1',
    't: <sip:pbx.example.com>',
    'i: abc@192.0.2.1',
    'CSeq: 7 OPTIONS',
    'Max-Forwards: 70',
    'Subject: prima riga',
    '  seconda riga',
    'l: 0',
  ].join('\n'));
  assert.equal(m.method, 'OPTIONS');
  assert.equal(m.get('Via'), 'SIP/2.0/UDP 192.0.2.1:5060;branch=z9hG4bK1');
  assert.equal(m.headers[0].compact, true);
  assert.equal(m.get('Subject'), 'prima riga seconda riga');
  assert.deepEqual(issuesOf(m, 'err'), []);
  assert.deepEqual(issuesOf(m, 'warn'), []);
  hasIssue(m, 'info', /Ignorate 1 righe/);
});

test('risposta senza To tag, codice non valido, testo non SIP', () => {
  const busy = parseSip(SIP_EXAMPLES.ok200.replace('200 OK', '486 Busy Here').replace(';tag=8321234356', '').split('\n\n')[0].replace(/Content-Length: \d+/, 'Content-Length: 0').replace(/Content-Type: .*\n/, ''));
  assert.equal(busy.statusClass, 'Errore del client');
  hasIssue(busy, 'warn', /486 con To senza tag/);
  hasIssue(parseSip('SIP/2.0 999 Strano\nVia: x'), 'err', /fuori dall'intervallo/);
  const junk = parseSip('ciao mondo');
  assert.equal(junk.ok, false);
  hasIssue(junk, 'err', /Start line non riconosciuta/);
  assert.equal(parseSip('  \n ').empty, true);
});

test('SDP: hold con 0.0.0.0, IPv6 ULA, righe obbligatorie mancanti', () => {
  const sdpMsg = (body) => parseSip(`INVITE sip:a@example.com SIP/2.0\nVia: SIP/2.0/UDP 192.0.2.1;branch=z9hG4bK1\nMax-Forwards: 70\nFrom: <sip:b@example.com>;tag=1\nTo: <sip:a@example.com>\nCall-ID: x\nCSeq: 1 INVITE\nContact: <sip:b@192.0.2.1>\nContent-Type: application/sdp\n\n${body}`);
  hasIssue(sdpMsg('v=0\no=- 1 1 IN IP4 192.0.2.1\ns=-\nc=IN IP4 0.0.0.0\nt=0 0\nm=audio 4000 RTP/AVP 0'), 'info', /hold/);
  hasIssue(sdpMsg('v=0\no=- 1 1 IN IP6 2001:db8::1\ns=-\nc=IN IP6 fd00::10\nt=0 0\nm=audio 4000 RTP/AVP 0'), 'info', /fd00::10 non pubblico \(unique local/);
  const missing = sdpMsg('v=0\nm=audio 4000 RTP/AVP 8');
  hasIssue(missing, 'err', /manca la riga obbligatoria o=/);
  hasIssue(missing, 'err', /nessuna riga c=/);
  hasIssue(missing, 'warn', /senza Content-Length/);
});

// Messaggio minimo e valido da variare nei test seguenti.
const sipMsg = ({ start = 'INVITE sip:a@example.com SIP/2.0', via = 'SIP/2.0/UDP 192.0.2.1:5060;branch=z9hG4bK1', to = '<sip:a@example.com>', cseq = '1 INVITE', contact = '<sip:b@192.0.2.1>', maxForwards = '70', body = '' } = {}) => parseSip([
  start, `Via: ${via}`, maxForwards == null ? null : `Max-Forwards: ${maxForwards}`, 'From: <sip:b@example.com>;tag=1', `To: ${to}`, 'Call-ID: x@example.com', `CSeq: ${cseq}`,
  contact == null ? null : `Contact: ${contact}`,
  body ? 'Content-Type: application/sdp' : null, `Content-Length: ${body ? body.split('\n').reduce((n, l) => n + l.length + 2, 0) : 0}`,
  '', body,
].filter((l) => l != null).join('\n'));
const sdpBody = (extra, { c = '192.0.2.1', port = 4000, proto = 'RTP/AVP' } = {}) => ['v=0', 'o=- 1 1 IN IP4 192.0.2.1', 's=-', `c=IN IP4 ${c}`, 't=0 0', `m=audio ${port} ${proto} 0`, ...extra].join('\n');

test('To tag: non richiesto nelle richieste iniziali', () => {
  for (const method of ['INVITE', 'OPTIONS', 'SUBSCRIBE', 'REGISTER', 'MESSAGE']) {
    const m = sipMsg({ start: `${method} sip:a@example.com SIP/2.0`, cseq: `1 ${method}` });
    assert.ok(!issuesOf(m).some((t) => /To senza tag|tag nel To/.test(t)), method);
  }
  // CANCEL riprende il To dell'INVITE originale, senza tag
  assert.ok(!issuesOf(sipMsg({ start: 'CANCEL sip:a@example.com SIP/2.0', cseq: '1 CANCEL' })).some((t) => /tag nel To/.test(t)));
});

test('To tag: richiesto nelle richieste in-dialog', () => {
  for (const method of ['BYE', 'ACK', 'PRACK', 'UPDATE', 'INFO']) {
    hasIssue(sipMsg({ start: `${method} sip:a@192.0.2.9 SIP/2.0`, cseq: `2 ${method}` }), 'warn', new RegExp(`${method} senza tag nel To`));
    const ok = sipMsg({ start: `${method} sip:a@192.0.2.9 SIP/2.0`, cseq: `2 ${method}`, to: '<sip:a@example.com>;tag=99' });
    assert.ok(!issuesOf(ok).some((t) => /tag nel To/.test(t)), method);
  }
});

test('NOTIFY senza To tag: azzurro, possibile NOTIFY unsolicited (MWI)', () => {
  const m = sipMsg({ start: 'NOTIFY sip:101@192.0.2.9 SIP/2.0', cseq: '1 NOTIFY' });
  hasIssue(m, 'info', /NOTIFY unsolicited \(MWI\)/);
  assert.ok(!issuesOf(m, 'warn').some((t) => /tag/.test(t)));
  assert.ok(!issuesOf(m, 'err').some((t) => /tag/.test(t)));
  const inDialog = sipMsg({ start: 'NOTIFY sip:101@192.0.2.9 SIP/2.0', cseq: '1 NOTIFY', to: '<sip:101@example.com>;tag=7' });
  assert.ok(!issuesOf(inDialog).some((t) => /NOTIFY senza tag/.test(t)));
});

test('rport confrontato con la porta del sent-by; 5060/5061 solo se assente', () => {
  const nat = (via) => sipMsg({ via }).nat.detected;
  assert.equal(nat('SIP/2.0/UDP 10.1.1.5:5070;branch=z9hG4bK1;rport=5070'), false, 'porta esplicita uguale');
  assert.equal(nat('SIP/2.0/UDP 10.1.1.5:5070;branch=z9hG4bK1;rport=5060'), true, '5060 ≠ porta esplicita 5070');
  assert.equal(nat('SIP/2.0/TLS 10.1.1.5:5070;branch=z9hG4bK1;rport=5061'), true, '5061 ≠ porta esplicita 5070');
  assert.equal(nat('SIP/2.0/UDP 10.1.1.5;branch=z9hG4bK1;rport=5060'), false, 'senza porta: default 5060');
  assert.equal(nat('SIP/2.0/UDP 10.1.1.5;branch=z9hG4bK1;rport=5061'), true, 'senza porta UDP: 5061 ≠ 5060');
  assert.equal(nat('SIP/2.0/TLS 10.1.1.5;branch=z9hG4bK1;rport=5060'), true, 'senza porta TLS: 5060 ≠ 5061');
  assert.equal(nat('SIP/2.0/UDP [2001:db8::5]:5080;branch=z9hG4bK1;rport=5080'), false, 'IPv6 con porta');
  assert.match(sipMsg({ via: 'SIP/2.0/UDP 10.1.1.5:5070;branch=z9hG4bK1;rport=40000' }).nat.evidence, /rport=40000 invece di 5070/);
});

test('To tag: risposte diverse da 100', () => {
  const resp = (code) => parseSip(`SIP/2.0 ${code}\nVia: SIP/2.0/UDP 192.0.2.1;branch=z9hG4bK1\nFrom: <sip:b@x>;tag=1\nTo: <sip:a@x>\nCall-ID: 1\nCSeq: 1 INVITE\nContent-Length: 0`);
  assert.ok(!issuesOf(resp('100 Trying')).some((t) => /To senza tag/.test(t)), '100 non segnala');
  for (const code of ['180 Ringing', '183 Session Progress', '200 OK', '404 Not Found', '503 Service Unavailable']) {
    hasIssue(resp(code), 'warn', /con To senza tag/);
  }
});

test('SAVP/SAVPF validi con a=crypto o con a=fingerprint (DTLS-SRTP)', () => {
  const noKeys = /senza a=crypto né a=fingerprint/;
  const crypto = 'a=crypto:1 AES_CM_128_HMAC_SHA1_80 inline:WVNfX19zZW1jdGwgKCkgewkyMjA7fQp9CnVubGVz';
  const fp = 'a=fingerprint:sha-256 4A:AD:B9:B1:3F:82:18:3B:54:02:12:DF:3E:5D:49:6B:19:E5:7C:AB:4A:AD:B9:B1:3F:82:18:3B:54:02:12:DF';
  for (const proto of ['RTP/SAVP', 'RTP/SAVPF', 'UDP/TLS/RTP/SAVPF']) {
    assert.ok(!issuesOf(sipMsg({ body: sdpBody([crypto], { proto }) })).some((t) => noKeys.test(t)), `${proto} + crypto`);
    assert.ok(!issuesOf(sipMsg({ body: sdpBody([fp, 'a=setup:actpass'], { proto }) })).some((t) => noKeys.test(t)), `${proto} + fingerprint di media`);
    hasIssue(sipMsg({ body: sdpBody([], { proto }) }), 'warn', noKeys);
  }
  // fingerprint a livello di sessione (prima di m=)
  const sessionFp = ['v=0', 'o=- 1 1 IN IP4 192.0.2.1', 's=-', 'c=IN IP4 192.0.2.1', 't=0 0', fp, 'm=audio 4000 UDP/TLS/RTP/SAVPF 0'].join('\n');
  const m = sipMsg({ body: sessionFp });
  assert.ok(!issuesOf(m).some((t) => noKeys.test(t)));
  assert.ok(m.sdp.media[0].effectiveFingerprint);
});

test('IP privati: azzurro senza NAT, arancio con received/rport nel Via', () => {
  const body = sdpBody([], { c: '10.1.1.5' });
  const plain = sipMsg({ via: 'SIP/2.0/UDP 10.1.1.5:5060;branch=z9hG4bK1', contact: '<sip:b@10.1.1.5>', body });
  hasIssue(plain, 'info', /indirizzo media 10\.1\.1\.5 non pubblico/);
  hasIssue(plain, 'info', /Contact con indirizzo 10\.1\.1\.5/);
  assert.deepEqual(issuesOf(plain, 'warn'), []);
  assert.equal(plain.nat.detected, false);

  const natted = sipMsg({ via: 'SIP/2.0/UDP 10.1.1.5:5060;branch=z9hG4bK1;received=203.0.113.7;rport=41234', contact: '<sip:b@10.1.1.5>', body });
  assert.equal(natted.nat.detected, true);
  hasIssue(natted, 'warn', /indirizzo media 10\.1\.1\.5 non pubblico.*received=203\.0\.113\.7/);
  hasIssue(natted, 'warn', /Contact con indirizzo 10\.1\.1\.5.*NAT rilevato/);

  // solo rport diverso dalla porta del sent-by
  assert.equal(sipMsg({ via: 'SIP/2.0/UDP 10.1.1.5:5060;branch=z9hG4bK1;rport=41234', body }).nat.detected, true);
  // received uguale al sent-by, rport uguale alla porta, received privato: nessun NAT
  assert.equal(sipMsg({ via: 'SIP/2.0/UDP 192.0.2.1:5060;branch=z9hG4bK1;received=192.0.2.1;rport=5060' }).nat.detected, false);
  assert.equal(sipMsg({ via: 'SIP/2.0/UDP 10.1.1.5:5060;branch=z9hG4bK1;received=10.9.9.9' }).nat.detected, false);
  // rport senza valore (richiesta del client) non indica NAT
  assert.equal(sipMsg({ via: 'SIP/2.0/UDP 10.1.1.5:5060;branch=z9hG4bK1;rport' }).nat.detected, false);
  // porta di default 5061 per TLS
  assert.equal(sipMsg({ via: 'SIP/2.0/TLS 10.1.1.5;branch=z9hG4bK1;rport=5061' }).nat.detected, false);
});

test('porte RTP dispari: azzurro, nessuna segnalazione con rtcp-mux', () => {
  hasIssue(sipMsg({ body: sdpBody([], { port: 4001 }) }), 'info', /porta RTP dispari \(4001\)/);
  assert.ok(!issuesOf(sipMsg({ body: sdpBody(['a=rtcp-mux'], { port: 4001 }) })).some((t) => /dispari/.test(t)));
  assert.ok(!issuesOf(sipMsg({ body: sdpBody([], { port: 4000 }) })).some((t) => /dispari/.test(t)));
  assert.ok(!issuesOf(sipMsg({ body: sdpBody([], { port: 4001 }) }), 'warn').some((t) => /dispari/.test(t)));
});

test('Max-Forwards obbligatorio nelle richieste, non nelle risposte', () => {
  for (const method of ['INVITE', 'BYE', 'OPTIONS', 'REGISTER']) {
    hasIssue(sipMsg({ start: `${method} sip:a@example.com SIP/2.0`, cseq: `1 ${method}`, maxForwards: null }), 'err', /Manca l'header obbligatorio Max-Forwards/);
  }
  assert.deepEqual(issuesOf(sipMsg(), 'err'), []);
  const resp = parseSip('SIP/2.0 200 OK\nVia: SIP/2.0/UDP 192.0.2.1;branch=z9hG4bK1\nFrom: <sip:b@x>;tag=1\nTo: <sip:a@x>;tag=2\nCall-ID: 1\nCSeq: 1 OPTIONS\nContent-Length: 0');
  assert.ok(!issuesOf(resp).some((t) => /Max-Forwards/.test(t)));
});

console.log('Parser SIP: header SBC/CUBE');

test('INVITE con PAI, Diversion, Session-Expires e SDP con telephone-event', () => {
  const m = parseSip(SIP_EXAMPLES.sbc);
  assert.deepEqual(issuesOf(m), []);
  assert.equal(hasSbcHeaders(m.sbc), true);
  assert.deepEqual(m.sbc.pai.map((e) => [e.display, e.uri]), [['Mario Rossi', 'sip:+390298765432@sbc.example.com'], [null, 'tel:+390298765432']]);
  assert.deepEqual(m.sbc.diversion, [{ index: 1, display: null, uri: 'sip:+390611111111@pbx.example.com', reason: 'no-answer', counter: '1', privacy: 'off' }]);
  assert.deepEqual(m.sbc.timer, { expires: 1800, refresher: 'uac', minSe: 90, supported: true, required: false });
  const te = m.sdp.media[0].telephoneEvent;
  assert.deepEqual(te, { pt: '101', rate: 8000, events: '0-15', description: 'cifre 0–9, *, #, A–D' });
});

test('History-Info con Reason incapsulato nella URI', () => {
  const hi = parseSip(SIP_EXAMPLES.sbc).sbc.historyInfo;
  assert.equal(hi.length, 2);
  assert.deepEqual(hi[0], { index: '1', uri: 'sip:+390611111111@pbx.example.com', reason: { protocol: 'SIP', cause: 408, text: 'Request Timeout', meaning: 'Request Timeout' }, tag: null });
  assert.equal(hi[1].index, '1.1');
  assert.equal(hi[1].tag, 'rc=1');
});

test('Reason Q.850 con nome della causa', () => {
  const m = parseSip(SIP_EXAMPLES.bye);
  assert.deepEqual(issuesOf(m), []);
  assert.deepEqual(m.sbc.reason, [{ protocol: 'Q.850', cause: 16, text: 'Normal call clearing', meaning: 'Normal call clearing' }]);
  assert.deepEqual(parseReason('Q.850;cause=17'), { protocol: 'Q.850', cause: 17, text: null, meaning: 'User busy' });
  assert.deepEqual(parseReason('SIP;cause=487;text="Request Terminated"').meaning, 'Request Terminated');
  // più Reason nello stesso header
  const two = parseSip(SIP_EXAMPLES.bye.replace('Reason: Q.850;cause=16;text="Normal call clearing"', 'Reason: SIP;cause=200;text="Call completed elsewhere", Q.850;cause=26'));
  assert.deepEqual(two.sbc.reason.map((r) => [r.protocol, r.cause]), [['SIP', 200], ['Q.850', 26]]);
});

test('session timer: refresher mancante in azzurro, Session-Expires < Min-SE in arancio', () => {
  const withTimer = (se, minSe) => parseSip(SIP_EXAMPLES.sbc
    .replace('Session-Expires: 1800;refresher=uac', `Session-Expires: ${se}`)
    .replace('Min-SE: 90\n', minSe == null ? '' : `Min-SE: ${minSe}\n`));
  const noRefresher = withTimer('1800', 90);
  hasIssue(noRefresher, 'info', /Session-Expires 1800 s senza refresher indicato: lo sceglierà lo UAS/);
  assert.deepEqual(issuesOf(noRefresher, 'warn'), []);
  const low = withTimer('60;refresher=uac', 120);
  hasIssue(low, 'warn', /Session-Expires 60 s inferiore a Min-SE 120 s: la controparte può rispondere 422/);
  const lowDefault = withTimer('80;refresher=uas', null);
  hasIssue(lowDefault, 'warn', /Session-Expires 80 s inferiore a Min-SE 90 s \(minimo predefinito RFC 4028\)/);
  hasIssue(withTimer('1800;refresher=caller', 90), 'warn', /refresher "caller" non valido/);
  assert.deepEqual(issuesOf(withTimer('90;refresher=uac', 90)), [], 'uguale al minimo: nessun avviso');
  // senza Session-Expires nessuna diagnostica sul timer
  assert.equal(parseSip(SIP_EXAMPLES.invite).sbc.timer, null);
  assert.equal(hasSbcHeaders(parseSip(SIP_EXAMPLES.invite).sbc), false);
});

const timerIssues = (m) => m.issues.filter((i) => /Session-Expires|refresher/.test(i.message));
const inviteWithTimer = (lines) => parseSip([
  'INVITE sip:a@example.com SIP/2.0', 'Via: SIP/2.0/UDP 192.0.2.1:5060;branch=z9hG4bK1', 'Max-Forwards: 70',
  'From: <sip:b@example.com>;tag=1', 'To: <sip:a@example.com>', 'Call-ID: t@example.com', 'CSeq: 1 INVITE',
  'Contact: <sip:b@192.0.2.1>', 'Supported: timer', ...lines, 'Content-Length: 0',
].join('\n'));

test('refresher: azzurro se assente in un INVITE, arancio solo se presente e diverso da uac/uas', () => {
  const absent = timerIssues(inviteWithTimer(['Session-Expires: 1800', 'Min-SE: 90']));
  assert.equal(absent.length, 1);
  assert.equal(absent[0].level, 'info');
  assert.equal(absent[0].message, 'Session-Expires 1800 s senza refresher indicato: lo sceglierà lo UAS nella risposta (RFC 4028).');
  for (const r of ['uac', 'uas', 'UAC']) {
    assert.deepEqual(timerIssues(inviteWithTimer([`Session-Expires: 1800;refresher=${r}`, 'Min-SE: 90'])), [], `refresher=${r}`);
  }
  for (const r of ['caller', 'callee', 'x']) {
    const issues = timerIssues(inviteWithTimer([`Session-Expires: 1800;refresher=${r}`, 'Min-SE: 90']));
    assert.equal(issues.length, 1, `refresher=${r}`);
    assert.equal(issues[0].level, 'warn');
    assert.equal(issues[0].message, `Session-Expires: refresher "${r}" non valido, ammessi uac o uas.`);
  }
});

test('Min-SE implicito 90 s: avviso solo se Session-Expires < 90', () => {
  assert.deepEqual(timerIssues(inviteWithTimer(['Session-Expires: 1800;refresher=uac'])), [], '1800 s senza Min-SE: nulla');
  assert.deepEqual(timerIssues(inviteWithTimer(['Session-Expires: 90;refresher=uac'])), [], '90 s senza Min-SE: nulla');
  const low = timerIssues(inviteWithTimer(['Session-Expires: 89;refresher=uac']));
  assert.equal(low.length, 1);
  assert.equal(low[0].level, 'warn');
  assert.equal(low[0].message, 'Session-Expires 89 s inferiore a Min-SE 90 s (minimo predefinito RFC 4028): la controparte può rispondere 422 Session Interval Too Small.');
  // con Min-SE esplicito vale quello, non il 90 implicito
  assert.deepEqual(timerIssues(inviteWithTimer(['Session-Expires: 60;refresher=uac', 'Min-SE: 30'])), []);
  assert.equal(timerIssues(inviteWithTimer(['Session-Expires: 600;refresher=uac', 'Min-SE: 1200']))[0].level, 'warn');
});

test('INVITE senza header SBC: nessun riquadro', () => {
  for (const key of ['invite', 'ok200', 'register', 'anomalie']) {
    const m = parseSip(SIP_EXAMPLES[key]);
    assert.equal(hasSbcHeaders(m.sbc), false, key);
    assert.deepEqual(m.sbc, { pai: [], ppi: [], diversion: [], historyInfo: [], reason: [], timer: null }, key);
  }
  assert.equal(hasSbcHeaders(parseSip(SIP_EXAMPLES.bye).sbc), true, 'il solo Reason basta a mostrarlo');
});

test('telephone-event senza fmtp in azzurro; eventi descritti', () => {
  const noFmtp = parseSip(SIP_EXAMPLES.sbc.replace('a=fmtp:101 0-15\n', ''));
  hasIssue(noFmtp, 'info', /telephone-event \(PT 101\) senza a=fmtp: per RFC 4733 si assumono gli eventi DTMF 0-15/);
  assert.equal(noFmtp.sdp.media[0].telephoneEvent.events, null);
  assert.ok(!issuesOf(parseSip(SIP_EXAMPLES.sbc)).some((t) => /telephone-event/.test(t)));
  assert.equal(describeEvents('0-16'), 'cifre 0–9, *, #, A–D, flash');
  assert.equal(describeEvents('0-11'), 'cifre 0–9, *, #');
  assert.equal(describeEvents('0-11,16'), 'cifre 0–9, *, #, flash');
  assert.equal(describeEvents('x'), null);
});

test('liste di header con virgole tra virgolette e name-addr', () => {
  assert.deepEqual(splitHeaderList('"Rossi, Mario" <sip:a@x>, <tel:+39>'), ['"Rossi, Mario" <sip:a@x>', '<tel:+39>']);
  assert.deepEqual(parseNameAddr('"Rossi, Mario" <sip:a@x;user=phone>;reason=busy'), { display: 'Rossi, Mario', uri: 'sip:a@x;user=phone', params: { reason: 'busy' } });
  assert.deepEqual(parseNameAddr('sip:b@y;counter=2'), { display: null, uri: 'sip:b@y', params: { counter: '2' } });
});

console.log('Codici SIP');

test('elenco completo, ordinato e senza duplicati', () => {
  const codes = SIP_CODES.map((c) => c.code);
  assert.equal(new Set(codes).size, codes.length);
  assert.deepEqual(codes, [...codes].sort((a, b) => a - b));
  assert.ok(codes.every((c) => c >= 100 && c <= 699));
  for (const c of [100, 180, 183, 200, 302, 401, 403, 404, 407, 408, 480, 481, 486, 487, 488, 491, 500, 502, 503, 504, 600, 603, 607, 608]) {
    assert.ok(codes.includes(c), `manca ${c}`);
  }
  assert.ok(SIP_CODES.every((c) => c.reason && c.rfc.startsWith('RFC ') && findCode(c.code).description.length > 20));
});

test('classi 1xx–6xx', () => {
  assert.deepEqual(codeClass(183), { digit: 1, label: 'Provvisoria' });
  assert.equal(codeClass(486).label, 'Errore del client');
  assert.equal(codeClass(603).label, 'Errore globale');
  const by = (d) => filterCodes({ classe: d }).map((c) => c.code);
  assert.ok(by(4).every((c) => c >= 400 && c < 500));
  assert.equal(filterCodes().length, SIP_CODES.length);
});

test('ricerca per codice e testo', () => {
  assert.deepEqual(filterCodes({ query: '486' }).map((c) => c.code), [486]);
  assert.ok(filterCodes({ query: 'busy' }).map((c) => c.code).includes(600));
  assert.equal(findCode(999), null);
  assert.equal(findCode('487').reason, 'Request Terminated');
});

test('mappatura SIP → Q.850 (RFC 3398)', () => {
  assert.deepEqual(q850For(486), { cause: 17, name: 'User busy' });
  assert.equal(q850For(404).cause, 1);
  assert.equal(q850For(408).cause, 102);
  assert.equal(q850For(480).cause, 18);
  assert.equal(q850For(503).cause, 41);
  assert.equal(q850For(603).cause, 21);
  assert.deepEqual(q850For(488), { byWarning: true });
  assert.equal(q850For(200), null);
  assert.equal(reasonHeader(486), 'Reason: Q.850;cause=17;text="User busy"');
  assert.equal(reasonHeader(488), null);
  for (const [code, cause] of Object.entries(SIP_TO_Q850)) {
    assert.ok(findCode(code), `codice ${code} non in elenco`);
    if (cause != null) assert.ok(Q850[cause], `causa ${cause} senza nome`);
  }
});

test('mappatura Q.850 → SIP (RFC 3398)', () => {
  const sipFor = (cause) => Q850_TO_SIP.find((r) => r.cause === cause).sip;
  assert.equal(sipFor(1), 404);
  assert.equal(sipFor(16), null);
  assert.equal(sipFor(17), 486);
  assert.equal(sipFor(18), 408);
  assert.equal(sipFor(34), 503);
  assert.equal(sipFor(102), 504);
  assert.equal(sipFor(127), 500);
  for (const r of Q850_TO_SIP) {
    assert.ok(Q850[r.cause], `causa ${r.cause} senza nome`);
    if (r.sip != null) assert.ok(findCode(r.sip), `risposta ${r.sip} non in elenco`);
  }
});

console.log('DSCP');

test('EF = 46 = 101110 = 0x2E, ToS 0xB8 (184), CoS 5', () => {
  const ef = dscpInfo(46);
  assert.equal(ef.name, 'EF');
  assert.equal(ef.bin, '101110');
  assert.equal(ef.hex, '0x2E');
  assert.equal(ef.tos, 184);
  assert.equal(ef.tosHex, '0xB8');
  assert.equal(ef.tosBin, '10111000');
  assert.equal(ef.precedence, 5);
  assert.equal(ef.precedenceName, 'Critical');
  assert.equal(ef.cos, 5);
  assert.equal(ef.af, null);
});

test('AF: classe e probabilità di scarto', () => {
  assert.deepEqual(dscpInfo(34).af, { cls: 4, drop: 1, dropName: 'bassa' });
  assert.deepEqual(dscpInfo(14).af, { cls: 1, drop: 3, dropName: 'alta' });
  assert.equal(dscpInfo(34).tosHex, '0x88');
  assert.equal(dscpInfo(26).tos, 104);
  assert.equal(dscpInfo(24).af, null, 'CS3 non è AF');
  assert.equal(dscpInfo(40).af, null, 'CS5 non è AF');
});

test('valori di riferimento della tabella', () => {
  const by = Object.fromEntries(TABLE_ROWS.map((r) => [r.name, r]));
  assert.equal(by.CS0.tos, 0);
  assert.equal(by.CS1.tosHex, '0x20');
  assert.equal(by.CS3.tos, 96);
  assert.equal(by.CS5.tosHex, '0xA0');
  assert.equal(by.CS6.tos, 192);
  assert.equal(by.CS7.tosHex, '0xE0');
  assert.equal(by.LE.dscp, 1);
  assert.equal(by['VOICE-ADMIT'].dscp, 44);
  assert.equal(by.AF41.cos, 4);
  const names = TABLE_ROWS.map((r) => r.name);
  for (const n of ['CS0', 'CS1', 'CS2', 'CS3', 'CS4', 'CS5', 'CS6', 'CS7', 'EF', 'AF11', 'AF12', 'AF13', 'AF21', 'AF22', 'AF23', 'AF31', 'AF32', 'AF33', 'AF41', 'AF42', 'AF43']) {
    assert.ok(names.includes(n), `manca ${n}`);
  }
  const dscps = TABLE_ROWS.map((r) => r.dscp);
  assert.equal(new Set(dscps).size, dscps.length);
  // il nome AFxy deve coincidere con classe e scarto calcolati
  for (const r of TABLE_ROWS.filter((x) => x.name.startsWith('AF'))) {
    assert.equal(r.name, `AF${r.af.cls}${r.af.drop}`);
  }
});

test('conversione da DSCP, ToS, precedenza e nome', () => {
  assert.deepEqual(parseValue('46'), { ok: true, dscp: 46, ecn: 0, from: 'dscp' });
  assert.equal(parseValue('0x2E').dscp, 46);
  assert.equal(parseValue('0b101110').dscp, 46);
  assert.equal(parseValue('101110b').dscp, 46);
  assert.deepEqual(parseValue('0xB8', 'tos'), { ok: true, dscp: 46, ecn: 0, from: 'tos' });
  assert.deepEqual(parseValue('185', 'tos'), { ok: true, dscp: 46, ecn: 1, from: 'tos' });
  assert.equal(dscpInfo(46, 3).ecnName, 'CE (congestione)');
  assert.equal(parseValue('5', 'prec').dscp, 40);
  assert.equal(parseValue('ef').dscp, 46);
  assert.equal(parseValue('AF 41').dscp, 34);
  assert.equal(parseValue('DF').dscp, 0);
  assert.equal(findPoint('be').dscp, 0);
});

test('valori non validi o non standard', () => {
  assert.equal(parseValue('64').ok, false);
  assert.equal(parseValue('256', 'tos').ok, false);
  assert.equal(parseValue('8', 'prec').ok, false);
  assert.equal(parseValue('XYZ').ok, false);
  assert.equal(parseValue('').ok, false);
  assert.equal(parseValue('2e').ok, false);
  assert.equal(dscpInfo(45).name, null);
});

console.log('MAC');

test('parsing di tutti i formati', () => {
  for (const text of ['0050.5612.ab34', '00:50:56:12:AB:34', '00-50-56-12-ab-34', '00505612ab34', ' 00 50 56 12 ab 34 ']) {
    assert.deepEqual(parseMac(text), { ok: true, hex: '00505612AB34', ouiOnly: false }, text);
  }
  assert.deepEqual(parseMac('00:50:56'), { ok: true, hex: '005056', ouiOnly: true });
  assert.equal(parseMac('0050.5612.ab3').ok, false);
  assert.equal(parseMac('0050.5612.ab3g').ok, false);
  assert.equal(parseMac('').ok, false);
});

test('formati Cisco, due punti, trattini, senza separatori, maiuscolo/minuscolo', () => {
  const hex = '00505612AB34';
  assert.equal(formatMac(hex, 'cisco', false), '0050.5612.ab34');
  assert.equal(formatMac(hex, 'cisco', true), '0050.5612.AB34');
  assert.equal(formatMac(hex, 'colon', false), '00:50:56:12:ab:34');
  assert.equal(formatMac(hex, 'dash', true), '00-50-56-12-AB-34');
  assert.equal(formatMac(hex, 'plain', false), '00505612ab34');
});

test('lookup produttore dal sottoinsieme OUI', () => {
  assert.ok(OUI_COUNT > 5000);
  assert.equal(lookupVendor('00000C000000'), 'Cisco');
  assert.equal(lookupVendor('005056000000'), 'VMware');
  assert.equal(lookupVendor('00155D000000'), 'Microsoft');
  assert.equal(lookupVendor('080027000000'), 'VirtualBox');
  assert.equal(lookupVendor('B827EB000000'), 'Raspberry Pi');
  assert.equal(lookupVendor('0004F2000000'), 'Polycom / Poly');
  assert.equal(lookupVendor('805EC0000000'), 'Yealink');
  assert.equal(lookupVendor('000B82000000'), 'Grandstream');
  assert.equal(lookupVendor('000413000000'), 'Snom');
  assert.equal(lookupVendor('001A1E000000'), 'HPE / Aruba');
  assert.equal(lookupVendor('123456000000'), null);
});

test('bit I/G e U/L, indirizzi locali senza produttore', () => {
  const uni = macInfo('00505612AB34');
  assert.equal(uni.multicast, false);
  assert.equal(uni.local, false);
  const rnd = macInfo('DAA119000001');
  assert.equal(rnd.local, true);
  assert.equal(rnd.randomized, true);
  assert.equal(rnd.vendor, null);
  const bc = macInfo('FFFFFFFFFFFF');
  assert.equal(bc.broadcast, true);
  assert.equal(bc.multicast, true);
  assert.equal(bc.special, 'Broadcast');
});

test('indirizzi speciali: HSRP, VRRP, GLBP, multicast, protocolli L2', () => {
  assert.equal(specialAddress('00000C07AC0A'), 'HSRP versione 1, gruppo 10');
  assert.equal(specialAddress('00000C9FF123'), 'HSRP versione 2, gruppo 291');
  assert.equal(specialAddress('00005E000105'), 'VRRP IPv4, gruppo 5');
  assert.equal(specialAddress('00005E000201'), 'VRRP IPv6, gruppo 1');
  assert.equal(specialAddress('0007B4000102'), 'GLBP, gruppo 1, forwarder 2');
  assert.match(specialAddress('01005E0000FB'), /224\.0\.0\.251/);
  assert.match(specialAddress('01005E7F0001'), /224\.127\.0\.1/);
  assert.equal(specialAddress('01005E800000'), null, 'oltre i 23 bit non è multicast IPv4');
  assert.match(specialAddress('333300000001'), /Multicast IPv6/);
  assert.match(specialAddress('0180C200000E'), /LLDP/);
  assert.match(specialAddress('0180C2000000'), /Spanning Tree/);
  assert.match(specialAddress('01000CCCCCCC'), /CDP/);
  assert.match(specialAddress('525400123456'), /QEMU/);
  assert.equal(specialAddress('00505612AB34'), null);
});

test('IPv6 link-local EUI-64', () => {
  // dall'input in formato con i due punti, come lo scriverebbe un utente
  assert.equal(eui64LinkLocal(parseMac('00:1A:2B:3C:4D:5E').hex), 'fe80::21a:2bff:fe3c:4d5e');
  assert.equal(macInfo(parseMac('00:1A:2B:3C:4D:5E').hex).eui64, 'fe80::21a:2bff:fe3c:4d5e');
  assert.equal(eui64LinkLocal('00505612AB34'), 'fe80::250:56ff:fe12:ab34');
  assert.equal(eui64LinkLocal('00000C07AC0A'), 'fe80::200:cff:fe07:ac0a');
  assert.equal(eui64LinkLocal('525400123456'), 'fe80::5054:ff:fe12:3456');
  assert.equal(macInfo('01005E0000FB').eui64, null, 'niente EUI-64 per multicast');
});

test('estrazione da testo libero (show mac address-table)', () => {
  const text = [
    'Vlan    Mac Address       Type        Ports',
    '  10    0050.5612.ab34    DYNAMIC     Gi1/0/1',
    '  20    00:0b:82:aa:bb:cc DYNAMIC     Gi1/0/2',
    '  30    80-5E-C0-12-34-56 STATIC      Gi1/0/3',
    'serial 1234567890123 e hash 00505612ab34f non sono MAC',
  ].join('\n');
  assert.deepEqual(extractMacs(text).map((m) => m.hex), ['00505612AB34', '000B82AABBCC', '805EC0123456']);
});

console.log('dBm / mW / EIRP');

const near = (actual, expected, tol, msg = '') => assert.ok(Math.abs(actual - expected) <= tol, `${msg} atteso ${expected} ± ${tol}, ottenuto ${actual}`);

test('dBm → mW: 0 dBm = 1 mW, 20 dBm = 100 mW, 30 dBm = 1 W', () => {
  near(dbmToMw(0), 1, 1e-12);
  near(dbmToMw(20), 100, 1e-9);
  near(dbmToMw(30), 1000, 1e-9);
  near(dbmToMw(-30), 0.001, 1e-15);
  near(dbmToMw(3), 1.99526, 1e-5);
});

test('mW → dBm e casi limite', () => {
  near(mwToDbm(1), 0, 1e-12);
  near(mwToDbm(100), 20, 1e-12);
  near(mwToDbm(1000), 30, 1e-12);
  near(mwToDbm(0.5), -3.0103, 1e-4);
  assert.equal(mwToDbm(0), null);
  assert.equal(mwToDbm(-1), null);
  for (const x of [-90, -67, 0, 13.5, 36]) near(mwToDbm(dbmToMw(x)), x, 1e-9, `andata e ritorno ${x}`);
});

test('EIRP = Tx − perdita cavo + guadagno antenna', () => {
  assert.equal(eirp(17, 1, 4), 20);
  assert.equal(eirp(20, 0, 0), 20);
  assert.equal(eirp(10, 3, 6), 13);
});

test('FSPL: 2400 MHz a 1 km ≈ 100 dB', () => {
  near(fspl(1, 2400), 100.04, 0.01);
  near(fspl(0.1, 5500), 87.25, 0.01);
  near(fspl(2, 2400) - fspl(1, 2400), 6.02, 0.01, 'distanza doppia = +6 dB');
  assert.equal(fspl(0, 2400), null);
  assert.equal(fspl(1, 0), null);
});

test('budget di collegamento, margine sull’RSSI di progetto e distanza massima', () => {
  const lb = linkBudget({ eirpDbm: 20, distanceKm: 1, freqMHz: 2400, rxGainDbi: 2, rxLossDb: 1, targetRssiDbm: -67 });
  near(lb.fspl, 100.04, 0.01);
  near(lb.rxDbm, 20 - 100.044 + 2 - 1, 0.001);
  near(lb.margin, lb.rxDbm + 67, 1e-9);
  // alla distanza massima la potenza ricevuta coincide con l'RSSI di progetto
  const atMax = linkBudget({ eirpDbm: 20, distanceKm: lb.maxDistanceKm, freqMHz: 2400, rxGainDbi: 2, rxLossDb: 1, targetRssiDbm: -67 });
  near(atMax.margin, 0, 1e-9);
  const noSens = linkBudget({ eirpDbm: 20, distanceKm: 1, freqMHz: 2400 });
  assert.equal(noSens.margin, null);
  assert.equal(noSens.maxDistanceKm, null);
});

test('limiti EIRP indicativi per banda', () => {
  assert.equal(bandCheck(20, '2g4').ok, true);
  assert.equal(bandCheck(20.5, '2g4').ok, false);
  near(bandCheck(23, '2g4').excess, 3, 1e-12);
  assert.equal(bandCheck(30, 'unii2c').ok, true, 'U-NII-2C con TPC e DFS: 30 dBm');
  assert.equal(bandCheck(30, 'unii2c-notpc').ok, false, 'U-NII-2C senza TPC: 27 dBm');
  assert.equal(bandCheck(27, 'unii2c-notpc').ok, true);
  assert.equal(bandCheck(23, 'unii2a').ok, true);
  assert.equal(bandCheck(23, 'unii2a-notpc').ok, false, 'U-NII-2A senza TPC: 20 dBm');
  assert.equal(bandCheck(23, 'unii1').band.label.includes('indoor'), true);
  assert.match(bandCheck(14, 'srd58').band.note, /non è una banda Wi-Fi U-NII europea/i);
  assert.equal(bandCheck(23, 'lpi6').ok, true);
  assert.equal(bandCheck(15, 'vlp6').ok, false);
  assert.equal(bandCheck(20, ''), null);
});

test('input numerici e formattazione', () => {
  assert.equal(parseNumber('20,5'), 20.5);
  assert.equal(parseNumber('-67'), -67);
  assert.equal(parseNumber('1e-3'), 0.001);
  assert.equal(parseNumber('abc'), null);
  assert.equal(parseNumber(''), null);
  assert.equal(formatPower(1000), '1 W');
  assert.equal(formatPower(100), '100 mW');
  assert.equal(formatPower(0.001), '1 µW');
  assert.equal(formatPower(dbmToMw(-67)), '199,526 pW');
  assert.equal(formatDistance(0.05), '50 m');
  assert.equal(formatDistance(1.5), '1,5 km');
});

console.log('MOS (E-model)');

test('G.711 in condizioni ideali: R ≈ 93, MOS ≈ 4,4', () => {
  const m = emodel({ codec: 'g711', delayMs: 20, lossPct: 0 });
  near(m.r, 92.72, 0.01);
  near(m.mos, 4.40, 0.01);
  assert.equal(m.category.label, 'Eccellente');
  near(emodel({ codec: 'g711', delayMs: 0, lossPct: 0 }).r, R0, 1e-12);
});

test('formula MOS e limiti', () => {
  near(rToMos(R0), 4.41, 0.005);
  near(rToMos(50), 2.58, 0.005);
  assert.equal(rToMos(0), 1);
  assert.equal(rToMos(-10), 1);
  assert.equal(rToMos(100), 4.5);
  assert.equal(rToMos(120), 4.5);
});

test('perdita: Ie,eff = Ie + (95 − Ie)·Ppl/(Ppl + Bpl)', () => {
  near(effectiveIe(11, 19, 1), 11 + 84 / 20, 1e-12);
  near(effectiveIe(0, 25.1, 0), 0, 1e-12);
  near(effectiveIe(0, 25.1, 5), 95 * 5 / 30.1, 1e-12);
});

test('G.729A con 1% di perdita: MOS inferiore a G.711', () => {
  const g711 = emodel({ codec: 'g711', delayMs: 100, lossPct: 1 });
  const g729 = emodel({ codec: 'g729a', delayMs: 100, lossPct: 1 });
  near(g729.ieEff, 15.2, 1e-9);
  assert.ok(g729.mos < g711.mos);
  assert.ok(g729.mos < emodel({ codec: 'g729a', delayMs: 100, lossPct: 0 }).mos);
  near(g729.r, 93.2 - 2.4 - 15.2, 1e-9);
});

test('ritardo: Id e soglia G.114 a 150 ms', () => {
  near(delayImpairment(100), 2.4, 1e-12);
  near(delayImpairment(177.3), 4.2552, 1e-9);
  near(delayImpairment(300), 0.024 * 300 + 0.11 * 122.7, 1e-9);
  assert.equal(emodel({ delayMs: 150 }).overG114, false);
  assert.equal(emodel({ delayMs: 151 }).overG114, true);
  assert.equal(oneWayDelay({ network: 40, jitterBuffer: 40, packetization: 20 }), 100);
});

test('basso ritardo: il termine oltre 177,3 ms è zero, mai negativo', () => {
  // con d ≤ 177,3 ms resta solo 0,024·d
  assert.equal(delayImpairment(100), 0.024 * 100);
  assert.equal(delayImpairment(177.3), 0.024 * 177.3);
  for (const d of [0, 1, 50, 100, 150, 177]) assert.equal(delayImpairment(d), 0.024 * d, `${d} ms`);
  const m = emodel({ codec: 'g711', delayMs: 100, lossPct: 0 });
  near(m.id, 2.4, 1e-12);
  near(m.r, 90.8, 1e-9);
  near(m.mos, 4.36, 0.005);
  // oltre la soglia il termine aggiuntivo cresce in modo continuo da zero
  near(delayImpairment(177.4) - 0.024 * 177.4, 0.11 * 0.1, 1e-9);
});

test('G.711 0% a 150 ms: R ≈ 89,6, MOS ≈ 4,33', () => {
  const m = emodel({ codec: 'g711', delayMs: 150, lossPct: 0 });
  near(m.id, 3.6, 1e-12);
  near(m.r, 89.6, 1e-9);
  near(m.mos, 4.33, 0.005);
  assert.equal(m.category.label, 'Buono');
  assert.equal(m.overG114, false);
});

test('fattore A, categorie G.109 e codec stimati', () => {
  near(emodel({ delayMs: 400, lossPct: 3, advantage: 20 }).r - emodel({ delayMs: 400, lossPct: 3 }).r, 20, 1e-9);
  assert.equal(category(95).label, 'Eccellente');
  assert.equal(category(85).label, 'Buono');
  assert.equal(category(75).label, 'Discreto');
  assert.equal(category(65).label, 'Scarso');
  assert.equal(category(40).label, 'Pessimo');
  assert.equal(emodel({ codec: 'opus', bitrate: 16 }).ie, 6);
  assert.equal(emodel({ codec: 'opus', bitrate: 16 }).codec.estimate, true);
  assert.equal(emodel({ codec: 'g7231' }).ie, 15);
});

test('input non validi', () => {
  assert.equal(emodel({ codec: 'gsm' }).ok, false);
  assert.equal(emodel({ delayMs: -1 }).field, 'delay');
  assert.equal(emodel({ lossPct: 101 }).field, 'loss');
});

console.log('Pattern CUCM');

test('9.[2-9]XXXXXXXXX con PreDot su 94085551234 → 4085551234', () => {
  const r = testPattern({ pattern: '9.[2-9]XXXXXXXXX', dialed: '94085551234', discard: 'predot' });
  assert.equal(r.match, true);
  assert.equal(r.preDot, '9');
  assert.equal(r.result, '4085551234');
  assert.equal(r.steps[0].rule, 'Discard Digits: PreDot');
});

test('914085551234 non combacia con 9.[2-9]XXXXXXXXX; serve 91.[2-9]XXXXXXXXX', () => {
  const no = testPattern({ pattern: '9.[2-9]XXXXXXXXX', dialed: '914085551234', discard: 'predot' });
  assert.equal(no.match, false);
  assert.equal(no.partial, false);
  assert.match(no.reason, /posizione 2 la cifra "1" non è ammessa da \[2-9\]/);
  const yes = testPattern({ pattern: '91.[2-9]XXXXXXXXX', dialed: '914085551234', discard: 'predot' });
  assert.equal(yes.result, '4085551234');
});

test('non-match: parziale (servono cifre), troppo lungo, cifra esclusa', () => {
  const partial = testPattern({ pattern: '9.[2-9]XXXXXXXXX', dialed: '9408555123' });
  assert.equal(partial.match, false);
  assert.equal(partial.partial, true);
  const long = testPattern({ pattern: '9.[2-9]XXXXXXXXX', dialed: '940855512345' });
  assert.equal(long.match, false);
  assert.equal(long.partial, false);
  assert.match(long.reason, /più lungo del pattern/);
  assert.equal(testPattern({ pattern: '[^0]XX', dialed: '055' }).match, false);
  assert.equal(testPattern({ pattern: '[^0]XX', dialed: '155' }).match, true);
});

test('maschera di trasformazione allineata a destra', () => {
  assert.equal(applyMask('5551234', '408XXXXXXX'), '4085551234');
  assert.equal(applyMask('5551234', 'XXXX'), '1234');
  assert.equal(applyMask('4123', '+390612XXXX'), '+3906124123');
  assert.equal(applyMask('12', 'XXXX'), '12');
  assert.equal(applyMask('1234', ''), '1234');
  const r = testPattern({ pattern: '4XXX', dialed: '4123', mask: '+390612XXXX' });
  assert.equal(r.result, '+3906124123');
});

test('ordine: discard, strip, maschera, prefisso', () => {
  const r = testPattern({ pattern: '0.XXXXXXX', dialed: '05551234', discard: 'predot', strip: 1, mask: '9XXXXXX', prefix: '00' });
  assert.deepEqual(r.steps.map((s) => s.after), ['5551234', '551234', '9551234', '009551234']);
  assert.equal(r.result, '009551234');
  const s = testPattern({ pattern: '\\+39!', dialed: '+390612345678', strip: 3 });
  assert.equal(s.result, '0612345678');
});

test('9.!# con PreDot Trailing-#', () => {
  const r = testPattern({ pattern: '9.!#', dialed: '900390612345678#', discard: 'predot-trailing' });
  assert.equal(r.match, true);
  assert.equal(r.result, '00390612345678');
  assert.equal(r.variable, true);
  assert.equal(r.count, null);
  assert.equal(testPattern({ pattern: '9.!#', dialed: '9123', discard: 'predot-trailing' }).partial, true, 'manca il #');
});

test('quantificatori ? e +, \\+ letterale', () => {
  assert.equal(testPattern({ pattern: '5X?', dialed: '5' }).match, true);
  assert.equal(testPattern({ pattern: '5X?', dialed: '5123' }).match, true);
  assert.equal(testPattern({ pattern: '5X+', dialed: '5' }).match, false);
  assert.equal(testPattern({ pattern: '1+', dialed: '111' }).match, true);
  assert.equal(testPattern({ pattern: '\\+1!', dialed: '+1408' }).match, true);
  assert.equal(testPattern({ pattern: '\\+1!', dialed: '1408' }).match, false);
  assert.equal(testPattern({ pattern: '*67XXXX', dialed: '*671234' }).match, true);
});

test('numeri coperti dal pattern', () => {
  assert.equal(patternCount(parsePattern('9.[2-9]XXXXXXXXX').tokens), 8000000000n);
  assert.equal(patternCount(parsePattern('4XXX').tokens), 1000n);
  assert.equal(patternCount(parsePattern('[^0]XX').tokens), 900n);
  assert.equal(patternCount(parsePattern('9.!').tokens), null);
});

test('pattern non validi e macro @ non supportata', () => {
  const at = testPattern({ pattern: '9.@', dialed: '914085551234' });
  assert.equal(at.ok, false);
  assert.equal(at.unsupported, true);
  assert.equal(parsePattern('9..XX').ok, false);
  assert.equal(parsePattern('[2-9XX').ok, false);
  assert.equal(parsePattern('[9-2]').ok, false);
  assert.equal(parsePattern('ABC').ok, false);
  assert.equal(parsePattern('?1').ok, false);
  assert.equal(testPattern({ pattern: 'XXXX', dialed: '1234', discard: 'predot' }).field, 'discard');
  assert.equal(testPattern({ pattern: 'XXXX', dialed: '12a4' }).field, 'dialed');
  assert.equal(testPattern({ pattern: 'XXXX', dialed: '1234', mask: '12Y' }).field, 'mask');
});

console.log('Lingue (IT / EN)');

const { MESSAGES, LANGS, setLang, getLang, t: tr, tn: trn, resolveLang } = await import('../js/i18n.js');

// Parole tipicamente italiane che non devono comparire nei testi inglesi.
// Escluse quelle ambigue in inglese (per, come, solo, …).
const ITALIAN = /(?:^|[^\p{L}])(il|lo|gli|della|delle|dei|degli|dello|nel|nella|nelle|dal|dalla|con|una|uno|sono|che|questo|questa|anche|senza|oppure|ogni|più|già|perché|cifre|cifra|numero|valore|errore|avviso|indirizzo|sottorete|sottoreti|chiamata|chiamate|banda|perdita|ritardo|rete|campo|pagina|righe|riga|esempi|esempio|codici|codice|tabella|corrisponde|verificato|stima|sviluppo|lingua|visite|gruppo|porta|valido|obbligatorio|presente|assente|prefisso|maschera|inserisci|nessun|nessuna|nessuno|manca|deve|può|essere|tra|fra|sul|sulla|non è)(?=$|[^\p{L}])|[àèìòù]/iu;
const italianIn = (text) => (ITALIAN.exec(String(text)) || [null])[0];
const placeholders = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test('ogni chiave esiste in italiano e in inglese, senza stringhe vuote', () => {
  assert.deepEqual(LANGS, ['it', 'en']);
  const itKeys = Object.keys(MESSAGES.it).sort();
  const enKeys = Object.keys(MESSAGES.en).sort();
  assert.ok(itKeys.length > 500, `chiavi: ${itKeys.length}`);
  assert.deepEqual(enKeys, itKeys, 'chiavi orfane o lingua mancante');
  for (const key of itKeys) {
    for (const lang of LANGS) {
      const v = MESSAGES[lang][key];
      assert.equal(typeof v, 'string', `${lang}.${key} non è una stringa`);
      assert.ok(v.length > 0, `${lang}.${key} vuota`);
    }
  }
});

test('stessi segnaposto {…} nelle due lingue', () => {
  for (const key of Object.keys(MESSAGES.it)) {
    assert.deepEqual(placeholders(MESSAGES.en[key]), placeholders(MESSAGES.it[key]), key);
  }
});

test('nessun testo italiano nelle traduzioni inglesi', () => {
  const offenders = Object.entries(MESSAGES.en).filter(([, v]) => italianIn(v)).map(([k, v]) => `${k}: "${italianIn(v)}" in ${v}`);
  assert.deepEqual(offenders, []);
});

test('lingua iniziale: URL > preferenza salvata > italiano', () => {
  assert.equal(resolveLang('en', 'it'), 'en');
  assert.equal(resolveLang(null, 'en'), 'en');
  assert.equal(resolveLang('xx', 'yy'), 'it');
  assert.equal(resolveLang(null, null), 'it');
});

test('in inglese i messaggi degli strumenti non contengono italiano', () => {
  setLang('en');
  try {
    assert.equal(getLang(), 'en');
    const outputs = [];
    const collect = (x) => {
      if (x == null) return;
      if (typeof x === 'string') outputs.push(x);
      else if (Array.isArray(x)) x.forEach(collect);
      else if (typeof x === 'object') for (const k of ['error', 'reason', 'message', 'label', 'meaning', 'detail', 'rule', 'note', 'statusClass', 'type', 'class', 'special', 'dropName', 'ecnName', 'description']) collect(x[k]);
    };
    // subnet
    for (const [a, m] of [['', ''], ['300.1.1.1/24', ''], ['10.0.0.0', ''], ['10.0.0.0/40', ''], ['10.0.0.0', '255.0.255.0'], ['2001:db8::', '255.0.0.0'], ['zz::1/64', ''], ['192.168.1.0/24', ''], ['10.1.1.1/31', ''], ['8.8.8.8/32', ''], ['240.0.0.1/4', ''], ['2001:db8::/32', ''], ['fe80::1/64', ''], ['::/128', '']]) {
      const r = calc(a, m);
      collect(r);
      if (r.ok) collect(subnet.resultAsText(r));
    }
    const base = calc('192.168.10.0/26');
    for (const [mode, v] of [['prefix', 'x'], ['prefix', '26'], ['prefix', '40'], ['hosts', '500'], ['count', '0'], ['nope', '1']]) collect(subdivide(base, mode, v));
    collect(subdivide(calc('2001:db8::/16'), 'prefix', '64'));
    collect(splitPlan(5000).notes);
    collect(splitPlan(100000).notes);
    collect(subnetsCsv(subdivide(calc('10.0.0.0/8'), 'prefix', '30'), 4));
    collect(subnetsCsv(subdivide(calc('10.0.0.0/24'), 'prefix', '26'), 4).text);
    // VoIP
    for (const o of [{ codec: 'x' }, { codec: 'opus', bitrate: 1 }, { ptime: 7 }, { calls: 0 }, { ipVersion: 5 }, { activity: 2 }, { srtp: 'x' }, { ipsec: 'x' }, { ipsec: 'tunnel', srtp: 'sha1-80', gre: true, natt: true, dot1q: true, preamble: true }, { ipsec: 'transport', cipher: 'gcm', codec: 'opus', bitrate: 24 }]) {
      const r = calcVoip(o);
      collect(r);
      if (r.ok) collect(r.layers);
    }
    // SIP: esempi e messaggi costruiti per far scattare ogni anomalia
    const anomalous = [
      ...Object.values(SIP_EXAMPLES),
      'garbage line\nfoo SIP/2.0',
      'hello',
      'log line\nInvite sip:a@x SIP/3.0\nVia: bogus\nVia: SIP/2.0/UDP 10.0.0.1:5060\nCSeq: x\nCSeq: 1 BYE\nMax-Forwards: abc\nFrom: a\nTo: b\nTo: c\nCall-ID: 1\nContact: <sip:a@10.0.0.1>\nEmpty:\nnocolon\nContent-Type: text/plain\nContent-Length: zz\n\nv=0',
      'FOO a@x SIP/2.0\nVia: SIP/2.0/UDP 10.0.0.1:5060;branch=z9hG4bK1;received=203.0.113.9;rport=4000\nMax-Forwards: 0\nFrom: <sip:a@x>\nTo: <sip:b@x>\nCall-ID: 1\nCSeq: 99999999999 FOO\nSession-Expires: abc\nContent-Length: 500\n\nv=1\nbad line\nm=audio 4001 RTP/SAVP 0 96 50\na=rtpmap:97 PCMU/8000\na=rtpmap:x\na=crypto:1 x\na=inactive',
      'BYE sip:a@x SIP/2.0\nVia: SIP/2.0/UDP 192.0.2.1;branch=z9hG4bK1\nMax-Forwards: 70\nFrom: <sip:a@x>;tag=1\nTo: <sip:b@x>\nCall-ID: 1\nCSeq: 2 BYE\nSession-Expires: 60;refresher=foo\nMin-SE: 90\nContent-Type: application/sdp\nContent-Length: 0',
      'NOTIFY sip:a@x SIP/2.0\nVia: SIP/2.0/UDP 192.0.2.1;branch=z9hG4bK1\nMax-Forwards: 70\nFrom: <sip:a@x>;tag=1\nTo: <sip:b@x>\nCall-ID: 1\nCSeq: 2 NOTIFY\nSession-Expires: 1800\nContent-Type: text/plain\nContent-Length: 1\n\nv=0\no=- 1 1 IN IP4 0.0.0.0\ns=-\nt=0 0\nc=IN IP4 0.0.0.0\nm=audio 0 RTP/AVP 0',
      'SIP/2.0 999 Odd\nVia: SIP/2.0/UDP 10.1.1.1;branch=z9hG4bK1\nFrom: <sip:a@x>;tag=1\nTo: <sip:b@x>\nCall-ID: 1\nCSeq: 1 INVITE\nContent-Type: application/sdp\nContent-Length: 10\n\nv=0\no=- 1 1 IN IP6 fd00::1\ns=-\nt=0 0\nm=audio 4000 RTP/AVP 0 101\nc=IN IP6 fd00::2\na=rtpmap:101 telephone-event/8000\na=sendonly',
      'INVITE sip:a@x SIP/2.0\nVia: SIP/2.0/UDP 192.0.2.1;branch=z9hG4bK1\nMax-Forwards: 70\nFrom: <sip:a@x>;tag=1\nTo: <sip:b@x>\nCall-ID: 1\nCSeq: 1 INVITE\nContact: <sip:a@192.0.2.1>\nContent-Length: 0',
    ];
    for (const text of anomalous) {
      const m = parseSip(text);
      collect(m.issues.map((i) => i.message));
      collect(m.statusClass);
      if (m.sdp) collect(m.sdp.media.map((x) => x.telephoneEvent?.description));
      if (m.sbc) collect(m.sbc.reason.map((x) => x.meaning));
    }
    collect(describeEvents('0-16'));
    // codici SIP, DSCP, MAC, MOS, CUCM, RF
    collect(filterCodes().map((c) => [c.description, c.label]));
    for (const v of [['', 'dscp'], ['XYZ', 'dscp'], ['zz', 'dscp'], ['300', 'tos'], ['9', 'prec'], ['70', 'dscp'], ['0xB9', 'tos'], ['45', 'dscp']]) {
      const p = parseValue(...v);
      collect(p);
      if (p.ok) collect(dscpInfo(p.dscp, p.ecn));
    }
    collect(dscpInfo(34));
    for (const v of ['', '00:5', 'zz:zz:zz:zz:zz:zz']) collect(parseMac(v));
    for (const hex of ['FFFFFFFFFFFF', '01005E0000FB', '333300000001', '00005E000105', '00005E000201', '00000C07AC0A', '00000C9FF123', '0007B4000102', '525400123456', '0180C200000E']) collect(specialAddress(hex));
    for (const o of [{ codec: 'x' }, { delayMs: -1 }, { lossPct: 200 }, { codec: 'opus', bitrate: 16, delayMs: 500, lossPct: 3 }, { codec: 'g722' }]) collect(emodel(o));
    for (const r of [95, 85, 75, 65, 30]) collect(category(r).label);
    for (const o of [
      { pattern: '' }, { pattern: '9.@' }, { pattern: '9\\x' }, { pattern: '9..X' }, { pattern: '[2-9' }, { pattern: '[]' }, { pattern: '[a]' }, { pattern: '[9-2]' }, { pattern: '[^0-9]' }, { pattern: '?' }, { pattern: 'Q' }, { pattern: '.' },
      { pattern: 'XXXX', dialed: '' }, { pattern: 'XXXX', dialed: 'ab' }, { pattern: 'XXXX', dialed: '1234', mask: 'Q' }, { pattern: 'XXXX', dialed: '1234', prefix: 'Q' }, { pattern: 'XXXX', dialed: '1234', strip: -1 }, { pattern: 'XXXX', dialed: '1234', discard: 'predot' },
      { pattern: '9.[2-9]XXXXXXXXX', dialed: '914085551234' }, { pattern: '9.[2-9]XXXXXXXXX', dialed: '9408' }, { pattern: 'XX', dialed: '1' }, { pattern: 'XX', dialed: '123' },
      { pattern: '9.!#', dialed: '9123#', discard: 'predot-trailing', strip: 1, mask: '0XXX', prefix: '00' }, { pattern: '5X?', dialed: '5' }, { pattern: '1+', dialed: '11', discard: 'trailing' },
    ]) {
      const r = testPattern(o);
      collect(r);
      if (r.tokens) collect(r.tokens.map((x) => x.meaning));
      if (r.steps) collect(r.steps);
    }
    for (const b of ['2g4', 'unii1', 'unii2a', 'unii2a-notpc', 'unii2c', 'unii2c-notpc', 'srd58', 'lpi6', 'vlp6']) collect(bandCheck(25, b).band);
    collect(trn('sip.countErr', 1));
    collect(tr('app.visits', { n: 3 }));

    assert.ok(outputs.length > 300, `uscite controllate: ${outputs.length}`);
    const offenders = [...new Set(outputs.filter((o) => italianIn(o)).map((o) => `"${italianIn(o)}" in ${o}`))];
    assert.deepEqual(offenders, []);
    // controllo a campione che la lingua sia davvero cambiata
    assert.equal(calc('').error, 'Enter an IP address.');
    assert.equal(parseSip(SIP_EXAMPLES.anomalie).issues[0].message, 'The mandatory Max-Forwards header is missing.');
    assert.equal(formatRate(87.2), '87.2 kbps');
  } finally {
    setLang('it');
  }
  assert.equal(calc('').error, 'Inserisci un indirizzo IP.', 'ritorno all’italiano');
});

console.log(`\n${passed} superati, ${failed} falliti`);
process.exit(failed ? 1 : 0);
