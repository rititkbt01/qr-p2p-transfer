// network.js — pairing and connections.
//
// Two ways to pair: scan the QR code, or type the 6-digit code it encodes — both
// resolve to the same PeerJS peer ID. A "room" can hold more than 2 devices using a
// star topology: every guest connects directly to the host, and the host relays
// broadcast messages between guests. The only server involved anywhere is PeerJS's
// public signaling broker, used purely to introduce two peers to each other — no
// file ever passes through it, and once a connection opens, bytes flow directly
// between the two browsers.
//
// This module knows nothing about files; it only moves JSON-ish messages and
// binary payloads between peers. transfer.js builds the file protocol on top.

import { getMyLastCode, setMyLastCode } from './db.js';

const ID_PREFIX = 'qrlan-';

export const state = {
  peer: null,
  myId: null,
  roomCode: null,
  role: null, // 'host' | 'guest'
  myName: '',
  connections: new Map(), // peerId -> DataConnection
  roster: [], // [{ id, name }], kept in sync by the host and mirrored to every guest
};

const listeners = {};
export function on(event, cb) {
  (listeners[event] ||= []).push(cb);
}
function emit(event, payload) {
  (listeners[event] || []).forEach((cb) => cb(payload));
}

function randomCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function makePeer(id) {
  return new Promise((resolve, reject) => {
    const peer = new Peer(id, {
      debug: 1,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      },
    });
    peer.on('open', () => resolve(peer));
    peer.on('error', (err) => reject(err));
  });
}

// ---- Hosting (the device that generated / is showing the QR code) ----

export async function startHosting(name) {
  state.myName = name || 'This device';

  // Try to reclaim the same code this device used last time — that's what makes
  // "Quick Connect" from a saved recent device actually work on a second visit.
  let code = getMyLastCode() || randomCode();

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const peer = await makePeer(ID_PREFIX + code);
      state.peer = peer;
      state.myId = peer.id;
      state.roomCode = code;
      state.role = 'host';
      setMyLastCode(code);
      state.roster = [{ id: peer.id, name: state.myName }];
      wireHostEvents(peer);
      emit('open', { code, role: 'host' });
      return code;
    } catch {
      // That code is already claimed by someone else's live session — roll a new one.
      code = randomCode();
    }
  }
  throw new Error('Could not claim a pairing code right now. Please try again.');
}

function wireHostEvents(peer) {
  peer.on('connection', (conn) => {
    conn.on('open', () => {
      state.connections.set(conn.peer, conn);
      const guestName = (conn.metadata && conn.metadata.name) || 'Guest device';
      state.roster = state.roster.filter((r) => r.id !== conn.peer);
      state.roster.push({ id: conn.peer, name: guestName });
      broadcastRoster();
      emit('connectionChange', { type: 'joined', id: conn.peer, name: guestName });
    });
    conn.on('data', (msg) => handleHostData(conn, msg));
    conn.on('close', () => dropGuest(conn.peer));
    conn.on('error', () => dropGuest(conn.peer));
  });
  peer.on('disconnected', () => emit('error', new Error('Lost the signaling connection. Reconnecting…')));
  peer.on('error', (err) => emit('error', err));
}

function dropGuest(peerId) {
  if (!state.connections.has(peerId)) return;
  state.connections.delete(peerId);
  const left = state.roster.find((r) => r.id === peerId);
  state.roster = state.roster.filter((r) => r.id !== peerId);
  broadcastRoster();
  emit('connectionChange', { type: 'left', id: peerId, name: left && left.name });
}

function broadcastRoster() {
  const msg = { type: 'roster', roster: state.roster };
  for (const conn of state.connections.values()) {
    if (conn.open) conn.send(msg);
  }
  emit('roster', state.roster);
}

function handleHostData(conn, msg) {
  if (msg && msg.broadcast) {
    for (const [id, other] of state.connections) {
      if (id !== conn.peer && other.open) other.send(msg);
    }
  }
  emit('data', { msg, fromId: msg.fromId || conn.peer });
}

// ---- Joining (the device that scanned the QR / typed the code) ----

export function joinRoom(code, name) {
  state.myName = name || 'This device';
  state.roomCode = code;
  state.role = 'guest';

  return new Promise((resolve, reject) => {
    makePeer(undefined)
      .then((peer) => {
        state.peer = peer;
        state.myId = peer.id;

        const conn = peer.connect(ID_PREFIX + code, {
          reliable: true,
          serialization: 'binary',
          metadata: { name: state.myName },
        });

        const timeout = setTimeout(() => {
          reject(new Error('No response from that code. Double check it and try again.'));
        }, 15000);

        conn.on('open', () => {
          clearTimeout(timeout);
          state.connections.set(conn.peer, conn);
          wireGuestEvents(conn);
          emit('open', { code, role: 'guest' });
          resolve(code);
        });
        conn.on('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
        peer.on('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      })
      .catch(reject);
  });
}

function wireGuestEvents(conn) {
  state.peer.on('disconnected', () => emit('error', new Error('Lost the signaling connection. Reconnecting…')));
  state.peer.on('error', (err) => emit('error', err));
  conn.on('data', (msg) => {
    if (msg.type === 'roster') {
      state.roster = msg.roster;
      emit('roster', state.roster);
      return;
    }
    emit('data', { msg, fromId: msg.fromId || conn.peer });
  });
  conn.on('close', () => {
    state.connections.delete(conn.peer);
    emit('connectionChange', { type: 'host-left' });
  });
}

// ---- Sending primitives (shared by transfer.js) ----

export function peerCount() {
  return state.connections.size;
}

export function sendTo(peerId, msg) {
  const conn = state.connections.get(peerId);
  if (conn && conn.open) conn.send(msg);
}

// Sends to everyone else currently in the room. Guests always talk through the
// host, which relays to the rest of the room (see handleHostData above) — the
// origin device itself never gets its own broadcast echoed back.
export function sendBroadcast(msg) {
  const tagged = { ...msg, broadcast: true, fromId: state.myId };
  for (const conn of state.connections.values()) {
    if (conn.open) conn.send(tagged);
  }
}

export function bufferedAmountFor(peerId) {
  if (peerId === 'broadcast') {
    let max = 0;
    for (const conn of state.connections.values()) max = Math.max(max, conn.bufferedAmount || 0);
    return max;
  }
  const conn = state.connections.get(peerId);
  return conn ? conn.bufferedAmount || 0 : 0;
}

export function labelFor(peerId) {
  const entry = state.roster.find((r) => r.id === peerId);
  return entry ? entry.name : 'Peer';
}

export function teardown() {
  for (const conn of state.connections.values()) {
    try {
      conn.close();
    } catch {
      /* already closed */
    }
  }
  state.connections.clear();
  state.roster = [];
  if (state.peer) {
    try {
      state.peer.destroy();
    } catch {
      /* already destroyed */
    }
  }
  state.peer = null;
  state.role = null;
  state.roomCode = null;
}
