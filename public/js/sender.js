// sender.js
// WebRTC P2P Sender Logic

// ── DOM References ──
const fileInput = document.getElementById('fileInput');
const folderInput = document.getElementById('folderInput');
const dropZone = document.getElementById('dropZone');
const dropLabel = document.getElementById('dropLabel');
const dropText = document.getElementById('dropText');
const fileListEl = document.getElementById('fileList');
const btnFiles = document.getElementById('btnFiles');
const btnFolder = document.getElementById('btnFolder');
const qrWrapper = document.getElementById('qrWrapper');
const peerIdDisplay = document.getElementById('peerIdDisplay');
const urlDisplay = document.getElementById('urlDisplay');
const fileCard = document.getElementById('fileCard');
const statusLog = document.getElementById('statusLog');

// ── State ──
let peer = null;
let conn = null;
let isFolderMode = false;

// ─ Utility: Log ──
function log(msg, type = 'info') {
    const p = document.createElement('p');
    p.textContent = `> ${msg}`;
    if (type === 'success') p.classList.add('success');
    if (type === 'error') p.classList.add('error');
    statusLog.appendChild(p);
    statusLog.scrollTop = statusLog.scrollHeight;
}

// ── Utility: Format Size ──
function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ── 1. Initialize PeerJS ──
function initPeer() {
    // Create a new Peer with a random ID (PeerJS cloud handles the signaling)
    peer = new Peer(); 

    peer.on('open', (id) => {
        log(`P2P ID generated: ${id}`, 'success');
        showQRCode(id);
    });

    peer.on('error', (err) => {
        log(`PeerJS Error: ${err.type}`, 'error');
    });

    // When a receiver connects
    peer.on('connection', (connection) => {
        conn = connection;
        
        conn.on('open', () => {
            log('✅ Receiver connected! P2P tunnel established.', 'success');
            fileCard.style.display = 'block'; // Unlock file selection
            document.querySelector('#connectionCard h2').textContent = '1. Connection Active';
            document.querySelector('#connectionCard .instruction').textContent = 'Share files directly to the connected device.';
        });

        conn.on('close', () => {
            log('⚠️ Receiver disconnected.', 'error');
            fileCard.style.display = 'none';
        });
    });
}

// ── 2. Show QR Code ──
function showQRCode(peerId) {
    // Construct the public URL (Vercel will provide the domain)
    // We use window.location.origin to get the current domain automatically
    const baseUrl = window.location.origin;
    const receiverUrl = `${baseUrl}/receiver.html?peerId=${peerId}`;

    peerIdDisplay.style.display = 'block';
    peerIdDisplay.querySelector('strong').textContent = peerId;
    
    urlDisplay.style.display = 'block';
    urlDisplay.textContent = receiverUrl;

    qrWrapper.style.display = 'flex';
    document.getElementById('qrcode').innerHTML = '';
    
    new QRCode(document.getElementById('qrcode'), {
        text: receiverUrl,
        width: 200,
        height: 200,
        colorDark: '#1a202c',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
    });
}

// ── 3. File Selection & Chunking Logic ──
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

    log(`Starting transfer of ${files.length} file(s)...`);
    fileListEl.innerHTML = '';

    // Send files sequentially to avoid overwhelming the connection
    for (const file of files) {
        const item = document.createElement('div');
        item.className = 'file-item';
        item.innerHTML = `<span>${file.name}</span><span class="size" id="status-${file.name}">Pending</span>`;
        fileListEl.appendChild(item);

        await sendFile(file, item.querySelector(`#status-${file.name}`));
    }
    log('✅ All files sent!', 'success');
}

// The Magic: Chunking and Sending
function sendFile(file, statusEl) {
    return new Promise((resolve) => {
        const chunkSize = 16 * 1024; // 16KB chunks (safe for WebRTC)
        const totalChunks = Math.ceil(file.size / chunkSize);
        let currentChunk = 0;

        // 1. Send Metadata
        conn.send({
            type: 'file-start',
            name: file.name,
            size: file.size,
            totalChunks: totalChunks
        });

        statusEl.textContent = 'Sending...';

        // 2. Recursive Chunk Sender
        function sendNextChunk() {
            if (currentChunk >= totalChunks) {
                conn.send({ type: 'file-end' });
                statusEl.textContent = 'Done ✓';
                statusEl.style.color = 'var(--success)';
                resolve();
                return;
            }

            const start = currentChunk * chunkSize;
            const end = Math.min(start + chunkSize, file.size);
            const blob = file.slice(start, end);
            
            const reader = new FileReader();
            reader.onload = (e) => {
                // Send the chunk (ArrayBuffer)
                conn.send({
                    type: 'chunk',
                    index: currentChunk,
                    data: e.target.result 
                });
                
                currentChunk++;
                // Simple progress update
                const pct = Math.round((currentChunk / totalChunks) * 100);
                statusEl.textContent = `${pct}%`;
                
                sendNextChunk(); // Send next
            };
            reader.readAsArrayBuffer(blob);
        }

        sendNextChunk();
    });
}

// ─ Drag & Drop ──
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => { dropZone.classList.remove('drag-over'); });
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const target = isFolderMode ? folderInput : fileInput;
    target.files = e.dataTransfer.files;
    handleFiles(e.dataTransfer.files);
});

// ─ Boot ──
document.addEventListener('DOMContentLoaded', initPeer);