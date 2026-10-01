// Genera data/oui.js: un sottoinsieme del registro IEEE MA-L (OUI a 24 bit)
// limitato ai produttori più comuni in reti aziendali e VoIP.
//
// Uso: scarica https://standards-oui.ieee.org/oui/oui.csv e poi
//   node scripts/build-oui.mjs percorso/oui.csv
//
// Il sito non contatta l'IEEE: usa solo il file generato.

import { readFileSync, writeFileSync } from 'node:fs';

// [nome mostrato, espressione sul campo "Organization Name"]
const VENDORS = [
  ['Cisco Meraki', /^Cisco Meraki/i],
  ['Cisco', /^Cisco Systems|^Cisco SPVTG/i],
  ['Juniper Networks', /^Juniper Networks/i],
  ['Arista Networks', /^Arista Networks/i],
  ['HPE / Aruba', /^Hewlett Packard Enterprise|^Aruba/i],
  ['HP', /^Hewlett[- ]Packard|^HP Inc/i],
  ['Extreme Networks', /^Extreme Networks/i],
  ['Ruckus / CommScope', /^Ruckus|^CommScope/i],
  ['Ubiquiti', /^Ubiquiti/i],
  ['MikroTik', /^Routerboard|^MikroTik/i],
  ['Fortinet', /^Fortinet/i],
  ['Palo Alto Networks', /^Palo Alto Networks/i],
  ['Check Point', /^Check Point Software/i],
  ['SonicWall', /^SonicWall/i],
  ['Allied Telesis', /^Allied Telesis/i],
  ['Huawei', /^Huawei Technologies|^HUAWEI TECHNOLOGIES/i],
  ['ZTE', /^zte corporation/i],
  ['Nokia', /^Nokia/i],
  ['Ericsson', /^Ericsson/i],
  ['Zyxel', /^Zyxel/i],
  ['TP-Link', /^TP-LINK/i],
  ['Netgear', /^NETGEAR/i],
  ['D-Link', /^D-Link/i],
  ['Polycom / Poly', /^Polycom/i],
  ['Yealink', /^Yealink|^XIAMEN YEALINK/i],
  ['Grandstream', /^Grandstream/i],
  ['Snom', /^snom/i],
  ['Avaya', /^Avaya/i],
  ['Mitel', /^Mitel/i],
  ['Alcatel-Lucent Enterprise', /^Alcatel-Lucent Enterprise|^ALE International/i],
  ['Gigaset', /^Gigaset/i],
  ['Fanvil', /^Fanvil/i],
  ['AudioCodes', /^AudioCodes/i],
  ['Ribbon / Sonus', /^Ribbon Communications|^Sonus Networks/i],
  ['Spectralink', /^Spectralink/i],
  ['Apple', /^Apple, Inc/i],
  ['Samsung', /^Samsung Electronics/i],
  ['Google', /^Google/i],
  ['Amazon', /^Amazon Technologies/i],
  ['Microsoft', /^Microsoft/i],
  ['Intel', /^Intel Corporate/i],
  ['Dell', /^Dell/i],
  ['Lenovo', /^Lenovo|^LCFC/i],
  ['Super Micro', /^Super Micro/i],
  ['Broadcom', /^Broadcom/i],
  ['Realtek', /^Realtek/i],
  ['NVIDIA / Mellanox', /^Mellanox|^NVIDIA/i],
  ['VMware', /^VMware/i],
  ['Xen', /^XenSource/i],
  ['VirtualBox', /^PCS Systemtechnik/i],
  ['Raspberry Pi', /^Raspberry Pi/i],
  ['Espressif', /^Espressif/i],
  ['Axis Communications', /^Axis Communications/i],
  ['Hikvision', /^Hangzhou Hikvision/i],
  ['Dahua', /^Zhejiang Dahua/i],
  ['Brother', /^Brother Industries/i],
  ['Canon', /^Canon Inc/i],
  ['Xerox', /^Xerox/i],
];

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out;
}

const [, , csvPath] = process.argv;
if (!csvPath) {
  console.error('Uso: node scripts/build-oui.mjs oui.csv');
  process.exit(1);
}

const byVendor = new Map(VENDORS.map(([name]) => [name, []]));
let total = 0;
for (const line of readFileSync(csvPath, 'utf8').split(/\r?\n/).slice(1)) {
  if (!line.trim()) continue;
  const [registry, assignment, org] = parseCsvLine(line);
  if (registry !== 'MA-L' || !/^[0-9A-F]{6}$/.test(assignment)) continue;
  total++;
  const vendor = VENDORS.find(([, re]) => re.test(org.trim()));
  if (vendor) byVendor.get(vendor[0]).push(assignment);
}

const lines = [...byVendor].filter(([, list]) => list.length).map(([name, list]) => `  [${JSON.stringify(name)}, '${list.sort().join('')}'],`);
const count = [...byVendor.values()].reduce((n, l) => n + l.length, 0);
const today = new Date().toISOString().slice(0, 10);

writeFileSync(new URL('../data/oui.js', import.meta.url), `// Sottoinsieme del registro IEEE MA-L: ${count} OUI di ${lines.length} produttori
// (su ${total} assegnazioni MA-L), generato il ${today} con scripts/build-oui.mjs.
// Formato: [produttore, OUI da 6 cifre esadecimali concatenati].

export const OUI_DATE = '${today}';

export const OUI_VENDORS = [
${lines.join('\n')}
];
`);
console.log(`${count} OUI di ${lines.length} produttori su ${total} assegnazioni MA-L`);
