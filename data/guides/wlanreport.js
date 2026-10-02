// Guida: rapporto Wi-Fi di Windows con "netsh wlan show wlanreport".
// Ogni testo è una coppia [italiano, inglese]. Struttura e file del rapporto verificati
// su Windows 11 (build 26200) il 2 ottobre 2026; i dati dell'esempio sono inventati.

export default {
  id: 'wlanreport',
  topic: ['Wireless · Windows', 'Wireless · Windows'],
  level: ['Base', 'Basic'],
  minutes: 10,
  navTitle: ['Rapporto Wi-Fi di Windows', 'Windows Wi-Fi report'],
  title: ['Rapporto Wi-Fi di Windows con netsh wlan show wlanreport', 'Windows Wi-Fi report with netsh wlan show wlanreport'],
  summary: [
    'Come generare e leggere il rapporto HTML delle sessioni Wi-Fi degli ultimi giorni, per capire perché un PC si disconnette.',
    'How to generate and read the HTML report of recent Wi-Fi sessions, to understand why a PC disconnects.',
  ],
  keywords: ['netsh wlan wlanreport windows wi-fi wifi rapporto disconnessioni driver diagnostica', 'netsh wlan wlanreport windows wi-fi wifi report disconnections driver diagnostics'],
  sections: [
    {
      title: ['A cosa serve', 'What it is for'],
      blocks: [
        { p: [
          'Windows registra ogni connessione e disconnessione Wi-Fi nel registro eventi. Il comando raccoglie questi eventi (di default gli ultimi tre giorni), li raggruppa per sessione e produce un rapporto HTML con grafico, motivi delle disconnessioni, durate delle sessioni e configurazione della scheda.',
          'Windows logs every Wi-Fi connection and disconnection in the event log. The command collects these events (by default the last three days), groups them by session and produces an HTML report with a chart, disconnect reasons, session durations and the adapter configuration.',
        ] },
        { p: [
          'È il primo controllo da fare quando un utente segnala che «il Wi-Fi cade»: mostra quando è successo, quanto duravano le sessioni e cosa ha registrato Windows in quel momento.',
          'It is the first check to run when a user reports that “the Wi-Fi keeps dropping”: it shows when it happened, how long sessions lasted and what Windows logged at that moment.',
        ] },
      ],
    },
    {
      title: ['Prerequisiti', 'Prerequisites'],
      blocks: [
        { list: [
          ['Windows 10 o Windows 11 con una scheda Wi-Fi.', 'Windows 10 or Windows 11 with a Wi-Fi adapter.'],
          ['Un terminale aperto come amministratore: Prompt dei comandi, PowerShell o Terminale.', 'A terminal opened as administrator: Command Prompt, PowerShell or Terminal.'],
          ['Il problema deve essersi verificato nei giorni coperti dal rapporto (vedi l’opzione duration).', 'The problem must have happened within the days covered by the report (see the duration option).'],
        ] },
      ],
    },
    {
      title: ['Passo 1 · Apri un terminale come amministratore', 'Step 1 · Open a terminal as administrator'],
      blocks: [
        { p: [
          'Premi Win + X e scegli «Terminale (amministratore)», oppure cerca «cmd» nel menu Start, clic destro su Prompt dei comandi → «Esegui come amministratore». Conferma la richiesta di Controllo dell’account utente.',
          'Press Win + X and choose “Terminal (Admin)”, or search for “cmd” in the Start menu, right-click Command Prompt → “Run as administrator”. Confirm the User Account Control prompt.',
        ] },
      ],
    },
    {
      title: ['Passo 2 · Genera il rapporto', 'Step 2 · Generate the report'],
      blocks: [
        { code: 'netsh wlan show wlanreport', shell: ['Prompt dei comandi o PowerShell, come amministratore', 'Command Prompt or PowerShell, as administrator'] },
        { p: ['Windows interroga i registri e scrive il rapporto. Ecco l’output reale su un Windows in italiano:', 'Windows queries the logs and writes the report. Here is the real output on an Italian-language Windows:'] },
        { console: `PS C:\\WINDOWS\\system32> netsh wlan show wlanreport
Generazione rapporto in corso...
Query degli eventi WLAN in corso ...
Query degli eventi NCSI in corso ...
Query degli eventi NDIS in corso ...
Query degli eventi EAP in corso ...
Query degli eventi WCM in corso ...
Query degli eventi Kernel in corso ...
Query degli eventi di sistema in corso ...
Esecuzione di ipconfig in corso ...
Esecuzione di "netsh wlan show all" in corso ...
Query dei profili wireless in corso ...
Query dei certificati utente e di sistema in corso ...
Query delle informazioni utente in corso ...
Query dei dispositivi di rete in corso ...

Report scritto in: C:\\ProgramData\\Microsoft\\Windows\\WlanReport\\wlan-report-latest.html
fatto.`, caption: ['Output di esempio (Windows 11 in italiano).', 'Sample output (Windows 11 in Italian; on an English Windows the messages are in English).'] },
        { p: ['Varianti utili:', 'Useful variants:'] },
        { code: 'netsh wlan show wlanreport duration="7"', note: ['Rapporto sugli ultimi 7 giorni invece di 3, se il registro eventi conserva ancora quegli eventi.', 'Report on the last 7 days instead of 3, if the event log still holds those events.'] },
        { code: 'netsh wlan show wlanreport ?', note: ['Mostra la sintassi completa: duration, log (un file .etl da usare al posto del registro eventi) e logger (i log da leggere, di default WiFiSession e LwtNetLog).', 'Shows the full syntax: duration, log (an .etl file to use instead of the event log) and logger (the logs to read, by default WiFiSession and LwtNetLog).'] },
      ],
    },
    {
      title: ['Passo 3 · Apri il rapporto', 'Step 3 · Open the report'],
      blocks: [
        { code: 'start C:\\ProgramData\\Microsoft\\Windows\\WlanReport\\wlan-report-latest.html', note: ['Funziona sia nel Prompt dei comandi sia in PowerShell e apre il rapporto nel browser predefinito.', 'Works in both Command Prompt and PowerShell and opens the report in the default browser.'] },
        { p: ['Nella cartella WlanReport trovi quattro file:', 'The WlanReport folder holds four files:'] },
        { table: {
          head: [['File', 'File'], ['Contenuto', 'Contents']],
          rows: [
            ['wlan-report-latest.html', ['il rapporto da aprire nel browser', 'the report to open in the browser']],
            [['wlan-report-AAAA-MM-GG.html', 'wlan-report-YYYY-MM-DD.html'], ['copia con la data, che resta anche dopo i rapporti successivi', 'dated copy, kept after later reports']],
            ['wlan-report-latest.xml', ['gli stessi dati in XML, per elaborazioni automatiche', 'the same data in XML, for automated processing']],
            ['wlan-report-latest.cab', ['archivio con i log grezzi raccolti, utile al supporto tecnico', 'archive with the raw logs collected, useful to technical support']],
          ],
        } },
        { p: ['Per inviarlo a chi deve analizzarlo, copia l’intera cartella sul Desktop (PowerShell):', 'To send it to whoever will analyse it, copy the whole folder to the Desktop (PowerShell):'] },
        { code: 'Copy-Item "$env:ProgramData\\Microsoft\\Windows\\WlanReport" "$env:USERPROFILE\\Desktop\\WlanReport" -Recurse', shell: ['PowerShell', 'PowerShell'] },
        { warn: [
          'Il rapporto contiene nome del PC, nome utente, nomi delle reti, indirizzi MAC e IP, profili Wi-Fi e l’elenco dei certificati. Microsoft indica che chiavi e password dei profili restano cifrate e non vengono mostrate, ma condividilo solo con chi deve analizzarlo.',
          'The report contains the PC name, user name, network names, MAC and IP addresses, Wi-Fi profiles and the list of certificates. Microsoft states that profile keys and passwords remain encrypted and are not shown, but share it only with whoever needs to analyse it.',
        ] },
      ],
    },
    {
      title: ['Passo 4 · Leggi il rapporto', 'Step 4 · Read the report'],
      blocks: [
        { p: ['Le intestazioni del rapporto sono in inglese; i messaggi degli eventi sono nella lingua di Windows. Le sezioni, dall’alto:', 'The report headings are in English; event messages are in the Windows language. The sections, from the top:'] },
        { table: {
          head: [['Sezione', 'Section'], ['Cosa guardare', 'What to look at']],
          rows: [
            [['Grafico di riepilogo', 'Summary chart'], ['una riga per sessione Wi-Fi: passa il mouse per il riepilogo, clicca un evento per saltare al dettaglio; i cerchi rossi segnalano errori', 'one row per Wi-Fi session: hover for a summary, click an event to jump to the details; red circles mark errors']],
            ['Report Info', ['data di creazione e periodo coperto (Report duration)', 'creation date and period covered (Report duration)']],
            ['General System Info · User Info', ['nome del PC, produttore e modello, BIOS, build di Windows, utente e dominio', 'PC name, manufacturer and model, BIOS, Windows build, user and domain']],
            ['Network Adapters', ['versione e data del driver Wi-Fi, eventuale codice di problema del dispositivo: un driver vecchio è una causa frequente', 'Wi-Fi driver version and date, any device problem code: an old driver is a frequent cause']],
            ['Script Output', ['l’output di ipconfig /all, netsh wlan show all e certutil (certificati, utili per 802.1X con certificato)', 'the output of ipconfig /all, netsh wlan show all and certutil (certificates, useful for certificate-based 802.1X)']],
            ['Profile Output', ['i profili Wi-Fi salvati, in XML, con le chiavi cifrate', 'saved Wi-Fi profiles, in XML, with keys encrypted']],
            ['Summary', ['successi, fallimenti e avvisi; motivi delle disconnessioni con il conteggio; durata delle sessioni per fasce (da 0–1 minuti a oltre 360)', 'successes, failures and warnings; disconnect reasons with counts; session durations by bucket (from 0–1 minutes to over 360)']],
            ['Wireless Sessions', ['l’elenco delle sessioni con gli eventi (EventId, ora, messaggio) espandibili: WLAN (connessione, disconnessione), NCSI (accesso a Internet), NDIS (sospensione e ripresa della scheda), EAP (autenticazione 802.1X)', 'the list of sessions with expandable events (EventId, time, message): WLAN (connect, disconnect), NCSI (Internet access), NDIS (adapter sleep and wake), EAP (802.1X authentication)']],
          ],
        } },
        { p: ['Ecco come appaiono le parti principali, ricostruite con dati inventati:', 'Here is how the main parts look, rebuilt with made-up data:'] },
        { mock: 'wlanreport' },
      ],
    },
    {
      title: ['Cosa cercare in caso di disconnessioni', 'What to look for when the Wi-Fi drops'],
      blocks: [
        { list: [
          ['Molte sessioni brevi (0–1 e 1–5 minuti) e il motivo «Driver disconnesso»: aggiorna il driver dal sito del produttore della scheda o del PC e controlla il risparmio energia della scheda.', 'Many short sessions (0–1 and 1–5 minutes) and the reason “Driver disconnected”: update the driver from the adapter or PC vendor site and check the adapter power saving.'],
          ['Disconnessioni subito dopo un evento NDIS di sospensione o ripresa: il problema è legato allo standby o al risparmio energia, non alla rete.', 'Disconnections right after an NDIS sleep or wake event: the problem is tied to standby or power saving, not to the network.'],
          ['«Non era visibile alcun punto di accesso collegabile»: copertura insufficiente nel punto in cui si trova il PC, roaming, oppure SSID su una banda o un canale che la scheda non supporta.', '“No connectable access point was visible”: insufficient coverage where the PC is, roaming, or an SSID on a band or channel the adapter does not support.'],
          ['Errori EAP: credenziali, certificato del server RADIUS non attendibile o profilo 802.1X errato.', 'EAP errors: credentials, untrusted RADIUS server certificate or wrong 802.1X profile.'],
          ['Wi-Fi connesso ma NCSI senza accesso a Internet: il collegamento radio funziona, il problema è dopo (DHCP, DNS, proxy o captive portal).', 'Wi-Fi connected but NCSI without Internet access: the radio link works, the problem is further on (DHCP, DNS, proxy or captive portal).'],
        ] },
        { p: ['Sono indizi da confermare: confronta gli orari con quelli segnalati dall’utente e, lato rete, con i log del controller o dell’access point.', 'These are clues to confirm: compare the times with those reported by the user and, on the network side, with the controller or access point logs.'] },
      ],
    },
    {
      title: ['Problemi comuni', 'Common problems'],
      blocks: [
        { list: [
          ['Il comando non parte o segnala un problema di autorizzazioni: il terminale non è aperto come amministratore.', 'The command does not run or reports a permission problem: the terminal is not open as administrator.'],
          ['Il rapporto dice «No WLAN events were found on this system»: nel periodo non ci sono eventi Wi-Fi. Allarga il periodo con duration o rigenera il rapporto subito dopo il problema.', 'The report says “No WLAN events were found on this system”: there are no Wi-Fi events in the period. Widen it with duration or regenerate the report right after the problem.'],
          ['Il rapporto viene sovrascritto: wlan-report-latest.html è sempre l’ultimo; per conservarne uno, copia la cartella prima di rigenerarlo.', 'The report gets overwritten: wlan-report-latest.html is always the latest; to keep one, copy the folder before regenerating it.'],
        ] },
      ],
    },
  ],
  sources: [
    { label: ['Microsoft: Analizzare il rapporto sulla rete wireless', 'Microsoft: Analyze the wireless network report'],
      url: ['https://support.microsoft.com/it-it/windows/experience/connectivity-networking/analyze-the-wireless-network-report', 'https://support.microsoft.com/en-us/windows/experience/connectivity-networking/analyze-the-wireless-network-report'] },
    { label: ['Microsoft Learn: Wireless network connectivity issues troubleshooting', 'Microsoft Learn: Wireless network connectivity issues troubleshooting'],
      url: ['https://learn.microsoft.com/en-us/troubleshoot/windows-client/networking/wireless-network-connectivity-issues-troubleshooting', 'https://learn.microsoft.com/en-us/troubleshoot/windows-client/networking/wireless-network-connectivity-issues-troubleshooting'] },
  ],
};
