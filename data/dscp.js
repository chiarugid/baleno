// Code point DSCP standard con classe di servizio (RFC 4594 e successive) e uso tipico.
// I campi derivati (binario, ToS, precedenza, CoS) li calcola js/tools/dscp.js.

export const DSCP_POINTS = [
  { name: 'CS0', alias: 'DF', dscp: 0, rfc: 'RFC 2474', serviceClass: 'Standard', use: 'Best effort predefinito: navigazione, posta e tutto il traffico non marcato.' },
  { name: 'LE', dscp: 1, rfc: 'RFC 8622', serviceClass: 'Lower-Effort', use: 'Traffico sacrificabile sotto il best effort: backup, aggiornamenti, P2P.' },
  { name: 'CS1', dscp: 8, rfc: 'RFC 2474', serviceClass: 'Low-Priority Data', use: 'Dati a bassa priorità (scavenger); in passato usato per il bulk.' },
  { name: 'AF11', dscp: 10, rfc: 'RFC 2597', serviceClass: 'High-Throughput Data', use: 'Dati ad alto throughput: trasferimenti di file, backup, sincronizzazioni.' },
  { name: 'AF12', dscp: 12, rfc: 'RFC 2597', serviceClass: 'High-Throughput Data', use: 'Come AF11, con probabilità di scarto media.' },
  { name: 'AF13', dscp: 14, rfc: 'RFC 2597', serviceClass: 'High-Throughput Data', use: 'Come AF11, con probabilità di scarto alta.' },
  { name: 'CS2', dscp: 16, rfc: 'RFC 2474', serviceClass: 'OAM', use: 'Gestione di rete: SNMP, SSH, syslog, NetFlow.' },
  { name: 'AF21', dscp: 18, rfc: 'RFC 2597', serviceClass: 'Low-Latency Data', use: 'Dati transazionali a bassa latenza: database, ERP, applicazioni client-server.' },
  { name: 'AF22', dscp: 20, rfc: 'RFC 2597', serviceClass: 'Low-Latency Data', use: 'Come AF21, con probabilità di scarto media.' },
  { name: 'AF23', dscp: 22, rfc: 'RFC 2597', serviceClass: 'Low-Latency Data', use: 'Come AF21, con probabilità di scarto alta.' },
  { name: 'CS3', dscp: 24, rfc: 'RFC 2474', serviceClass: 'Broadcast Video', use: 'Video broadcast (RFC 4594); in molte reti aziendali segnalazione voce (SIP, H.323, SCCP).' },
  { name: 'AF31', dscp: 26, rfc: 'RFC 2597', serviceClass: 'Multimedia Streaming', use: 'Streaming multimediale, video on demand; in reti più vecchie anche segnalazione.' },
  { name: 'AF32', dscp: 28, rfc: 'RFC 2597', serviceClass: 'Multimedia Streaming', use: 'Come AF31, con probabilità di scarto media.' },
  { name: 'AF33', dscp: 30, rfc: 'RFC 2597', serviceClass: 'Multimedia Streaming', use: 'Come AF31, con probabilità di scarto alta.' },
  { name: 'CS4', dscp: 32, rfc: 'RFC 2474', serviceClass: 'Real-Time Interactive', use: 'Applicazioni interattive in tempo reale: giochi, telepresenza, desktop remoto.' },
  { name: 'AF41', dscp: 34, rfc: 'RFC 2597', serviceClass: 'Multimedia Conferencing', use: 'Videoconferenza (flussi video delle chiamate).' },
  { name: 'AF42', dscp: 36, rfc: 'RFC 2597', serviceClass: 'Multimedia Conferencing', use: 'Come AF41, con probabilità di scarto media.' },
  { name: 'AF43', dscp: 38, rfc: 'RFC 2597', serviceClass: 'Multimedia Conferencing', use: 'Come AF41, con probabilità di scarto alta.' },
  { name: 'CS5', dscp: 40, rfc: 'RFC 2474', serviceClass: 'Signaling', use: 'Segnalazione delle chiamate (SIP, H.323) secondo RFC 4594.' },
  { name: 'VOICE-ADMIT', dscp: 44, rfc: 'RFC 5865', serviceClass: 'Capacity-Admitted Telephony', use: 'Voce sottoposta a controllo di ammissione (CAC).' },
  { name: 'EF', dscp: 46, rfc: 'RFC 3246', serviceClass: 'Telephony', use: 'Voce (RTP): coda prioritaria a bassa latenza e jitter.' },
  { name: 'CS6', dscp: 48, rfc: 'RFC 2474', serviceClass: 'Network Control', use: 'Controllo di rete: protocolli di routing (OSPF, BGP, EIGRP), HSRP/VRRP.' },
  { name: 'CS7', dscp: 56, rfc: 'RFC 2474', serviceClass: 'Riservato', use: 'Riservato al controllo del link; normalmente non usato dalle applicazioni.' },
];

export const PRECEDENCE_NAMES = ['Routine', 'Priority', 'Immediate', 'Flash', 'Flash Override', 'Critical', 'Internetwork Control', 'Network Control'];

export const ECN_NAMES = ['Not-ECT', 'ECT(1)', 'ECT(0)', 'CE (congestione)'];

export const AF_DROP = { 1: 'bassa', 2: 'media', 3: 'alta' };
