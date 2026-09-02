// sender.js - CORRECTED QR API

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
    console.log('[SENDER]', msg);
}

function formatSize(bytes) {
    if (!bytes) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function initPeer() {
    log('Initializing PeerJS...');
    
    if (typeof Peer === 'undefined') {
        log('❌ PeerJS not loaded!', 'error');
        return;
    }
    
    peer = new Peer(undefined, {
        debug: 2,
        config: {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' }
            ]
        }
    });

    peer.on('open', (id) => {
        log(`P2P ID generated: ${id}`, 'success');
        showQRCode(id);
    });

    peer.on('error', (err) => {
        log(`PeerJS Error: ${err.type}`, 'error');
    });

    peer.on('connection', (connection) => {
        conn = connection;
        
        conn.on('open', () => {
            log('✅ Receiver connected!', 'success');
            connectionCard.style.display = 'none';
            qrSection.style.display = 'block';
            fileSection.style.display = 'block';
            receiverStatus.textContent = '✅ Connected! Ready to send.';
        });

        conn.on('close', () => {
            log('⚠️ Receiver disconnected.', 'error');
            fileSection.style.display = 'none';
        });
    });
}

function showQRCode(peerId) {
    console.log('[QR] Starting QR generation...');
    
    // Check if QRCode library loaded
    if (typeof QRCode === 'undefined') {
        log('❌ QRCode library not loaded!', 'error');
        return;
    }
    
    const baseUrl = window.location.origin;
    const receiverUrl = `${baseUrl}/receiver.html?peerId=${peerId}`;
    
    // Update displays
    if (peerIdDisplay) peerIdDisplay.textContent = peerId;
    if (urlDisplay) urlDisplay.textContent = receiverUrl;
    
    // Show section
    if (qrSection) {
        qrSection.style.display = 'block';
        console.log('[QR] Section displayed');
    }
    
    // Generate QR using the CORRECT API for qrcodejs library
    try {
        const qrContainer = document.getElementById('qrcode');
        if (!qrContainer) {
            log('❌ QR container not found!', 'error');
            return;
        }
        
        // Clear any existing QR code
        qrContainer.innerHTML = '';
        
        // Use the CORRECT constructor for qrcodejs library
        new QRCode(qrContainer, {
            text: receiverUrl,
            width: 200,
            height: 200,
            colorDark: '#1a202c',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.M
        });
        
        log('✅ QR code generated!', 'success');
        console.log('[QR] Success!');
        
    } catch (err) {
        log(`❌ QR Error: ${err.message}`, 'error');
        console.error('[QR] Error:', err);
    }
}

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
        await sendFile(file, item.querySelector(`#status-${file.name}`));
    }
    log('✅ All files sent!', 'success');
}

function sendFile(file, statusEl) {
    return new Promise((resolve) => {
        const chunkSize = 8 * 1024;
        const totalChunks = Math.ceil(file.size / chunkSize);
        let currentChunk = 0;

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
                conn.send({
                    type: 'chunk',
                    index: currentChunk,
                    data: e.target.result,
                    fileName: file.name
                });
                
                currentChunk++;
                const pct = Math.round((currentChunk / totalChunks) * 100);
                statusEl.textContent = `${pct}%`;
                
                setTimeout(sendNextChunk, 5);
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