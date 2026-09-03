// app.js - TRUE BIDIRECTIONAL P2P (ROBUST & PRODUCTION-READY)

// ── DOM References ──
const hostView = document.getElementById('hostView');
const clientView = document.getElementById('clientView');
const qrWrapper = document.getElementById('qrWrapper');
const peerIdDisplay = document.getElementById('peerIdDisplay');
const connectionStatus = document.getElementById('connectionStatus');
const sendCard = document.getElementById('sendCard');
const receiveCard = document.getElementById('receiveCard');
const fileInput = document.getElementById('fileInput');
const folderInput = document.getElementById('folderInput');
const fileListEl = document.getElementById('fileList');
const transferLog = document.getElementById('transferLog');
const statusLog = document.getElementById('statusLog');
const btnFiles = document.getElementById('btnFiles');
const btnFolder = document.getElementById('btnFolder');
const dropLabel = document.getElementById('dropLabel');
const dropText = document.getElementById('dropText');

// ── State ──
let peer = null;
let conn = null;
let fileCounter = 0;
let isConnectionReady = false;
let isFolderMode = false;

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
            clientView.style.display = 'block';
            hostView.style.display = 'none';
            connectToHost(targetPeerId);
        } else {
            hostView.style.display = 'block';
            clientView.style.display = 'none';
            showQRCode(id);
        }
    });

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
    
    const connection = peer.connect(targetId, { 
        reliable: true, 
        serialization: 'binary' 
    });
    
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
        isConnectionReady = false;
        sendCard.style.display = 'none';
    });
}

// ── 4. Setup Connection (Called by BOTH Host and Client) ──
function setupConnection(connection) {
    conn = connection;
    
    conn.on('open', () => {
        log('✅ Connection stream opened!', 'success');
        isConnectionReady = true;
        enableSendReceive();
    });

    conn.on('data', handleIncomingData);
    
    conn.on('close', () => {
        log('⚠️ Peer disconnected.', 'error');
        isConnectionReady = false;
        sendCard.style.display = 'none';
    });
    
    conn.on('error', (err) => {
        log(`Connection error: ${err}`, 'error');
        isConnectionReady = false;
    });
}

function enableSendReceive() {
    log('🚀 Enabling Send & Receive capabilities...', 'success');
    sendCard.style.display = 'block';
}

// ── 5. MODE TOGGLE LOGIC ──
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

// ── 6. SENDING LOGIC (ROBUST) ──
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
        log('❌ Connection not ready or lost!', 'error'); 
        isConnectionReady = false;
        return; 
    }
    
    if (!files || files.length === 0) return;

    log(`📤 Starting transfer of ${files.length} item(s)...`, 'success');
    fileListEl.innerHTML = '';

    const fileItems = [];
    for (const file of files) {
        if (file.size === 0 && file.name.endsWith('/')) continue; // Skip empty dir placeholders

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

    // Process sequentially with error handling
    for (const { file, statusEl } of fileItems) {
        try {
            await sendFile(file, statusEl);
        } catch (err) {
            log(`❌ Transfer interrupted: ${err.message}`, 'error');
            statusEl.textContent = 'Failed ✗';
            statusEl.style.color = 'var(--danger)';
            break; // Stop the loop if one file fails to prevent cascade errors
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
        // Ensure at least 1 chunk for 0-byte files
        const totalChunks = Math.max(1, Math.ceil(file.size / chunkSize));
        let currentChunk = 0;

        log(`📦 Sending: ${file.name} (${formatSize(file.size)})`, 'info');

        try {
            conn.send({ type: 'file-start', name: file.name, size: file.size, totalChunks });
            statusEl.textContent = 'Sending...';

            function sendNextChunk() {
                if (!conn || !conn.open) {
                    statusEl.textContent = 'Disconnected ✗';
                    return reject(new Error('Connection lost during transfer'));
                }

                if (currentChunk >= totalChunks) {
                    conn.send({ type: 'file-end', name: file.name });
                    statusEl.textContent = 'Done ✓'; 
                    statusEl.style.color = 'var(--success)';
                    return resolve(); 
                }
                
                // Flow control: pause if buffer gets too full
                if (conn.bufferedAmount > 1024 * 1024) { 
                    setTimeout(sendNextChunk, 50); 
                    return; 
                }

                // Handle 0-byte files gracefully
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

// ── 7. RECEIVING Logic (ROBUST) ──
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
            
            // Reset state for the next file
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