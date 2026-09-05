// main.js — wires everything together. This is the only module that touches both
// the DOM (via ui.js) and the app's other systems (network, transfer, zip, db, pwa).

import * as net from './network.js';
import * as transfer from './transfer.js';
import * as zip from './zip.js';
import * as db from './db.js';
import * as pwa from './pwa.js';
import * as ui from './ui.js';

let isFolderMode = false;
let currentCode = null;
let currentLink = null;
let manualAutoSaveOverride = null; // null = follow trust state, true/false = user overrode this session

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', boot);

function boot() {
  pwa.registerServiceWorker();
  pwa.watchInstallPrompt((available) => {
    ui.el('installBtn').hidden = !available;
  });
  ui.el('installBtn').addEventListener('click', async () => {
    const outcome = await pwa.promptInstall();
    if (outcome === 'accepted') ui.toast('Installed! Look for it on your home screen.', 'success');
  });

  ui.el('deviceNameInput').value = db.getMyDeviceName();
  ui.el('deviceNameInput').addEventListener('change', (e) => db.setMyDeviceName(e.target.value.trim()));

  ui.el('passphraseInput').addEventListener('input', (e) => transfer.setPassphrase(e.target.value));

  wireLinkPanel();
  wireSendPanel();
  wireReceivePanel();
  wireHistoryPanel();
  wireNetworkEvents();
  wireTransferEvents();

  renderRecentDevices();
  loadHistory();

  const params = new URLSearchParams(window.location.search);
  const codeFromUrl = params.get('code');
  if (codeFromUrl && /^\d{6}$/.test(codeFromUrl)) {
    startJoin(codeFromUrl);
  } else {
    startHost();
  }
}

// ---------------------------------------------------------------------------
// Link panel: hosting, joining, recent devices
// ---------------------------------------------------------------------------

function wireLinkPanel() {
  ui.el('joinBtn').addEventListener('click', () => {
    const code = ui.el('joinCodeInput').value.trim();
    if (!/^\d{6}$/.test(code)) {
      ui.toast('Enter the 6-digit code exactly as shown.', 'error');
      return;
    }
    startJoin(code);
  });
  ui.el('joinCodeInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') ui.el('joinBtn').click();
  });
  ui.el('joinCodeInput').addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
  });

  ui.el('copyCodeBtn').addEventListener('click', () => copyText(currentCode, 'Copied code'));
  ui.el('copyLinkBtn').addEventListener('click', () => copyText(currentLink, 'Copied link'));
  ui.el('leaveBtn').addEventListener('click', resetToLinkScreen);
}

async function copyText(text, successMsg) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    ui.toast(successMsg, 'success');
  } catch {
    ui.toast('Could not copy \u2014 select and copy manually.', 'error');
  }
}

function deviceName() {
  return ui.el('deviceNameInput').value.trim() || db.getMyDeviceName() || undefined;
}

async function startHost() {
  net.teardown();
  ui.el('connectionStatusRow').hidden = true;
  ui.el('hostBlock').hidden = false;
  ui.log('Setting up your pairing code\u2026');
  try {
    const code = await net.startHosting(deviceName());
    showHostCode(code);
    ui.log(`Ready \u2014 code ${code}`, 'success');
  } catch (err) {
    ui.log(`Could not start: ${err.message}`, 'error');
    ui.toast('Could not set up a pairing code. Check your connection and reload.', 'error');
  }
}

function showHostCode(code) {
  currentCode = code;
  currentLink = `${window.location.origin}/?code=${code}`;
  ui.el('roomCodeDisplay').textContent = code.slice(0, 3) + ' ' + code.slice(3);
  ui.el('qrWrapper').hidden = false;
  const target = ui.el('qrcode');
  target.innerHTML = '';
  // eslint-disable-next-line no-undef
  new QRCode(target, {
    text: currentLink,
    width: 176,
    height: 176,
    colorDark: '#0B0E1D',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.M,
  });
  ui.attachTilt(ui.el('qrWrapper'));

  const wrapper = ui.el('qrWrapper');
  wrapper.classList.add('qr-wrapper--enter');
  setTimeout(() => wrapper.classList.remove('qr-wrapper--enter'), 550);
}

async function startJoin(code) {
  net.teardown();
  ui.el('hostBlock').hidden = true;
  ui.el('connectionStatusRow').hidden = false;
  ui.el('connectionStatus').textContent = `Connecting with code ${code}\u2026`;
  ui.log(`Connecting with code ${code}\u2026`);
  try {
    await net.joinRoom(code, deviceName());
  } catch (err) {
    ui.log(`Connection failed: ${err.message}`, 'error');
    ui.toast(err.message, 'error');
    ui.el('connectionStatus').textContent = 'Connection failed.';
    history.replaceState(null, '', window.location.pathname); // don't retry a dead code on reload
    setTimeout(() => startHost(), 1200);
  }
}

function resetToLinkScreen() {
  net.teardown();
  ui.el('rosterBlock').hidden = true;
  ui.el('sendPanel').hidden = true;
  ui.el('receivePanel').hidden = true;
  ui.el('fileList').innerHTML = '';
  ui.el('transferLog').innerHTML = '';
  ui.el('receiveEmpty').hidden = false;
  manualAutoSaveOverride = null;
  history.replaceState(null, '', window.location.pathname);
  startHost();
}

function renderRecentDevices() {
  ui.renderRecentDevices(
    db.getRecentDevices(),
    (d) => {
      ui.el('joinCodeInput').value = d.roomCode;
      startJoin(d.roomCode);
    },
    (d) => {
      db.forgetRecentDevice(d.roomCode, d.label);
      renderRecentDevices();
    }
  );
}

// ---------------------------------------------------------------------------
// Network events
// ---------------------------------------------------------------------------

function wireNetworkEvents() {
  net.on('open', ({ role }) => {
    if (role === 'host') return; // handled by showHostCode already
    ui.el('connectionStatusRow').hidden = true;
    ui.log('Connected!', 'success');
  });

  net.on('roster', (roster) => {
    ui.renderRoster(roster, net.state.myId, net.state.role);
    ui.renderTargetOptions(roster, net.state.myId, net.state.role);
    const connected = roster.length > 1;
    const wasHidden = ui.el('sendPanel').hidden;
    ui.el('sendPanel').hidden = !connected;
    ui.el('receivePanel').hidden = !connected;
    if (connected && wasHidden) {
      ui.el('sendPanel').classList.add('panel-unlock');
      ui.el('receivePanel').classList.add('panel-unlock');
      setTimeout(() => {
        ui.el('sendPanel').classList.remove('panel-unlock');
        ui.el('receivePanel').classList.remove('panel-unlock');
      }, 500);
    }

    if (net.state.role === 'guest') {
      const host = roster.find((r) => r.id !== net.state.myId);
      if (host) db.saveRecentDevice({ roomCode: net.state.roomCode, label: host.name });
    }
    syncAutoSaveWithTrust(roster);
  });

  net.on('connectionChange', ({ type, name }) => {
    if (type === 'joined') {
      ui.log(`${name} joined`, 'success');
      ui.toast(`${name} joined the room`, 'success');
      ui.playConnectPulse();
      if (net.state.roomCode) db.saveRecentDevice({ roomCode: net.state.roomCode, label: name });
      renderRecentDevices();
    } else if (type === 'left') {
      ui.log(`${name || 'A device'} disconnected`, 'error');
    } else if (type === 'host-left') {
      ui.log('The host disconnected.', 'error');
      ui.toast('The host disconnected \u2014 link again below.', 'error');
      resetToLinkScreen();
    }
  });

  net.on('error', (err) => {
    ui.log(`Connection error: ${err.message || err}`, 'error');
  });
}

function syncAutoSaveWithTrust(roster) {
  if (manualAutoSaveOverride !== null) return;
  const others = roster.filter((r) => r.id !== net.state.myId);
  const anyTrusted = others.some((r) => db.isTrusted(r.name));
  ui.el('autoSaveToggle').checked = anyTrusted;
}

// ---------------------------------------------------------------------------
// Send panel
// ---------------------------------------------------------------------------

function wireSendPanel() {
  ui.el('btnFiles').addEventListener('click', () => setFolderMode(false));
  ui.el('btnFolder').addEventListener('click', () => setFolderMode(true));

  ui.el('fileInput').addEventListener('change', (e) => {
    handleOutgoingFiles(e.target.files, false);
    e.target.value = '';
  });
  ui.el('folderInput').addEventListener('change', (e) => {
    handleOutgoingFiles(e.target.files, true);
    e.target.value = '';
  });

  const dz = ui.el('dropZone');
  ['dragenter', 'dragover'].forEach((evt) =>
    dz.addEventListener(evt, (e) => {
      e.preventDefault();
      dz.classList.add('drop-zone--active');
    })
  );
  ['dragleave', 'drop'].forEach((evt) =>
    dz.addEventListener(evt, (e) => {
      e.preventDefault();
      dz.classList.remove('drop-zone--active');
    })
  );
  dz.addEventListener('drop', (e) => {
    if (isFolderMode) {
      ui.toast('Drag & drop only works for files \u2014 use the button to pick a folder.', 'info');
      return;
    }
    if (e.dataTransfer.files.length) handleOutgoingFiles(e.dataTransfer.files, false);
  });
}

function setFolderMode(folder) {
  isFolderMode = folder;
  ui.el('btnFolder').classList.toggle('active', folder);
  ui.el('btnFiles').classList.toggle('active', !folder);
  ui.el('dropLabel').setAttribute('for', folder ? 'folderInput' : 'fileInput');
  ui.el('dropText').textContent = folder ? 'Click to select a folder' : 'Click to browse or drag & drop files here';
  ui.el('dropIcon').textContent = folder ? '\ud83d\udcc1' : '\ud83d\udcc4';
}

async function handleOutgoingFiles(fileList, isFolder) {
  if (!fileList || fileList.length === 0) return;
  const target = ui.el('targetSelect').value || firstOtherPeerId();
  if (!target) {
    ui.toast('No device is linked yet.', 'error');
    return;
  }
  const passphrase = ui.el('passphraseInput').value || null;

  try {
    if (isFolder) {
      const files = Array.from(fileList).filter((f) => !(f.size === 0 && f.name.endsWith('/')));
      const folderName = (files[0] && files[0].webkitRelativePath.split('/')[0]) || 'folder';
      ui.el('zipProgressRow').hidden = false;
      ui.log(`Zipping "${folderName}" (${files.length} files)\u2026`);
      const zipped = await zip.zipFiles(files, folderName, (percent) => {
        ui.el('zipProgressFill').style.width = `${Math.round(percent)}%`;
        ui.el('zipProgressText').textContent = `Compressing\u2026 ${Math.round(percent)}%`;
      });
      ui.el('zipProgressRow').hidden = true;
      ui.log(`Zipped "${folderName}" \u2192 ${ui.formatSize(zipped.size)}`, 'success');
      await transfer.sendFiles([zipped], { target, passphrase, isFolder: true });
    } else {
      await transfer.sendFiles(Array.from(fileList), { target, passphrase, isFolder: false });
    }
  } catch (err) {
    ui.log(`Transfer error: ${err.message}`, 'error');
    ui.toast('Something interrupted the transfer.', 'error');
  }
}

function firstOtherPeerId() {
  const others = net.state.roster.filter((r) => r.id !== net.state.myId);
  return others.length ? (others.length > 1 ? 'broadcast' : others[0].id) : null;
}

// ---------------------------------------------------------------------------
// Receive panel
// ---------------------------------------------------------------------------

function wireReceivePanel() {
  ui.el('autoSaveToggle').addEventListener('change', (e) => {
    manualAutoSaveOverride = e.target.checked;
    const others = net.state.roster.filter((r) => r.id !== net.state.myId);
    others.forEach((r) => db.setTrusted(r.name, e.target.checked));
  });
}

// ---------------------------------------------------------------------------
// Transfer events
// ---------------------------------------------------------------------------

function wireTransferEvents() {
  transfer.on('send-start', ({ transferId, name, size }) => {
    ui.addOutgoingRow(transferId, name, size);
    ui.log(`Sending "${name}" (${ui.formatSize(size)})\u2026`);
  });
  transfer.on('send-progress', ({ transferId, percent }) => ui.updateOutgoingRow(transferId, percent));
  transfer.on('send-done', ({ transferId, name }) => {
    ui.finishOutgoingRow(transferId, true);
    ui.log(`Sent "${name}" \u2713`, 'success');
    loadHistory();
  });
  transfer.on('send-error', ({ transferId, name, error }) => {
    ui.finishOutgoingRow(transferId, false, 'Failed \u2717');
    ui.log(`Failed to send "${name}": ${error}`, 'error');
    ui.toast(`Failed to send "${name}"`, 'error');
  });

  transfer.on('recv-start', ({ transferId, name, size, peerLabel, encrypted }) => {
    ui.addIncomingCard(transferId, { name, size, peerLabel, encrypted });
    ui.log(`Receiving "${name}" from ${peerLabel}\u2026`);
  });
  transfer.on('recv-progress', ({ transferId, percent }) => ui.updateIncomingCard(transferId, percent));
  transfer.on('recv-error', ({ transferId, name, error }) => {
    ui.markIncomingFailed(transferId, error);
    ui.log(`Could not receive "${name}": ${error}`, 'error');
    ui.toast(error, 'error');
    loadHistory();
  });
  transfer.on('recv-done', (payload) => onFileReceived(payload));
}

async function onFileReceived({ transferId, name, blob, isFolder, historyId }) {
  ui.log(`Received "${name}" \u2713`, 'success');
  const autoSave = ui.el('autoSaveToggle').checked;
  const canExtract = isFolder && zip.canExtractToDisk();

  if (autoSave) {
    ui.downloadBlob(blob, name);
    ui.markIncomingReady(transferId, [
      { label: 'Saved automatically \u2713', variant: 'ghost', onClick: () => {} },
      ...(canExtract
        ? [{ label: 'Extract to folder', variant: 'ghost', onClick: () => doExtract(blob, name) }]
        : []),
    ]);
  } else {
    const actions = [
      { label: 'Save', variant: 'primary', onClick: (btn) => saveNow(btn, blob, name) },
      { label: 'Discard', variant: 'danger', onClick: () => ui.el(`in-${transferId}`).remove() },
    ];
    if (canExtract) {
      actions.splice(1, 0, { label: 'Extract to folder', variant: 'ghost', onClick: () => doExtract(blob, name) });
    }
    ui.markIncomingReady(transferId, actions);
  }
  loadHistory();
}

function saveNow(btn, blob, name) {
  ui.downloadBlob(blob, name);
  btn.textContent = 'Saved \u2713';
  btn.disabled = true;
}

async function doExtract(blob, name) {
  try {
    const written = await zip.extractZipToDisk(blob);
    ui.toast(`Extracted ${written} file${written === 1 ? '' : 's'} to the folder you picked.`, 'success');
  } catch (err) {
    if (err && err.name !== 'AbortError') {
      ui.toast('Could not extract \u2014 try Save instead and unzip manually.', 'error');
    }
  }
}

// ---------------------------------------------------------------------------
// History panel
// ---------------------------------------------------------------------------

function wireHistoryPanel() {
  ui.el('clearHistoryBtn').addEventListener('click', async () => {
    if (!window.confirm('Clear all transfer history? This also removes any files kept for re-download.')) return;
    await db.clearHistory();
    loadHistory();
    ui.toast('History cleared', 'success');
  });
}

async function loadHistory() {
  const entries = await db.getAllHistory();
  ui.renderHistory(entries, {
    canExtract: zip.canExtractToDisk(),
    onRedownload: async (entry) => {
      const blob = await db.getBlob(String(entry.id));
      if (!blob) {
        ui.toast('That file was too large to keep a copy of \u2014 ask the sender to resend it.', 'error');
        return;
      }
      ui.downloadBlob(blob, entry.fileName);
    },
    onExtract: async (entry) => {
      const blob = await db.getBlob(String(entry.id));
      if (!blob) {
        ui.toast('No stored copy to extract.', 'error');
        return;
      }
      await doExtract(blob, entry.fileName);
    },
  });
}
