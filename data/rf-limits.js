// Limiti EIRP indicativi in Europa (ETSI / decisioni CE) per le bande Wi-Fi.
// Solo orientativi: valgono condizioni (TPC, DFS, uso interno) e varianti nazionali.
// Etichette e note delle bande sono in js/i18n.js (rf.band.<id>.label / .note).
// channels: canali da 20 MHz interamente nella banda (primo, ultimo, passo).

export const BANDS = [
  { id: '' },
  { id: '2g4', range: [2400, 2483.5], channels: [1, 13, 1], eirp: 20 },
  { id: 'unii1', range: [5150, 5250], channels: [36, 48, 4], eirp: 23 },
  { id: 'unii2a', range: [5250, 5350], channels: [52, 64, 4], eirp: 23 },
  { id: 'unii2a-notpc', range: [5250, 5350], channels: [52, 64, 4], eirp: 20 },
  { id: 'unii2c', range: [5470, 5725], channels: [100, 140, 4], eirp: 30 },
  { id: 'unii2c-notpc', range: [5470, 5725], channels: [100, 140, 4], eirp: 27 },
  { id: 'srd58', range: [5725, 5875], channels: [149, 173, 4], eirp: 14 },
  { id: 'lpi6', range: [5945, 6425], channels: [1, 93, 4], eirp: 23, psd: 10 },
  { id: 'vlp6', range: [5945, 6425], channels: [1, 93, 4], eirp: 14, psd: 1 },
];
