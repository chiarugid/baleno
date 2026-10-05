# rebluc

Strumenti di rete e VoIP che girano interamente nel browser, pubblicati su [www.rebluc.com](https://www.rebluc.com) tramite GitHub Pages.

- **Calcolatore subnet** IPv4/IPv6: rete, broadcast, range host, wildcard, suddivisione in sottoreti (fino a 2^32 calcolate al volo; ordinamento e filtro sull'intero elenco fino a 4096 righe, sulla pagina corrente oltre; esportazione CSV fino a 65.536 righe)
- **Calcolatore banda VoIP**: codec, packetization e overhead (SRTP, IPv4/IPv6, Ethernet, 802.1Q, preambolo, GRE, IPsec, NAT-T), per direzione o bidirezionale, banda media con VAD
- **Parser SIP**: start line, header (anche compatti), SDP con codec, media e DTMF RFC 4733, anomalie comuni; verifica del Content-Length; header SBC/CUBE (P-Asserted-Identity, P-Preferred-Identity, Diversion, History-Info, Reason con causa Q.850, session timer)
- **Codici di risposta SIP**: tutti i codici 1xx–6xx con significato, RFC e mappatura Q.850 (RFC 3398)
- **Tabella DSCP/CoS/ToS** con PHB, classe di servizio e uso tipico, più convertitore DSCP ↔ ToS ↔ IP Precedence
- **Stima MOS (E-model)**: fattore R e MOS secondo ITU-T G.107 da codec, ritardo one-way (anche per componenti), perdita e fattore A; categorie G.109 e soglia G.114
- **Tester pattern CUCM**: route/translation pattern (X, !, [2-9], [^…], ., #, *, \+, ?, +) contro un numero chiamato, con Discard Digits (PreDot, Trailing-#), strip, transform mask e prefisso spiegati passo per passo; macro @ dichiarata non supportata
- **dBm / mW / EIRP**: conversioni di potenza, EIRP (potenza Tx in dBm o mW) con limiti indicativi ETSI (UE) o FCC (USA) e canali da 20 MHz di ogni banda, budget di collegamento (FSPL, margine, distanza massima; in spazio libero o con l’ambiente e le pareti scelti nel grafico) e grafico potenza ricevuta / distanza con lettura in dBm e mW alla distanza scelta, in spazio libero o con modello log-distanza per ambiente (esponente n) e pareti attraversate
- **Convertitore MAC**: formati Cisco, due punti, trattini, senza separatori; produttore da un sottoinsieme OUI locale; indirizzi speciali (HSRP, VRRP, multicast…); conversione multipla
- **Decoder certificati**: certificati X.509 e CSR PKCS#10 in PEM o DER (anche catene e file): soggetto, emittente, validità e giorni rimanenti, serial, algoritmi di firma e chiave, SAN, Key Usage, EKU, Basic Constraints, SKI/AKI, CRL/OCSP, impronte SHA-1/SHA-256 e pin SPKI; avvisi su scadenza, firme deboli e SAN mancanti. Parser DER scritto per il sito (`js/lib/`), impronte con Web Crypto; le chiavi private incollate vengono segnalate e mai lette

**Avvertenza:** tutti i risultati e i valori di riferimento (limiti di potenza, codifiche, tabelle, stime) sono indicativi e possono contenere errori o non essere aggiornati. Vanno sempre ricontrollati da chi usa gli strumenti, sulle fonti ufficiali, prima di qualsiasi uso reale. Il sito lo ricorda in cima a ogni strumento, nella sidebar e nelle Informazioni.

HTML, CSS e JavaScript vanilla: nessun build step, nessun backend, nessuna chiamata esterna, nessun tracking.

## Guide pratiche

La sezione **Guide pratiche** raccoglie procedure passo per passo con comandi da copiare, esempi di risultato e fonti ufficiali, anch'esse indicative. Ogni guida è un file in `data/guides/` con i testi in coppie italiano/inglese; la resa è in `js/guides.js`. Prima guida: **Rapporto Wi-Fi di Windows** (`netsh wlan show wlanreport`), con l'output reale del comando e un'anteprima del rapporto ricostruita con dati inventati.

## Strumenti esterni

La sezione **Strumenti esterni** raccoglie link a strumenti utili di altri autori, che si aprono sui loro siti in una nuova scheda; il sito non carica nulla da quei domini. Per ora: Cisco **Wireless Config Analyzer Express (WCAE)**, versione cloud (`cway.cisco.com`), con l'avviso che quella versione carica il file sui server Cisco. I link sono in `EXTERNAL` di `js/app.js`, i testi in `ext.*` di `js/i18n.js`.

## Lingue

Interfaccia in italiano e inglese (selettore IT/EN nell'header). Tutte le stringhe stanno in `js/i18n.js`, una chiave con entrambe le lingue; i termini tecnici di protocollo restano in inglese. La lingua si sceglie da:

1. parametro nell'URL, es. `#/voce/banda?lang=en` (link condivisibili);
2. preferenza salvata nel browser (`localStorage`, chiave `rebluc.lang`);
3. italiano come predefinito.

## Contatore visite

In alto a destra (nel menu su mobile) un contatore discreto mostra le visite **di questo browser**: il totale sta in `localStorage` (chiave `rebluc.visits`) e aumenta una volta per sessione (`sessionStorage`), non a ogni cambio di pagina. Nessuna richiesta di rete: non è un conteggio dei visitatori del sito. Se il browser blocca `localStorage` il contatore non compare.

## Avvio in locale

Il sito usa moduli ES, quindi va servito via HTTP (aprire `index.html` con doppio clic non funziona):

```sh
python -m http.server 8000
```

poi apri <http://localhost:8000>.

## Versione dei file e uso offline

GitHub Pages lascia i file in cache nel browser per 10 minuti. Per far arrivare subito gli aggiornamenti, ogni CSS e modulo JS è richiesto con `?v=<impronta del contenuto>`: i fogli di stile e `js/app.js` direttamente in `index.html`, gli altri moduli tramite una import map. **Prima di ogni commit** che tocca `js/`, `data/` o `css/`:

```sh
node scripts/stamp.mjs
```

Lo stesso comando aggiorna `sw.js` (versione ed elenco dei file per l'uso offline). Un test di `tests/run.mjs` fallisce se `index.html` o `sw.js` non sono aggiornati.

## Uso offline

`sw.js` è un service worker: alla prima visita salva nel browser pagina, font, CSS e moduli (circa 680 KB), poi il sito funziona anche senza rete. La pagina si chiede sempre prima alla rete, quindi gli aggiornamenti arrivano subito; i file versionati si prendono dalla cache. A ogni nuova versione le cache precedenti vengono eliminate.

## Test

I calcoli si verificano con Node 20 o successivo (serve Web Crypto globale), senza dipendenze:

```sh
node tests/run.mjs
```

`tests/fixtures/` contiene un certificato RSA autofirmato, una CA EC P-256 e una CSR di prova generati con OpenSSL (le chiavi private non sono nel repo); i test ne verificano campi e impronte attese.

## Dati OUI

`data/oui.js` contiene un sottoinsieme del registro IEEE MA-L (circa 10.000 prefissi dei produttori più comuni in reti aziendali e VoIP). Per aggiornarlo scarica `https://standards-oui.ieee.org/oui/oui.csv` ed esegui:

```sh
node scripts/build-oui.mjs oui.csv
```

## Struttura

```
index.html     pagina unica (sidebar, header, breadcrumb, contenuti)
css/           tema (tokens), layout, componenti
js/app.js      navigazione, tema, lingua, ricerca strumenti
js/i18n.js     dizionario italiano/inglese e funzioni t()
js/visits.js   contatore visite locale
js/guides.js   resa delle guide pratiche (contenuti in data/guides/)
js/ui/         componenti condivisi (dashlet, tabella, icone)
js/lib/        parser ASN.1/DER e X.509
js/tools/      un modulo per strumento: funzioni di calcolo + interfaccia
data/          tabelle statiche
fonts/         Inter (SIL OFL 1.1)
tests/         test dei calcoli e fixture dei certificati
scripts/       generazione dei dati (OUI) e versione dei file (stamp.mjs)
```
