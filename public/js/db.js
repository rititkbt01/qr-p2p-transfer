// db.js — local persistence, zero dependencies.
//
// Two things live here:
//  1. IndexedDB: transfer history + received-file blobs, so "History" survives reloads.
//  2. localStorage: small synchronous preferences (recent devices, your device name,
//     your last pairing code, which peers you've marked as trusted).
//
// Ponytail principle: native browser APIs only, no wrapper libraries.

const DB_NAME = 'qrlan-transfer';
const DB_VERSION = 1;
const STORE_HISTORY = 'history';
const STORE_BLOBS = 'blobs';

// Cap how large a received file we'll keep a full copy of for "download again" in
// History. Bigger files are still logged, just without a replayable copy — keeps
// IndexedDB usage predictable on phones with limited storage.
const MAX_STORED_BLOB_BYTES = 300 * 1024 * 1024;

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_HISTORY)) {
        const store = db.createObjectStore(STORE_HISTORY, { keyPath: 'id', autoIncrement: true });
        store.createIndex('byTime', 'timestamp');
      }
      if (!db.objectStoreNames.contains(STORE_BLOBS)) {
        db.createObjectStore(STORE_BLOBS, { keyPath: 'transferId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function addHistoryEntry(entry) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_HISTORY, 'readwrite');
    const req = tx.objectStore(STORE_HISTORY).add({ ...entry, timestamp: Date.now() });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllHistory() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_HISTORY, 'readonly');
    const req = tx.objectStore(STORE_HISTORY).getAll();
    req.onsuccess = () => resolve((req.result || []).sort((a, b) => b.timestamp - a.timestamp));
    req.onerror = () => reject(req.error);
  });
}

export async function clearHistory() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_HISTORY, STORE_BLOBS], 'readwrite');
    tx.objectStore(STORE_HISTORY).clear();
    tx.objectStore(STORE_BLOBS).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function storeBlob(transferId, blob) {
  if (blob.size > MAX_STORED_BLOB_BYTES) return false;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BLOBS, 'readwrite');
    const req = tx.objectStore(STORE_BLOBS).put({ transferId, blob });
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

export async function getBlob(transferId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BLOBS, 'readonly');
    const req = tx.objectStore(STORE_BLOBS).get(transferId);
    req.onsuccess = () => resolve(req.result ? req.result.blob : null);
    req.onerror = () => reject(req.error);
  });
}

// ---- localStorage: small synchronous preferences (non-sensitive) ----

const LS_RECENT = 'qrlan_recent_devices';
const LS_MY_CODE = 'qrlan_my_last_code';
const LS_MY_NAME = 'qrlan_my_device_name';
const LS_TRUSTED = 'qrlan_trusted_devices';

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function getRecentDevices() {
  return readJSON(LS_RECENT, []);
}

export function saveRecentDevice({ roomCode, label }) {
  const list = getRecentDevices().filter((d) => !(d.roomCode === roomCode && d.label === label));
  list.unshift({ roomCode, label, lastConnected: Date.now() });
  localStorage.setItem(LS_RECENT, JSON.stringify(list.slice(0, 8)));
}

export function forgetRecentDevice(roomCode, label) {
  const list = getRecentDevices().filter((d) => !(d.roomCode === roomCode && d.label === label));
  localStorage.setItem(LS_RECENT, JSON.stringify(list));
}

export function getMyLastCode() {
  return localStorage.getItem(LS_MY_CODE) || null;
}

export function setMyLastCode(code) {
  localStorage.setItem(LS_MY_CODE, code);
}

export function getMyDeviceName() {
  return localStorage.getItem(LS_MY_NAME) || '';
}

export function setMyDeviceName(name) {
  localStorage.setItem(LS_MY_NAME, name);
}

export function trustKey(roomCode, label) {
  return `${roomCode}::${label}`;
}

export function isTrusted(key) {
  return readJSON(LS_TRUSTED, []).includes(key);
}

export function setTrusted(key, trusted) {
  const list = new Set(readJSON(LS_TRUSTED, []));
  if (trusted) list.add(key);
  else list.delete(key);
  localStorage.setItem(LS_TRUSTED, JSON.stringify([...list]));
}
