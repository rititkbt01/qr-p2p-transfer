// receiver.js
// WebRTC P2P file receiver using PeerJS

// ── DOM References ──
const connectionStatus = document.getElementById('connectionStatus');
const connectingCard = document.getElementById('connectingCard');
const waitingCard = document.getElementById('waitingCard');
const receivingCard = document.getElementById('receivingCard');
const errorCard = document.getElementById('errorCard');
const errorMessage = document.getElementById('errorMessage');
const retryBtn = document.getElementById('retryBtn');
const currentFileName = document.getElementById('currentFileName');
const receiveProgressFill = document.getElementById('receiveProgressFill');
const receiveProgressText = document.getElementById('receiveProgressText');

// ─ Parse peer ID from URL ──
const params = new URLSearchParams(window.location.search);
const senderPeerId = params.get('peerId');

if (!senderPeerId) {
    showError('Invalid QR code. No peer ID found in the URL.');
} else {
    connectionStatus.textContent = `Connecting to sender: ${senderPeerId.substring(0, 15)}...`;
    connectToSender(senderPeerId);
}

// ──────────────────────────────────────────
// CONNECT TO SENDER
// ──────────────────────────────────────────
function connectToSender(senderId) {
    const peer = new Peer(); // Generate random ID for receiver
    
    peer.on('open', () => {
        const conn = peer.connect(senderId, {
            reliable: true // Ensure ordered delivery
        });
        
        conn.on('open', () => {
            connectionStatus.textContent = '✅ Connected to sender!';
            connectingCard.style.display = 'none';
            waitingCard.style.display = 'block';
            
            // Tell sender we're ready
            conn.send({ type: 'ready' });
        });
        
        conn.on('data', handleData);
        
        conn.on('error', (err) => {
            showError(`Connection error: ${err}`);
        });
        
        conn.on('close', () => {
            showError('Sender disconnected.');
        });
    });
    
    peer.on('error', (err) => {
        showError(`Failed to connect: ${err.type}`);
    });
}

// ──────────────────────────────────────────
// HANDLE INCOMING DATA (Chunked Files)
// ─────────────────────────────────────────
let currentFile = null;
let receivedChunks = [];
let expectedChunks = 0;

function handleData(data) {
    if (data.type === 'file-start') {
        // New file incoming
        currentFile = {
            name: data.name,
            size: data.size,
            totalChunks: data.totalChunks
        };
        receivedChunks = new Array(data.totalChunks);
        expectedChunks = data.totalChunks;
        
        // Update UI
        waitingCard.style.display = 'none';
        receivingCard.style.display = 'block';
        currentFileName.textContent = data.name;
        receiveProgressFill.style.width = '0%';
        receiveProgressText.textContent = '0%';
        
    } else if (data.type === 'chunk') {
        // Store chunk at correct index
        receivedChunks[data.index] = data.data;
        
        // Calculate progress
        const receivedCount = receivedChunks.filter(c => c !== undefined).length;
        const pct = Math.round((receivedCount / expectedChunks) * 100);
        receiveProgressFill.style.width = pct + '%';
        receiveProgressText.textContent = `${pct}% (${formatSize(receivedCount * 64 * 1024)} / ${formatSize(currentFile.size)})`;
        
    } else if (data.type === 'file-end') {
        // File complete - reassemble and download
        receiveProgressFill.style.width = '100%';
        receiveProgressFill.classList.add('complete');
        receiveProgressText.textContent = 'Complete ✓';
        
        // Combine chunks into single ArrayBuffer
        const totalSize = receivedChunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
        const combined = new Uint8Array(totalSize);
        let offset = 0;
        
        for (const chunk of receivedChunks) {
            combined.set(new Uint8Array(chunk), offset);
            offset += chunk.byteLength;
        }
        
        // Create Blob and trigger download
        const blob = new Blob([combined]);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = currentFile.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        // Reset for next file
        currentFile = null;
        receivedChunks = [];
        
        // Show waiting state again
        setTimeout(() => {
            receivingCard.style.display = 'none';
            waitingCard.style.display = 'block';
        }, 2000);
    }
}

// ──────────────────────────────────────────
// UI HELPERS
// ──────────────────────────────────────────
function showError(msg) {
    connectingCard.style.display = 'none';
    waitingCard.style.display = 'none';
    receivingCard.style.display = 'none';
    errorCard.style.display = 'block';
    errorMessage.textContent = msg;
}

function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

retryBtn.addEventListener('click', () => {
    window.location.reload();
});