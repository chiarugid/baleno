// Parametri E-model (ITU-T G.107) per codec: fattore di degrado Ie e
// robustezza alla perdita di pacchetti Bpl (ITU-T G.113 Appendice I).
// "estimate" indica valori non tabellati in G.113 (stime orientative).
// Nomi dei codec, fonti, fattori A e categorie sono tradotti in js/i18n.js (mos.*).

export const EMODEL_CODECS = [
  { id: 'g711', ie: 0, bpl: 25.1, ptime: 20 },
  { id: 'g722', ie: 0, bpl: 25.1, ptime: 20, estimate: true },
  { id: 'g729a', ie: 11, bpl: 19, ptime: 20 },
  { id: 'g7231', ie: 15, bpl: 16.1, ptime: 30 },
  { id: 'opus', ptime: 20, estimate: true, variants: [
    { bitrate: 12, ie: 11, bpl: 20 },
    { bitrate: 16, ie: 6, bpl: 20 },
    { bitrate: 24, ie: 2, bpl: 20 },
    { bitrate: 32, ie: 0, bpl: 20 },
  ] },
];

// Fattore di vantaggio A (G.107, tabella 1).
export const ADVANTAGE = [0, 5, 10, 20];

// Categorie di qualità per valore R (ITU-T G.109).
export const CATEGORIES = [
  { min: 90, id: 'excellent', state: 'ok' },
  { min: 80, id: 'good', state: 'ok' },
  { min: 70, id: 'fair', state: 'warn' },
  { min: 60, id: 'poor', state: 'err' },
  { min: -Infinity, id: 'bad', state: 'err' },
];
