// Limiti EIRP indicativi in Europa (ETSI / decisioni CE) per le bande Wi-Fi.
// Solo orientativi: valgono condizioni (TPC, DFS, uso interno) e varianti nazionali.
// Etichette e note delle bande sono in js/i18n.js (rf.band.<id>.label / .note).

export const BANDS = [
  { id: '' },
  { id: '2g4', range: [2400, 2483.5], eirp: 20 },
  { id: 'unii1', range: [5150, 5250], eirp: 23 },
  { id: 'unii2a', range: [5250, 5350], eirp: 23 },
  { id: 'unii2a-notpc', range: [5250, 5350], eirp: 20 },
  { id: 'unii2c', range: [5470, 5725], eirp: 30 },
  { id: 'unii2c-notpc', range: [5470, 5725], eirp: 27 },
  { id: 'srd58', range: [5725, 5875], eirp: 14 },
  { id: 'lpi6', range: [5945, 6425], eirp: 23, psd: 10 },
  { id: 'vlp6', range: [5945, 6425], eirp: 14, psd: 1 },
];
