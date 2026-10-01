# rebluc

Strumenti di rete e VoIP che girano interamente nel browser, pubblicati su [www.rebluc.it](https://www.rebluc.it) tramite GitHub Pages.

- **Calcolatore subnet** IPv4/IPv6: rete, broadcast, range host, wildcard, suddivisione in sottoreti (fino a 2^32 calcolate al volo; ordinamento e filtro sull'intero elenco fino a 4096 righe, sulla pagina corrente oltre; esportazione CSV fino a 65.536 righe)
- **Calcolatore banda VoIP**: codec, packetization e overhead (SRTP, IPv4/IPv6, Ethernet, 802.1Q, preambolo, GRE, IPsec, NAT-T), per direzione o bidirezionale, banda media con VAD
- **Parser SIP**: start line, header (anche compatti), SDP con codec, media e DTMF RFC 4733, anomalie comuni; verifica del Content-Length; header SBC/CUBE (P-Asserted-Identity, P-Preferred-Identity, Diversion, History-Info, Reason con causa Q.850, session timer)
- **Codici di risposta SIP**: tutti i codici 1xx–6xx con significato, RFC e mappatura Q.850 (RFC 3398)
- **Tabella DSCP/CoS/ToS** con PHB, classe di servizio e uso tipico, più convertitore DSCP ↔ ToS ↔ IP Precedence
- **Stima MOS (E-model)**: fattore R e MOS secondo ITU-T G.107 da codec, ritardo one-way (anche per componenti), perdita e fattore A; categorie G.109 e soglia G.114
- **Tester pattern CUCM**: route/translation pattern (X, !, [2-9], [^…], ., #, *, \+, ?, +) contro un numero chiamato, con Discard Digits (PreDot, Trailing-#), strip, transform mask e prefisso spiegati passo per passo; macro @ dichiarata non supportata
- **dBm / mW / EIRP**: conversioni di potenza, EIRP con limiti ETSI indicativi, budget di collegamento in spazio libero (FSPL, margine, distanza massima)
- **Convertitore MAC**: formati Cisco, due punti, trattini, senza separatori; produttore da un sottoinsieme OUI locale; indirizzi speciali (HSRP, VRRP, multicast…); conversione multipla

HTML, CSS e JavaScript vanilla: nessun build step, nessun backend, nessuna chiamata esterna, nessun tracking.

## Lingue

Interfaccia in italiano e inglese (selettore IT/EN nell'header). Tutte le stringhe stanno in `js/i18n.js`, una chiave con entrambe le lingue; i termini tecnici di protocollo restano in inglese. La lingua si sceglie da:

1. parametro nell'URL, es. `#/voce/banda?lang=en` (link condivisibili);
2. preferenza salvata nel browser (`localStorage`, chiave `rebluc.lang`);
3. italiano come predefinito.

## Avvio in locale

Il sito usa moduli ES, quindi va servito via HTTP (aprire `index.html` con doppio clic non funziona):

```sh
python -m http.server 8000
```

poi apri <http://localhost:8000>.

## Test

I calcoli si verificano con Node 18 o successivo, senza dipendenze:

```sh
node tests/run.mjs
```

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
js/ui/         componenti condivisi (dashlet, tabella, icone)
js/tools/      un modulo per strumento: funzioni di calcolo + interfaccia
data/          tabelle statiche
fonts/         Inter (SIL OFL 1.1)
tests/         test dei calcoli
scripts/       generazione dei dati (OUI)
```
