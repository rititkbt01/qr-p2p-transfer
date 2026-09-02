// sender.js - DEBUG VERSION

// ── DOM References ──
const fileInput = document.getElementById('fileInput');
const folderInput = document.getElementById('folderInput');
const dropZone = document.getElementById('dropZone');
const dropLabel = document.getElementById('dropLabel');
const dropText = document.getElementById('dropText');
const fileListEl = document.getElementById('fileList');
const btnFiles = document.getElementById('btnFiles');
const btnFolder = document.getElementById('btnFolder');
const qrSection = document.getElementById('qrSection');
const fileSection = document.getElementById('fileSection');
const peerIdDisplay = document.getElementById('peerIdDisplay');
const urlDisplay = document.getElementById('urlDisplay');
const receiverStatus = document.getElementById('receiverStatus');
const statusLog = document.getElementById('statusLog');
const connectionCard = document.getElementById('connectionCard');

let peer = null;
let conn = null;
let isFolderMode = false;

function log(msg, type = 'info') {
    const p = document.createElement('p');
    p.textContent = `> ${msg}`;
    if (type === 'success') p.classList.add('success');
    if (type === 'error') p.classList.add('error');
    statusLog.appendChild(p);
    statusLog.scrollTop = statusLog.scrollHeight;
    console.log(`[SENDER] ${msg}`);
}

function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ─ 1. Initialize PeerJS ─
function initPeer() {
    log('Initializing PeerJS...');
    
    // Check if PeerJS loaded
    if (typeof Peer === 'undefined') {
        log('❌ ERROR: PeerJS library not loaded!', 'error');
        return;
    }
    
    peer = new Peer(undefined, {
        debug: 2,
        config: {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        }
    });

    peer.on('open', (id) => {
        log(`P2P ID generated: ${id}`, 'success');
        showQRCode(id);
    });

    peer.on('error', (err) => {
        log(`PeerJS Error: ${err.type} - ${err.message}`, 'error');
    });

    peer.on('connection', (connection) => {
        conn = connection;
        
        conn.on('open', () => {
            log('✅ Receiver connected! P2P tunnel established.', 'success');
            connectionCard.style.display = 'none';
            qrSection.style.display = 'block';
            fileSection.style.display = 'block';
            receiverStatus.textContent = '✅ Connected! Ready to send files.';
            receiverStatus.style.color = 'var(--success)';
        });

        conn.on('close', () => {
            log('⚠️ Receiver disconnected.', 'error');
            fileSection.style.display = 'none';
        });
    });
}

// ── 2. Show QR Code ──
function showQRCode(peerId) {
    console.log('[DEBUG] showQRCode called with ID:', peerId);
    
    // Check if QRCode library loaded
    if (typeof QRCode === 'undefined') {
        log('❌ ERROR: QRCode library not loaded! Check CDN.', 'error');
        console.log('QRCode object:', typeof QRCode);
        return;
    }
    
    console.log('[DEBUG] QRCode library loaded:', QRCode);
    
    const baseUrl = window.location.origin;
    const receiverUrl = `${baseUrl}/receiver.html?peerId=${peerId}`;
    
    console.log('[DEBUG] Generated URL:', receiverUrl);

    // Update text displays
    if (peerIdDisplay) {
        peerIdDisplay.textContent = peerId;
        console.log('[DEBUG] Updated peerIdDisplay');
    } else {
        console.error('[DEBUG] peerIdDisplay element not found!');
    }
    
    if (urlDisplay) {
        urlDisplay.textContent = receiverUrl;
        console.log('[DEBUG] Updated urlDisplay');
    } else {
        console.error('[DEBUG] urlDisplay element not found!');
    }

    // Show the QR section
    if (qrSection) {
        qrSection.style.display = 'block';
        console.log('[DEBUG] Showed qrSection');
    } else {
        console.error('[DEBUG] qrSection element not found!');
    }

    // Generate QR code
    const qrContainer = document.getElementById('qrcode');
    if (!qrContainer) {
        log('❌ ERROR: #qrcode container not found!', 'error');
        return;
    }
    
    console.log('[DEBUG] QR container found:', qrContainer);
    
    // Clear any existing QR code
    qrContainer.innerHTML = '';
    
    try {
        new QRCode(qrContainer, {
            text: receiverUrl,
            width: 200,
            height: 200,
            colorDark: '#1a202c',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.M
        });
        log('✅ QR code generated successfully!', 'success');
        console.log('[DEBUG] QRCode object created');
    } catch (err) {
        log(`❌ ERROR generating QR: ${err.message}`, 'error');
        console.error('[DEBUG] QRCode generation error:', err);
    }
}

// ── 3. File Selection ─
btnFiles.addEventListener('click', () => setMode(false));
btnFolder.addEventListener('click', () => setMode(true));

function setMode(isFolder) {
    isFolderMode = isFolder;
    btnFiles.classList.toggle('active', !isFolder);
    btnFolder.classList.toggle('active', isFolder);
    dropLabel.setAttribute('for', isFolder ? 'folderInput' : 'fileInput');
    dropText.textContent = isFolder ? 'Click to select a folder' : 'Click to browse or drag & drop files here';
    dropLabel.querySelector('.icon').textContent = isFolder ? '📁' : '📄';
}

fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
folderInput.addEventListener('change', (e) => handleFiles(e.target.files));

async function handleFiles(files) {
    if (!conn || !conn.open) {
        log('❌ No receiver connected!', 'error');
        return;
    }
    if (!files || files.length === 0) return;

    log(`Starting transfer of ${files.length} file(s)...`, 'success');
    fileListEl.innerHTML = '';

    for (const file of files) {
        const item = document.createElement('div');
        item.className = 'file-item';
        item.innerHTML = `<span>${file.name}</span><span class="size" id="status-${file.name}">Pending</span>`;
        fileListEl.appendChild(item);

        await sendFileWithFlowControl(file, item.querySelector(`#status-${file.name}`));
    }
    log('✅ All files sent!', 'success');
}

function sendFileWithFlowControl(file, statusEl) {
    return new Promise((resolve) => {
        const chunkSize = 8 * 1024;
        const totalChunks = Math.ceil(file.size / chunkSize);
        let currentChunk = 0;
        let bytesSent = 0;

        conn.send({
            type: 'file-start',
            name: file.name,
            size: file.size,
            totalChunks: totalChunks
        });

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
                try {
                    conn.send({
                        type: 'chunk',
                        index: currentChunk,
                        data: e.target.result,
                        fileName: file.name
                    });
                    
                    currentChunk++;
                    bytesSent += chunkSize;
                    const pct = Math.min(100, Math.round((bytesSent / file.size) * 100));
                    statusEl.textContent = `${pct}%`;
                    
                    setTimeout(sendNextChunk, 5);
                    
                } catch (err) {
                    log(`Error sending chunk: ${err.message}`, 'error');
                    statusEl.textContent = 'Error ✗';
                    statusEl.style.color = 'var(--danger)';
                    resolve();
                }
            };
            
            reader.onerror = () => {
                log(`Error reading file chunk`, 'error');
                statusEl.textContent = 'Read Error ✗';
                resolve();
            };
            
            reader.readAsArrayBuffer(blob);
        }

        sendNextChunk();
    });
}

dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => { dropZone.classList.remove('drag-over'); });
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const target = isFolderMode ? folderInput : fileInput;
    target.files = e.dataTransfer.files;
    handleFiles(e.dataTransfer.files);
});

document.addEventListener('DOMContentLoaded', initPeer);