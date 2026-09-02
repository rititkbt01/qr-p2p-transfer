// receiver.js
// WebRTC P2P Receiver Logic

// ── DOM References ──
const connectionStatus = document.getElementById('connectionStatus');
const loadingCard = document.getElementById('loadingCard');
const filesCard = document.getElementById('filesCard');
const errorCard = document.getElementById('errorCard');
const errorMessage = document.getElementById('errorMessage');
const transferLog = document.getElementById('transferLog');
const retryBtn = document.getElementById('retryBtn');

// ── 1. Get Peer ID from URL ──
const params = new URLSearchParams(window.location.search);
const senderPeerId = params.get('peerId');

if (!senderPeerId) {
    showError('Invalid link. No Peer ID found.');
} else {
    connectToSender(senderPeerId);
}

// ── 2. Connect via PeerJS ──
function connectToSender(targetId) {
    const peer = new Peer(); // Generate random ID for receiver

    peer.on('open', () => {
        connectionStatus.textContent = `Connecting to ${targetId.substring(0,8)}...`;
        const conn = peer.connect(targetId, { reliable: true }); // reliable: true ensures ordered delivery

        conn.on('open', () => {
            connectionStatus.textContent = '✅ Connected! Waiting for files...';
            loadingCard.style.display = 'none';
            filesCard.style.display = 'block';
        });

        conn.on('data', handleData); // The main event listener for incoming chunks

        conn.on('error', (err) => showError('Connection error: ' + err));
        peer.on('error', (err) => showError('Peer error: ' + err));
    });
}

// ── 3. Handle Incoming Data (The Reassembly Logic) ──
let currentFileMeta = null;
let receivedChunks = [];

function handleData(data) {
    if (data.type === 'file-start') {
        // New file starting
        currentFileMeta = data;
        receivedChunks = new Array(data.totalChunks); // Pre-allocate array
        
        // Create UI element for this transfer
        const item = document.createElement('div');
        item.className = 'file-card';
        item.id = `transfer-${data.name}`;
        item.innerHTML = `
            <div class="file-card-header">
                <span class="file-name">${data.name}</span>
                <span class="file-size">${formatSize(data.size)}</span>
            </div>
            <div class="progress-container">
                <div class="progress-bar"><div class="progress-fill" id="fill-${data.name}"></div></div>
                <p class="progress-text" id="text-${data.name}">0%</p>
            </div>
        `;
        transferLog.appendChild(item);

    } else if (data.type === 'chunk') {
        // Store chunk in correct order
        receivedChunks[data.index] = data.data;
        
        // Update Progress
        const total = currentFileMeta.totalChunks;
        const received = receivedChunks.filter(c => c !== undefined).length;
        const pct = Math.round((received / total) * 100);
        
        const fill = document.getElementById(`fill-${currentFileMeta.name}`);
        const text = document.getElementById(`text-${currentFileMeta.name}`);
        if (fill) fill.style.width = `${pct}%`;
        if (text) text.textContent = `${pct}%`;

    } else if (data.type === 'file-end') {
        // File complete! Assemble and download.
        const blob = new Blob(receivedChunks);
        triggerDownload(blob, currentFileMeta.name);
        
        const text = document.getElementById(`text-${currentFileMeta.name}`);
        if (text) {
            text.textContent = 'Complete ✓';
            text.style.color = 'var(--success)';
        }
        
        // Reset for next file
        currentFileMeta = null;
        receivedChunks = [];
    }
}

// ── 4. Trigger Native Download ──
function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url); // Free memory
}

// ── Utilities ──
function showError(msg) {
    loadingCard.style.display = 'none';
    filesCard.style.display = 'none';
    errorCard.style.display = 'block';
    errorMessage.textContent = msg;
}

function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

retryBtn.addEventListener('click', () => location.reload());