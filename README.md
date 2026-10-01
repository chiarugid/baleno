# rebluc

Strumenti di rete e VoIP che girano interamente nel browser, pubblicati su [www.rebluc.it](https://www.rebluc.it) tramite GitHub Pages.

- **Calcolatore subnet** IPv4/IPv6: rete, broadcast, range host, wildcard, suddivisione in sottoreti
- **Calcolatore banda VoIP**: codec, packetization e overhead (SRTP, Ethernet, 802.1Q, preambolo, GRE, IPsec, NAT-T), per direzione o bidirezionale
- **Parser SIP**: start line, header (anche compatti), SDP con codec e media, anomalie comuni
- **Codici di risposta SIP**: tutti i codici 1xx–6xx con significato, RFC e mappatura Q.850 (RFC 3398)
- **Tabella DSCP/CoS/ToS** con PHB, classe di servizio e uso tipico, più convertitore DSCP ↔ ToS ↔ IP Precedence
- **Convertitore MAC** con lookup vendor OUI locale *(in sviluppo)*

HTML, CSS e JavaScript vanilla: nessun build step, nessun backend, nessuna chiamata esterna, nessun tracking.

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

## Struttura

```
index.html     pagina unica (sidebar, header, breadcrumb, contenuti)
css/           tema (tokens), layout, componenti
js/app.js      navigazione, tema, ricerca strumenti
js/ui/         componenti condivisi (dashlet, tabella, icone)
js/tools/      un modulo per strumento: funzioni di calcolo + interfaccia
data/          tabelle statiche
fonts/         Inter (SIL OFL 1.1)
tests/         test dei calcoli
```
