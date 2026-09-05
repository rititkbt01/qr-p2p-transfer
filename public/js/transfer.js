// transfer.js — the file protocol itself: chunking, flow control, and the optional
// encryption layer. network.js only knows how to move messages between peers; this
// module decides what those messages mean (file-start / chunk / file-end) and turns
// them back into a File the person can save.

import * as net from './network.js';
import * as cryptoUtil from './crypto.js';
import { addHistoryEntry, storeBlob } from './db.js';

const CHUNK_SIZE = 16 * 1024;
const MAX_BUFFERED_AMOUNT = 1024 * 1024;

const listeners = {};
export function on(event, cb) {
  (listeners[event] ||= []).push(cb);
}
function emit(event, payload) {
  (listeners[event] || []).forEach((cb) => cb(payload));
}

let activePassphrase = null;
export function setPassphrase(pw) {
  activePassphrase = pw || null;
}

const incoming = new Map(); // transferId -> transfer state

net.on('data', ({ msg, fromId }) => {
  if (!msg || !msg.type) return;
  if (msg.type === 'file-start') return void handleStart(msg, fromId);
  if (msg.type === 'chunk') return void trackChunk(msg);
  if (msg.type === 'file-end') return void handleEnd(msg, fromId);
});

// handleChunk decrypts asynchronously, so a chunk can still be mid-flight when
// file-end arrives right behind it (decryption is comfortably faster than real
// network latency, but not guaranteed to be — e.g. very low-latency links, or a
// slow device under load). Track every in-flight chunk promise per transfer so
// handleEnd can wait for all of them before assembling the final blob, instead
// of racing them and silently dropping trailing chunks.
function trackChunk(msg) {
  const t = incoming.get(msg.transferId);
  if (!t) return;
  const p = handleChunk(msg).catch(() => {});
  t.pending.add(p);
  p.finally(() => t.pending.delete(p));
}

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---- Sending ----

// target: a specific peerId, or the string 'broadcast' for everyone in the room.
export async function sendFiles(files, { target, passphrase, isFolder } = {}) {
  for (const file of files) {
    // eslint-disable-next-line no-await-in-loop
    await sendOne(file, { target, passphrase, isFolder });
  }
}

async function sendOne(file, { target, passphrase, isFolder }) {
  const transferId = uuid();
  const send = target === 'broadcast' ? (m) => net.sendBroadcast(m) : (m) => net.sendTo(target, m);

  let encryptor = null;
  if (passphrase) encryptor = await cryptoUtil.makeEncryptor(passphrase);

  const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
  const startMsg = {
    type: 'file-start',
    transferId,
    name: file.name,
    size: file.size,
    mime: file.type || 'application/octet-stream',
    totalChunks,
    encrypted: !!encryptor,
    salt: encryptor ? encryptor.saltB64 : null,
    isFolder: !!isFolder,
  };
  send(startMsg);
  emit('send-start', { transferId, name: file.name, size: file.size, target });

  let currentChunk = 0;
  try {
    while (currentChunk < totalChunks) {
      if (net.bufferedAmountFor(target) > MAX_BUFFERED_AMOUNT) {
        // eslint-disable-next-line no-await-in-loop
        await wait(40);
        continue;
      }
      if (file.size === 0) {
        currentChunk = totalChunks;
        break;
      }

      const start = currentChunk * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      // eslint-disable-next-line no-await-in-loop
      const buf = await file.slice(start, end).arrayBuffer();
      const payload = encryptor ? await encryptor.encryptChunk(buf) : buf; // eslint-disable-line no-await-in-loop

      send({ type: 'chunk', transferId, index: currentChunk, data: payload });
      currentChunk++;
      emit('send-progress', { transferId, percent: Math.round((currentChunk / totalChunks) * 100) });
      // eslint-disable-next-line no-await-in-loop
      await wait(4);
    }

    send({ type: 'file-end', transferId });
    emit('send-done', { transferId, name: file.name });

    await addHistoryEntry({
      direction: 'sent',
      fileName: file.name,
      size: file.size,
      mime: file.type,
      peerLabel: target === 'broadcast' ? 'Everyone in the room' : net.labelFor(target),
      roomCode: net.state.roomCode,
      status: 'complete',
      isFolder: !!isFolder,
    });
  } catch (err) {
    emit('send-error', { transferId, name: file.name, error: err.message || 'Transfer failed' });
    throw err;
  }
}

// ---- Receiving ----

async function handleStart(msg, fromId) {
  const t = {
    meta: msg,
    fromId,
    chunks: new Array(msg.totalChunks),
    receivedBytes: 0,
    decryptor: null,
    failed: false,
    pending: new Set(), // in-flight per-chunk promises (see trackChunk above)
  };
  incoming.set(msg.transferId, t);

  if (msg.encrypted && activePassphrase) {
    // Key derivation (PBKDF2, 150k iterations) is async and can take longer than
    // it takes the first chunk to arrive right behind file-start. Store the
    // *promise*, not just the eventual result, so every chunk handler awaits the
    // same in-flight derivation instead of racing it and finding null.
    t.decryptorPromise = cryptoUtil
      .makeDecryptor(activePassphrase, msg.salt)
      .then((d) => (t.decryptor = d))
      .catch(() => null);
  }

  emit('recv-start', { ...msg, fromId, peerLabel: net.labelFor(fromId) });
}

async function handleChunk(msg) {
  const t = incoming.get(msg.transferId);
  if (!t) return;

  let data = msg.data;
  if (t.meta.encrypted) {
    if (!t.decryptorPromise) {
      t.failed = true; // no passphrase supplied on this device — can't decrypt
    } else {
      const decryptor = await t.decryptorPromise; // waits, doesn't race, if still deriving
      if (!decryptor) {
        t.failed = true;
      } else {
        try {
          data = await decryptor.decryptChunk(data);
        } catch {
          t.failed = true; // passphrase didn't match
        }
      }
    }
  }

  if (!t.failed) t.chunks[msg.index] = data;
  t.receivedBytes += msg.data.byteLength || 0;
  const percent = Math.min(100, Math.round((t.receivedBytes / Math.max(1, t.meta.size)) * 100));
  emit('recv-progress', { transferId: msg.transferId, percent, failed: t.failed });
}

async function handleEnd(msg, fromId) {
  const t = incoming.get(msg.transferId);
  if (!t) return;
  if (t.pending.size) await Promise.all(t.pending); // let any still-decrypting chunks finish first
  incoming.delete(msg.transferId);

  if (t.failed) {
    emit('recv-error', {
      transferId: msg.transferId,
      name: t.meta.name,
      error:
        t.meta.encrypted && !t.decryptor
          ? 'This file is encrypted. Enter the sender\u2019s passphrase, then ask them to resend.'
          : 'Wrong passphrase \u2014 could not decrypt this file.',
    });
    await addHistoryEntry({
      direction: 'received',
      fileName: t.meta.name,
      size: t.meta.size,
      mime: t.meta.mime,
      peerLabel: net.labelFor(fromId),
      roomCode: net.state.roomCode,
      status: 'failed',
      isFolder: !!t.meta.isFolder,
    });
    return;
  }

  const blob = new Blob(t.chunks.filter(Boolean), { type: t.meta.mime || 'application/octet-stream' });

  const historyId = await addHistoryEntry({
    direction: 'received',
    fileName: t.meta.name,
    size: t.meta.size,
    mime: t.meta.mime,
    peerLabel: net.labelFor(fromId),
    roomCode: net.state.roomCode,
    status: 'complete',
    isFolder: !!t.meta.isFolder,
  });
  const stored = await storeBlob(String(historyId), blob);

  emit('recv-done', {
    transferId: msg.transferId,
    name: t.meta.name,
    size: t.meta.size,
    blob,
    isFolder: !!t.meta.isFolder,
    historyId,
    storedForHistory: stored,
    fromId,
  });
}
