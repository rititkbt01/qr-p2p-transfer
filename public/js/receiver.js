// receiver.js - WITH MANUAL SAVE/DISCARD CONTROL

// ─ DOM References (Exactly matching your receiver.html) ─
const connectionStatus = document.getElementById('connectionStatus');
const loadingCard = document.getElementById('loadingCard');
const filesCard = document.getElementById('filesCard');
const transferLog = document.getElementById('transferLog');
const errorCard = document.getElementById('errorCard');
const errorMessage = document.getElementById('errorMessage');
const retryBtn = document.getElementById('retryBtn');

// ── State ─
const params = new URLSearchParams(window.location.search);
const senderPeerId = params.get('peerId');

let peer = null;
let conn = null;
let currentFileMeta = null;
let receivedChunks = [];
let totalBytesReceived = 0;
let fileCounter = 0; // ✅ Unique counter to avoid ID conflicts with special characters

if (!senderPeerId) {
    showError('Invalid link. No Peer ID found in URL.');
} else {
    connectToSender(senderPeerId);
}

// ── 1. Connect via PeerJS ──
function connectToSender(targetId) {
    log('Connecting to sender...');
    
    peer = new Peer(undefined, {
        debug: 1,
        config: {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        }
    });

    peer.on('open', () => {
        connectionStatus.textContent = `Connecting to ${targetId.substring(0, 8)}...`;
        
        conn = peer.connect(targetId, { reliable: true, serialization: 'json' });

        conn.on('open', () => {
            log('✅ Connected to sender!');
            connectionStatus.textContent = '✅ Connected! Waiting for files...';
            connectionStatus.style.color = 'var(--success)';
            loadingCard.style.display = 'none';
            filesCard.style.display = 'block';
        });

        conn.on('data', handleData);

        conn.on('error', (err) => {
            log(`Connection error: ${err}`);
            showError('Connection error: ' + err);
        });

        conn.on('close', () => {
            log('Connection closed by sender');
            showError('Sender disconnected.');
        });
    });

    peer.on('error', (err) => {
        log(`Peer error: ${err.type} - ${err.message}`);
        showError('Peer error: ' + err.type);
    });
}

// ── 2. Handle Incoming Data (Reassembly Logic) ──
function handleData(data) {
    try {
        if (data.type === 'file-start') {
            log(` Receiving: ${data.name} (${formatSize(data.size)})`);
            currentFileMeta = data;
            receivedChunks = new Array(data.totalChunks);
            totalBytesReceived = 0;
            fileCounter++; // ✅ Increment counter for unique IDs
            
            filesCard.style.display = 'block';
            
            // Create UI element for this transfer
            const item = document.createElement('div');
            item.className = 'file-card';
            item.id = `card-${fileCounter}`; // ✅ Use counter instead of filename
            
            item.innerHTML = `
                <div class="file-card-header">
                    <span class="file-name">${data.name}</span>
                    <span class="file-size">${formatSize(data.size)}</span>
                </div>
                <div class="progress-container">
                    <div class="progress-bar">
                        <div class="progress-fill" id="fill-${fileCounter}"></div>
                    </div>
                    <p class="progress-text" id="text-${fileCounter}">0%</p>
                </div>
            `;
            transferLog.appendChild(item);
            
        } else if (data.type === 'chunk') {
            if (!currentFileMeta) {
                log('ERROR: Received chunk without file-start metadata!');
                return;
            }
            
            // Store chunk in correct order
            receivedChunks[data.index] = data.data;
            totalBytesReceived += data.data.byteLength;
            
            // Update Progress
            const pct = Math.min(100, Math.round((totalBytesReceived / currentFileMeta.size) * 100));
            
            const fill = document.getElementById(`fill-${fileCounter}`);
            const text = document.getElementById(`text-${fileCounter}`);
            if (fill) fill.style.width = `${pct}%`;
            if (text) text.textContent = `${pct}%`;
            
        } else if (data.type === 'file-end') {
            log(`✅ File complete! Waiting for user action...`);
            
            // Filter out any undefined chunks (safety check)
            const validChunks = receivedChunks.filter(chunk => chunk !== undefined);
            const blob = new Blob(validChunks);
            
            const text = document.getElementById(`text-${fileCounter}`);
            if (text) {
                text.textContent = 'Received - Choose action';
                text.style.color = 'var(--accent)';
            }
            
            // ✅ Add Save and Discard buttons
            const card = document.getElementById(`card-${fileCounter}`);
            if (card) {
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
                    triggerDownload(blob, currentFileMeta.name);
                    saveBtn.textContent = 'Saved ✓';
                    saveBtn.disabled = true;
                    saveBtn.style.background = '#2f855a';
                    saveBtn.style.cursor = 'default';
                    discardBtn.remove();
                    log(`✅ Saved: ${currentFileMeta.name}`);
                };

                // DISCARD BUTTON
                const discardBtn = document.createElement('button');
                discardBtn.className = 'btn-download';
                discardBtn.style.flex = '1';
                discardBtn.style.background = 'var(--danger)';
                discardBtn.textContent = '❌ Discard';
                
                discardBtn.onclick = () => {
                    card.remove();
                    log(`❌ Discarded: ${currentFileMeta.name}`);
                };

                actionsDiv.appendChild(saveBtn);
                actionsDiv.appendChild(discardBtn);
                card.appendChild(actionsDiv);
            }
            
            // Reset for next file
            currentFileMeta = null;
            receivedChunks = [];
            totalBytesReceived = 0;
        }
    } catch (err) {
        log(`ERROR handling data: ${err.message}`);
        showError('Error processing file: ' + err.message);
    }
}

// ── 3. Trigger Native Download (Only when "Save" is clicked) ──
function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url); // Free memory immediately
}

// ─ Utilities ──
function showError(msg) {
    loadingCard.style.display = 'none';
    filesCard.style.display = 'none';
    errorCard.style.display = 'block';
    errorMessage.textContent = msg;
    console.error(msg);
}

function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function log(msg) {
    console.log(`[Receiver] ${msg}`);
}

retryBtn.addEventListener('click', () => location.reload());