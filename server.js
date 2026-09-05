// server.js — a zero-dependency static file server for the /public folder.
//
// Ponytail principle: no Express, no npm install required at all — this uses only
// Node's built-in http/fs/path/os modules. Good enough for local use and for
// pointing a couple of devices on the same network at this machine; for anything
// public-facing, put a real web server (or a host like Vercel/Netlify) in front.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function safeJoin(root, requestPath) {
  const decoded = decodeURIComponent(requestPath.split('?')[0]);
  const resolved = path.normalize(path.join(root, decoded));
  // Reject any traversal outside the public/ root (e.g. "/../server.js").
  if (!resolved.startsWith(root)) return null;
  return resolved;
}

const server = http.createServer((req, res) => {
  let filePath = safeJoin(ROOT, req.url === '/' ? '/index.html' : req.url);
  if (!filePath) {
    res.writeHead(400).end('Bad request');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || (stats.isDirectory() && !fs.existsSync(path.join(filePath, 'index.html')))) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 — not found');
      return;
    }
    if (stats.isDirectory()) filePath = path.join(filePath, 'index.html');

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      // Local/dev-friendly: never let the browser cache a stale copy while you're
      // iterating. Fine for the small scale this server is meant for.
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

function localNetworkAddresses() {
  const nets = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) addresses.push(net.address);
    }
  }
  return addresses;
}

server.listen(PORT, () => {
  console.log(`\nQR P2P Transfer is running:\n`);
  console.log(`  Local:    http://localhost:${PORT}`);
  localNetworkAddresses().forEach((addr) => {
    console.log(`  Network:  http://${addr}:${PORT}   \u2190 open this on another device on the same Wi-Fi`);
  });
  console.log(`\nPress Ctrl+C to stop.\n`);
});
