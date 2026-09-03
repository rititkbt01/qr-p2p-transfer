// app.js - COMPLETE PRODUCTION VERSION

const $ = id => document.getElementById(id);
const hostView = $('hostView'), clientView = $('clientView');
const roomCodeDisplay = $('roomCodeDisplay'), roomCodeInput = $('roomCodeInput');
const joinRoomBtn = $('joinRoomBtn'), copyCodeBtn = $('copyCodeBtn'), shareCodeBtn = $('shareCodeBtn');
const clientSpinner = $('clientSpinner'), roomInputGroup = $('roomInputGroup');
const connectionStatus = $('connectionStatus');
const sendCard = $('sendCard'), receiveCard = $('receiveCard');
const fileInput = $('fileInput'), folderInput = $('folderInput');
const fileListEl = $('fileList'), transferLog = $('transferLog');
const downloadAllBtn = $('downloadAllBtn');
const savedDevicesList = $('savedDevicesList'), noDevicesHint = $('noDevicesHint');
const historyList = $('historyList'), clearHistoryBtn = $('clearHistoryBtn');

let peer = null, conn = null;
let isConnectionReady = false, isHost = false, currentRoomCode = null;
let receivedFiles = [];
const PEER_PREFIX = 'qrlan-';
const ROOM_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// Tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        $(`tab-${btn.dataset.tab}`).classList.add('active');
    });
});

function log(msg, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${msg}`);
}

function formatSize(bytes) {
    if (!bytes) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function generateRoomCode() {
    let code = '';
    for (let i = 0; i < 6; i++) code += ROOM_CHARS.charAt(Math.floor(Math.random() * ROOM_CHARS.length));
    return code;
}

// LocalStorage
const Storage = {
    getDevices: () => JSON.parse(localStorage.getItem('p2p_devices') || '[]'),
    saveDevice: (device) => {
        let devices = Storage.getDevices();
        const idx = devices.findIndex(d => d.code === device.code);
        if (idx >= 0) devices[idx] = { ...devices[idx], ...device, lastSeen: Date.now() };
        else devices.push({ ...device, lastSeen: Date.now(), count: 1 });
        localStorage.setItem('p2p_devices', JSON.stringify(devices));
        renderSavedDevices();
    },
    removeDevice: (code) => {
        localStorage.setItem('p2p_devices', JSON.stringify(Storage.getDevices().filter(d => d.code !== code)));
        renderSavedDevices();
    },
    getHistory: () => JSON.parse(localStorage.getItem('p2p_history') || '[]'),
    addHistory: (item) => {
        const history = Storage.getHistory();
        history.unshift({ ...item, date: Date.now() });
        localStorage.setItem('p2p_history', JSON.stringify(history.slice(0, 50)));
        renderHistory();
    },
    clearHistory: () => { localStorage.removeItem('p2p_history'); renderHistory(); }
};

function renderSavedDevices() {
    const devices = Storage.getDevices();
    if (devices.length === 0) { noDevicesHint.style.display = 'block'; savedDevicesList.innerHTML = ''; return; }
    noDevicesHint.style.display = 'none';
    savedDevicesList.innerHTML = devices.map(d => `
        <div class="saved-device-item">
            <div class="device-info" style="flex:1">
                <div class="history-name">${d.name || 'Unknown Device'}</div>
                <div class="history-meta">${d.code} • ${d.count || 1}x</div>
            </div>
            <button class="connect-btn" onclick="joinRoom('${d.code}')">Connect</button>
            <button class="delete-btn" onclick="Storage.removeDevice('${d.code}')">🗑️</button>
        </div>
    `).join('');
}

function renderHistory() {
    const history = Storage.getHistory();
    if (history.length === 0) { historyList.innerHTML = '<p class="hint">No history yet.</p>'; return; }
    historyList.innerHTML = history.map(h => `
        <div class="history-item">
            <span class="history-icon">${h.type === 'sent' ? '📤' : '📥'}</span>
            <div class="history-details">
                <div class="history-name">${h.name}</div>
                <div class="history-meta">${formatSize(h.size)} • ${new Date(h.date).toLocaleTimeString()}</div>
            </div>
        </div>
    `).join('');
}

// Init
function init() {
    const params = new URLSearchParams(window.location.search);
    const urlRoom = params.get('room');

    if (urlRoom) {
        clientView.style.display = 'block';
        hostView.style.display = 'none';
        roomInputGroup.style.display = 'none';
        clientSpinner.style.display = 'block';
        connectionStatus.textContent = `Joining ${urlRoom}...`;
        setTimeout(() => joinRoom(urlRoom), 500);
    } else {
        hostView.style.display = 'block';
        clientView.style.display = 'none';
        isHost = true;
        startHost();
    }
    renderSavedDevices();
    renderHistory();
}

function startHost() {
    currentRoomCode = generateRoomCode();
    roomCodeDisplay.textContent = currentRoomCode;
    createPeer(`${PEER_PREFIX}${currentRoomCode}`);
}

function createPeer(peerId) {
    peer = new Peer(peerId, { config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] } });
    
    peer.on('open', () => {
        log(`Ready: ${peerId}`);
        if (isHost) {
            $('qrWrapper').style.display = 'flex';
            // Clear previous QR if any
            $('qrcode').innerHTML = '';
            new QRCode($('qrcode'), { 
                text: `${window.location.origin}/?room=${currentRoomCode}`, 
                width: 180, height: 180,
                colorDark: '#1a202c', colorLight: '#ffffff'
            });
        }
    });

    peer.on('connection', setupConnection);
    
    peer.on('error', (err) => {
        log(`Error: ${err.type}`, 'error');
        if (err.type === 'unavailable-id' && isHost) {
            currentRoomCode = generateRoomCode();
            roomCodeDisplay.textContent = currentRoomCode;
            setTimeout(() => { peer.destroy(); createPeer(`${PEER_PREFIX}${currentRoomCode}`); }, 1000);
        }
    });
}

window.joinRoom = function(code) {
    if (!code || code.length < 6) return;
    code = code.toUpperCase();
    connectionStatus.textContent = `Connecting to ${code}...`;
    clientSpinner.style.display = 'block';
    roomInputGroup.style.display = 'none';

    peer = new Peer(undefined, { config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] } });
    peer.on('open', () => {
        const c = peer.connect(`${PEER_PREFIX}${code}`, { reliable: true, serialization: 'binary' });
        setupConnection(c, code);
        setTimeout(() => { if (!isConnectionReady) { log('Timeout', 'error'); clientSpinner.style.display = 'none'; roomInputGroup.style.display = 'flex'; } }, 15000);
    });
    peer.on('error', () => { log('Failed', 'error'); clientSpinner.style.display = 'none'; roomInputGroup.style.display = 'flex'; });
};

function setupConnection(connection, code = null) {
    conn = connection;
    conn.on('open', () => {
        isConnectionReady = true;
        log('Connected!', 'success');
        sendCard.style.display = 'block';
        if (code) Storage.saveDevice({ code, name: prompt('Name this device?', 'Device') || 'Device' });
        if (!isHost) { connectionStatus.textContent = '✅ Connected!'; clientSpinner.style.display = 'none'; }
    });
    conn.on('data', handleIncomingData);
    conn.on('close', () => { isConnectionReady = false; sendCard.style.display = 'none'; log('Disconnected', 'error'); });
}

$('btnFiles').onclick = () => toggleMode(false);
$('btnFolder').onclick = () => toggleMode(true);

function toggleMode(isFolder) {
    $('btnFiles').classList.toggle('active', !isFolder);
    $('btnFolder').classList.toggle('active', isFolder);
    $('dropLabel').setAttribute('for', isFolder ? 'folderInput' : 'fileInput');
    $('dropText').textContent = isFolder ? 'Select Folder' : 'Select Files';
}

fileInput.onchange = e => handleFiles(e.target.files);
folderInput.onchange = e => handleFiles(e.target.files);

async function handleFiles(files) {
    if (!isConnectionReady) return log('Not connected', 'error');
    fileListEl.innerHTML = '';
    for (const file of files) {
        if (file.size === 0 && file.name.endsWith('/')) continue;
        const item = document.createElement('div');
        item.className = 'file-item';
        item.innerHTML = `<span>${file.name}</span><span class="size status">Pending</span>`;
        fileListEl.appendChild(item);
        await sendFile(file, item.querySelector('.status'));
        Storage.addHistory({ type: 'sent', name: file.name, size: file.size });
    }
}

function sendFile(file, statusEl) {
    return new Promise(resolve => {
        const chunkSize = 16 * 1024;
        const totalChunks = Math.max(1, Math.ceil(file.size / chunkSize));
        let i = 0;
        conn.send({ type: 'start', name: file.name, size: file.size, chunks: totalChunks });
        statusEl.textContent = 'Sending...';

        const next = () => {
            if (i >= totalChunks) { conn.send({ type: 'end', name: file.name }); statusEl.textContent = 'Done ✓'; statusEl.style.color = 'var(--success)'; return resolve(); }
            if (conn.bufferedAmount > 1024 * 1024) return setTimeout(next, 50);
            
            const start = i * chunkSize;
            const reader = new FileReader();
            reader.onload = e => {
                conn.send({ type: 'chunk', i, data: e.target.result });
                i++;
                statusEl.textContent = `${Math.round((i/totalChunks)*100)}%`;
                setTimeout(next, 5);
            };
            reader.readAsArrayBuffer(file.slice(start, Math.min(start + chunkSize, file.size)));
        };
        next();
    });
}

let currentMeta = null, chunks = [], receivedCount = 0;

function handleIncomingData(data) {
    if (data.type === 'start') {
        currentMeta = data; chunks = new Array(data.chunks); receivedCount = 0;
        receiveCard.style.display = 'block';
        downloadAllBtn.style.display = 'none';
        
        const item = document.createElement('div');
        item.className = 'file-card';
        item.innerHTML = `<div class="file-card-header"><span>${data.name}</span><span>${formatSize(data.size)}</span></div>
                          <div class="progress-bar"><div class="progress-fill"></div></div><p class="progress-text">0%</p>`;
        transferLog.appendChild(item);
    } 
    else if (data.type === 'chunk') {
        chunks[data.i] = data.data;
        receivedCount += data.data.byteLength;
        const pct = Math.round((receivedCount / currentMeta.size) * 100);
        const card = transferLog.lastElementChild;
        if (card) { card.querySelector('.progress-fill').style.width = `${pct}%`; card.querySelector('.progress-text').textContent = `${pct}%`; }
    } 
    else if (data.type === 'end') {
        const blob = new Blob(chunks.filter(c => c));
        receivedFiles.push({ name: currentMeta.name, blob });
        Storage.addHistory({ type: 'received', name: currentMeta.name, size: currentMeta.size });
        
        const card = transferLog.lastElementChild;
        if (card) { card.querySelector('.progress-text').textContent = 'Received'; card.querySelector('.progress-fill').classList.add('complete'); }
        
        downloadAllBtn.style.display = 'block';
        currentMeta = null; chunks = [];
    }
}

downloadAllBtn.onclick = async () => {
    log(`Downloading ${receivedFiles.length} files...`);
    for (const file of receivedFiles) {
        const url = URL.createObjectURL(file.blob);
        const a = document.createElement('a');
        a.href = url; a.download = file.name;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
        await new Promise(r => setTimeout(r, 500));
    }
    receivedFiles = [];
    downloadAllBtn.style.display = 'none';
    transferLog.innerHTML = '';
    log('All files downloaded!', 'success');
};

copyCodeBtn.onclick = () => { navigator.clipboard.writeText(currentRoomCode); copyCodeBtn.textContent = '✅ Copied'; setTimeout(() => copyCodeBtn.textContent = '📋 Copy', 2000); };
shareCodeBtn.onclick = () => { if (navigator.share) navigator.share({ title: 'P2P Transfer', url: `${window.location.origin}/?room=${currentRoomCode}` }); else copyCodeBtn.click(); };
clearHistoryBtn.onclick = () => { if(confirm('Clear history?')) Storage.clearHistory(); };

document.addEventListener('DOMContentLoaded', init);