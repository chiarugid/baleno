// Limiti EIRP indicativi in Europa (ETSI / decisioni CE) per le bande Wi-Fi.
// Solo orientativi: valgono condizioni (TPC, DFS, uso interno) e varianti nazionali.

export const BANDS = [
  { id: '', label: 'Nessuna verifica' },
  { id: '2g4', label: '2,4 GHz (2400–2483,5 MHz)', range: [2400, 2483.5], eirp: 20, note: 'ETSI EN 300 328: 100 mW EIRP.' },
  { id: 'unii1', label: '5 GHz U-NII-1 (5150–5250 MHz)', range: [5150, 5250], eirp: 23, note: 'ETSI EN 301 893: 200 mW EIRP, solo uso interno.' },
  { id: 'unii2a', label: '5 GHz U-NII-2A (5250–5350 MHz)', range: [5250, 5350], eirp: 23, note: '200 mW EIRP con TPC (20 dBm senza), DFS obbligatorio, solo uso interno.' },
  { id: 'unii2c', label: '5 GHz U-NII-2C (5470–5725 MHz)', range: [5470, 5725], eirp: 30, note: '1 W EIRP con TPC (27 dBm senza), DFS obbligatorio, anche esterno.' },
  { id: 'srd58', label: '5,8 GHz SRD (5725–5875 MHz)', range: [5725, 5875], eirp: 14, note: 'ETSI EN 300 440: 25 mW EIRP; regole nazionali molto variabili.' },
  { id: 'lpi6', label: '6 GHz LPI (5945–6425 MHz)', range: [5945, 6425], eirp: 23, psd: 10, note: 'Low Power Indoor: 23 dBm EIRP e 10 dBm/MHz, solo uso interno.' },
  { id: 'vlp6', label: '6 GHz VLP (5945–6425 MHz)', range: [5945, 6425], eirp: 14, psd: 1, note: 'Very Low Power: 14 dBm EIRP e 1 dBm/MHz, anche esterno.' },
];
