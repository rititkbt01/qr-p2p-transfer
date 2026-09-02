// app.js - TRUE BIDIRECTIONAL P2P (FINAL FIXED VERSION)

// ── DOM References ──
const hostView = document.getElementById('hostView');
const clientView = document.getElementById('clientView');
const qrWrapper = document.getElementById('qrWrapper');
const peerIdDisplay = document.getElementById('peerIdDisplay');
const connectionStatus = document.getElementById('connectionStatus');
const sendCard = document.getElementById('sendCard');
const receiveCard = document.getElementById('receiveCard');
const fileInput = document.getElementById('fileInput');
const fileListEl = document.getElementById('fileList');
const transferLog = document.getElementById('transferLog');
const statusLog = document.getElementById('statusLog');
const dropZone = document.getElementById('dropZone');

// ── State ──
let peer = null;
let conn = null;
let fileCounter = 0;

// ── Utility: Log ──
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

// ── 1. Initialize PeerJS ──
function init() {
    log('Initializing PeerJS...');
    peer = new Peer(undefined, {
        debug: 1,
        config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
    });

    peer.on('open', (id) => {
        log(`P2P ID generated: ${id}`, 'success');
        
        const params = new URLSearchParams(window.location.search);
        const targetPeerId = params.get('peerId');

        if (targetPeerId) {
            // CLIENT MODE
            clientView.style.display = 'block';
            hostView.style.display = 'none';
            log('Mode: Client (connecting to host)', 'info');
            connectToHost(targetPeerId);
        } else {
            // HOST MODE
            hostView.style.display = 'block';
            clientView.style.display = 'none';
            log('Mode: Host (waiting for client)', 'info');
            showQRCode(id);
        }
    });

    // Host listens for incoming connections
    peer.on('connection', (connection) => {
        log('📥 Incoming connection received!', 'success');
        setupConnection(connection);
    });

    peer.on('error', (err) => log(`PeerJS Error: ${err.type}`, 'error'));
}

// ── 2. Host Logic (Show QR) ──
function showQRCode(peerId) {
    const baseUrl = window.location.origin;
    const clientUrl = `${baseUrl}/?peerId=${peerId}`;
    
    peerIdDisplay.textContent = peerId;
    qrWrapper.style.display = 'flex';
    
    document.getElementById('qrcode').innerHTML = '';
    new QRCode(document.getElementById('qrcode'), {
        text: clientUrl, width: 200, height: 200,
        colorDark: '#1a202c', colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
    });
    log('✅ QR code generated! Share with client.', 'success');
}

// ── 3. Client Logic (Connect) ──
function connectToHost(targetId) {
    connectionStatus.textContent = `Connecting to ${targetId.substring(0, 8)}...`;
    log(`📡 Attempting to connect to: ${targetId}`, 'info');
    
    const connection = peer.connect(targetId, { 
        reliable: true, 
        serialization: 'json' 
    });
    
    // CRITICAL: Set up the connection IMMEDIATELY after creating it
    setupConnection(connection);
    
    connection.on('open', () => {
        log('✅ Successfully connected to Host!', 'success');
        connectionStatus.textContent = '✅ Connected!';
        connectionStatus.style.color = 'var(--success)';
        enableSendReceive();
    });
    
    connection.on('error', (err) => log(`Connection error: ${err}`, 'error'));
    connection.on('close', () => {
        log('⚠️ Host disconnected.', 'error');
        sendCard.style.display = 'none';
    });
}

// ── 4. Setup Connection (Called by BOTH Host and Client) ──
function setupConnection(connection) {
    conn = connection;
    log('🔧 Setting up bidirectional connection...', 'info');
    
    conn.on('open', () => {
        log('✅ Connection stream opened!', 'success');
        enableSendReceive();
    });

    conn.on('data', handleIncomingData);
    
    conn.on('close', () => {
        log('⚠️ Peer disconnected.', 'error');
        sendCard.style.display = 'none';
    });
    
    conn.on('error', (err) => {
        log(`Connection error: ${err}`, 'error');
    });
}

// ── Enable Send/Receive on BOTH Devices ──
function enableSendReceive() {
    log('🚀 Enabling Send & Receive capabilities...', 'success');
    sendCard.style.display = 'block';
    log('✅ You can now SEND and RECEIVE files!', 'success');
}

// ── 5. SENDING Logic ──
dropZone.addEventListener('click', () => {
    if (!conn || !conn.open) {
        log('❌ Not connected! Wait for connection.', 'error');
        return;
    }
    fileInput.click();
});

fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

async function handleFiles(files) {
    if (!conn || !conn.open) { 
        log('❌ Not connected!', 'error'); 
        return; 
    }
    if (!files || files.length === 0) return;

    log(`📤 Starting transfer of ${files.length} file(s)...`, 'success');
    fileListEl.innerHTML = '';

    const fileItems = [];
    for (const file of files) {
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
        await sendFile(file, statusEl);
    }
    log('✅ All files sent!', 'success');
}

function sendFile(file, statusEl) {
    return new Promise((resolve) => {
        const chunkSize = 8 * 1024;
        const totalChunks = Math.ceil(file.size / chunkSize);
        let currentChunk = 0;

        log(`📦 Sending: ${file.name} (${formatSize(file.size)})`, 'info');

        conn.send({ type: 'file-start', name: file.name, size: file.size, totalChunks });
        statusEl.textContent = 'Sending...';

        function sendNextChunk() {
            if (currentChunk >= totalChunks) {
                conn.send({ type: 'file-end', name: file.name });
                statusEl.textContent = 'Done ✓'; 
                statusEl.style.color = 'var(--success)';
                resolve(); 
                return;
            }
            if (conn.bufferedAmount > 1024 * 1024) { 
                setTimeout(sendNextChunk, 50); 
                return; 
            }

            const start = currentChunk * chunkSize;
            const end = Math.min(start + chunkSize, file.size);
            const blob = file.slice(start, end);
            const reader = new FileReader();
            
            reader.onload = (e) => {
                conn.send({ type: 'chunk', index: currentChunk, data: e.target.result });
                currentChunk++;
                statusEl.textContent = `${Math.round((currentChunk / totalChunks) * 100)}%`;
                setTimeout(sendNextChunk, 5);
            };
            reader.onerror = () => {
                log(`❌ Error reading file chunk`, 'error');
                statusEl.textContent = 'Error ✗';
                resolve();
            };
            reader.readAsArrayBuffer(blob);
        }
        sendNextChunk();
    });
}

// ── 6. RECEIVING Logic ──
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
            
            // ✅ CRITICAL FIX: Capture filename locally BEFORE resetting state
            const fileName = currentFileMeta ? currentFileMeta.name : 'downloaded_file';
            
            // Create blob immediately
            const validChunks = receivedChunks.filter(c => c !== undefined);
            const fileBlob = new Blob(validChunks);
            log(`💾 Blob created: ${formatSize(fileBlob.size)} bytes`, 'success');
            
            const actionsDiv = document.createElement('div');
            actionsDiv.style.display = 'flex'; 
            actionsDiv.style.gap = '10px'; 
            actionsDiv.style.marginTop = '12px';

            // SAVE BUTTON
            const saveBtn = document.createElement('button');
            saveBtn.className = 'btn-download'; 
            saveBtn.style.flex = '1'; 
            saveBtn.style.background = 'var(--success)';
            saveBtn.textContent = '💾 Save';
            
            saveBtn.onclick = () => {
                try {
                    log(`💾 Attempting to save: ${fileName}`, 'info');
                    const url = URL.createObjectURL(fileBlob);
                    const a = document.createElement('a'); 
                    a.href = url; 
                    a.download = fileName; // Uses the safely captured local variable
                    a.style.display = 'none';
                    
                    document.body.appendChild(a); 
                    a.click(); 
                    document.body.removeChild(a);
                    
                    // Clean up URL after a short delay to ensure download starts
                    setTimeout(() => {
                        URL.revokeObjectURL(url);
                    }, 100);
                    
                    saveBtn.textContent = 'Saved ✓'; 
                    saveBtn.disabled = true; 
                    saveBtn.style.background = '#2f855a';
                    saveBtn.style.cursor = 'default';
                    
                    if (typeof discardBtn !== 'undefined' && discardBtn) {
                        discardBtn.remove();
                    }
                    log(`✅ File saved successfully!`, 'success');
                } catch (err) {
                    log(`❌ Save error: ${err.message}`, 'error');
                    console.error('Save error details:', err);
                }
            };

            // DISCARD BUTTON
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
            
            // Reset for next file (Safe now because fileName is captured locally above)
            currentFileMeta = null; 
            receivedChunks = []; 
            totalBytesReceived = 0;
        }
    } catch (err) { 
        log(`ERROR in handleIncomingData: ${err.message}`, 'error');
        console.error('Full error:', err);
    }
}

// ── 3D Tilt Effect ──
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

// Boot
document.addEventListener('DOMContentLoaded', init);