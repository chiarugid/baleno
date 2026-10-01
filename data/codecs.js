// Codec voce e intestazioni per il calcolatore banda VoIP.
// bitrate in kbps; la dimensione del payload RTP è bitrate × ptime / 8.

export const CODECS = [
  { id: 'g711', name: 'G.711', detail: 'PCMU/PCMA, 8 kHz', bitrate: 64 },
  { id: 'g722', name: 'G.722', detail: 'wideband 16 kHz', bitrate: 64 },
  { id: 'g729', name: 'G.729', detail: 'CS-ACELP, frame da 10 ms', bitrate: 8 },
  { id: 'opus', name: 'Opus', detail: 'bitrate variabile', bitrate: 24, variable: true, min: 6, max: 510 },
];

export const OPUS_BITRATES = [12, 16, 20, 24, 32, 40, 48, 64];

export const PTIMES = [10, 20, 30];

// Byte per intestazione.
export const HEADERS = {
  rtp: 12,
  udp: 8,
  ip: 20,
  ethernet: 18, // 14 di intestazione + 4 di FCS
  dot1q: 4,
  preamble: 20, // 8 di preambolo/SFD + 12 di inter-frame gap
  gre: 24, // nuova intestazione IP 20 + GRE 4
  natt: 8, // UDP 4500
  espHeader: 8, // SPI 4 + numero di sequenza 4
  espTrailer: 2, // pad length + next header
};

// ESP: IV, ICV (autenticazione) e allineamento del blocco cifrato.
export const IPSEC = [
  { id: 'none', label: 'Nessuno' },
  { id: 'tunnel-cbc', label: 'ESP tunnel · AES-CBC + HMAC-SHA1-96', mode: 'tunnel', iv: 16, icv: 12, block: 16 },
  { id: 'tunnel-gcm', label: 'ESP tunnel · AES-GCM-128', mode: 'tunnel', iv: 8, icv: 16, block: 4 },
  { id: 'transport-cbc', label: 'ESP transport · AES-CBC + HMAC-SHA1-96', mode: 'transport', iv: 16, icv: 12, block: 16 },
  { id: 'transport-gcm', label: 'ESP transport · AES-GCM-128', mode: 'transport', iv: 8, icv: 16, block: 4 },
];
