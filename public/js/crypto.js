// crypto.js — optional end-to-end passphrase encryption for file transfers.
//
// The passphrase itself never travels over the connection. Both devices type the
// same passphrase locally (like reading a Wi-Fi password aloud), each independently
// derives the same AES-256 key with PBKDF2, and only the file bytes — pre-encrypted —
// go over the WebRTC data channel. Even the PeerJS signaling broker, which only ever
// sees connection metadata, never sees the passphrase or the plaintext.
//
// This is a practical safeguard for a peer-to-peer transfer tool, not an
// independently audited cryptographic implementation — treat it accordingly.

const PBKDF2_ITERATIONS = 150000;
const IV_LENGTH = 12; // bytes, standard for AES-GCM
const SALT_LENGTH = 16;

function randomBytes(len) {
  return crypto.getRandomValues(new Uint8Array(len));
}

async function deriveKey(passphrase, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export function bufToB64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function b64ToBuf(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

// Creates a one-time encryptor for a single file: a fresh random salt (shared with
// the receiver via the file-start message) and a key derived from it.
export async function makeEncryptor(passphrase) {
  const salt = randomBytes(SALT_LENGTH);
  const key = await deriveKey(passphrase, salt);
  return {
    saltB64: bufToB64(salt),
    async encryptChunk(arrayBuffer) {
      const iv = randomBytes(IV_LENGTH);
      const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, arrayBuffer);
      // Prepend the IV to the ciphertext so the receiver can pull it back out —
      // the GCM authentication tag is already appended by the Web Crypto API.
      const out = new Uint8Array(iv.byteLength + cipherBuf.byteLength);
      out.set(iv, 0);
      out.set(new Uint8Array(cipherBuf), iv.byteLength);
      return out.buffer;
    },
  };
}

export async function makeDecryptor(passphrase, saltB64) {
  const salt = new Uint8Array(b64ToBuf(saltB64));
  const key = await deriveKey(passphrase, salt);
  return {
    async decryptChunk(arrayBuffer) {
      const bytes = new Uint8Array(arrayBuffer);
      const iv = bytes.slice(0, IV_LENGTH);
      const cipher = bytes.slice(IV_LENGTH);
      // Throws if the passphrase is wrong — GCM's authentication tag won't verify.
      return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
    },
  };
}
