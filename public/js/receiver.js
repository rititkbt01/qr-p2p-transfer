// receiver.js
// WebRTC P2P Receiver Logic - FINAL ROBUST VERSION

// ── DOM References (Matched to your HTML) ──
const connectionStatus = document.getElementById('connectionStatus');
const connectingCard = document.getElementById('connectingCard');
const waitingCard = document.getElementById('waitingCard');
const receivingCard = document.getElementById('receivingCard');
const errorCard = document.getElementById('errorCard');
const errorMessage = document.getElementById('errorMessage');
const currentFileName = document.getElementById('currentFileName');
const receiveProgressFill = document.getElementById('receiveProgressFill');
const receiveProgressText = document.getElementById('receiveProgressText');
const retryBtn = document.getElementById('retryBtn');

// ── State ──
const params = new URLSearchParams(window.location.search);
const senderPeerId = params.get('peerId');

let peer = null;
let conn = null;
let currentFileMeta = null;
let receivedChunks = [];
let totalBytesReceived = 0;

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
        
        // reliable: true ensures ordered delivery of chunks
        conn = peer.connect(targetId, { reliable: true, serialization: 'json' });

        conn.on('open', () => {
            log('✅ Connected to sender!');
            connectionStatus.textContent = '✅ Connected! Waiting for files...';
            connectionStatus.style.color = 'var(--success)';
            connectingCard.style.display = 'none';
            waitingCard.style.display = 'block';
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
            log(`📥 Receiving: ${data.name} (${formatSize(data.size)})`);
            currentFileMeta = data;
            receivedChunks = new Array(data.totalChunks);
            totalBytesReceived = 0;
            
            waitingCard.style.display = 'none';
            receivingCard.style.display = 'block';
            currentFileName.textContent = data.name;
            receiveProgressText.textContent = '0%';
            receiveProgressFill.style.width = '0%';
            receiveProgressFill.classList.remove('complete');
            
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
            receiveProgressText.textContent = `${pct}%`;
            receiveProgressFill.style.width = `${pct}%`;
            
        } else if (data.type === 'file-end') {
            log(`✅ File complete! Assembling...`);
            
            // Filter out any undefined chunks (safety check)
            const validChunks = receivedChunks.filter(chunk => chunk !== undefined);
            const blob = new Blob(validChunks);
            
            log(`Downloaded ${formatSize(blob.size)} bytes`);
            triggerDownload(blob, currentFileMeta.name);
            
            receiveProgressText.textContent = 'Complete ✓';
            receiveProgressFill.classList.add('complete');
            
            // Reset for next file after a brief pause
            setTimeout(() => {
                receivingCard.style.display = 'none';
                waitingCard.style.display = 'block';
                currentFileMeta = null;
                receivedChunks = [];
                totalBytesReceived = 0;
            }, 1500);
        }
    } catch (err) {
        log(`ERROR handling data: ${err.message}`);
        showError('Error processing file: ' + err.message);
    }
}

// ── 3. Trigger Native Download ──
function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url); // Free memory immediately
    log(`✅ Saved: ${filename}`);
}

// ── Utilities ──
function showError(msg) {
    connectingCard.style.display = 'none';
    waitingCard.style.display = 'none';
    receivingCard.style.display = 'none';
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