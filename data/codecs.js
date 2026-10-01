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

// SRTP (RFC 3711): authentication tag in coda al pacchetto RTP, MKI non usato.
export const SRTP = [
  { id: 'none', label: 'Nessuno', tag: 0 },
  { id: 'sha1-80', label: 'AES-CM + HMAC-SHA1-80', tag: 10 },
  { id: 'sha1-32', label: 'AES-CM + HMAC-SHA1-32', tag: 4 },
];

// IPsec ESP: modalità, cifratura (IV e allineamento del blocco) e integrità (ICV).
export const IPSEC_MODES = [
  { id: 'none', label: 'Nessuno' },
  { id: 'tunnel', label: 'ESP tunnel' },
  { id: 'transport', label: 'ESP transport' },
];

export const IPSEC_CIPHERS = [
  { id: 'cbc', label: 'AES-CBC', iv: 16, block: 16 },
  // GCM è AEAD: l'ICV da 16 B è parte dell'algoritmo, nessuna HMAC separata.
  { id: 'gcm', label: 'AES-GCM-128', iv: 8, block: 4, icv: 16 },
];

export const IPSEC_INTEGRITY = [
  { id: 'sha1', label: 'HMAC-SHA1-96', icv: 12 },
  { id: 'sha256', label: 'HMAC-SHA-256-128', icv: 16 },
];
