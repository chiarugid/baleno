// Limiti EIRP indicativi per le bande Wi-Fi, per normativa di riferimento.
// Solo orientativi: valgono condizioni (TPC, DFS, uso interno, AFC) e varianti nazionali.
// Etichette e note delle bande sono in js/i18n.js (rf.band.<id>.label / .note).
// channels: canali da 20 MHz interamente nella banda, come segmenti [primo, ultimo, passo].
// psd: limite di densità spettrale in dBm/MHz, dove previsto.
// match: banda equivalente nell'altra normativa, per conservare la scelta al cambio.

export const REGULATIONS = ['etsi', 'fcc'];

export const BANDS = [
  { id: '' },

  // ETSI / decisioni CE (Europa)
  { id: '2g4', reg: 'etsi', range: [2400, 2483.5], channels: [[1, 13, 1]], eirp: 20, match: 'fcc-2g4' },
  { id: 'unii1', reg: 'etsi', range: [5150, 5250], channels: [[36, 48, 4]], eirp: 23, match: 'fcc-unii1' },
  { id: 'unii2a', reg: 'etsi', range: [5250, 5350], channels: [[52, 64, 4]], eirp: 23, match: 'fcc-unii2a' },
  { id: 'unii2a-notpc', reg: 'etsi', range: [5250, 5350], channels: [[52, 64, 4]], eirp: 20, match: 'fcc-unii2a' },
  { id: 'unii2c', reg: 'etsi', range: [5470, 5725], channels: [[100, 140, 4]], eirp: 30, match: 'fcc-unii2c' },
  { id: 'unii2c-notpc', reg: 'etsi', range: [5470, 5725], channels: [[100, 140, 4]], eirp: 27, match: 'fcc-unii2c' },
  { id: 'srd58', reg: 'etsi', range: [5725, 5875], channels: [[149, 173, 4]], eirp: 14, match: 'fcc-unii3' },
  { id: 'lpi6', reg: 'etsi', range: [5945, 6425], channels: [[1, 93, 4]], eirp: 23, psd: 10, match: 'fcc-lpi6-ap' },
  { id: 'vlp6', reg: 'etsi', range: [5945, 6425], channels: [[1, 93, 4]], eirp: 14, psd: 1, match: 'fcc-vlp6' },

  // FCC Part 15 (Stati Uniti): potenza condotta massima + antenna fino a 6 dBi
  { id: 'fcc-2g4', reg: 'fcc', range: [2400, 2483.5], channels: [[1, 11, 1]], eirp: 36, match: '2g4' },
  { id: 'fcc-unii1', reg: 'fcc', range: [5150, 5250], channels: [[36, 48, 4]], eirp: 36, psd: 23, match: 'unii1' },
  { id: 'fcc-unii1-client', reg: 'fcc', range: [5150, 5250], channels: [[36, 48, 4]], eirp: 30, psd: 17, match: 'unii1' },
  { id: 'fcc-unii2a', reg: 'fcc', range: [5250, 5350], channels: [[52, 64, 4]], eirp: 30, psd: 17, match: 'unii2a' },
  { id: 'fcc-unii2c', reg: 'fcc', range: [5470, 5725], channels: [[100, 144, 4]], eirp: 30, psd: 17, match: 'unii2c' },
  { id: 'fcc-unii3', reg: 'fcc', range: [5725, 5850], channels: [[149, 165, 4]], eirp: 36, match: 'srd58' },
  { id: 'fcc-lpi6-ap', reg: 'fcc', range: [5925, 7125], channels: [[1, 233, 4]], eirp: 30, psd: 5, match: 'lpi6' },
  { id: 'fcc-lpi6-client', reg: 'fcc', range: [5925, 7125], channels: [[1, 233, 4]], eirp: 24, psd: -1, match: 'lpi6' },
  { id: 'fcc-sp6', reg: 'fcc', range: [5925, 6875], channels: [[1, 93, 4], [117, 181, 4]], eirp: 36, psd: 23, match: 'lpi6' },
  { id: 'fcc-vlp6', reg: 'fcc', range: [5925, 6875], channels: [[1, 93, 4], [117, 181, 4]], eirp: 14, psd: -5, match: 'vlp6' },
];
