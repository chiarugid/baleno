// Guida: troubleshooting Wi-Fi su Android con le Opzioni sviluppatore.
// Ogni testo è una coppia [italiano, inglese]. Nomi delle opzioni e comportamenti verificati
// sulla documentazione ufficiale Android e AOSP (ottobre 2026); i menu possono variare per
// produttore e versione. Rivista dopo due passaggi di revisione tecnica.

export default {
  id: 'android-wifi',
  topic: ['Wireless · Android', 'Wireless · Android'],
  level: ['Intermedio', 'Intermediate'],
  minutes: 25,
  navTitle: ['Troubleshooting Wi-Fi su Android', 'Wi-Fi troubleshooting on Android'],
  title: ['Troubleshooting Wi-Fi su Android con le Opzioni sviluppatore', 'Wi-Fi troubleshooting on Android with Developer options'],
  summary: [
    'Come raccogliere dal telefono le informazioni utili quando un client Android si disconnette, non si autentica o resta associato a un access point peggiore: dove si interrompe la connessione, dati radio, logging dettagliato, scansione, MAC casuale e segnalazione di bug.',
    'How to collect useful information from the phone when an Android client disconnects, fails to authenticate or stays associated with a worse access point: where the connection breaks, radio data, verbose logging, scanning, randomised MAC and bug reports.',
  ],
  keywords: ['android wi-fi wifi troubleshooting opzioni sviluppatore logging dettagliato scansione mac casuale randomizzato bugreport adb dumpsys bssid rssi snr roaming 802.1x wpa3 smartphone', 'android wi-fi wifi troubleshooting developer options verbose logging scan throttling randomized mac bugreport adb dumpsys bssid rssi snr roaming 802.1x wpa3 smartphone'],
  sections: [
    {
      title: ['A cosa serve', 'What it is for'],
      blocks: [
        { p: [
          'Quando un problema Wi-Fi riguarda un solo tipo di dispositivo, molte delle informazioni utili stanno sul client: a quale access point (BSSID) era associato, con che qualità radio, con quale indirizzo MAC, cosa ha registrato il sistema. Android ne mostra una parte nelle impostazioni e, con le Opzioni sviluppatore, ne aggiunge altre pensate per il debug.',
          'When a Wi-Fi problem affects only one kind of device, much of the useful information is on the client: which access point (BSSID) it was associated with, at what radio quality, with which MAC address, what the system logged. Android shows part of it in its settings and, with Developer options, adds more that is meant for debugging.',
        ] },
        { warn: [
          'Le Opzioni sviluppatore cambiano il comportamento del sistema. Attiva solo quello che serve al test e, alla fine, rimetti tutto com’era (vedi l’ultimo passo). Nomi, percorsi e informazioni mostrate cambiano tra produttori e versioni di Android.',
          'Developer options change how the system behaves. Turn on only what the test needs and, at the end, put everything back as it was (see the last step). Names, paths and the information shown differ between manufacturers and Android versions.',
        ] },
      ],
    },
    {
      title: ['Dove si interrompe la connessione', 'Where the connection breaks'],
      blocks: [
        { p: [
          'Prima di raccogliere dati conviene capire a che punto della catena si ferma la connessione: ogni fase ha sintomi e controlli diversi.',
          'Before collecting data it helps to work out where in the chain the connection stops: each stage has different symptoms and checks.',
        ] },
        { table: {
          head: [['Fase', 'Stage'], ['Cosa la conferma', 'What confirms it']],
          rows: [
            [['1 · Radio', '1 · Radio'], ['la rete compare nelle scansioni con un RSSI adeguato; quando disponibili, verifica SNR e qualità radio sul controller o sull’AP (Android in genere non mostra l’SNR)', 'the network appears in scans with adequate RSSI; where available, check SNR and radio quality on the controller or AP (Android usually does not show SNR)']],
            [['2 · Associazione 802.11', '2 · 802.11 association'], ['il telefono si associa a un BSSID (visibile sul controller)', 'the phone associates with a BSSID (visible on the controller)']],
            [['3 · Autenticazione WPA/EAP', '3 · WPA/EAP authentication'], ['autenticazione completata e chiavi installate (4-way handshake); per 802.1X verifica anche Access-Accept del RADIUS ed EAP-Success, che da soli non bastano: dopo deve riuscire il 4-way handshake', 'authentication completed and keys installed (4-way handshake); for 802.1X also check the RADIUS Access-Accept and EAP-Success, which alone are not enough: the 4-way handshake must then succeed']],
            [['4 · DHCP e IP', '4 · DHCP and IP'], ['indirizzo IP, gateway e DNS presenti nei dettagli della rete', 'IP address, gateway and DNS present in the network details']],
            [['5 · Gateway e DNS', '5 · Gateway and DNS'], ['il gateway risponde e i nomi vengono risolti', 'the gateway answers and names are resolved']],
            [['6 · Validazione di Android', '6 · Android validation'], ['Android verifica l’accesso a Internet con una prova di connessione; se fallisce mostra la rete come «connessa, senza Internet» o rileva un captive portal', 'Android checks Internet access with a connectivity probe; if it fails it shows the network as “connected, no Internet” or detects a captive portal']],
          ],
        } },
      ],
    },
    {
      title: ['Prerequisiti', 'Prerequisites'],
      blocks: [
        { list: [
          ['Uno smartphone o tablet Android su cui riprodurre il problema.', 'An Android phone or tablet on which to reproduce the problem.'],
          ['Per i comandi adb: un computer con Android SDK Platform-Tools collegato al telefono con un cavo USB oppure, da Android 11, con il Debug wireless (computer e telefono sulla stessa rete). Per diagnosticare il Wi-Fi è preferibile il cavo: il Debug wireless passa proprio dal Wi-Fi che stai analizzando.', 'For the adb commands: a computer with Android SDK Platform-Tools connected to the phone with a USB cable or, from Android 11, with Wireless debugging (computer and phone on the same network). To diagnose Wi-Fi the cable is better: Wireless debugging runs over the very Wi-Fi you are analysing.'],
          ['Orario e posizione in cui si è verificato il problema, da confrontare con i log del controller o dell’access point.', 'Time and place where the problem happened, to compare with the controller or access point logs.'],
        ] },
      ],
    },
    {
      title: ['Passo 1 · Attiva le Opzioni sviluppatore', 'Step 1 · Turn on Developer options'],
      blocks: [
        { p: [
          'Tocca sette volte la voce Numero build finché compare il messaggio che sei uno sviluppatore, poi torna indietro: in fondo alle impostazioni (spesso in Sistema) compare Opzioni sviluppatore. Il telefono può chiedere PIN o sequenza di sblocco. Dove si trova Numero build:',
          'Tap Build number seven times until the message says you are now a developer, then go back: Developer options appears at the bottom of the settings (often under System). The phone may ask for the PIN or unlock pattern. Where to find Build number:',
        ] },
        { table: {
          head: [['Dispositivo', 'Device'], ['Percorso', 'Path']],
          rows: [
            ['Google Pixel', ['Impostazioni › Informazioni sullo smartphone › Numero build', 'Settings › About phone › Build number']],
            ['Samsung Galaxy', ['Impostazioni › Informazioni sullo smartphone › Informazioni sul software › Numero build', 'Settings › About phone › Software information › Build number']],
            ['OnePlus', ['Impostazioni › Informazioni sullo smartphone › Numero build', 'Settings › About phone › Build number']],
            [['Altri', 'Others'], ['cerca «Numero build» nella ricerca delle impostazioni', 'search for “Build number” in the settings search']],
          ],
        } },
      ],
    },
    {
      title: ['Passo 2 · Annota i dati della connessione', 'Step 2 · Note the connection data'],
      blocks: [
        { p: [
          'A seconda della versione di Android e del produttore, i dettagli della rete a cui sei connesso (Impostazioni › Rete e Internet › Internet, o Connessioni › Wi-Fi, poi la rotella della rete) possono mostrare intensità del segnale, frequenza o banda, sicurezza, MAC usato, IP, gateway e DNS. Per il troubleshooting servono soprattutto:',
          'Depending on the Android version and manufacturer, the details of the network you are connected to (Settings › Network & internet › Internet, or Connections › Wi-Fi, then the network’s gear icon) may show signal strength, frequency or band, security, the MAC in use, IP, gateway and DNS. For troubleshooting you mainly need:',
        ] },
        { list: [
          ['il BSSID dell’access point a cui sei associato, essenziale per roaming e client che restano attaccati a un AP; se i dettagli non lo mostrano, prova con il logging dettagliato (passo 3) o con dumpsys (passo 7);', 'the BSSID of the access point you are associated with, essential for roaming and clients that stick to one AP; if the details do not show it, try verbose logging (step 3) or dumpsys (step 7);'],
          ['frequenza o canale e RSSI;', 'frequency or channel and RSSI;'],
          ['la velocità del collegamento (link speed), quando disponibile: è il rate del collegamento (PHY rate) riportato da driver e sistema, non il throughput che ottengono le applicazioni, che è sempre più basso;', 'the link speed, when available: it is the link rate (PHY rate) reported by the driver and system, not the throughput applications get, which is always lower;'],
          ['il MAC usato per quella rete (vedi il passo 5).', 'the MAC used for that network (see step 5).'],
        ] },
        { p: [
          'Wi-Fi 7 e MLO: con Multi-Link Operation i valori sintetici delle API WifiInfo si riferiscono a un solo link: l’RSSI è il più alto tra i link associati e la link speed è quella del link con l’RSSI più alto. Non descrivono l’insieme dei link MLO, e le schermate dei produttori possono mostrare valori diversi; per un’analisi completa esamina i singoli link associati, quando il dispositivo o gli strumenti di debug li espongono.',
          'Wi-Fi 7 and MLO: with Multi-Link Operation the summary values of the WifiInfo APIs refer to a single link: the RSSI is the highest among the associated links and the link speed is that of the link with the highest RSSI. They do not describe the MLO links as a whole, and manufacturers’ screens may show different values; for a complete analysis examine the individual associated links, when the device or debugging tools expose them.',
        ] },
        { p: [
          'L’RSSI da solo non descrive la qualità radio: quando possibile va correlato con SNR, percentuale di ritrasmissioni (retry), PHY rate o MCS e utilizzo e interferenza del canale, dati che spesso si leggono meglio sul controller. Un client con un buon RSSI ma molte ritrasmissioni può funzionare peggio di uno con RSSI più basso su un canale pulito. Inoltre l’RSSI è misurato dal chipset del telefono con criteri che variano tra produttori e modelli: i valori di dispositivi diversi non sono direttamente confrontabili, quindi confronta le misure sempre con lo stesso dispositivo.',
          'RSSI alone does not describe radio quality: where possible correlate it with SNR, retry percentage, PHY rate or MCS and channel utilisation and interference, data that is often easier to read on the controller. A client with good RSSI but many retries can perform worse than one with lower RSSI on a clean channel. Moreover RSSI is measured by the phone’s chipset with criteria that vary between manufacturers and models: values from different devices are not directly comparable, so always compare measurements taken with the same device.',
        ] },
        { tool: '#/wireless/potenza', label: ['Per stimare il segnale atteso a una certa distanza e confrontarlo con l’RSSI di progetto usa lo strumento dBm / mW / EIRP.', 'To estimate the expected signal at a given distance and compare it with the design RSSI use the dBm / mW / EIRP tool.'] },
      ],
    },
    {
      title: ['Passo 3 · Attiva il logging dettagliato del Wi-Fi', 'Step 3 · Enable Wi-Fi verbose logging'],
      blocks: [
        { p: [
          'In Opzioni sviluppatore › Rete attiva «Attiva il logging dettagliato del Wi-Fi» (Enable Wi-Fi verbose logging). L’opzione rende più dettagliati i log del Wi-Fi, comprese le informazioni sull’RSSI e sullo stato delle reti; su molte versioni anche l’elenco delle reti e i dettagli mostrano dati tecnici aggiuntivi.',
          'In Developer options › Networking turn on “Enable Wi-Fi verbose logging”. The option makes the Wi-Fi logs more detailed, including information on RSSI and network state; on many versions the network list and details also show additional technical data.',
        ] },
        { p: [
          'Attivala prima di riprodurre il problema: i log più dettagliati finiscono poi nella segnalazione di bug del passo 7.',
          'Turn it on before reproducing the problem: the more detailed logs then end up in the bug report of step 7.',
        ] },
      ],
    },
    {
      title: ['Passo 4 · Scansione Wi-Fi e app di analisi', 'Step 4 · Wi-Fi scanning and analyser apps'],
      blocks: [
        { p: [
          'Le app che misurano le reti vicine (canali, segnale degli AP) chiedono le scansioni tramite le API di Android (WifiManager.startScan), che sono limitate: dalla versione 9 ogni app in primo piano può fare 4 scansioni ogni 2 minuti e tutte le app in background insieme una ogni 30 minuti. Per questo un’app di analisi può sembrare «lenta» ad aggiornarsi. I limiti riguardano le scansioni richieste dalle app, non quelle che il sistema fa per conto suo.',
          'Apps that measure nearby networks (channels, AP signal) request scans through the Android APIs (WifiManager.startScan), which are throttled: from version 9 each foreground app may scan 4 times every 2 minutes and all background apps together once every 30 minutes. That is why an analyser app may seem “slow” to refresh. The limits apply to scans requested by apps, not to those the system performs on its own.',
        ] },
        { list: [
          ['Da Android 10, in Opzioni sviluppatore › Rete, l’opzione di limitazione della scansione Wi-Fi (Wi-Fi scan throttling) si può disattivare per i test.', 'From Android 10, in Developer options › Networking, the Wi-Fi scan throttling option can be turned off for testing.'],
          ['Da Android 10, per WifiManager.startScan() servono i permessi ACCESS_FINE_LOCATION e CHANGE_WIFI_STATE e la localizzazione attiva sul telefono; per getScanResults() servono ACCESS_FINE_LOCATION, ACCESS_WIFI_STATE e la localizzazione attiva. ACCESS_FINE_LOCATION è obbligatorio per le app che puntano ad Android 10 o successivi (con un target inferiore basta anche ACCESS_COARSE_LOCATION) e resta necessario anche puntando ad Android 13 o successivi: il permesso NEARBY_WIFI_DEVICES di Android 13 copre altre API Wi-Fi (hotspot locale, Wi-Fi Aware, Wi-Fi Direct, RTT), non queste.', 'From Android 10, WifiManager.startScan() needs the ACCESS_FINE_LOCATION and CHANGE_WIFI_STATE permissions and location turned on in the phone; getScanResults() needs ACCESS_FINE_LOCATION, ACCESS_WIFI_STATE and location turned on. ACCESS_FINE_LOCATION is mandatory for apps targeting Android 10 or later (with a lower target ACCESS_COARSE_LOCATION is also enough) and is still required when targeting Android 13 or later: the Android 13 NEARBY_WIFI_DEVICES permission covers other Wi-Fi APIs (local-only hotspot, Wi-Fi Aware, Wi-Fi Direct, RTT), not these.'],
          ['A test finito riattiva la limitazione: serve a risparmiare batteria.', 'When testing is done turn throttling back on: it saves battery.'],
        ] },
      ],
    },
    {
      title: ['Passo 5 · Controlla il MAC casuale', 'Step 5 · Check the randomised MAC'],
      blocks: [
        { p: [
          'Da Android 10 il telefono usa di default un indirizzo MAC casuale persistente: è derivato dal profilo della rete (per esempio SSID e tipo di sicurezza) e resta normalmente stabile per quella configurazione, anche se dimentichi e ricrei la rete, fino al ripristino del dispositivo.',
          'From Android 10 the phone uses a persistent random MAC address by default: it is derived from the network profile (for example SSID and security type) and normally stays stable for that configuration, even if you forget and re-add the network, until the device is reset.',
        ] },
        { p: [
          'Da Android 12 è disponibile anche la randomizzazione non persistente, usata solo in casi specifici: per le reti suggerite da un’app che la richiede, oppure per le reti aperte senza captive portal se il produttore l’ha abilitata (di default no). Quando questa modalità è in uso, Android rigenera il MAC all’inizio di una connessione solo se il lease DHCP è scaduto e sono passate più di 4 ore dalla disconnessione, oppure se il MAC è stato generato da più di 24 ore; altrimenti riusa quello precedente. Non significa un MAC nuovo a ogni connessione, e il comportamento predefinito resta quello persistente. L’opzione «Wi-Fi non-persistent MAC randomization» è nelle Opzioni sviluppatore da Android 11.',
          'From Android 12 non-persistent randomisation is also available, used only in specific cases: for networks suggested by an app that requests it, or for open networks without a captive portal if the manufacturer has enabled it (off by default). When this mode is in use, Android regenerates the MAC at the start of a connection only if the DHCP lease has expired and more than 4 hours have passed since disconnection, or if the MAC was generated more than 24 hours earlier; otherwise it reuses the previous one. It does not mean a new MAC at every connection, and the default behaviour remains persistent. The “Wi-Fi non-persistent MAC randomization” option is in Developer options from Android 11.',
        ] },
        { p: [
          'Un MAC diverso da quello hardware (di fabbrica) del dispositivo spiega molti problemi: controlli basati sul MAC, MAB sul sistema NAC, policy RADIUS legate al MAC, prenotazioni DHCP, captive portal che «dimenticano» il dispositivo, client che nei log del controller sembrano dispositivi diversi.',
          'A MAC different from the device’s hardware (factory) MAC explains many problems: MAC-based controls, MAB on the NAC system, MAC-based RADIUS policies, DHCP reservations, captive portals that “forget” the device, clients that look like different devices in the controller logs.',
        ] },
        { list: [
          ['Nei dettagli della rete, nella voce sulla privacy, puoi scegliere per quella rete se usare il MAC casuale o quello del dispositivo.', 'In the network details, under the privacy entry, you can choose for that network whether to use the random MAC or the device MAC.'],
          ['Per un test, confronta il MAC mostrato nei dettagli della rete con quello visto dall’access point o dal controller.', 'For a test, compare the MAC shown in the network details with the one seen by the access point or controller.'],
        ] },
        { tool: '#/l2/mac', label: ['Il convertitore MAC riconosce un indirizzo amministrato localmente (bit U/L a 1): è una caratteristica tipica dei MAC casuali, ma da sola non dimostra che l’indirizzo sia casuale.', 'The MAC converter recognises a locally administered address (U/L bit set): it is typical of randomised MACs, but on its own it does not prove the address is random.'] },
      ],
    },
    {
      title: ['Passo 6 · Escludi il passaggio automatico alla rete mobile', 'Step 6 · Rule out automatic switching to mobile data'],
      blocks: [
        { p: [
          'L’opzione «Trasferimento aggressivo dal Wi-Fi alla rete cellulare», se presente sul dispositivo, fa passare più facilmente la connessione dati alla rete mobile quando il segnale Wi-Fi è debole. Il traffico può spostarsi sulla rete mobile anche mentre il telefono resta associato al Wi-Fi, e questo complica la diagnosi: controlla che l’opzione sia disattivata, oppure disattiva i dati mobili mentre riproduci il problema. Molti produttori hanno anche una funzione simile, con nomi diversi, nelle impostazioni Wi-Fi avanzate o nelle impostazioni dei dati mobili: se non la trovi, usa la ricerca nelle impostazioni.',
          'The “Aggressive Wi-Fi to cellular handover” option, where the device has it, hands the data connection over to mobile data more readily when the Wi-Fi signal is weak. Traffic may move to mobile data even while the phone stays associated with the Wi-Fi, which makes diagnosis harder: check that the option is off, or turn off mobile data while reproducing the problem. Many manufacturers also have a similar feature, under different names, in the advanced Wi-Fi settings or the mobile data settings: if you cannot find it, use the settings search.',
        ] },
      ],
    },
    {
      title: ['Passo 7 · Raccogli la segnalazione di bug', 'Step 7 · Capture a bug report'],
      blocks: [
        { p: [
          'Subito dopo aver riprodotto il problema, in Opzioni sviluppatore tocca «Acquisisci segnalazione di bug» (Take bug report), scegli il tipo e conferma. Quando arriva la notifica, toccala per condividere il file .zip con chi deve analizzarlo.',
          'Right after reproducing the problem, in Developer options tap “Take bug report”, choose the type and confirm. When the notification arrives, tap it to share the .zip file with whoever will analyse it.',
        ] },
        { p: ['Dal computer, con Debug USB (o Debug wireless) attivo nelle Opzioni sviluppatore:', 'From the computer, with USB debugging (or Wireless debugging) on in Developer options:'] },
        { code: 'adb devices', note: ['Elenca i dispositivi collegati: alla prima connessione conferma l’autorizzazione sul telefono.', 'Lists the connected devices: on the first connection confirm the authorisation on the phone.'] },
        { code: 'adb bugreport', note: ['Crea il file bugreport-<build>-<data>.zip nella cartella corrente. Contiene dumpsys (stato dei servizi di sistema), dumpstate e logcat (i log di sistema).', 'Creates the bugreport-<build>-<date>.zip file in the current folder. It contains dumpsys (system service state), dumpstate and logcat (system logs).'] },
        { code: 'adb shell dumpsys wifi', note: ['Mostra lo stato diagnostico interno del servizio Wi-Fi: può includere configurazione e connessione correnti, statistiche, scansioni ed eventi recenti. Contenuto e formato non sono un’interfaccia stabile e cambiano tra versioni di Android e produttori.', 'Shows the internal diagnostic state of the Wi-Fi service: it may include the current configuration and connection, statistics, scans and recent events. Content and format are not a stable interface and change between Android versions and manufacturers.'] },
        { p: [
          'Esempio reale di cosa cercare. Per la connessione corrente filtra la riga mWifiInfo:',
          'A real example of what to look for. For the current connection filter the mWifiInfo line:',
        ] },
        { code: 'adb shell "dumpsys wifi | grep mWifiInfo"', note: ['Il filtro gira sul telefono, quindi il comando funziona uguale da Windows, macOS e Linux.', 'The filter runs on the phone, so the command works the same from Windows, macOS and Linux.'] },
        { console: `mWifiInfo SSID: "corp-wifi", BSSID: aa:bb:cc:dd:ee:01, MAC: da:a1:19:12:34:56, IP: /192.0.2.50, Security type: 2, Supplicant state: COMPLETED, Wi-Fi standard: 11ac, RSSI: -42, Link speed: 866Mbps, Tx Link speed: 866Mbps, Max Supported Tx Link speed: 866Mbps, Rx Link speed: 780Mbps, Max Supported Rx Link speed: 866Mbps, Frequency: 5260MHz, Net ID: 14, Metered hint: false, score: 60, isUsable: true, …`, lang: 'en', caption: ['Galaxy S23 (SM-S911B), Android 16, 5 ottobre 2026. SSID, BSSID, MAC e IP sostituiti con valori d’esempio, riga accorciata (…).', 'Galaxy S23 (SM-S911B), Android 16, 5 October 2026. SSID, BSSID, MAC and IP replaced with sample values, line shortened (…).'] },
        { table: {
          head: [['Campo', 'Field'], ['Come leggerlo', 'How to read it']],
          rows: [
            ['BSSID', ['l’access point (radio) a cui il telefono è associato: è il valore da cercare sul controller', 'the access point (radio) the phone is associated with: the value to look up on the controller']],
            ['RSSI', ['−42 dBm: segnale molto forte; da leggere insieme a SNR e ritrasmissioni del controller', '−42 dBm: very strong signal; read it together with the controller SNR and retries']],
            ['Frequency', ['5260 MHz = canale 52 (U-NII-2A, con DFS)', '5260 MHz = channel 52 (U-NII-2A, with DFS)']],
            ['Wi-Fi standard', ['11ac = Wi-Fi 5; con 11ax o 11be (Wi-Fi 6, 7) cambiano rate e funzioni disponibili', '11ac = Wi-Fi 5; with 11ax or 11be (Wi-Fi 6, 7) available rates and features change']],
            ['Link speed · Tx · Rx', ['rate di collegamento attuali (866 e 780 Mbps) e massimi supportati: non sono il throughput delle applicazioni', 'current link rates (866 and 780 Mbps) and maximum supported: not the applications’ throughput']],
            ['Security type', ['2 = PSK (WPA2-Personal) secondo le costanti AOSP: 0 aperta, 3 EAP (802.1X), 4 SAE (WPA3-Personal), 6 OWE', '2 = PSK (WPA2-Personal) per the AOSP constants: 0 open, 3 EAP (802.1X), 4 SAE (WPA3-Personal), 6 OWE']],
            ['Supplicant state', ['COMPLETED = il supplicant ha completato connessione e autenticazione a livello 2; non dice nulla su DHCP, IP o Internet. Stati come ASSOCIATING o FOUR_WAY_HANDSHAKE che restano fermi indicano dove si blocca', 'COMPLETED = the supplicant has completed the layer 2 connection and authentication; it says nothing about DHCP, IP or Internet. States such as ASSOCIATING or FOUR_WAY_HANDSHAKE that stay put show where it stalls']],
            ['MAC', ['il MAC usato per questa rete: qui è amministrato localmente, compatibile con un MAC casuale di Android, ma il bit U/L da solo non lo dimostra (vedi il passo 5)', 'the MAC used for this network: here it is locally administered, compatible with an Android random MAC, but the U/L bit alone does not prove it (see step 5)']],
          ],
        } },
        { p: [
          'Per la cronologia, su questo telefono la sezione StaEventList (dentro WifiMetrics) elenca gli eventi di ogni connessione. Per vedere gli ultimi:',
          'For the history, on this phone the StaEventList section (inside WifiMetrics) lists the events of each connection. To see the latest:',
        ] },
        { code: 'adb shell "dumpsys wifi | grep -E \'ASSOCIATION_REJECTION_EVENT|AUTHENTICATION_FAILURE_EVENT|CMD_ASSOCIATED_BSSID|NETWORK_CONNECTION_EVENT|CMD_IP_CONFIGURATION_SUCCESSFUL|CMD_IP_CONFIGURATION_LOST|CMD_IP_REACHABILITY_LOST|NETWORK_AGENT_VALID_NETWORK|NETWORK_DISCONNECTION_EVENT\' | tail -n 20"', note: ['Mostra gli ultimi 20 eventi di rifiuto dell’associazione, fallimento dell’autenticazione, associazione, connessione, IP provisioning (riuscito o perso), validazione e disconnessione.', 'Shows the last 20 association rejection, authentication failure, association, connection, IP provisioning (successful or lost), validation and disconnection events.'] },
        { console: `10-05 09:29:24.134 MAC_CHANGE screenOn=false cellularData=true …
10-05 09:29:24.183 CMD_START_CONNECT screenOn=false cellularData=true …
10-05 09:29:24.402 CMD_ASSOCIATED_BSSID lastRssi=-56 lastFreq=5260 lastLinkSpeed=468 … supplicantStateChangeEvents: { ASSOCIATING ASSOCIATED } …
10-05 09:29:24.436 NETWORK_CONNECTION_EVENT … supplicantStateChangeEvents: { FOUR_WAY_HANDSHAKE GROUP_HANDSHAKE } …
10-05 09:29:26.615 CMD_IP_CONFIGURATION_SUCCESSFUL lastRssi=-55 lastFreq=5260 lastLinkSpeed=468 … supplicantStateChangeEvents: { COMPLETED } …
10-05 09:29:28.420 NETWORK_AGENT_VALID_NETWORK screenOn=false cellularData=true …

10-04 20:33:12.352 NETWORK_DISCONNECTION_EVENT local_gen=true reason=3:DEAUTH_LEAVING …
10-05 08:55:41.749 NETWORK_DISCONNECTION_EVENT local_gen=false reason=-1:UNSPECIFIED lastRssi=-63 lastFreq=5180 lastLinkSpeed=351 lastScore=60 …`, lang: 'en', caption: ['Stesso telefono: una connessione completa e due disconnessioni. Righe accorciate (…), tolti contatori di traffico e configurazione.', 'Same phone: one complete connection and two disconnections. Lines shortened (…), traffic counters and configuration removed.'] },
        { table: {
          head: [['Evento', 'Event'], ['Fase e significato', 'Stage and meaning']],
          rows: [
            ['MAC_CHANGE · CMD_START_CONNECT', ['il telefono imposta il MAC per questa rete e avvia la connessione', 'the phone sets the MAC for this network and starts connecting']],
            ['CMD_ASSOCIATED_BSSID', ['fase 2, associazione: { ASSOCIATING ASSOCIATED }, con RSSI, frequenza e link speed del momento', 'stage 2, association: { ASSOCIATING ASSOCIATED }, with the current RSSI, frequency and link speed']],
            ['NETWORK_CONNECTION_EVENT', ['il supplicant segnala la connessione alla rete (evento di livello 2); supplicantStateChangeEvents mostra gli stati attraversati, qui { FOUR_WAY_HANDSHAKE GROUP_HANDSHAKE }', 'the supplicant reports the connection to the network (layer 2 event); supplicantStateChangeEvents shows the states passed through, here { FOUR_WAY_HANDSHAKE GROUP_HANDSHAKE }']],
            ['ASSOCIATION_REJECTION_EVENT · AUTHENTICATION_FAILURE_EVENT', ['non compaiono nell’esempio: associazione rifiutata (con status 802.11 e timedOut) e autenticazione fallita (con reason); sono i primi da cercare quando la connessione non parte', 'not in the example: association rejected (with 802.11 status and timedOut) and authentication failed (with reason); they are the first to look for when the connection does not start']],
            ['CMD_IP_CONFIGURATION_SUCCESSFUL', ['fase 4, IP provisioning completato (indirizzo IPv4 via DHCP e/o configurazione IPv6); { COMPLETED }', 'stage 4, IP provisioning completed (IPv4 address via DHCP and/or IPv6 configuration); { COMPLETED }']],
            ['CMD_IP_CONFIGURATION_LOST · CMD_IP_REACHABILITY_LOST', ['non compaiono nell’esempio: IP provisioning non completato, oppure persa la raggiungibilità dei vicini di rete (per esempio il gateway)', 'not in the example: IP provisioning not completed, or reachability to network neighbours lost (for example the gateway)']],
            ['NETWORK_AGENT_VALID_NETWORK', ['fase 6, Android ha validato l’accesso a Internet', 'stage 6, Android has validated Internet access']],
            ['NETWORK_DISCONNECTION_EVENT', ['local_gen=true: disconnessione generata localmente dal client (qui reason=3, DEAUTH_LEAVING: il client lascia la rete); local_gen=false: non generata localmente, cioè secondo la descrizione AOSP dal lato AP, spesso una deautenticazione o disassociazione ricevuta. In entrambi i casi va correlata con il codice reason 802.11 (−1 = non specificato) e con i log dell’AP o del controller; lastRssi e lastFreq mostrano le condizioni radio al momento', 'local_gen=true: disconnection generated locally by the client (here reason=3, DEAUTH_LEAVING: the client leaves the network); local_gen=false: not generated locally, that is from the AP side according to the AOSP description, often a received deauthentication or disassociation. In both cases correlate it with the 802.11 reason code (−1 = unspecified) and with the AP or controller logs; lastRssi and lastFreq show the radio conditions at that moment']],
          ],
        } },
        { p: [
          'Se la sequenza non arriva a NETWORK_CONNECTION_EVENT, cerca ASSOCIATION_REJECTION_EVENT o AUTHENTICATION_FAILURE_EVENT e gli stati del supplicant per distinguere un problema di associazione, di autenticazione o di scambio delle chiavi; senza CMD_IP_CONFIGURATION_SUCCESSFUL, o con CMD_IP_CONFIGURATION_LOST, il problema è nella fase di IP provisioning (per esempio DHCP per IPv4 o configurazione IPv6); senza NETWORK_AGENT_VALID_NETWORK è la validazione (Internet, DNS, proxy, captive portal). Nomi e sezioni sono quelli di questo telefono: su altre versioni o produttori possono cambiare.',
          'If the sequence does not reach NETWORK_CONNECTION_EVENT, look for ASSOCIATION_REJECTION_EVENT or AUTHENTICATION_FAILURE_EVENT and the supplicant states to tell an association, authentication or key exchange problem apart; without CMD_IP_CONFIGURATION_SUCCESSFUL, or with CMD_IP_CONFIGURATION_LOST, the problem is in the IP provisioning stage (for example DHCP for IPv4 or IPv6 configuration); without NETWORK_AGENT_VALID_NETWORK it is validation (Internet, DNS, proxy, captive portal). Names and sections are those of this phone: on other versions or manufacturers they may change.',
        ] },
        { warn: [
          'Segnalazione di bug e dumpsys contengono molti dati personali e di rete: nomi delle reti, indirizzi e identificativi, app installate, account, log di sistema e delle altre app. Condividili solo con chi deve analizzarli, su un canale riservato, e non pubblicarli mai su forum o ticket pubblici.',
          'Bug reports and dumpsys contain a lot of personal and network data: network names, addresses and identifiers, installed apps, accounts, system and other apps’ logs. Share them only with whoever needs to analyse them, over a private channel, and never post them on forums or public tickets.',
        ] },
      ],
    },
    {
      title: ['Cosa cercare', 'What to look for'],
      blocks: [
        { table: {
          head: [['Sintomo', 'Symptom'], ['Dove guardare', 'Where to look']],
          rows: [
            [['Si disconnette spesso', 'Disconnects often'], ['RSSI, SNR e ritrasmissioni: un segnale basso aumenta adattamento del rate, ritrasmissioni e instabilità. −67/−70 dBm sono riferimenti di progetto diffusi, non soglie universali (contano anche SNR, banda, MCS e tipo di traffico). Android usa soglie interne configurabili dai produttori nella logica AOSP di selezione e valutazione della rete: per esempio −73 dBm a 2,4 GHz e −70 dBm a 5/6 GHz, più soglie d’ingresso più basse per i candidati. Confronta l’orario con i log del controller', 'RSSI, SNR and retries: a low signal increases rate adaptation, retransmissions and instability. −67/−70 dBm are common design references, not universal thresholds (SNR, band, MCS and traffic type also matter). Android uses internal thresholds that manufacturers can configure in the AOSP network selection and scoring logic: for example −73 dBm at 2.4 GHz and −70 dBm at 5/6 GHz, plus lower entry thresholds for candidates. Compare the time with the controller logs']],
            [['Resta associato a un AP peggiore', 'Stays associated with a worse AP'], ['il client rimane su un BSSID con qualità radio peggiore anche se ci sono candidati migliori: la decisione di roaming è del client; parte delle scansioni e delle decisioni può essere gestita dal firmware o dal driver, in particolare a schermo spento e in risparmio energetico. Con il logging dettagliato annota BSSID e segnale mentre ti sposti; verifica sul controller gli eventi di roaming e, se usati da WLAN e client, il supporto di 802.11k (informazioni sui vicini), 802.11v (BSS Transition Management) e 802.11r (Fast BSS Transition)', 'the client stays on a BSSID with worse radio quality even though better candidates exist: the roaming decision belongs to the client; some scans and decisions may be handled by the firmware or driver, especially with the screen off and in power saving. With verbose logging note BSSID and signal as you move; check the roaming events on the controller and, where the WLAN and client use them, support for 802.11k (neighbour information), 802.11v (BSS Transition Management) and 802.11r (Fast BSS Transition)']],
            [['Non si autentica', 'Fails to authenticate'], ['MAC casuale contro controlli basati sul MAC o MAB. Per 802.1X controlla metodo EAP, eventuale metodo interno, identità e identità anonima, certificato client per EAP-TLS, CA del server e dominio del certificato: da Android 12 la validazione del certificato del server è obbligatoria, da Android 13 c’è anche il TOFU', 'random MAC against MAC-based controls or MAB. For 802.1X check the EAP method, inner method if any, identity and anonymous identity, client certificate for EAP-TLS, server CA and certificate domain: from Android 12 server certificate validation is mandatory, from Android 13 TOFU is also available']],
            [['Connesso ma senza Internet', 'Connected but no Internet'], ['IP, gateway e DNS nei dettagli della rete; la validazione di Android (rete «senza Internet» o captive portal anche con DHCP e gateway funzionanti); passaggio del traffico alla rete mobile', 'IP, gateway and DNS in the network details; Android validation (network “without Internet” or captive portal even with DHCP and gateway working); traffic moving to mobile data']],
            [['Funziona solo con alcune reti', 'Works only with some networks'], ['WPA2 o WPA3, transition mode e PMF (Protected Management Frames, introdotti da 802.11w e oggi parte dello standard 802.11; richiesti da WPA3): Android supporta WPA3 da Android 10 e l’indicazione «transition disable» da Android 12, ma il comportamento dipende anche da chipset, driver e firmware; banda e canale supportati dal telefono', 'WPA2 or WPA3, transition mode and PMF (Protected Management Frames, introduced by 802.11w and now part of the 802.11 standard; required by WPA3): Android supports WPA3 from Android 10 and the “transition disable” indication from Android 12, but behaviour also depends on chipset, driver and firmware; band and channel supported by the phone']],
          ],
        } },
        { p: ['Sono indizi da confermare con i dati dell’infrastruttura: lo stesso problema visto da client e controller è molto più facile da risolvere.', 'These are clues to confirm with infrastructure data: the same problem seen from both client and controller is much easier to solve.'] },
      ],
    },
    {
      title: ['Passo 8 · Rimetti tutto com’era', 'Step 8 · Put everything back'],
      blocks: [
        { list: [
          ['Disattiva il logging dettagliato del Wi-Fi e riattiva la limitazione della scansione.', 'Turn off Wi-Fi verbose logging and turn scan throttling back on.'],
          ['Ripristina la scelta del MAC (casuale o del dispositivo) della rete su cui hai fatto le prove.', 'Restore the MAC choice (random or device) of the network you tested.'],
          ['Disattiva Debug USB e Debug wireless. Se non servono più, disattiva anche le Opzioni sviluppatore con l’interruttore in cima alla pagina: la maggior parte delle opzioni torna disabilitata.', 'Turn off USB debugging and Wireless debugging. If no longer needed, also turn off Developer options with the switch at the top of the page: most options go back to disabled.'],
        ] },
      ],
    },
  ],
  sources: [
    { label: ['Android Developers: Configurare le opzioni sviluppatore sul dispositivo', 'Android Developers: Configure on-device developer options'],
      url: ['https://developer.android.com/studio/debug/dev-options?hl=it', 'https://developer.android.com/studio/debug/dev-options?hl=en'] },
    { label: ['Android Developers: Panoramica della scansione Wi-Fi', 'Android Developers: Wi-Fi scanning overview'],
      url: ['https://developer.android.com/develop/connectivity/wifi/wifi-scan?hl=it', 'https://developer.android.com/develop/connectivity/wifi/wifi-scan?hl=en'] },
    { label: ['Android Open Source Project: Comportamento della randomizzazione MAC', 'Android Open Source Project: MAC randomization behavior'],
      url: ['https://source.android.com/docs/core/connect/wifi-mac-randomization-behavior?hl=it', 'https://source.android.com/docs/core/connect/wifi-mac-randomization-behavior?hl=en'] },
    { label: ['Android Developers: Permessi Wi-Fi (NEARBY_WIFI_DEVICES e posizione)', 'Android Developers: Wi-Fi permissions (NEARBY_WIFI_DEVICES and location)'],
      url: ['https://developer.android.com/develop/connectivity/wifi/wifi-permissions?hl=it', 'https://developer.android.com/develop/connectivity/wifi/wifi-permissions?hl=en'] },
    { label: ['Android Developers: WifiInfo (RSSI, link speed, standard Wi-Fi, MLO)', 'Android Developers: WifiInfo (RSSI, link speed, Wi-Fi standard, MLO)'],
      url: ['https://developer.android.com/reference/android/net/wifi/WifiInfo?hl=it', 'https://developer.android.com/reference/android/net/wifi/WifiInfo?hl=en'] },
    { label: ['Android Open Source Project: Selezione della rete Wi-Fi (soglie RSSI)', 'Android Open Source Project: Wi-Fi network selection (RSSI thresholds)'],
      url: ['https://source.android.com/docs/core/connect/wifi-network-selection?hl=it', 'https://source.android.com/docs/core/connect/wifi-network-selection?hl=en'] },
    { label: ['Android Open Source Project: TOFU per WPA-Enterprise', 'Android Open Source Project: TOFU for WPA-Enterprise'],
      url: ['https://source.android.com/docs/core/connect/wifi-tofu?hl=it', 'https://source.android.com/docs/core/connect/wifi-tofu?hl=en'] },
    { label: ['Android Open Source Project: WPA3 e Wi-Fi Enhanced Open', 'Android Open Source Project: WPA3 and Wi-Fi Enhanced Open'],
      url: ['https://source.android.com/docs/core/connect/wifi-wpa3-owe?hl=it', 'https://source.android.com/docs/core/connect/wifi-wpa3-owe?hl=en'] },
    { label: ['Android Developers: Acquisire e leggere le segnalazioni di bug', 'Android Developers: Capture and read bug reports'],
      url: ['https://developer.android.com/studio/debug/bug-report?hl=it', 'https://developer.android.com/studio/debug/bug-report?hl=en'] },
    { label: ['Android Developers: adb, anche via Wi-Fi', 'Android Developers: adb, including over Wi-Fi'],
      url: ['https://developer.android.com/tools/adb?hl=it', 'https://developer.android.com/tools/adb?hl=en'] },
    { label: ['Android Developers: dumpsys', 'Android Developers: dumpsys'],
      url: ['https://developer.android.com/tools/dumpsys?hl=it', 'https://developer.android.com/tools/dumpsys?hl=en'] },
  ],
};
