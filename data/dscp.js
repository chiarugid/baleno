// Code point DSCP standard con classe di servizio (RFC 4594 e successive) e uso tipico.
// I campi derivati (binario, ToS, precedenza, CoS) li calcola js/tools/dscp.js.
// Uso tipico in js/i18n.js (dscp.use.*); serviceClass null = riservato (tradotto).

export const DSCP_POINTS = [
  { name: 'CS0', alias: 'DF', dscp: 0, rfc: 'RFC 2474', serviceClass: 'Standard' },
  { name: 'LE', dscp: 1, rfc: 'RFC 8622', serviceClass: 'Lower-Effort' },
  { name: 'CS1', dscp: 8, rfc: 'RFC 2474', serviceClass: 'Low-Priority Data' },
  { name: 'AF11', dscp: 10, rfc: 'RFC 2597', serviceClass: 'High-Throughput Data' },
  { name: 'AF12', dscp: 12, rfc: 'RFC 2597', serviceClass: 'High-Throughput Data' },
  { name: 'AF13', dscp: 14, rfc: 'RFC 2597', serviceClass: 'High-Throughput Data' },
  { name: 'CS2', dscp: 16, rfc: 'RFC 2474', serviceClass: 'OAM' },
  { name: 'AF21', dscp: 18, rfc: 'RFC 2597', serviceClass: 'Low-Latency Data' },
  { name: 'AF22', dscp: 20, rfc: 'RFC 2597', serviceClass: 'Low-Latency Data' },
  { name: 'AF23', dscp: 22, rfc: 'RFC 2597', serviceClass: 'Low-Latency Data' },
  { name: 'CS3', dscp: 24, rfc: 'RFC 2474', serviceClass: 'Broadcast Video' },
  { name: 'AF31', dscp: 26, rfc: 'RFC 2597', serviceClass: 'Multimedia Streaming' },
  { name: 'AF32', dscp: 28, rfc: 'RFC 2597', serviceClass: 'Multimedia Streaming' },
  { name: 'AF33', dscp: 30, rfc: 'RFC 2597', serviceClass: 'Multimedia Streaming' },
  { name: 'CS4', dscp: 32, rfc: 'RFC 2474', serviceClass: 'Real-Time Interactive' },
  { name: 'AF41', dscp: 34, rfc: 'RFC 2597', serviceClass: 'Multimedia Conferencing' },
  { name: 'AF42', dscp: 36, rfc: 'RFC 2597', serviceClass: 'Multimedia Conferencing' },
  { name: 'AF43', dscp: 38, rfc: 'RFC 2597', serviceClass: 'Multimedia Conferencing' },
  { name: 'CS5', dscp: 40, rfc: 'RFC 2474', serviceClass: 'Signaling' },
  { name: 'VOICE-ADMIT', dscp: 44, rfc: 'RFC 5865', serviceClass: 'Capacity-Admitted Telephony' },
  { name: 'EF', dscp: 46, rfc: 'RFC 3246', serviceClass: 'Telephony' },
  { name: 'CS6', dscp: 48, rfc: 'RFC 2474', serviceClass: 'Network Control' },
  { name: 'CS7', dscp: 56, rfc: 'RFC 2474', serviceClass: null },
];

export const PRECEDENCE_NAMES = ['Routine', 'Priority', 'Immediate', 'Flash', 'Flash Override', 'Critical', 'Internetwork Control', 'Network Control'];

// ECN e probabilità di scarto AF: etichette in js/i18n.js (dscp.ecn.*, dscp.drop.*).
export const ECN_NAMES = ['Not-ECT', 'ECT(1)', 'ECT(0)', 'CE'];

