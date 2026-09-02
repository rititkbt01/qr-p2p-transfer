// sender.js
// WebRTC P2P file transfer using PeerJS

// ── DOM References ──
const connectionCard = document.getElementById('connectionCard');
const connectionSpinner = document.getElementById('connectionSpinner');
const connectionStatus = document.getElementById('connectionStatus');
const qrSection = document.getElementById('qrSection');
const fileSection = document.getElementById('fileSection');
const peerIdDisplay = document.getElementById('peerIdDisplay');
const urlDisplay = document.getElementById('urlDisplay');
const receiverStatus = document.getElementById('receiverStatus');
const fileInput = document.getElementById('fileInput');
const folderInput = document.getElementById('folderInput');
const dropZone = document.getElementById('dropZone');
const dropLabel = document.getElementById('dropLabel');
const dropText = document.getElementById('dropText');
const fileListEl = document.getElementById('fileList');
const btnFiles = document.getElementById('btnFiles');
const btnFolder = document.getElementById('btnFolder');
const statusLog = document.getElementById('statusLog');
const transferProgressContainer = document.getElementById('transferProgressContainer');
const transferProgressFill = document.getElementById('transferProgressFill');
const transferProgressText = document.getElementById('transferProgressText');

// ── State ──
let peer = null;
let conn = null;
let isFolderMode = false;
let isReceiverConnected = false;

// ─ Constants ──
const CHUNK_SIZE = 64 * 1024; // 64KB chunks (safe for WebRTC)

// ──────────────────────────────────────────
// UTILITY: Logging
// ──────────────────────────────────────────
function log(msg, type = 'info') {
    const p = document.createElement('p');
    p.textContent = `> ${msg}`;
    if (type === 'success') p.classList.add('success');
    if (type === 'error') p.classList.add('error');
    statusLog.appendChild(p);
    statusLog.scrollTop = statusLog.scrollHeight;
}

// ──────────────────────────────────────────
// UTILITY: Format file size
// ──────────────────────────────────────────
function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ──────────────────────────────────────────
// INIT: Create PeerJS instance
// ──────────────────────────────────────────
function init() {
    log('Initializing PeerJS...');
    
    // Generate a random peer ID
    const peerId = 'qr-transfer-' + Math.random().toString(36).substring(2, 10);
    
    // Create Peer instance (uses PeerJS free cloud servers for signaling)
    peer = new Peer(peerId);
    
    peer.on('open', (id) => {
        log(`Peer ID generated: ${id}`, 'success');
        peerIdDisplay.textContent = id;
        
        // Build the receiver URL
        const baseUrl = window.location.origin + window.location.pathname.replace('index.html', '');
        const receiverUrl = `${baseUrl}receiver.html?peerId=${id}`;
        urlDisplay.textContent = receiverUrl;
        
        // Generate QR code
        document.getElementById('qrcode').innerHTML = '';
        new QRCode(document.getElementById('qrcode'), {
            text: receiverUrl,
            width: 200,
            height: 200,
            colorDark: '#1a202c',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.M
        });
        
        // Show QR section, hide connection spinner
        connectionCard.style.display = 'none';
        qrSection.style.display = 'block';
        log('QR code ready. Waiting for receiver to scan...', 'success');
    });
    
    peer.on('connection', (connection) => {
        log('Receiver is connecting...', 'info');
        conn = connection;
        
        conn.on('open', () => {
            log('Receiver connected successfully!', 'success');
            isReceiverConnected = true;
            receiverStatus.textContent = '✅ Receiver connected! You can now select files.';
            receiverStatus.style.color = 'var(--success)';
            fileSection.style.display = 'block';
        });
        
        conn.on('data', (data) => {
            // Handle messages from receiver (e.g., "ready", "error")
            if (data.type === 'ready') {
                log('Receiver is ready to receive files.', 'info');
            }
        });
        
        conn.on('error', (err) => {
            log(`Connection error: ${err}`, 'error');
        });
        
        conn.on('close', () => {
            log('Receiver disconnected.', 'error');
            isReceiverConnected = false;
            receiverStatus.textContent = '❌ Receiver disconnected. Please scan QR again.';
            receiverStatus.style.color = 'var(--danger)';
            fileSection.style.display = 'none';
        });
    });
    
    peer.on('error', (err) => {
        log(`Peer error: ${err.type}`, 'error');
        connectionStatus.textContent = 'Failed to initialize. Please refresh.';
        connectionSpinner.style.display = 'none';
    });
}

// ──────────────────────────────────────────
// FILE/FOLDER MODE TOGGLE
// ──────────────────────────────────────────
btnFiles.addEventListener('click', () => {
    isFolderMode = false;
    btnFiles.classList.add('active');
    btnFolder.classList.remove('active');
    dropLabel.setAttribute('for', 'fileInput');
    dropText.textContent = 'Click to browse or drag & drop files here';
    dropLabel.querySelector('.icon').textContent = '📄';
});

btnFolder.addEventListener('click', () => {
    isFolderMode = true;
    btnFolder.classList.add('active');
    btnFiles.classList.remove('active');
    dropLabel.setAttribute('for', 'folderInput');
    dropText.textContent = 'Click to select a folder';
    dropLabel.querySelector('.icon').textContent = '📁';
});

// ──────────────────────────────────────────
// FILE SELECTION HANDLER
// ──────────────────────────────────────────
function handleFilesSelected(files) {
    if (!files || files.length === 0) return;
    if (!isReceiverConnected) {
        log('⚠️ Receiver not connected yet. Please wait.', 'error');
        return;
    }

    // Render the list
    fileListEl.innerHTML = '';
    let totalSize = 0;

    Array.from(files).forEach(file => {
        totalSize += file.size;
        const div = document.createElement('div');
        div.className = 'file-item';
        div.innerHTML = `<span>${file.name}</span><span class="size">${formatSize(file.size)}</span>`;
        fileListEl.appendChild(div);
    });

    log(`${files.length} file(s) selected (${formatSize(totalSize)} total). Starting transfer...`);

    // Start P2P transfer
    sendFiles(files);
}

fileInput.addEventListener('change', (e) => handleFilesSelected(e.target.files));
folderInput.addEventListener('change', (e) => handleFilesSelected(e.target.files));

// ──────────────────────────────────────────
// DRAG & DROP
// ──────────────────────────────────────────
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
});
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const target = isFolderMode ? folderInput : fileInput;
    target.files = e.dataTransfer.files;
    handleFilesSelected(e.dataTransfer.files);
});

// ──────────────────────────────────────────
// P2P FILE TRANSFER WITH CHUNKING
// ──────────────────────────────────────────
async function sendFiles(files) {
    transferProgressContainer.style.display = 'block';
    transferProgressFill.style.width = '0%';
    transferProgressFill.classList.remove('complete');
    transferProgressText.textContent = 'Preparing... 0%';

    const totalFiles = files.length;
    let filesCompleted = 0;

    for (const file of files) {
        log(`Sending: ${file.name} (${formatSize(file.size)})`);
        
        // Read file as ArrayBuffer
        const arrayBuffer = await file.arrayBuffer();
        const totalChunks = Math.ceil(arrayBuffer.byteLength / CHUNK_SIZE);
        
        // Send file metadata
        conn.send({
            type: 'file-start',
            name: file.name,
            size: file.size,
            totalChunks: totalChunks
        });
        
        // Send chunks
        for (let i = 0; i < totalChunks; i++) {
            const start = i * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, arrayBuffer.byteLength);
            const chunk = arrayBuffer.slice(start, end);
            
            conn.send({
                type: 'chunk',
                index: i,
                data: chunk
            });
            
            // Update progress
            const overallProgress = ((filesCompleted + (i + 1) / totalChunks) / totalFiles) * 100;
            const pct = Math.round(overallProgress);
            transferProgressFill.style.width = pct + '%';
            transferProgressText.textContent = `Sending ${file.name}... ${pct}%`;
        }
        
        // Send file-end marker
        conn.send({ type: 'file-end' });
        
        filesCompleted++;
        log(`✅ Sent: ${file.name}`, 'success');
    }

    transferProgressFill.style.width = '100%';
    transferProgressFill.classList.add('complete');
    transferProgressText.textContent = 'All files sent! ✓';
    log('All files transferred successfully!', 'success');
}

// ── Boot ──
document.addEventListener('DOMContentLoaded', init);