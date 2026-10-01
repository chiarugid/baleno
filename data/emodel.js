// Parametri E-model (ITU-T G.107) per codec: fattore di degrado Ie e
// robustezza alla perdita di pacchetti Bpl (ITU-T G.113 Appendice I).
// "estimate" indica valori non tabellati in G.113 (stime orientative).

export const EMODEL_CODECS = [
  { id: 'g711', name: 'G.711 (con PLC)', ie: 0, bpl: 25.1, ptime: 20, source: 'G.113 App. I' },
  { id: 'g722', name: 'G.722', ie: 0, bpl: 25.1, ptime: 20, estimate: true, source: 'stima: G.722 è wideband, la scala corretta è G.107.1; qui trattato come G.711' },
  { id: 'g729a', name: 'G.729A (+VAD)', ie: 11, bpl: 19, ptime: 20, source: 'G.113 App. I' },
  { id: 'g7231', name: 'G.723.1 6,3 kbit/s (+VAD)', ie: 15, bpl: 16.1, ptime: 30, source: 'G.113 App. I' },
  { id: 'opus', name: 'Opus (stima)', ptime: 20, estimate: true, source: 'stima: Opus non è tabellato in G.113; valori orientativi per bitrate', variants: [
    { bitrate: 12, ie: 11, bpl: 20 },
    { bitrate: 16, ie: 6, bpl: 20 },
    { bitrate: 24, ie: 2, bpl: 20 },
    { bitrate: 32, ie: 0, bpl: 20 },
  ] },
];

// Fattore di vantaggio A (G.107, tabella 1).
export const ADVANTAGE = [
  { value: 0, label: 'Fisso (0)' },
  { value: 5, label: 'Mobile in edificio (5)' },
  { value: 10, label: 'Mobile (10)' },
  { value: 20, label: 'Satellite / zone remote (20)' },
];

// Categorie di qualità per valore R (ITU-T G.109).
export const CATEGORIES = [
  { min: 90, label: 'Eccellente', state: 'ok' },
  { min: 80, label: 'Buono', state: 'ok' },
  { min: 70, label: 'Discreto', state: 'warn' },
  { min: 60, label: 'Scarso', state: 'err' },
  { min: -Infinity, label: 'Pessimo', state: 'err' },
];
