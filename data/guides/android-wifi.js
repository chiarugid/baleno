// Guida: troubleshooting Wi-Fi su Android con le Opzioni sviluppatore.
// Ogni testo è una coppia [italiano, inglese]. Nomi delle opzioni e comportamenti verificati
// sulla documentazione ufficiale Android (ottobre 2026); i menu possono variare per produttore e versione.

export default {
  id: 'android-wifi',
  topic: ['Wireless · Android', 'Wireless · Android'],
  level: ['Intermedio', 'Intermediate'],
  minutes: 20,
  navTitle: ['Troubleshooting Wi-Fi su Android', 'Wi-Fi troubleshooting on Android'],
  title: ['Troubleshooting Wi-Fi su Android con le Opzioni sviluppatore', 'Wi-Fi troubleshooting on Android with Developer options'],
  summary: [
    'Come raccogliere dal telefono le informazioni utili quando un client Android si disconnette, non si autentica o resta su un access point lontano: logging dettagliato, scansione, MAC casuale e segnalazione di bug.',
    'How to collect useful information from the phone when an Android client disconnects, fails to authenticate or sticks to a distant access point: verbose logging, scanning, randomised MAC and bug reports.',
  ],
  keywords: ['android wi-fi wifi troubleshooting opzioni sviluppatore logging dettagliato scansione mac casuale randomizzato bugreport adb dumpsys smartphone', 'android wi-fi wifi troubleshooting developer options verbose logging scan throttling randomized mac bugreport adb dumpsys smartphone'],
  sections: [
    {
      title: ['A cosa serve', 'What it is for'],
      blocks: [
        { p: [
          'Quando un problema Wi-Fi riguarda un solo tipo di dispositivo, la parte più utile delle informazioni sta sul client: con quale access point era associato, con che segnale, con quale indirizzo MAC, cosa ha registrato il sistema. Android mostra molti di questi dati nelle impostazioni e, con le Opzioni sviluppatore, ne aggiunge altri pensati per il debug.',
          'When a Wi-Fi problem affects only one kind of device, the most useful information is on the client: which access point it was associated with, at what signal, with which MAC address, what the system logged. Android shows much of this data in its settings and, with Developer options, adds more that is meant for debugging.',
        ] },
        { warn: [
          'Le Opzioni sviluppatore cambiano il comportamento del sistema. Attiva solo quello che serve al test e, alla fine, rimetti tutto com’era (vedi l’ultimo passo). Nomi e percorsi dei menu cambiano tra produttori e versioni di Android.',
          'Developer options change how the system behaves. Turn on only what the test needs and, at the end, put everything back as it was (see the last step). Menu names and paths differ between manufacturers and Android versions.',
        ] },
      ],
    },
    {
      title: ['Prerequisiti', 'Prerequisites'],
      blocks: [
        { list: [
          ['Uno smartphone o tablet Android su cui riprodurre il problema.', 'An Android phone or tablet on which to reproduce the problem.'],
          ['Per i comandi adb: un computer con Android SDK Platform-Tools e un cavo USB.', 'For the adb commands: a computer with Android SDK Platform-Tools and a USB cable.'],
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
      title: ['Passo 2 · Leggi i dettagli della rete', 'Step 2 · Read the network details'],
      blocks: [
        { p: [
          'Anche senza Opzioni sviluppatore, aprendo la rete Wi-Fi a cui sei connesso (Impostazioni › Rete e Internet › Internet, o Connessioni › Wi-Fi, poi la rotella della rete) trovi in genere intensità del segnale, frequenza, sicurezza, indirizzo MAC usato, indirizzo IP, gateway e DNS. Annotali prima di cambiare qualcosa.',
          'Even without Developer options, opening the Wi-Fi network you are connected to (Settings › Network & internet › Internet, or Connections › Wi-Fi, then the network’s gear icon) usually shows signal strength, frequency, security, the MAC address in use, IP address, gateway and DNS. Note them down before changing anything.',
        ] },
        { tool: '#/wireless/potenza', label: ['Per valutare il segnale rispetto all’RSSI di progetto (per esempio −67 dBm per la voce) usa lo strumento dBm / mW / EIRP.', 'To assess the signal against the design RSSI (for example −67 dBm for voice) use the dBm / mW / EIRP tool.'] },
      ],
    },
    {
      title: ['Passo 3 · Attiva il logging dettagliato del Wi-Fi', 'Step 3 · Enable Wi-Fi verbose logging'],
      blocks: [
        { p: [
          'In Opzioni sviluppatore › Rete attiva «Attiva il logging dettagliato del Wi-Fi» (Enable Wi-Fi verbose logging). Secondo la documentazione Android aumenta il livello di logging del Wi-Fi per ogni rete a cui ti connetti, in base all’intensità del segnale ricevuto (RSSI). Su molte versioni, con l’opzione attiva, anche l’elenco delle reti e i dettagli mostrano informazioni tecniche aggiuntive.',
          'In Developer options › Networking turn on “Enable Wi-Fi verbose logging”. According to the Android documentation it raises the Wi-Fi logging level for each network you connect to, based on received signal strength (RSSI). On many versions, with the option on, the network list and details also show additional technical information.',
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
          'Le app che misurano le reti vicine (canali, segnale degli AP) dipendono dalle scansioni, che Android limita: dalla versione 9 ogni app in primo piano può fare 4 scansioni ogni 2 minuti e tutte le app in background insieme una ogni 30 minuti. Per questo un’app di analisi può sembrare «lenta» ad aggiornarsi.',
          'Apps that measure nearby networks (channels, AP signal) depend on scans, which Android throttles: from version 9 each foreground app may scan 4 times every 2 minutes and all background apps together once every 30 minutes. That is why an analyser app may seem “slow” to refresh.',
        ] },
        { list: [
          ['Da Android 10, in Opzioni sviluppatore › Rete, l’opzione di limitazione della scansione Wi-Fi (Wi-Fi scan throttling) si può disattivare per i test.', 'From Android 10, in Developer options › Networking, the Wi-Fi scan throttling option can be turned off for testing.'],
          ['Per le scansioni la localizzazione del telefono deve essere attiva e l’app deve avere il permesso di posizione.', 'For scans the phone’s location must be on and the app must have the location permission.'],
          ['A test finito riattiva la limitazione: serve a risparmiare batteria.', 'When testing is done turn throttling back on: it saves battery.'],
        ] },
      ],
    },
    {
      title: ['Passo 5 · Controlla il MAC casuale', 'Step 5 · Check the randomised MAC'],
      blocks: [
        { p: [
          'Da Android 10 il telefono usa di default un indirizzo MAC casuale, diverso per ogni rete ma stabile nel tempo per la stessa rete. Da Android 12 è disponibile anche la randomizzazione non persistente: per alcune reti Android può generare un nuovo MAC all’inizio di una connessione, secondo condizioni definite dal sistema (per esempio lease DHCP scaduto e più di 4 ore dalla disconnessione, oppure MAC generato da più di 24 ore). Non significa un MAC nuovo a ogni connessione, e il comportamento predefinito resta quello persistente. L’opzione «Wi-Fi non-persistent MAC randomization» è nelle Opzioni sviluppatore da Android 11.',
          'From Android 10 the phone uses a random MAC address by default, different for each network but stable over time for the same network. From Android 12 non-persistent randomisation is also available: for some networks Android may generate a new MAC at the start of a connection, under conditions defined by the system (for example DHCP lease expired and more than 4 hours since disconnection, or a MAC generated more than 24 hours earlier). It does not mean a new MAC at every connection, and the default behaviour remains persistent. The “Wi-Fi non-persistent MAC randomization” option is in Developer options from Android 11.',
        ] },
        { p: [
          'Un MAC che non è quello stampato sul dispositivo spiega molti problemi: filtri MAC, prenotazioni DHCP, autenticazione MAB su NAC o RADIUS, captive portal che «dimenticano» il dispositivo, client che nei log del controller sembrano dispositivi diversi.',
          'A MAC that is not the one printed on the device explains many problems: MAC filters, DHCP reservations, MAB authentication on NAC or RADIUS, captive portals that “forget” the device, clients that look like different devices in the controller logs.',
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
          'L’opzione «Trasferimento aggressivo dal Wi-Fi alla rete cellulare», se presente sul dispositivo, fa passare il telefono alla rete mobile più facilmente quando il segnale Wi-Fi è debole. Durante un test può far sembrare il Wi-Fi «caduto» quando in realtà il telefono ha scelto i dati mobili: controlla che sia disattivata, oppure disattiva i dati mobili mentre riproduci il problema. Molti produttori hanno anche una funzione simile nelle impostazioni Wi-Fi avanzate.',
          'The “Aggressive Wi-Fi to cellular handover” option, where the device has it, makes the phone move to mobile data more easily when the Wi-Fi signal is weak. During a test it can make the Wi-Fi look “dropped” when the phone actually chose mobile data: check that it is off, or turn off mobile data while reproducing the problem. Many manufacturers also have a similar feature in the advanced Wi-Fi settings.',
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
        { p: ['Dal computer, con Debug USB attivo nelle Opzioni sviluppatore e il telefono collegato:', 'From the computer, with USB debugging on in Developer options and the phone connected:'] },
        { code: 'adb devices', note: ['Elenca i dispositivi collegati: alla prima connessione conferma l’autorizzazione sul telefono.', 'Lists the connected devices: on the first connection confirm the authorisation on the phone.'] },
        { code: 'adb bugreport', note: ['Crea il file bugreport-<build>-<data>.zip nella cartella corrente. Contiene dumpsys (stato dei servizi di sistema), dumpstate e logcat (i log di sistema).', 'Creates the bugreport-<build>-<date>.zip file in the current folder. It contains dumpsys (system service state), dumpstate and logcat (system logs).'] },
        { code: 'adb shell dumpsys wifi', note: ['Stampa subito lo stato del servizio Wi-Fi (rete corrente, eventi recenti), utile per un controllo veloce senza aspettare il bug report completo.', 'Prints the Wi-Fi service state right away (current network, recent events), useful for a quick check without waiting for the full bug report.'] },
        { warn: [
          'Segnalazione di bug e dumpsys contengono dati personali e di rete: nomi delle reti, indirizzi, app installate, account e log. Condividili solo con chi deve analizzarli.',
          'Bug reports and dumpsys contain personal and network data: network names, addresses, installed apps, accounts and logs. Share them only with whoever needs to analyse them.',
        ] },
      ],
    },
    {
      title: ['Cosa cercare', 'What to look for'],
      blocks: [
        { table: {
          head: [['Sintomo', 'Symptom'], ['Dove guardare', 'Where to look']],
          rows: [
            [['Si disconnette spesso', 'Disconnects often'], ['segnale nei dettagli della rete: un RSSI basso aumenta adattamento del rate, ritrasmissioni e instabilità; −67/−70 dBm sono riferimenti di progetto diffusi, non soglie universali (contano anche SNR, banda, MCS e tipo di traffico); confronta l’orario con i log del controller', 'signal in the network details: a low RSSI increases rate adaptation, retransmissions and instability; −67/−70 dBm are common design references, not universal thresholds (SNR, band, MCS and traffic type also matter); compare the time with the controller logs']],
            [['Resta su un AP lontano', 'Sticks to a distant AP'], ['con il logging dettagliato annota a quale AP è associato e con che segnale mentre ti sposti; verifica sul controller gli eventi di roaming e, se usati da WLAN e client, il supporto di 802.11k (informazioni sui vicini), 802.11v (transizione assistita) e 802.11r (autenticazione rapida)', 'with verbose logging note which AP it is associated with and at what signal as you move; check the roaming events on the controller and, where the WLAN and client use them, support for 802.11k (neighbour information), 802.11v (assisted transition) and 802.11r (fast authentication)']],
            [['Non si autentica', 'Fails to authenticate'], ['MAC casuale contro filtri o MAB; per 802.1X certificato del server, identità e dominio nel profilo', 'random MAC against filters or MAB; for 802.1X the server certificate, identity and domain in the profile']],
            [['Connesso ma senza Internet', 'Connected but no Internet'], ['IP, gateway e DNS nei dettagli della rete; captive portal; passaggio ai dati mobili', 'IP, gateway and DNS in the network details; captive portal; switch to mobile data']],
            [['Funziona solo con alcune reti', 'Works only with some networks'], ['sicurezza (WPA2, WPA3, transizione), banda e canale supportati dal telefono', 'security (WPA2, WPA3, transition), band and channel supported by the phone']],
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
          ['Disattiva Debug USB. Se non servono più, disattiva anche le Opzioni sviluppatore con l’interruttore in cima alla pagina: la maggior parte delle opzioni torna disabilitata.', 'Turn off USB debugging. If no longer needed, also turn off Developer options with the switch at the top of the page: most options go back to disabled.'],
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
    { label: ['Android Developers: Acquisire e leggere le segnalazioni di bug', 'Android Developers: Capture and read bug reports'],
      url: ['https://developer.android.com/studio/debug/bug-report?hl=it', 'https://developer.android.com/studio/debug/bug-report?hl=en'] },
  ],
};
