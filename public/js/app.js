// app.js - COMPLETE WITH DISCONNECT & MODE SWITCHING

const $ = id => {
    const el = document.getElementById(id);
    if (!el) console.warn(`Element #${id} not found!`);
    return el;
};

const hostView = $('hostView');
const clientView = $('clientView');
const roomCodeDisplay = $('roomCodeDisplay');
const roomCodeInput = $('roomCodeInput');
const joinRoomBtn = $('joinRoomBtn');
const copyCodeBtn = $('copyCodeBtn');
const shareCodeBtn = $('shareCodeBtn');
const clientSpinner = $('clientSpinner');
const roomInputGroup = $('roomInputGroup');
const connectionStatus = $('connectionStatus');
const sendCard = $('sendCard');
const receiveCard = $('receiveCard');
const fileInput = $('fileInput');
const folderInput = $('folderInput');
const fileListEl = $('fileList');
const transferLog = $('transferLog');
const downloadAllBtn = $('downloadAllBtn');
const disconnectBtn = $('disconnectBtn');
const savedDevicesList = $('savedDevicesList');
const noDevicesHint = $('noDevicesHint');
const historyList = $('historyList');
const clearHistoryBtn = $('clearHistoryBtn');
const qrWrapper = $('qrWrapper');
const qrcodeDiv = $('qrcode');
const hostStatus = $('hostStatus');
const hostModeBtn = $('hostModeBtn');
const clientModeBtn = $('clientModeBtn');

let peer = null;
let conn = null;
let isConnectionReady = false;
let isHost = false;
let currentRoomCode = null;
let receivedFiles = [];
const PEER_PREFIX = 'qrlan-';
const ROOM_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// ═══════════════════════════════════════════
// TABS & MODE TOGGLE
// ═══════════════════════════════════════════
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => {
            b.classList.remove('active');
            b.setAttribute('aria-selected', 'false');
        });
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
        const tabContent = document.getElementById(`tab-${btn.dataset.tab}`);
        if (tabContent) tabContent.classList.add('active');
    });
});

function setHostMode() {
    if (hostModeBtn) hostModeBtn.classList.add('active');
    if (clientModeBtn) clientModeBtn.classList.remove('active');
    if (hostView) hostView.style.display = 'block';
    if (clientView) clientView.style.display = 'none';
    isHost = true;
    if (!peer) startHost();
}

function setClientMode() {
    if (clientModeBtn) clientModeBtn.classList.add('active');
    if (hostModeBtn) hostModeBtn.classList.remove('active');
    if (clientView) clientView.style.display = 'block';
    if (hostView) hostView.style.display = 'none';
    isHost = false;
}

function disconnect() {
    if (conn) {
        conn.close();
        conn = null;
    }
    if (peer) {
        peer.destroy();
        peer = null;
    }
    isConnectionReady = false;
    currentRoomCode = null;
    receivedFiles = [];
    
    if (sendCard) sendCard.style.display = 'none';
    if (receiveCard) receiveCard.style.display = 'none';
    if (transferLog) transferLog.innerHTML = '';
    if (downloadAllBtn) downloadAllBtn.style.display = 'none';
    
    // Reset to host mode
    setHostMode();
    log('Disconnected. You can now create or join a new room.', 'info');
}

if (hostModeBtn) hostModeBtn.onclick = setHostMode;
if (clientModeBtn) clientModeBtn.onclick = setClientMode;
if (disconnectBtn) disconnectBtn.onclick = disconnect;

// ═══════════════════════════════════════════
// UTILITIES & HEALTH CHECK
// ═══════════════════════════════════════════
function log(msg, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${msg}`);
    if (hostStatus && isHost) hostStatus.textContent = msg;
}

function formatSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function generateRoomCode() {
    let code = '';
    for (let i = 0; i < 6; i++) code += ROOM_CHARS.charAt(Math.floor(Math.random() * ROOM_CHARS.length));
    return code;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function checkConnection() {
    if (!conn || !conn.open) {
        isConnectionReady = false;
        if (sendCard) sendCard.style.display = 'none';
        log('⚠️ Connection lost. Please disconnect and rejoin.', 'error');
        return false;
    }
    return true;
}

// ═══════════════════════════════════════════
// LOCALSTORAGE
// ═══════════════════════════════════════════
const Storage = {
    getDevices: () => { try { return JSON.parse(localStorage.getItem('p2p_devices') || '[]'); } catch { return []; } },
    saveDevice: (device) => {
        try {
            let devices = Storage.getDevices();
            const idx = devices.findIndex(d => d.code === device.code);
            if (idx >= 0) devices[idx] = { ...devices[idx], ...device, lastSeen: Date.now() };
            else devices.push({ ...device, lastSeen: Date.now(), count: 1 });
            localStorage.setItem('p2p_devices', JSON.stringify(devices));
            renderSavedDevices();
        } catch (err) { console.error('Save device error:', err); }
    },
    removeDevice: (code) => {
        try {
            localStorage.setItem('p2p_devices', JSON.stringify(Storage.getDevices().filter(d => d.code !== code)));
            renderSavedDevices();
        } catch (err) { console.error('Remove device error:', err); }
    },
    getHistory: () => { try { return JSON.parse(localStorage.getItem('p2p_history') || '[]'); } catch { return []; } },
    addHistory: (item) => {
        try {
            const history = Storage.getHistory();
            history.unshift({ ...item, date: Date.now() });
            localStorage.setItem('p2p_history', JSON.stringify(history.slice(0, 50)));
            renderHistory();
        } catch (err) { console.error('Add history error:', err); }
    },
    clearHistory: () => {
        try { localStorage.removeItem('p2p_history'); renderHistory(); } catch (err) { console.error('Clear history error:', err); }
    }
};

function renderSavedDevices() {
    if (!savedDevicesList || !noDevicesHint) return;
    const devices = Storage.getDevices();
    if (devices.length === 0) { noDevicesHint.style.display = 'block'; savedDevicesList.innerHTML = ''; return; }
    noDevicesHint.style.display = 'none';
    savedDevicesList.innerHTML = devices.map(d => `
        <div class="saved-device-item">
            <div class="device-info">
                <div class="device-name">${escapeHtml(d.name || 'Unknown Device')}</div>
                <div class="device-code">${escapeHtml(d.code)} • ${d.count || 1}x</div>
            </div>
            <button class="connect-btn" onclick="window.joinRoom('${escapeHtml(d.code)}')">Connect</button>
            <button class="delete-btn" onclick="Storage.removeDevice('${escapeHtml(d.code)}')" title="Remove">🗑️</button>
        </div>
    `).join('');
}

function renderHistory() {
    if (!historyList) return;
    const history = Storage.getHistory();
    if (history.length === 0) { historyList.innerHTML = '<p class="hint">No history yet.</p>'; return; }
    historyList.innerHTML = history.map(h => `
        <div class="history-item">
            <span class="history-icon">${h.type === 'sent' ? '📤' : '📥'}</span>
            <div class="history-details">
                <div class="history-name">${escapeHtml(h.name)}</div>
                <div class="history-meta">${formatSize(h.size)} • ${new Date(h.date).toLocaleString()}</div>
            </div>
        </div>
    `).join('');
}

// ═══════════════════════════════════════════
// INITIALIZATION & PEER SETUP
// ═══════════════════════════════════════════
function init() {
    try {
        const params = new URLSearchParams(window.location.search);
        const urlRoom = params.get('room');
        if (urlRoom) {
            setClientMode();
            if (roomInputGroup) roomInputGroup.style.display = 'none';
            if (clientSpinner) clientSpinner.style.display = 'block';
            if (connectionStatus) connectionStatus.textContent = `Joining ${urlRoom}...`;
            setTimeout(() => joinRoom(urlRoom), 500);
        } else {
            setHostMode();
        }
        renderSavedDevices();
        renderHistory();
    } catch (err) {
        console.error('Initialization error:', err);
        log('Failed to initialize', 'error');
        setHostMode();
    }
}

function startHost() {
    try {
        currentRoomCode = generateRoomCode();
        if (roomCodeDisplay) roomCodeDisplay.textContent = currentRoomCode;
        log(`Generated room: ${currentRoomCode}`);
        createPeer(`${PEER_PREFIX}${currentRoomCode}`);
    } catch (err) {
        console.error('Start host error:', err);
        log('Failed to start host', 'error');
    }
}

function createPeer(peerId) {
    try {
        if (!window.Peer) { log('Error: PeerJS library not loaded', 'error'); return; }
        peer = new Peer(peerId, { debug: 1, config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] } });
        
        peer.on('open', (id) => {
            log(`Ready: ${id}`, 'success');
            if (isHost && qrWrapper && qrcodeDiv) {
                qrWrapper.style.display = 'flex';
                qrcodeDiv.innerHTML = '';
                if (window.QRCode) {
                    new QRCode(qrcodeDiv, { text: `${window.location.origin}/?room=${currentRoomCode}`, width: 180, height: 180, colorDark: '#1a202c', colorLight: '#ffffff', correctLevel: window.QRCode.CorrectLevel.M });
                }
            }
        });
        peer.on('connection', (connection) => { log('Incoming connection!', 'success'); setupConnection(connection); });
        peer.on('error', (err) => {
            console.error('Peer error:', err);
            log(`Error: ${err.type}`, 'error');
            if (err.type === 'unavailable-id' && isHost) {
                currentRoomCode = generateRoomCode();
                if (roomCodeDisplay) roomCodeDisplay.textContent = currentRoomCode;
                setTimeout(() => { if (peer) peer.destroy(); createPeer(`${PEER_PREFIX}${currentRoomCode}`); }, 1000);
            }
        });
    } catch (err) { console.error('Create peer error:', err); log('Failed to create peer', 'error'); }
}

window.joinRoom = function(code) {
    if (!code || code.length < 6) { log('Invalid room code', 'error'); return; }
    code = code.toUpperCase().trim();
    try {
        if (connectionStatus) connectionStatus.textContent = `Connecting to ${code}...`;
        if (clientSpinner) clientSpinner.style.display = 'block';
        if (roomInputGroup) roomInputGroup.style.display = 'none';
        if (!window.Peer) { log('PeerJS not loaded', 'error'); return; }

        peer = new Peer(undefined, { debug: 1, config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] } });
        peer.on('open', () => {
            log('Client peer ready', 'success');
            const connection = peer.connect(`${PEER_PREFIX}${code}`, { reliable: true, serialization: 'binary' });
            setupConnection(connection, code);
            setTimeout(() => { 
                if (!isConnectionReady) { 
                    log('Connection timeout', 'error');
                    if (connectionStatus) connectionStatus.textContent = 'Connection failed. Check code.';
                    if (clientSpinner) clientSpinner.style.display = 'none';
                    if (roomInputGroup) roomInputGroup.style.display = 'flex';
                } 
            }, 15000);
        });
        peer.on('error', (err) => {
            console.error('Client error:', err);
            log(`Failed: ${err.type}`, 'error');
            if (connectionStatus) connectionStatus.textContent = 'Failed to connect';
            if (clientSpinner) clientSpinner.style.display = 'none';
            if (roomInputGroup) roomInputGroup.style.display = 'flex';
        });
    } catch (err) { console.error('Join room error:', err); log('Failed to join room', 'error'); }
};

function setupConnection(connection, code = null) {
    try {
        conn = connection;
        conn.on('open', () => {
            isConnectionReady = true;
            log('Connected!', 'success');
            if (sendCard) sendCard.style.display = 'block';
            if (code) {
                const deviceName = prompt('Name this device?', 'Device') || 'Device';
                Storage.saveDevice({ code, name: deviceName });
            }
            if (!isHost && connectionStatus) {
                connectionStatus.textContent = '✅ Connected!';
                connectionStatus.style.color = 'var(--success)';
            }
            if (clientSpinner) clientSpinner.style.display = 'none';
        });
        conn.on('data', (data) => { try { handleIncomingData(data); } catch (err) { console.error('Data handling error:', err); } });
        conn.on('close', () => { 
            isConnectionReady = false; 
            if (sendCard) sendCard.style.display = 'none';
            log('⚠️ Disconnected.', 'error');
            if (!isHost && connectionStatus) {
                connectionStatus.textContent = 'Disconnected. Click Disconnect to rejoin.';
                connectionStatus.style.color = 'var(--danger)';
            }
        });
        conn.on('error', (err) => {
            console.error('Connection error:', err);
            isConnectionReady = false;
            log('⚠️ Connection error.', 'error');
        });
    } catch (err) { console.error('Setup connection error:', err); }
}

// ═══════════════════════════════════════════
// FILE HANDLING & SENDING
// ═══════════════════════════════════════════
const btnFiles = $('btnFiles');
const btnFolder = $('btnFolder');
if (btnFiles) btnFiles.onclick = () => toggleMode(false);
if (btnFolder) btnFolder.onclick = () => toggleMode(true);

function toggleMode(isFolder) {
    if (btnFiles) btnFiles.classList.toggle('active', !isFolder);
    if (btnFolder) btnFolder.classList.toggle('active', isFolder);
    const dropLabel = $('dropLabel');
    const dropText = $('dropText');
    if (dropLabel) dropLabel.setAttribute('for', isFolder ? 'folderInput' : 'fileInput');
    if (dropText) dropText.textContent = isFolder ? 'Select Folder' : 'Select Files';
}

if (fileInput) fileInput.onchange = e => handleFiles(e.target.files);
if (folderInput) folderInput.onchange = e => handleFiles(e.target.files);

const dropZone = $('dropZone');
if (dropZone) {
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => { dropZone.classList.remove('drag-over'); });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        if (fileInput) { fileInput.files = e.dataTransfer.files; handleFiles(e.dataTransfer.files); }
    });
}

async function handleFiles(files) {
    if (!checkConnection()) return;
    if (!files || files.length === 0) return;
    if (fileListEl) fileListEl.innerHTML = '';
    log(`Sending ${files.length} file(s)...`, 'success');
    
    for (const file of files) {
        if (file.size === 0 && file.name.endsWith('/')) continue;
        const item = document.createElement('div');
        item.className = 'file-item';
        item.innerHTML = `<span>${escapeHtml(file.name)}</span><span class="size status">Pending</span>`;
        if (fileListEl) fileListEl.appendChild(item);
        const statusEl = item.querySelector('.status');
        
        try {
            if (!checkConnection()) {
                statusEl.textContent = 'Disconnected ✗';
                statusEl.style.color = 'var(--danger)';
                break;
            }
            await sendFile(file, statusEl);
            Storage.addHistory({ type: 'sent', name: file.name, size: file.size });
        } catch (err) {
            console.error('Send error:', err);
            if (statusEl) { statusEl.textContent = 'Failed ✗'; statusEl.style.color = 'var(--danger)'; }
        }
    }
    log('Transfer session complete.', 'success');
}

function sendFile(file, statusEl) {
    return new Promise((resolve, reject) => {
        if (!conn || !conn.open) {
            if (statusEl) { statusEl.textContent = 'No connection ✗'; statusEl.style.color = 'var(--danger)'; }
            return reject(new Error('Not connected'));
        }
        const chunkSize = 16 * 1024;
        const totalChunks = Math.max(1, Math.ceil(file.size / chunkSize));
        let i = 0;
        try {
            conn.send({ type: 'start', name: file.name, size: file.size, chunks: totalChunks });
            if (statusEl) statusEl.textContent = 'Sending...';
            const next = () => {
                if (!conn || !conn.open) {
                    if (statusEl) { statusEl.textContent = 'Disconnected ✗'; statusEl.style.color = 'var(--danger)'; }
                    return reject(new Error('Connection lost'));
                }
                if (i >= totalChunks) { 
                    conn.send({ type: 'end', name: file.name }); 
                    if (statusEl) { statusEl.textContent = 'Done ✓'; statusEl.style.color = 'var(--success)'; }
                    return resolve(); 
                }
                if (conn.bufferedAmount > 1024 * 1024) return setTimeout(next, 50);
                if (file.size === 0) { i++; return next(); }
                const start = i * chunkSize;
                const end = Math.min(start + chunkSize, file.size);
                const blob = file.slice(start, end);
                const reader = new FileReader();
                reader.onload = e => {
                    try {
                        conn.send({ type: 'chunk', i, data: e.target.result });
                        i++;
                        if (statusEl) statusEl.textContent = `${Math.round((i/totalChunks)*100)}%`;
                        setTimeout(next, 5);
                    } catch (err) {
                        console.error('Send chunk error:', err);
                        if (statusEl) { statusEl.textContent = 'Error ✗'; statusEl.style.color = 'var(--danger)'; }
                        reject(err);
                    }
                };
                reader.onerror = () => {
                    console.error('File read error');
                    if (statusEl) { statusEl.textContent = 'Read Error ✗'; statusEl.style.color = 'var(--danger)'; }
                    reject(new Error('File read error'));
                };
                reader.readAsArrayBuffer(blob);
            };
            next();
        } catch (err) {
            console.error('Send file error:', err);
            if (statusEl) { statusEl.textContent = 'Error ✗'; statusEl.style.color = 'var(--danger)'; }
            reject(err);
        }
    });
}

// ═══════════════════════════════════════════
// RECEIVING LOGIC
// ═══════════════════════════════════════════
let currentMeta = null;
let chunks = [];
let receivedCount = 0;

function handleIncomingData(data) {
    try {
        if (data.type === 'start') {
            if (currentMeta) {
                console.warn('Previous transfer interrupted, resetting state.');
            }
            currentMeta = data;
            chunks = new Array(data.chunks);
            receivedCount = 0;
            
            if (receiveCard) receiveCard.style.display = 'block';
            if (downloadAllBtn) downloadAllBtn.style.display = 'none';
            
            const item = document.createElement('div');
            item.className = 'file-card';
            item.innerHTML = `<div class="file-card-header"><span>${escapeHtml(data.name)}</span><span>${formatSize(data.size)}</span></div><div class="progress-bar"><div class="progress-fill"></div></div><p class="progress-text">0%</p>`;
            if (transferLog) transferLog.appendChild(item);
            log(`Receiving: ${data.name}`, 'info');
            
        } else if (data.type === 'chunk') {
            if (!currentMeta) return;
            chunks[data.i] = data.data;
            receivedCount += data.data.byteLength;
            const pct = Math.round((receivedCount / currentMeta.size) * 100);
            const card = transferLog ? transferLog.lastElementChild : null;
            if (card) {
                const fill = card.querySelector('.progress-fill');
                const text = card.querySelector('.progress-text');
                if (fill) fill.style.width = `${pct}%`;
                if (text) text.textContent = `${pct}%`;
            }
        } else if (data.type === 'end') {
            if (!currentMeta) return;
            
            const blob = new Blob(chunks.filter(c => c !== undefined));
            receivedFiles.push({ name: currentMeta.name, blob });
            Storage.addHistory({ type: 'received', name: currentMeta.name, size: currentMeta.size });
            
            const card = transferLog ? transferLog.lastElementChild : null;
            if (card) {
                const text = card.querySelector('.progress-text');
                const fill = card.querySelector('.progress-fill');
                if (text) text.textContent = 'Received';
                if (fill) fill.classList.add('complete');
            }
            
            if (downloadAllBtn) downloadAllBtn.style.display = 'block';
            log(`Received: ${currentMeta.name}`, 'success');
            
            currentMeta = null;
            chunks = [];
            receivedCount = 0;
        }
    } catch (err) { 
        console.error('Handle incoming data error:', err); 
        log('Error receiving data', 'error'); 
    }
}

// ═══════════════════════════════════════════
// DOWNLOAD ALL & UI ACTIONS
// ═══════════════════════════════════════════
if (downloadAllBtn) {
    downloadAllBtn.onclick = async () => {
        if (receivedFiles.length === 0) { log('No files to download', 'error'); return; }
        log(`Downloading ${receivedFiles.length} files...`, 'info');
        for (let i = 0; i < receivedFiles.length; i++) {
            const file = receivedFiles[i];
            try {
                const url = URL.createObjectURL(file.blob);
                const a = document.createElement('a');
                a.href = url; a.download = file.name; a.style.display = 'none';
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
                URL.revokeObjectURL(url);
                await new Promise(r => setTimeout(r, 500));
                log(`Downloaded ${i + 1}/${receivedFiles.length}: ${file.name}`, 'success');
            } catch (err) {
                console.error('Download error:', err);
                log(`Failed to download: ${file.name}`, 'error');
            }
        }
        receivedFiles = [];
        if (downloadAllBtn) downloadAllBtn.style.display = 'none';
        if (transferLog) transferLog.innerHTML = '';
        log('All files downloaded!', 'success');
    };
}

if (copyCodeBtn) {
    copyCodeBtn.onclick = async () => {
        if (!currentRoomCode) return;
        try {
            await navigator.clipboard.writeText(currentRoomCode);
            copyCodeBtn.textContent = '✅ Copied';
            setTimeout(() => { copyCodeBtn.textContent = '📋 Copy'; }, 2000);
        } catch {
            const textarea = document.createElement('textarea');
            textarea.value = currentRoomCode;
            document.body.appendChild(textarea); textarea.select(); document.execCommand('copy'); document.body.removeChild(textarea);
            copyCodeBtn.textContent = '✅ Copied';
            setTimeout(() => { copyCodeBtn.textContent = '📋 Copy'; }, 2000);
        }
    };
}

if (shareCodeBtn) {
    shareCodeBtn.onclick = () => {
        if (!currentRoomCode) return;
        const shareData = { title: 'QR P2P Transfer', text: `Join my transfer room: ${currentRoomCode}`, url: `${window.location.origin}/?room=${currentRoomCode}` };
        if (navigator.share) { navigator.share(shareData).catch(() => {}); }
        else { if (copyCodeBtn) copyCodeBtn.click(); }
    };
}

if (clearHistoryBtn) {
    clearHistoryBtn.onclick = () => { if (confirm('Clear all transfer history?')) Storage.clearHistory(); };
}

if (joinRoomBtn) {
    joinRoomBtn.onclick = () => { if (roomCodeInput) window.joinRoom(roomCodeInput.value.trim()); };
}

if (roomCodeInput) {
    roomCodeInput.addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-HJKMNP-Z2-9]/g, ''); });
    roomCodeInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') window.joinRoom(roomCodeInput.value.trim()); });
}

if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }