// Test dei calcoli: node tests/run.mjs (Node 18+, nessuna dipendenza).

import assert from 'node:assert/strict';
import * as subnet from '../js/tools/subnet.js';

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

console.log(`\n${passed} superati, ${failed} falliti`);
process.exit(failed ? 1 : 0);
