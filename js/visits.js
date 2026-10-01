// Contatore delle visite di questo browser, solo locale: nessuna richiesta di rete.
// Il totale sta in localStorage; sessionStorage evita di contare di nuovo la stessa
// sessione (ricaricamenti e cambi di pagina interni non incrementano).
// Non è un conteggio dei visitatori del sito: ogni browser vede solo le proprie visite.

export const VISITS_KEY = 'rebluc.visits';
export const SESSION_KEY = 'rebluc.visit-counted';

// local e session sono oggetti tipo Storage (getItem/setItem) oppure null.
// Restituisce il totale aggiornato, o null se localStorage non è utilizzabile.
export function countVisit(local, session) {
  if (!local) return null;
  try {
    const stored = Number.parseInt(local.getItem(VISITS_KEY) ?? '0', 10);
    let total = Number.isSafeInteger(stored) && stored >= 0 ? stored : 0;
    let alreadyCounted = false;
    try { alreadyCounted = session?.getItem(SESSION_KEY) === '1'; } catch { alreadyCounted = false; }
    if (!alreadyCounted) {
      total += 1;
      local.setItem(VISITS_KEY, String(total));
      try { session?.setItem(SESSION_KEY, '1'); } catch { /* senza sessionStorage si conta ogni caricamento */ }
    }
    return total;
  } catch {
    // localStorage pieno, bloccato o in sola lettura: il contatore non viene mostrato.
    return null;
  }
}

// Accesso difensivo a window.localStorage / sessionStorage: in alcuni browser
// (cookie bloccati, iframe sandbox) già la lettura della proprietà genera un errore.
export function browserStorage(name) {
  try {
    const storage = globalThis[name];
    if (!storage) return null;
    const probe = '__rebluc_probe__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}
