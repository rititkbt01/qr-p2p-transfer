// app.js - QUICK CONNECT + SAVED DEVICES + BIDIRECTIONAL P2P

// ═══════════════════════════════════════════
// DOM REFERENCES
// ═══════════════════════════════════════════
const hostView = document.getElementById('hostView');
const clientView = document.getElementById('clientView');
const qrWrapper = document.getElementById('qrWrapper');
const peerIdDisplay = document.getElementById('peerIdDisplay');
const connectionStatus = document.getElementById('connectionStatus');
const sendCard = document.getElementById('sendCard');
const receiveCard = document.getElementById('receiveCard');
const savedDevicesCard = document.getElementById('savedDevicesCard');
const fileInput = document.getElementById('fileInput');
const folderInput = document.getElementById('folderInput');
const fileListEl = document.getElementById('fileList');
const transferLog = document.getElementById('transferLog');
const statusLog = document.getElementById('statusLog');
const btnFiles = document.getElementById('btnFiles');
const btnFolder = document.getElementById('btnFolder');
const dropLabel = document.getElementById('dropLabel');
const dropText = document.getElementById('dropText');
const roomCodeDisplay = document.getElementById('roomCodeDisplay');
const roomCodeInput = document.getElementById('roomCodeInput');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const copyCodeBtn = document.getElementById('copyCodeBtn');
const shareCodeBtn = document.getElementById('shareCodeBtn');
const clientSpinner = document.getElementById('clientSpinner');
const roomInputGroup = document.getElementById('roomInputGroup');
const savedDevicesList = document.getElementById('savedDevicesList');
const noDevicesHint = document.getElementById('noDevicesHint');

// ═══════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════
let peer = null;
let conn = null;
let fileCounter = 0;
let isConnectionReady = false;
let isFolderMode = false;
let currentRoomCode = null;
let isHost = false;

// ═══════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════
const PEER_PREFIX = 'qrlan-';
const STORAGE_KEY = 'qrP2P_pairedDevices';
// Characters safe for verbal sharing (no 0/O, 1/I/L confusion)
const ROOM_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// ═══════════════════════════════════════════
// UTILITY: Log
// ═══════════════════════════════════════════
function log(msg, type = 'info') {
    const p = document.createElement('p');
    p.textContent = `> ${msg}`;
    if (type === 'success') p.classList.add('success');
    if (type === 'error') p.classList.add('error');
    statusLog.appendChild(p);
    statusLog.scrollTop = statusLog.scrollHeight;
    console.log('[APP]', msg);
}

function formatSize(bytes) {
    if (!bytes) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ═══════════════════════════════════════════
// ROOM CODE GENERATOR
// ═══════════════════════════════════════════
function generateRoomCode() {
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += ROOM_CHARS.charAt(Math.floor(Math.random() * ROOM_CHARS.length));
    }
    return code;
}

function getPeerIdFromRoomCode(code) {
    return `${PEER_PREFIX}${code.toUpperCase()}`;
}

// ══════════════════════════════════════════
// LOCALSTORAGE: SAVED DEVICES
// ═══════════════════════════════════════════
function getPairedDevices() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
        return [];
    }
}

function savePairedDevice(device) {
    const devices = getPairedDevices();
    const idx = devices.findIndex(d => d.roomCode === device.roomCode);
    
    if (idx >= 0) {
        devices[idx] = {
            ...devices[idx],
            ...device,
            lastConnected: Date.now(),
            connectionCount: (devices[idx].connectionCount || 0) + 1
        };
    } else {
        devices.push({
            ...device,
            lastConnected: Date.now(),
            connectionCount: 1
        });
    }
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(devices));
    renderSavedDevices();
}

function removePairedDevice(roomCode) {
    const devices = getPairedDevices().filter(d => d.roomCode !== roomCode);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(devices));
    renderSavedDevices();
}

function renamePairedDevice(roomCode, newName) {
    const devices = getPairedDevices();
    const idx = devices.findIndex(d => d.roomCode === roomCode);
    if (idx >= 0) {
        devices[idx].deviceName = newName;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(devices));
        renderSavedDevices();
    }
}

function timeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

// ═══════════════════════════════════════════
// RENDER SAVED DEVICES
// ═══════════════════════════════════════════
function renderSavedDevices() {
    const devices = getPairedDevices();
    
    if (devices.length === 0) {
        savedDevicesCard.style.display = 'none';
        return;
    }
    
    savedDevicesCard.style.display = 'block';
    noDevicesHint.style.display = 'none';
    savedDevicesList.innerHTML = '';
    
    // Sort by most recently connected
    devices.sort((a, b) => b.lastConnected - a.lastConnected);
    
    devices.forEach(device => {
        const item = document.createElement('div');
        item.className = 'saved-device-item';
        
        const name = device.deviceName || `Device ${device.roomCode}`;
        const lastSeen = timeAgo(device.lastConnected);
        const count = device.connectionCount || 1;
        
        item.innerHTML = `
            <div class="device-info">
                <div class="device-name-row">
                    <span class="device-icon">📱</span>
                    <span class="device-name" data-room="${device.roomCode}">${name}</span>
                    <button class="rename-btn" data-room="${device.roomCode}" title="Rename">✏️</button>
                </div>
                <div class="device-meta">
                    <span class="device-code">${device.roomCode}</span>
                    <span class="device-stats">${count}x • ${lastSeen}</span>
                </div>
            </div>
            <button class="connect-btn" data-room="${device.roomCode}">Connect</button>
            <button class="delete-btn" data-room="${device.roomCode}" title="Remove">🗑️</button>
        `;
        
        savedDevicesList.appendChild(item);
    });
    
    // Attach event listeners
    savedDevicesList.querySelectorAll('.connect-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const code = btn.dataset.room;
            log(`📡 Quick connecting to ${code}...`, 'info');
            joinRoom(code);
        });
    });
    
    savedDevicesList.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const code = btn.dataset.room;
            if (confirm('Remove this saved device?')) {
                removePairedDevice(code);
                log(`🗑️ Removed saved device ${code}`, 'info');
            }
        });
    });
    
    savedDevicesList.querySelectorAll('.rename-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const code = btn.dataset.room;
            const nameEl = savedDevicesList.querySelector(`.device-name[data-room="${code}"]`);
            const currentName = nameEl.textContent;
            const newName = prompt('Enter device name:', currentName);
            if (newName && newName.trim()) {
                renamePairedDevice(code, newName.trim());
                log(`✏️ Renamed device to "${newName.trim()}"`, 'success');
            }
        });
    });
}

// ═══════════════════════════════════════════
// 1. INITIALIZE PEERJS
// ═══════════════════════════════════════════
function init() {
    log('Initializing PeerJS...');
    
    // Check URL for room code (from QR scan or shared link)
    const params = new URLSearchParams(window.location.search);
    const urlRoomCode = params.get('room');
    const urlPeerId = params.get('peerId'); // Legacy support
    
    if (urlRoomCode || urlPeerId) {
        // CLIENT MODE - connecting to a host
        clientView.style.display = 'block';
        hostView.style.display = 'none';
        roomInputGroup.style.display = 'none';
        clientSpinner.style.display = 'block';
        
        const targetCode = urlRoomCode || urlPeerId.replace(PEER_PREFIX, '');
        log(`📡 Auto-joining room: ${targetCode}`, 'info');
        connectionStatus.textContent = `Joining room ${targetCode}...`;
        
        // Small delay to let PeerJS initialize
        setTimeout(() => joinRoom(targetCode), 500);
    } else {
        // HOST MODE - generate room code
        hostView.style.display = 'block';
        clientView.style.display = 'none';
        isHost = true;
        initHost();
    }
    
    // Render saved devices
    renderSavedDevices();
}

function initHost() {
    currentRoomCode = generateRoomCode();
    const peerId = getPeerIdFromRoomCode(currentRoomCode);
    
    log(`🏠 Generated room code: ${currentRoomCode}`, 'success');
    roomCodeDisplay.textContent = currentRoomCode;
    
    createPeer(peerId);
}

function createPeer(peerId) {
    peer = new Peer(peerId, {
        debug: 1,
        config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
    });

    peer.on('open', (id) => {
        log(`✅ Peer ID ready: ${id}`, 'success');
        
        if (isHost) {
            peerIdDisplay.textContent = id;
            qrWrapper.style.display = 'flex';
            showQRCode(currentRoomCode);
        }
    });

    peer.on('connection', (connection) => {
        log('📥 Incoming connection received!', 'success');
        setupConnection(connection);
    });

    peer.on('error', (err) => {
        log(`❌ PeerJS Error: ${err.type}`, 'error');
        
        // Handle room code collision
        if (err.type === 'unavailable-id' && isHost) {
            log('🔄 Room code taken, generating new one...', 'info');
            currentRoomCode = generateRoomCode();
            const newPeerId = getPeerIdFromRoomCode(currentRoomCode);
            roomCodeDisplay.textContent = currentRoomCode;
            
            // Destroy old peer and create new one
            setTimeout(() => {
                peer.destroy();
                createPeer(newPeerId);
            }, 1000);
        }
    });
}

// ═══════════════════════════════════════════
// 2. HOST: SHOW QR CODE
// ═══════════════════════════════════════════
function showQRCode(roomCode) {
    const baseUrl = window.location.origin;
    const clientUrl = `${baseUrl}/?room=${roomCode}`;
    
    document.getElementById('qrcode').innerHTML = '';
    new QRCode(document.getElementById('qrcode'), {
        text: clientUrl, width: 200, height: 200,
        colorDark: '#1a202c', colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
    });
    log('✅ QR code generated!', 'success');
}

// ══════════════════════════════════════════
// 3. CLIENT: JOIN ROOM
// ═══════════════════════════════════════════
function joinRoom(roomCode) {
    if (!roomCode || roomCode.length < 6) {
        log('❌ Invalid room code', 'error');
        connectionStatus.textContent = 'Invalid code. Enter 6 characters.';
        return;
    }
    
    roomCode = roomCode.toUpperCase().trim();
    const peerId = getPeerIdFromRoomCode(roomCode);
    
    log(`📡 Connecting to room: ${roomCode}`, 'info');
    connectionStatus.textContent = `Connecting to ${roomCode}...`;
    clientSpinner.style.display = 'block';
    roomInputGroup.style.display = 'none';
    
    // Create client peer with random ID
    peer = new Peer(undefined, {
        debug: 1,
        config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
    });
    
    peer.on('open', () => {
        log(` Client peer ready`, 'success');
        
        const connection = peer.connect(peerId, {
            reliable: true,
            serialization: 'binary'
        });
        
        setupConnection(connection, roomCode);
        
        // Timeout if no response
        setTimeout(() => {
            if (!isConnectionReady) {
                log('️ Connection timeout', 'error');
                connectionStatus.textContent = 'Connection failed. Check code and try again.';
                clientSpinner.style.display = 'none';
                roomInputGroup.style.display = 'flex';
            }
        }, 15000);
    });
    
    peer.on('error', (err) => {
        log(`❌ Connection error: ${err.type}`, 'error');
        connectionStatus.textContent = 'Could not connect. Check room code.';
        clientSpinner.style.display = 'none';
        roomInputGroup.style.display = 'flex';
    });
}

// ═══════════════════════════════════════════
// 4. SETUP CONNECTION (BOTH HOST & CLIENT)
// ══════════════════════════════════════════
function setupConnection(connection, roomCode = null) {
    conn = connection;
    
    conn.on('open', () => {
        log('✅ Connection established!', 'success');
        isConnectionReady = true;
        enableSendReceive();
        
        // Save the connection
        if (roomCode || currentRoomCode) {
            const code = roomCode || currentRoomCode;
            savePairedDevice({
                roomCode: code,
                deviceName: null, // Will be prompted
                peerId: conn.peer
            });
            promptDeviceName(code);
        }
        
        // Update UI for client
        if (!isHost) {
            connectionStatus.textContent = `✅ Connected to ${roomCode || currentRoomCode}!`;
            connectionStatus.style.color = 'var(--success)';
            clientSpinner.style.display = 'none';
        }
    });

    conn.on('data', handleIncomingData);
    
    conn.on('close', () => {
        log('⚠️ Peer disconnected.', 'error');
        isConnectionReady = false;
        sendCard.style.display = 'none';
        if (!isHost) {
            connectionStatus.textContent = 'Disconnected. Try again.';
            roomInputGroup.style.display = 'flex';
        }
    });
    
    conn.on('error', (err) => {
        log(`❌ Connection error: ${err}`, 'error');
        isConnectionReady = false;
    });
}

function promptDeviceName(roomCode) {
    setTimeout(() => {
        const devices = getPairedDevices();
        const device = devices.find(d => d.roomCode === roomCode);
        
        if (device && !device.deviceName) {
            const name = prompt(`Name this device (e.g., "John's iPhone"):\nRoom: ${roomCode}`, '');
            if (name && name.trim()) {
                renamePairedDevice(roomCode, name.trim());
                log(`✏️ Device named: "${name.trim()}"`, 'success');
            }
        }
    }, 1000);
}

function enableSendReceive() {
    log('🚀 Send & Receive enabled!', 'success');
    sendCard.style.display = 'block';
}

// ═══════════════════════════════════════════
// 5. ROOM CODE ACTIONS (COPY / SHARE)
// ═══════════════════════════════════════════
copyCodeBtn.addEventListener('click', async () => {
    if (!currentRoomCode) return;
    
    try {
        await navigator.clipboard.writeText(currentRoomCode);
        copyCodeBtn.textContent = '✅ Copied!';
        log('📋 Room code copied!', 'success');
        setTimeout(() => { copyCodeBtn.textContent = '📋 Copy'; }, 2000);
    } catch {
        // Fallback
        const textarea = document.createElement('textarea');
        textarea.value = currentRoomCode;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        copyCodeBtn.textContent = '✅ Copied!';
        setTimeout(() => { copyCodeBtn.textContent = '📋 Copy'; }, 2000);
    }
});

shareCodeBtn.addEventListener('click', async () => {
    if (!currentRoomCode) return;
    
    const shareUrl = `${window.location.origin}/?room=${currentRoomCode}`;
    const shareData = {
        title: 'QR P2P Transfer',
        text: `Join my transfer room: ${currentRoomCode}`,
        url: shareUrl
    };
    
    try {
        if (navigator.share) {
            await navigator.share(shareData);
            log(' Link shared!', 'success');
        } else {
            await navigator.clipboard.writeText(shareUrl);
            shareCodeBtn.textContent = '✅ Link copied!';
            setTimeout(() => { shareCodeBtn.textContent = '🔗 Share'; }, 2000);
        }
    } catch (err) {
        log(`Share cancelled`, 'info');
    }
});

// ═══════════════════════════════════════════
// 6. CLIENT: JOIN ROOM BUTTON
// ═══════════════════════════════════════════
joinRoomBtn.addEventListener('click', () => {
    const code = roomCodeInput.value.trim();
    joinRoom(code);
});

roomCodeInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const code = roomCodeInput.value.trim();
        joinRoom(code);
    }
});

// Auto-uppercase input
roomCodeInput.addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-HJKMNP-Z2-9]/g, '');
});

// ═══════════════════════════════════════════
// 7. MODE TOGGLE (FILES / FOLDER)
// ═══════════════════════════════════════════
btnFiles.addEventListener('click', () => setMode(false));
btnFolder.addEventListener('click', () => setMode(true));

function setMode(isFolder) {
    isFolderMode = isFolder;
    if (isFolder) {
        btnFolder.classList.add('active');
        btnFiles.classList.remove('active');
        dropLabel.setAttribute('for', 'folderInput');
        dropText.textContent = 'Click to select a folder';
        dropLabel.querySelector('.icon').textContent = '📁';
    } else {
        btnFiles.classList.add('active');
        btnFolder.classList.remove('active');
        dropLabel.setAttribute('for', 'fileInput');
        dropText.textContent = 'Click to browse or drag & drop files here';
        dropLabel.querySelector('.icon').textContent = '📄';
    }
}

// ═══════════════════════════════════════════
// 8. SENDING LOGIC
// ═══════════════════════════════════════════
fileInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
    fileInput.value = '';
});

folderInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
    folderInput.value = '';
});

async function handleFiles(files) {
    if (!isConnectionReady || !conn || !conn.open) {
        log('❌ Connection not ready!', 'error');
        return;
    }
    
    if (!files || files.length === 0) return;

    log(`📤 Starting transfer of ${files.length} item(s)...`, 'success');
    fileListEl.innerHTML = '';

    const fileItems = [];
    for (const file of files) {
        if (file.size === 0 && file.name.endsWith('/')) continue;

        const item = document.createElement('div');
        item.className = 'file-item';
        const nameSpan = document.createElement('span');
        nameSpan.textContent = file.name;
        const statusSpan = document.createElement('span');
        statusSpan.className = 'size';
        statusSpan.textContent = 'Pending';
        item.appendChild(nameSpan);
        item.appendChild(statusSpan);
        fileListEl.appendChild(item);
        fileItems.push({ file, statusEl: statusSpan });
    }

    for (const { file, statusEl } of fileItems) {
        try {
            await sendFile(file, statusEl);
        } catch (err) {
            log(`❌ Transfer interrupted: ${err.message}`, 'error');
            statusEl.textContent = 'Failed ✗';
            statusEl.style.color = 'var(--danger)';
            break;
        }
    }
    log('✅ Transfer session complete!', 'success');
}

function sendFile(file, statusEl) {
    return new Promise((resolve, reject) => {
        if (!conn || !conn.open) {
            statusEl.textContent = 'No connection ✗';
            return reject(new Error('Not connected'));
        }

        const chunkSize = 16 * 1024;
        const totalChunks = Math.max(1, Math.ceil(file.size / chunkSize));
        let currentChunk = 0;

        log(`📦 Sending: ${file.name} (${formatSize(file.size)})`, 'info');

        try {
            conn.send({ type: 'file-start', name: file.name, size: file.size, totalChunks });
            statusEl.textContent = 'Sending...';

            function sendNextChunk() {
                if (!conn || !conn.open) {
                    statusEl.textContent = 'Disconnected ✗';
                    return reject(new Error('Connection lost'));
                }

                if (currentChunk >= totalChunks) {
                    conn.send({ type: 'file-end', name: file.name });
                    statusEl.textContent = 'Done ✓';
                    statusEl.style.color = 'var(--success)';
                    return resolve();
                }

                if (conn.bufferedAmount > 1024 * 1024) {
                    setTimeout(sendNextChunk, 50);
                    return;
                }

                if (file.size === 0) {
                    currentChunk++;
                    sendNextChunk();
                    return;
                }

                const start = currentChunk * chunkSize;
                const end = Math.min(start + chunkSize, file.size);
                const blob = file.slice(start, end);
                const reader = new FileReader();

                reader.onload = (e) => {
                    try {
                        conn.send({ type: 'chunk', index: currentChunk, data: e.target.result });
                        currentChunk++;
                        statusEl.textContent = `${Math.round((currentChunk / totalChunks) * 100)}%`;
                        setTimeout(sendNextChunk, 5);
                    } catch (err) {
                        statusEl.textContent = 'Error ✗';
                        reject(new Error('Send failed'));
                    }
                };

                reader.onerror = () => {
                    statusEl.textContent = 'Read Error ✗';
                    reject(new Error('File read error'));
                };

                reader.readAsArrayBuffer(blob);
            }
            sendNextChunk();
        } catch (err) {
            statusEl.textContent = 'Error ✗';
            reject(err);
        }
    });
}

// ═══════════════════════════════════════════
// 9. RECEIVING LOGIC
// ═══════════════════════════════════════════
let currentFileMeta = null;
let receivedChunks = [];
let totalBytesReceived = 0;

function handleIncomingData(data) {
    try {
        if (data.type === 'file-start') {
            fileCounter++;
            currentFileMeta = data;
            receivedChunks = new Array(data.totalChunks);
            totalBytesReceived = 0;

            log(`📥 Receiving: ${data.name} (${formatSize(data.size)})`, 'info');

            receiveCard.style.display = 'block';
            const item = document.createElement('div');
            item.className = 'file-card';
            item.id = `card-${fileCounter}`;
            item.innerHTML = `
                <div class="file-card-header">
                    <span class="file-name">${data.name}</span>
                    <span class="file-size">${formatSize(data.size)}</span>
                </div>
                <div class="progress-container">
                    <div class="progress-bar"><div class="progress-fill" id="fill-${fileCounter}"></div></div>
                    <p class="progress-text" id="text-${fileCounter}">0%</p>
                </div>
            `;
            transferLog.appendChild(item);

        } else if (data.type === 'chunk') {
            if (!currentFileMeta) return;

            receivedChunks[data.index] = data.data;
            totalBytesReceived += data.data.byteLength;

            const pct = Math.min(100, Math.round((totalBytesReceived / currentFileMeta.size) * 100));
            const fill = document.getElementById(`fill-${fileCounter}`);
            const text = document.getElementById(`text-${fileCounter}`);
            if (fill) fill.style.width = `${pct}%`;
            if (text) text.textContent = `${pct}%`;

        } else if (data.type === 'file-end') {
            log(`✅ File received complete!`, 'success');

            const text = document.getElementById(`text-${fileCounter}`);
            if (text) {
                text.textContent = 'Received - Choose action';
                text.style.color = 'var(--accent)';
            }

            const card = document.getElementById(`card-${fileCounter}`);
            const fileName = currentFileMeta ? currentFileMeta.name : 'downloaded_file';
            const validChunks = receivedChunks.filter(c => c !== undefined);
            const fileBlob = new Blob(validChunks);

            const actionsDiv = document.createElement('div');
            actionsDiv.style.display = 'flex';
            actionsDiv.style.gap = '10px';
            actionsDiv.style.marginTop = '12px';

            const saveBtn = document.createElement('button');
            saveBtn.className = 'btn-download';
            saveBtn.style.flex = '1';
            saveBtn.style.background = 'var(--success)';
            saveBtn.textContent = '💾 Save';

            saveBtn.onclick = () => {
                try {
                    const url = URL.createObjectURL(fileBlob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = fileName;
                    a.style.display = 'none';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    setTimeout(() => URL.revokeObjectURL(url), 100);

                    saveBtn.textContent = 'Saved ✓';
                    saveBtn.disabled = true;
                    saveBtn.style.background = '#2f855a';
                    saveBtn.style.cursor = 'default';
                    if (typeof discardBtn !== 'undefined' && discardBtn) discardBtn.remove();
                    log(`✅ File saved successfully!`, 'success');
                } catch (err) {
                    log(`❌ Save error: ${err.message}`, 'error');
                }
            };

            const discardBtn = document.createElement('button');
            discardBtn.className = 'btn-download';
            discardBtn.style.flex = '1';
            discardBtn.style.background = 'var(--danger)';
            discardBtn.textContent = '❌ Discard';

            discardBtn.onclick = () => {
                card.remove();
                log(`❌ Discarded: ${fileName}`, 'info');
            };

            actionsDiv.appendChild(saveBtn);
            actionsDiv.appendChild(discardBtn);
            card.appendChild(actionsDiv);

            currentFileMeta = null;
            receivedChunks = [];
            totalBytesReceived = 0;
        }
    } catch (err) {
        log(`ERROR in handleIncomingData: ${err.message}`, 'error');
        console.error('Full error:', err);
    }
}

// ═══════════════════════════════════════════
// 10. 3D TILT EFFECT
// ═══════════════════════════════════════════
document.querySelectorAll('.card').forEach(card => {
    card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        card.style.transform = `perspective(1000px) rotateX(${((y - centerY) / centerY) * -4}deg) rotateY(${((x - centerX) / centerX) * 4}deg) scale3d(1.01, 1.01, 1.01)`;
    });
    card.addEventListener('mouseleave', () => {
        card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) scale3d(1, 1, 1)';
    });
});

// ═══════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════
document.addEventListener('DOMContentLoaded', init);